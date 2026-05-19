const fs = require('fs')
const { applyPlaywrightEnvironment } = require('./playwright-runtime')
const { loadSessionState } = require('./session-state')
const {
  failUpload,
  finishUpload,
  startUpload,
  updateUploadStage,
} = require('./upload-runtime')
const {
  __private: publishHelpers,
} = require('./naver-upload')

applyPlaywrightEnvironment()

const { chromium } = require('playwright')

const WRITE_URL = 'https://blog.naver.com/GoBlogWrite.naver'
const LOGIN_URL_PATTERN = /^https:\/\/nid\.naver\.com\/nidlogin\.login/i
const EDITOR_READY_TIMEOUT_MS = 45000
const PUBLISH_TIMEOUT_MS = 90000
const EDITABLE_SELECTOR = '[contenteditable="true"], [role="textbox"], textarea, input[type="text"], input:not([type]), .se-title-text p, .se-section-text p, .se-text-paragraph'
const DEFAULT_HEADING_FONT_SIZE = '24'
const DEFAULT_BODY_FONT_SIZE = '15'
const DEFAULT_TITLE_FONT_SIZE = '19'
const DIVIDER_MARKER = '[DIVIDER]'
const BLOG_TEXT_STYLE_PRESETS = {
  default: {
    bodyFontSize: DEFAULT_BODY_FONT_SIZE,
    headingBold: true,
    headingFontSize: DEFAULT_HEADING_FONT_SIZE,
    titleBold: null,
    titleFontSize: null,
  },
  admissions_style_2: {
    bodyFontSize: DEFAULT_BODY_FONT_SIZE,
    headingBold: false,
    headingFontSize: DEFAULT_BODY_FONT_SIZE,
    titleBold: true,
    titleFontSize: DEFAULT_TITLE_FONT_SIZE,
  },
}
const QUOTE_STYLE_LABELS = {
  'line-quote': ['라인 & 따옴표', '라인&따옴표', '라인 따옴표'],
  postit: ['포스트잇'],
}
const {
  clickFinalPublishButton,
  clickPublishButton,
  configureScheduledPublish,
  getEditorTargets,
  getPublishDialogTargets,
  openPublishDialog,
  resolvePublishOutcome,
} = publishHelpers

function stripMarkdown(value = '') {
  return String(value)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[*_`~>|[\](){}]/g, '')
    .replace(/\r/g, '')
    .trim()
}

// Naver SmartEditor 는 줄 앞에 emoji + 일반 공백 패턴이 오면 자동 리스트/단락 분리로
// 인식해 emoji 뒤에서 줄을 끊는 경향이 있다. 공백을 NBSP 로 치환하면 시각적으로는 동일하지만
// auto-format 트리거를 회피할 수 있다.
const LEADING_EMOJI_SPACE_RE =
  /^([\p{Extended_Pictographic}️‍\u{1F1E6}-\u{1F1FF}]+)([ \t]+)/u

// 이모지로 시작하는 줄은 paragraph 합치기에서 분리해 줄당 단독 블록으로 처리해야
// preserveLeadingEmojiSpace 가 모든 줄의 emoji+공백을 NBSP 로 치환할 수 있다.
const LEADING_EMOJI_LINE_RE =
  /^[\p{Extended_Pictographic}️‍\u{1F1E6}-\u{1F1FF}]+[ \t]+\S/u

function preserveLeadingEmojiSpace(value = '') {
  const text = String(value || '')
  if (!LEADING_EMOJI_SPACE_RE.test(text)) return text
  return text.replace(LEADING_EMOJI_SPACE_RE, (_, emoji, space) => `${emoji}${' '.repeat(space.length)}`)
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeQuoteStyle(value = '') {
  const key = String(value || '').trim().toLowerCase()
  return Object.prototype.hasOwnProperty.call(QUOTE_STYLE_LABELS, key)
    ? key
    : ''
}

function getBlogTextStylePreset(value = '') {
  const key = String(value || '').trim().toLowerCase()
  return BLOG_TEXT_STYLE_PRESETS[key] ? key : 'default'
}

function parseBlogBlocks(content = '') {
  const lines = String(content || '').replace(/\r/g, '').split('\n')
  const blocks = []
  let paragraph = []
  let quote = []
  let blankRun = 0

  const flushParagraph = () => {
    const text = paragraph.join(' ').replace(/\s+/g, ' ').trim()
    if (text) blocks.push({ type: 'paragraph', text })
    paragraph = []
  }

  const flushQuote = () => {
    const text = quote.join(' ').replace(/\s+/g, ' ').trim()
    if (text) blocks.push({ type: 'quote', text })
    quote = []
  }

  // 연속 빈 줄 N개(= 소스의 \n N+1개) 가 들어오면 단락 사이 기본 여백 외에 추가 빈 단락 N-1 개를
  // 끼워 화면에 N개 빈 줄로 보이게 한다. 선행/후행 빈 줄은 무시.
  const consumeBlanks = () => {
    if (blocks.length > 0 && blankRun > 1) {
      for (let i = 0; i < blankRun - 1; i += 1) {
        blocks.push({ type: 'paragraph', text: '' })
      }
    }
    blankRun = 0
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      flushParagraph()
      flushQuote()
      blankRun += 1
      continue
    }

    consumeBlanks()

    if (line === DIVIDER_MARKER) {
      flushParagraph()
      flushQuote()
      blocks.push({ type: 'divider' })
      continue
    }

    const headingMatch = line.match(/^#{1,3}\s+(.+)$/)
    if (headingMatch) {
      flushParagraph()
      flushQuote()
      blocks.push({ type: 'heading', text: stripMarkdown(headingMatch[1]) })
      continue
    }

    const quoteMatch = line.match(/^>\s+(.+)$/)
    if (quoteMatch) {
      flushParagraph()
      quote.push(stripMarkdown(quoteMatch[1]))
      continue
    }

    const listMatch = line.match(/^[-*]\s+(.+)$/)
    if (listMatch) {
      flushParagraph()
      flushQuote()
      blocks.push({ type: 'paragraph', text: `- ${stripMarkdown(listMatch[1])}` })
      continue
    }

    if (LEADING_EMOJI_LINE_RE.test(line)) {
      flushParagraph()
      flushQuote()
      blocks.push({ type: 'paragraph', text: stripMarkdown(line) })
      continue
    }

    flushQuote()
    paragraph.push(stripMarkdown(line))
  }

  flushParagraph()
  flushQuote()
  return blocks
}

function buildBodyHtml(content = '') {
  const blocks = parseBlogBlocks(content)
  return blocks.map((block) => {
    if (block.type === 'divider') {
      return '<hr style="margin:24px 0;border:0;border-top:1px solid #d0d7de;" />'
    }

    const text = escapeHtml(preserveLeadingEmojiSpace(block.text))
    if (block.type === 'heading') {
      return `<p style="font-size:24px;font-weight:700;line-height:1.45;margin:24px 0 10px 0;">${text}</p>`
    }

    if (block.type === 'quote') {
      return `<blockquote style="margin:18px 0;padding:12px 16px;border-left:4px solid #d0d7de;background:#f6f8fa;color:#57606a;font-size:15px;line-height:1.75;">${text}</blockquote>`
    }

    const paragraphContent = text || '&nbsp;'
    return `<p style="font-size:15px;font-weight:400;line-height:1.75;margin:0 0 14px 0;">${paragraphContent}</p>`
  }).join('')
}

async function dismissBlockingDialogs(page) {
  const candidates = [
    'button:has-text("닫기")',
    'button:has-text("취소")',
    'button:has-text("확인")',
    '[aria-label="닫기"]',
    '.se-popup-button-cancel',
    '.se-help-panel-close-button',
  ]

  for (const selector of candidates) {
    const locator = page.locator(selector).first()
    try {
      if (await locator.isVisible({ timeout: 800 })) {
        await locator.click({ timeout: 1000 })
        await page.waitForTimeout(300)
      }
    } catch {}
  }
}

async function dismissBlockingDialogsV2(page) {
  const buttonPatterns = [
    '^\\s*\\uCDE8\\uC18C\\s*$',
    '^\\s*\\uB2EB\\uAE30\\s*$',
    '^\\s*\\uC544\\uB2C8\\uC624\\s*$',
  ]

  const closeInScope = async (scope) => scope.evaluate((buttonPatterns) => {
    const normalize = (value = '') => String(value).replace(/\s+/g, ' ').trim()
    const buttonRegexes = buttonPatterns.map((source) => new RegExp(source, 'u'))
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    }
    const getLabel = (element) => normalize([
      element.textContent,
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('title'),
      element.getAttribute?.('value'),
    ].filter(Boolean).join(' '))

    const clickables = Array.from(document.querySelectorAll('button, a, input[type="button"], [role="button"], .se-popup-button-cancel, .se-help-panel-close-button'))
      .filter(isVisible)
    const target = clickables.find((element) => (
      buttonRegexes.some((pattern) => pattern.test(getLabel(element))) ||
      /cancel|close/i.test(String(element.className || ''))
    ))

    if (!target) return false
    target.click()
    return true
  }, buttonPatterns).catch(() => false)

  for (const scope of [page, ...page.frames()]) {
    if (await closeInScope(scope)) {
      await page.waitForTimeout(300)
    }
  }
}

async function discardExistingDraftIfPrompted(page) {
  updateUploadStage('draft-check', { stageLabel: '작성 중인 글 확인' })

  const handled = await page.evaluate(() => {
    const normalize = (value = '') => String(value).replace(/\s+/g, ' ').trim()
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    }

    const roots = Array.from(document.querySelectorAll('[role="dialog"], .se-popup, .se-layer, .layer, .popup, body'))
      .filter(isVisible)

    const draftRoot = roots.find((root) => {
      const text = normalize(root.textContent)
      return (
        /작성\s*중인\s*글/.test(text) ||
        /임시\s*저장/.test(text) ||
        /이어서\s*작성/.test(text) ||
        /저장된\s*글/.test(text)
      )
    })

    if (!draftRoot) return false

    const buttons = Array.from(draftRoot.querySelectorAll('button, a, [role="button"]')).filter(isVisible)
    const preferred = [
      /취소/,
      /새로\s*작성/,
      /새\s*글/,
      /닫기/,
      /아니오/,
      /삭제/,
    ]

    for (const pattern of preferred) {
      const target = buttons.find((button) => pattern.test(normalize(button.textContent || button.getAttribute('aria-label') || button.getAttribute('title'))))
      if (target) {
        target.click()
        return true
      }
    }

    return false
  })

  if (handled) {
    await page.waitForTimeout(1000)
    await dismissBlockingDialogs(page)
  }
}

async function discardExistingDraftIfPromptedV2(page) {
  updateUploadStage('draft-check', { stageLabel: 'draft prompt check' })

  const draftPatterns = [
    '\\uC791\\uC131\\s*\\uC911\\uC778\\s*\\uAE00',
    '\\uC791\\uC131\\s*\\uC911\\uC778\\s*\\uAE00\\uC774\\s*\\uC788\\uC2B5\\uB2C8\\uB2E4',
    '\\uC784\\uC2DC\\s*\\uC800\\uC7A5',
    '\\uC774\\uC5B4\\uC11C\\s*\\uC791\\uC131',
    '\\uC800\\uC7A5\\uB41C\\s*\\uAE00',
  ]
  const buttonPatterns = [
    '^\\s*\\uCDE8\\uC18C\\s*$',
    '\\uC0C8\\uB85C\\s*\\uC791\\uC131',
    '\\uC0C8\\s*\\uAE00',
    '^\\s*\\uB2EB\\uAE30\\s*$',
    '^\\s*\\uC544\\uB2C8\\uC624\\s*$',
    '\\uC0AD\\uC81C',
  ]

  const clickDraftButton = async (scope) => scope.evaluate(({ draftPatterns, buttonPatterns }) => {
    const normalize = (value = '') => String(value).replace(/\s+/g, ' ').trim()
    const draftRegexes = draftPatterns.map((source) => new RegExp(source, 'u'))
    const buttonRegexes = buttonPatterns.map((source) => new RegExp(source, 'u'))
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    }
    const getLabel = (element) => normalize([
      element.textContent,
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('title'),
      element.getAttribute?.('value'),
    ].filter(Boolean).join(' '))

    const roots = Array.from(document.querySelectorAll('[role="dialog"], .se-popup, .se-layer, .layer, .popup, .modal, body'))
      .filter(isVisible)
    const draftRoot = roots.find((root) => draftRegexes.some((pattern) => pattern.test(normalize(root.textContent))))
    if (!draftRoot) return false

    const clickables = Array.from(draftRoot.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"], .se-popup-button, .se-popup-button-cancel'))
      .filter(isVisible)

    for (const pattern of buttonRegexes) {
      const target = clickables.find((element) => pattern.test(getLabel(element)))
      if (target) {
        target.click()
        return true
      }
    }

    const cancelByClass = clickables.find((element) => /cancel|close/i.test(String(element.className || '')))
    if (cancelByClass) {
      cancelByClass.click()
      return true
    }

    return false
  }, { draftPatterns, buttonPatterns }).catch(() => false)

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const scopes = [page, ...page.frames()]
    for (const scope of scopes) {
      if (await clickDraftButton(scope)) {
        await page.waitForTimeout(1200)
        await dismissBlockingDialogsV2(page)
        return true
      }
    }
    await page.waitForTimeout(500)
  }

  return false
}

async function findEditableElements(page) {
  const scopes = [page, ...page.frames()]
  const results = []

  for (const [scopeIndex, scope] of scopes.entries()) {
    const editables = await scope.evaluate((selector) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return rect.width > 20 && rect.height > 12 && style.visibility !== 'hidden' && style.display !== 'none'
    }

    return Array.from(document.querySelectorAll(selector))
      .filter(visible)
      .map((element, index) => {
        const rect = element.getBoundingClientRect()
        const text = [
          element.getAttribute('aria-label'),
          element.getAttribute('placeholder'),
          element.className,
          element.closest('[class]')?.className,
        ].filter(Boolean).join(' ').toLowerCase()

        let score = 0
        if (/title|subject|documenttitle|제목/.test(text)) score += 40
        if (/text|body|content|본문|se-section-text/.test(text)) score += 20
        if (element.matches('[contenteditable="true"]')) score += 10

        return {
          index,
          score,
          tagName: element.tagName,
          top: rect.top,
          left: rect.left,
          text,
        }
      })
    }, EDITABLE_SELECTOR).catch(() => [])

    results.push(...editables.map((item) => ({ ...item, scopeIndex })))
  }

  return results.sort((a, b) => (b.score - a.score) || (a.top - b.top) || (a.left - b.left))
}

async function focusEditableByIndex(page, scopeIndex, index) {
  const scope = [page, ...page.frames()][scopeIndex]
  if (!scope) throw new Error(`Editor frame not found: ${scopeIndex}`)

  await scope.evaluate(({ targetIndex, selector }) => {
    const elements = Array.from(document.querySelectorAll(selector))
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return rect.width > 20 && rect.height > 12 && style.visibility !== 'hidden' && style.display !== 'none'
      })

    const element = elements[targetIndex]
    if (!element) throw new Error(`Editable element not found: ${targetIndex}`)
    const focusTarget = element.matches('[contenteditable="true"], textarea, input') ? element : element.closest('[contenteditable="true"]') || element
    focusTarget.scrollIntoView({ block: 'center', inline: 'center' })
    focusTarget.focus()
  }, { targetIndex: index, selector: EDITABLE_SELECTOR })
}

async function waitForEditorReady(page) {
  updateUploadStage('editor-ready', { stageLabel: 'editor ready check' })
  const startedAt = Date.now()

  while (Date.now() - startedAt < EDITOR_READY_TIMEOUT_MS) {
    const editables = await findEditableElements(page)
    if (editables.length >= 2) return editables
    await discardExistingDraftIfPromptedV2(page)
    await dismissBlockingDialogsV2(page)
    await page.waitForTimeout(500)
  }

  const frameUrls = page.frames().map((frame) => frame.url()).filter(Boolean)
  throw new Error(`Naver blog editor did not expose editable fields within ${EDITOR_READY_TIMEOUT_MS}ms. url=${page.url()} frames=${frameUrls.join(' | ')}`)
}

async function focusFirstMatchingElement(page, selectors) {
  const scopes = [page, ...page.frames()]

  for (const [scopeIndex, scope] of scopes.entries()) {
    const focused = await scope.evaluate((selectors) => {
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return rect.width > 20 && rect.height > 12 && style.visibility !== 'hidden' && style.display !== 'none'
      }

      for (const selector of selectors) {
        const element = Array.from(document.querySelectorAll(selector)).find(isVisible)
        if (!element) continue
        const target = element.matches('[contenteditable="true"], textarea, input') ? element : element.closest('[contenteditable="true"]') || element
        target.scrollIntoView({ block: 'center', inline: 'center' })
        target.focus()
        return true
      }

      return false
    }, selectors).catch(() => false)

    if (focused) return scopeIndex
  }

  return null
}

async function setTextFirstMatchingElement(page, selectors, text) {
  for (const [scopeIndex, scope] of [page, ...page.frames()].entries()) {
    const updated = await scope.evaluate(({ selectors, text }) => {
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return rect.width > 20 && rect.height > 12 && style.visibility !== 'hidden' && style.display !== 'none'
      }

      for (const selector of selectors) {
        const element = Array.from(document.querySelectorAll(selector)).find(isVisible)
        if (!element) continue
        const target = element.matches('textarea, input, [contenteditable="true"]') ? element : element.closest('[contenteditable="true"]') || element
        target.scrollIntoView({ block: 'center', inline: 'center' })
        target.focus()
        if (target.matches('textarea, input')) target.value = text
        else target.textContent = text
        target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
        target.dispatchEvent(new Event('change', { bubbles: true }))
        return true
      }

      return false
    }, { selectors, text }).catch(() => false)

    if (updated) return scopeIndex
  }

  return null
}

async function insertHtmlFirstMatchingElement(page, selectors, html, clear = false) {
  for (const [scopeIndex, scope] of [page, ...page.frames()].entries()) {
    const updated = await scope.evaluate(({ selectors, html, clear }) => {
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return rect.width > 20 && rect.height > 12 && style.visibility !== 'hidden' && style.display !== 'none'
      }

      for (const selector of selectors) {
        const element = Array.from(document.querySelectorAll(selector)).find(isVisible)
        if (!element) continue
        const target = element.matches('[contenteditable="true"]') ? element : element.closest('[contenteditable="true"]') || element
        target.scrollIntoView({ block: 'center', inline: 'center' })
        target.focus()
        if (clear) {
          document.execCommand('selectAll', false, null)
        } else {
          const range = document.createRange()
          range.selectNodeContents(target)
          range.collapse(false)
          const selection = window.getSelection()
          selection.removeAllRanges()
          selection.addRange(range)
        }
        document.execCommand('insertHTML', false, html)
        target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertHTML' }))
        return true
      }

      return false
    }, { selectors, html, clear }).catch(() => false)

    if (updated) return scopeIndex
  }

  return null
}

async function setTitleV2(page, title) {
  updateUploadStage('fill-title', { stageLabel: 'fill title' })
  const titleScopeIndex = await focusFirstMatchingElement(page, [
    '.se-title-text [contenteditable="true"]',
    '.se-title-text p',
    '.se-title-text',
    '[class*="title"] [contenteditable="true"]',
    '[class*="Title"] [contenteditable="true"]',
    '[placeholder*="제목"]',
    '[aria-label*="제목"]',
    'textarea[placeholder*="제목"]',
    'input[placeholder*="제목"]',
  ])

  if (titleScopeIndex === null) {
    throw new Error('네이버 블로그 제목 입력 영역을 찾지 못했습니다.')
  }

  await page.keyboard.press('Control+A')
  await page.keyboard.type(stripMarkdown(title), { delay: 10 })
}

async function insertBodyHtmlV2(page, html) {
  updateUploadStage('fill-body', { stageLabel: 'fill body' })
  const bodyScopeIndex = await focusFirstMatchingElement(page, [
    '.se-main-container .se-section-text [contenteditable="true"]',
    '.se-main-container .se-section-text p',
    '.se-content .se-section-text [contenteditable="true"]',
    '.se-content .se-section-text p',
    '.se-section-text [contenteditable="true"]',
    '.se-section-text p',
    '[class*="body"] [contenteditable="true"]',
    '[class*="content"] [contenteditable="true"]',
  ])

  if (bodyScopeIndex === null) {
    throw new Error('네이버 블로그 본문 입력 영역을 찾지 못했습니다.')
  }

  await page.keyboard.press('Control+A')
  const scope = [page, ...page.frames()][bodyScopeIndex]
  await scope.evaluate((bodyHtml) => {
    document.execCommand('insertHTML', false, bodyHtml)
  }, html)
}

async function setTitleV3(page, title) {
  updateUploadStage('fill-title', { stageLabel: 'fill title' })
  const titleScopeIndex = await setTextFirstMatchingElement(page, [
    '.se-title-text [contenteditable="true"]',
    '.se-title-text p',
    '.se-title-text',
    '[class*="title"] [contenteditable="true"]',
    '[class*="Title"] [contenteditable="true"]',
    '[placeholder*="\\C81C\\BAA9"]',
    '[aria-label*="\\C81C\\BAA9"]',
    'textarea[placeholder*="\\C81C\\BAA9"]',
    'input[placeholder*="\\C81C\\BAA9"]',
  ], stripMarkdown(title))

  if (titleScopeIndex === null) {
    throw new Error('Naver blog title input was not found.')
  }
}

const BODY_SELECTORS = [
  '.se-main-container .se-section-text [contenteditable="true"]',
  '.se-main-container [contenteditable="true"].se-section-text',
  '.se-main-container .se-section-text p',
  '.se-content .se-section-text [contenteditable="true"]',
  '.se-content [contenteditable="true"].se-section-text',
  '.se-content .se-section-text p',
  '.se-section-text [contenteditable="true"]',
  '[contenteditable="true"].se-section-text',
  '.se-section-text p',
  '[class*="body"] [contenteditable="true"]',
  '[class*="content"] [contenteditable="true"]',
]

async function insertBodyHtmlV3(page, html, clear = false) {
  updateUploadStage('fill-body', { stageLabel: 'fill body' })
  const bodyScopeIndex = await insertHtmlFirstMatchingElement(page, BODY_SELECTORS, html, clear)
  if (bodyScopeIndex === null) {
    throw new Error('Naver blog body input was not found.')
  }
}

function splitContentByImageMarkers(content = '') {
  const parts = []
  const markerPattern = /\[\[\s*image\s*:\s*(\d+)\s*\]\]|\[IMG\s*:\s*(\d+)\]/gi
  let cursor = 0
  let match

  while ((match = markerPattern.exec(content)) !== null) {
    const text = content.slice(cursor, match.index)
    if (text.trim()) parts.push({ type: 'text', text })
    parts.push({ type: 'image', index: Number(match[1] || match[2]) - 1 })
    cursor = markerPattern.lastIndex
  }

  const rest = content.slice(cursor)
  if (rest.trim()) parts.push({ type: 'text', text: rest })
  return parts.length ? parts : [{ type: 'text', text: content }]
}

async function insertBodyContentWithImages(page, content, photoPaths = []) {
  const parts = splitContentByImageMarkers(content)
  let insertedText = false
  const usedPhotoIndexes = new Set()

  for (const part of parts) {
    if (part.type === 'text') {
      await insertBodyHtmlV3(page, buildBodyHtml(part.text), !insertedText)
      insertedText = true
      continue
    }

    const photoPath = photoPaths[part.index]
    if (photoPath) {
      await uploadPhotosV2(page, [photoPath])
      usedPhotoIndexes.add(part.index)
    }
  }

  const remainingPhotos = photoPaths.filter((_, index) => !usedPhotoIndexes.has(index))
  if (remainingPhotos.length) {
    await uploadPhotosV2(page, remainingPhotos)
  }
}

const TITLE_SELECTORS = [
  '.se-section-documentTitle [contenteditable="true"]',
  '.se-section-documentTitle .se-text-paragraph',
  '[class*="documentTitle"] [contenteditable="true"]',
  '[class*="documentTitle"] .se-text-paragraph',
  '.se-title-text[contenteditable="true"]',
  '.se-title-text [contenteditable="true"]',
  '.se-documentTitle [contenteditable="true"]',
  '.se-documentTitle[contenteditable="true"]',
  '[contenteditable="true"][class*="title"]',
  '[contenteditable="true"][class*="Title"]',
  '[contenteditable="true"][data-placeholder*="제목"]',
  '[contenteditable="true"][aria-label*="제목"]',
  '[class*="title"] [contenteditable="true"]',
  '[class*="Title"] [contenteditable="true"]',
  '[placeholder*="\\C81C\\BAA9"]',
  '[aria-label*="\\C81C\\BAA9"]',
  'textarea[placeholder*="\\C81C\\BAA9"]',
  'input[placeholder*="\\C81C\\BAA9"]',
]

async function focusEditableEnd(page, selectors, clear = false) {
  for (const scope of [page, ...page.frames()]) {
    const focused = await scope.evaluate(({ selectors, clear }) => {
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return rect.width > 20 && rect.height > 12 && style.visibility !== 'hidden' && style.display !== 'none'
      }

      for (const selector of selectors) {
        const element = Array.from(document.querySelectorAll(selector)).find(isVisible)
        if (!element) continue
        const target =
          element.matches('textarea, input, [contenteditable="true"]')
            ? element
            : element.closest('[contenteditable="true"]') || element.querySelector?.('[contenteditable="true"], textarea, input') || element

        if (!target.matches('textarea, input, [contenteditable="true"]')) continue

        target.scrollIntoView({ block: 'center', inline: 'center' })
        target.click()
        target.focus()

        if (target.matches('textarea, input')) {
          const length = target.value.length
          target.setSelectionRange?.(length, length)
          return true
        }

        const range = document.createRange()
        range.selectNodeContents(target)
        range.collapse(!clear)
        const selection = window.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
        return true
      }

      return false
    }, { selectors, clear }).catch(() => false)

    if (focused) return true
  }

  return false
}

function buildBodyTextBlocks(content = '') {
  return parseBlogBlocks(content).filter((block) => block.type === 'divider' || block.text)
}

async function setTitleV4(page, title) {
  updateUploadStage('fill-title', { stageLabel: 'fill title' })
  const focused = await focusEditableEnd(page, TITLE_SELECTORS, true)
  if (!focused) throw new Error('Naver blog title input was not found.')

  await page.keyboard.press('Control+A')
  await page.keyboard.insertText(stripMarkdown(title))
  await page.waitForTimeout(300)
}

async function clickTitleField(page) {
  const selectors = [
    '.se-section-documentTitle .se-text-paragraph',
    '.se-section-documentTitle [contenteditable="true"]',
    '[class*="documentTitle"] .se-text-paragraph',
    '[class*="documentTitle"] [contenteditable="true"]',
    '.se-title-text[contenteditable="true"]',
    '.se-title-text [contenteditable="true"]',
    '.tit_input',
  ]

  for (const scope of [page, ...page.frames()]) {
    for (const selector of selectors) {
      const locator = scope.locator(selector).first()
      try {
        if (!(await locator.isVisible({ timeout: 500 }))) continue
        await locator.click({ timeout: 1500 })
        await page.waitForTimeout(250)
        return true
      } catch {}
    }

    const placeholder = scope.getByText(/\uC81C\uBAA9/, { exact: false }).first()
    try {
      if (await placeholder.isVisible({ timeout: 500 })) {
        await placeholder.click({ timeout: 1500 })
        await page.waitForTimeout(250)
        return true
      }
    } catch {}
  }

  return false
}

async function setTitleV5(page, title) {
  updateUploadStage('fill-title', { stageLabel: 'fill title' })
  const clicked = await clickTitleField(page)
  const focused = clicked || await focusEditableEnd(page, TITLE_SELECTORS, true)
  if (!focused) throw new Error('Naver blog title input was not found.')

  await page.keyboard.press('Control+A')
  await page.keyboard.insertText(stripMarkdown(title))
  await page.waitForTimeout(500)
}

async function applyTitleTextStyle(page, textStyleKey = 'default') {
  const style = BLOG_TEXT_STYLE_PRESETS[getBlogTextStylePreset(textStyleKey)]
  if (!style.titleFontSize && style.titleBold == null) {
    return
  }
  const clicked = await clickTitleField(page)
  const focused = clicked || await focusEditableEnd(page, TITLE_SELECTORS, false)
  if (!focused) return

  await page.keyboard.press('Control+A')
  let fontSizeState = null
  let boldState = null
  if (style.titleFontSize) {
    fontSizeState = await setFontSizeFormatting(page, style.titleFontSize, fontSizeState)
  }
  if (style.titleBold != null) {
    boldState = await setBoldFormatting(page, style.titleBold, boldState)
  }
  await page.waitForTimeout(250)
  await page.keyboard.press('ArrowRight').catch(() => {})
}

function getFormattingScopes(page) {
  return [page, ...page.frames()]
}

function getToolbarSelectors(kind) {
  if (kind === 'bold') {
    return [
      'button[aria-label*="bold" i]',
      '[role="button"][aria-label*="bold" i]',
      'button[title*="bold" i]',
      '[role="button"][title*="bold" i]',
      '[data-click-area*="bold"]',
      '[data-name="bold"]',
      '[data-command="bold"]',
      '[data-tool="bold"]',
      '[data-testid*="bold"]',
      'button.se-toolbar-item-bold',
      '.se-toolbar-item-bold button',
    ]
  }

  if (kind === 'fontSize') {
    return [
      'button[aria-label*="font size" i]',
      '[role="button"][aria-label*="font size" i]',
      'button[title*="font size" i]',
      '[role="button"][title*="font size" i]',
      '[data-name="fontSize"]',
      '[data-name="fontsize"]',
      '[data-command="fontSize"]',
      '[data-command="fontsize"]',
      '[data-tool="fontSize"]',
      '[data-tool="fontsize"]',
      '[data-click-area*="font"]',
      '[data-click-area*="size"]',
      '[data-click-area*="font-size"]',
      'button.se-toolbar-item-font-size',
      '.se-toolbar-item-font-size button',
      '[class*="font-size"] button',
      '[class*="fontSize"] button',
    ]
  }

  if (kind === 'quote') {
    return [
      'button[aria-label*="quote" i]',
      '[role="button"][aria-label*="quote" i]',
      'button[title*="quote" i]',
      '[role="button"][title*="quote" i]',
      '[data-name="quote"]',
      '[data-name="blockquote"]',
      '[data-command="quote"]',
      '[data-command="blockquote"]',
      '[data-tool="quote"]',
      '[data-tool="blockquote"]',
      '[data-click-area*="quote"]',
      '[data-click-area*="blockquote"]',
      'button.se-toolbar-item-quote',
      '.se-toolbar-item-quote button',
      '[class*="quote"] button',
    ]
  }

  if (kind === 'divider') {
    return [
      'button[aria-label*="divider" i]',
      '[role="button"][aria-label*="divider" i]',
      'button[aria-label*="separator" i]',
      '[role="button"][aria-label*="separator" i]',
      'button[aria-label*="horizontal line" i]',
      '[role="button"][aria-label*="horizontal line" i]',
      'button[title*="divider" i]',
      '[role="button"][title*="divider" i]',
      'button[title*="separator" i]',
      '[role="button"][title*="separator" i]',
      '[data-name="divider"]',
      '[data-name="separator"]',
      '[data-command="divider"]',
      '[data-command="separator"]',
      '[data-tool="divider"]',
      '[data-tool="separator"]',
      '[data-click-area*="divider"]',
      '[data-click-area*="separator"]',
      '[data-click-area*="line"]',
      'button.se-toolbar-item-line',
      '.se-toolbar-item-line button',
      'button.se-toolbar-item-divider',
      '.se-toolbar-item-divider button',
      '[class*="divider"] button',
      '[class*="separator"] button',
    ]
  }

  return []
}

async function findToolbarButtonStateByKind(scope, kind) {
  return scope.evaluate(({ kind, selectors }) => {
    const normalize = (value = '') => String(value).replace(/\s+/g, ' ').trim().toLowerCase()
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    }
    const labelOf = (element) => normalize([
      element.textContent,
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('title'),
      element.getAttribute?.('data-name'),
      element.getAttribute?.('data-command'),
      element.getAttribute?.('data-tool'),
      element.getAttribute?.('data-click-area'),
      element.className,
    ].filter(Boolean).join(' '))
    const score = (element) => {
      const label = labelOf(element)
      if (kind === 'bold') {
        if (label.includes('bold')) return 100
        if (label.includes('굵')) return 95
        return 0
      }
      if (kind === 'fontSize') {
        if (label.includes('font size')) return 100
        if (label.includes('fontsize')) return 95
        if (label.includes('글자 크기')) return 92
        if (label.includes('font')) return 75
        if (label.includes('size')) return 70
        return 0
      }
      if (label.includes('blockquote')) return 100
      if (label.includes('quote')) return 95
      if (label.includes('인용')) return 92
      return 0
    }

    const button = selectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter((element) => element instanceof HTMLElement && isVisible(element))
      .sort((left, right) => score(right) - score(left))
      .find((element) => score(element) > 0)

    if (!button) return null

    const activeText = normalize([
      button.getAttribute('aria-pressed'),
      button.getAttribute('aria-checked'),
      button.getAttribute('data-active'),
      button.getAttribute('data-selected'),
      button.className,
      button.parentElement?.className,
    ].filter(Boolean).join(' '))
    const sizeMatch = labelOf(button).match(/\b(\d{1,2})(?:\s*px)?\b/)

    return {
      active: activeText.includes('true') || activeText.includes('active') || activeText.includes('selected') || activeText.includes(' on'),
      size: sizeMatch ? sizeMatch[1] : null,
    }
  }, { kind, selectors: getToolbarSelectors(kind) }).catch(() => null)
}

async function clickToolbarButtonByKind(scope, kind) {
  return scope.evaluate(({ kind, selectors }) => {
    const normalize = (value = '') => String(value).replace(/\s+/g, ' ').trim().toLowerCase()
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    }
    const labelOf = (element) => normalize([
      element.textContent,
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('title'),
      element.getAttribute?.('data-name'),
      element.getAttribute?.('data-command'),
      element.getAttribute?.('data-tool'),
      element.getAttribute?.('data-click-area'),
      element.className,
    ].filter(Boolean).join(' '))
    const score = (element) => {
      const label = labelOf(element)
      if (kind === 'bold') return label.includes('bold') || label.includes('굵') ? 100 : 0
      if (kind === 'fontSize') {
        if (label.includes('font size') || label.includes('fontsize') || label.includes('글자 크기')) return 100
        if (label.includes('font') || label.includes('size')) return 70
        return 0
      }
      if (label.includes('blockquote')) return 100
      if (label.includes('quote')) return 95
      if (label.includes('인용')) return 92
      return 0
    }

    const button = selectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter((element) => element instanceof HTMLElement && isVisible(element))
      .sort((left, right) => score(right) - score(left))
      .find((element) => score(element) > 0)

    if (!button) return false
    button.click()
    return true
  }, { kind, selectors: getToolbarSelectors(kind) }).catch(() => false)
}

async function findToolbarButtonState(scope, kind) {
  return scope.evaluate((kind) => {
    const normalize = (value = '') => String(value).replace(/\s+/g, ' ').trim().toLowerCase()
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    }
    const candidates = {
      bold: [
        'button[aria-label*="bold" i]',
        '[role="button"][aria-label*="bold" i]',
        'button[title*="bold" i]',
        '[role="button"][title*="bold" i]',
        '[data-click-area*="bold"]',
        '[data-name="bold"]',
        '[data-command="bold"]',
        '[data-tool="bold"]',
        '[data-testid*="bold"]',
        'button.se-toolbar-item-bold',
        '.se-toolbar-item-bold button',
      ],
      fontSize: [
        'button[aria-label*="font size" i]',
        '[role="button"][aria-label*="font size" i]',
        'button[title*="font size" i]',
        '[role="button"][title*="font size" i]',
        '[data-name="fontSize"]',
        '[data-name="fontsize"]',
        '[data-command="fontSize"]',
        '[data-command="fontsize"]',
        '[data-tool="fontSize"]',
        '[data-tool="fontsize"]',
        '[data-click-area*="font"]',
        '[data-click-area*="size"]',
        '[data-click-area*="font-size"]',
        'button.se-toolbar-item-font-size',
        '.se-toolbar-item-font-size button',
        '[class*="font-size"] button',
        '[class*="fontSize"] button',
      ],
    }[kind] || []
    const labelOf = (element) => normalize([
      element.textContent,
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('title'),
      element.getAttribute?.('data-name'),
      element.getAttribute?.('data-command'),
      element.getAttribute?.('data-tool'),
      element.getAttribute?.('data-click-area'),
      element.className,
    ].filter(Boolean).join(' '))
    const score = (element) => {
      const label = labelOf(element)
      if (kind === 'bold') {
        if (label.includes('bold')) return 100
        if (label.includes('굵')) return 95
      }
      if (kind === 'fontSize') {
        if (label.includes('font size')) return 100
        if (label.includes('fontsize')) return 95
        if (label.includes('글자 크기')) return 92
        if (label.includes('font')) return 75
        if (label.includes('size')) return 70
      }
      return 0
    }
    const button = candidates
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter((element) => element instanceof HTMLElement && isVisible(element))
      .sort((left, right) => score(right) - score(left))
      .find((element) => score(element) > 0)

    if (!button) return null
    const activeText = normalize([
      button.getAttribute('aria-pressed'),
      button.getAttribute('aria-checked'),
      button.getAttribute('data-active'),
      button.getAttribute('data-selected'),
      button.className,
      button.parentElement?.className,
    ].filter(Boolean).join(' '))
    const sizeMatch = labelOf(button).match(/\b(\d{1,2})(?:\s*px)?\b/)
    return {
      active: activeText.includes('true') || activeText.includes('active') || activeText.includes('selected') || activeText.includes(' on'),
      size: sizeMatch ? sizeMatch[1] : null,
    }
  }, kind).catch(() => null)
}

async function clickToolbarButton(scope, kind) {
  return scope.evaluate((kind) => {
    const normalize = (value = '') => String(value).replace(/\s+/g, ' ').trim().toLowerCase()
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    }
    const selectors = kind === 'bold'
      ? [
          'button[aria-label*="bold" i]',
          '[role="button"][aria-label*="bold" i]',
          'button[title*="bold" i]',
          '[role="button"][title*="bold" i]',
          '[data-click-area*="bold"]',
          '[data-name="bold"]',
          '[data-command="bold"]',
          '[data-tool="bold"]',
          '[data-testid*="bold"]',
          'button.se-toolbar-item-bold',
          '.se-toolbar-item-bold button',
        ]
      : [
          'button[aria-label*="font size" i]',
          '[role="button"][aria-label*="font size" i]',
          'button[title*="font size" i]',
          '[role="button"][title*="font size" i]',
          '[data-name="fontSize"]',
          '[data-name="fontsize"]',
          '[data-command="fontSize"]',
          '[data-command="fontsize"]',
          '[data-tool="fontSize"]',
          '[data-tool="fontsize"]',
          '[data-click-area*="font"]',
          '[data-click-area*="size"]',
          '[data-click-area*="font-size"]',
          'button.se-toolbar-item-font-size',
          '.se-toolbar-item-font-size button',
          '[class*="font-size"] button',
          '[class*="fontSize"] button',
        ]
    const labelOf = (element) => normalize([
      element.textContent,
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('title'),
      element.getAttribute?.('data-name'),
      element.getAttribute?.('data-command'),
      element.getAttribute?.('data-tool'),
      element.getAttribute?.('data-click-area'),
      element.className,
    ].filter(Boolean).join(' '))
    const score = (element) => {
      const label = labelOf(element)
      if (kind === 'bold') return label.includes('bold') || label.includes('굵') ? 100 : 0
      if (label.includes('font size') || label.includes('fontsize') || label.includes('글자 크기')) return 100
      if (label.includes('font') || label.includes('size')) return 70
      return 0
    }
    const button = selectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter((element) => element instanceof HTMLElement && isVisible(element))
      .sort((left, right) => score(right) - score(left))
      .find((element) => score(element) > 0)
    if (!button) return false
    button.click()
    return true
  }, kind).catch(() => false)
}

async function clickFontSizeOption(scope, sizeLabel) {
  return scope.evaluate((sizeLabel) => {
    const normalize = (value = '') => String(value).replace(/\s+/g, ' ').trim().toLowerCase()
    const target = normalize(sizeLabel)
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    }
    const valuesOf = (element) => [
      element.textContent,
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('title'),
      element.getAttribute?.('data-value'),
      element.getAttribute?.('data-size'),
      element.getAttribute?.('value'),
    ].map(normalize)
    const matches = (element) => valuesOf(element).some((value) => (
      value === target ||
      value === `${target}px` ||
      value === `${target} px` ||
      value.startsWith(`${target}px`) ||
      value.includes(`${target}px`) ||
      value.includes(`${target} px`)
    ))
    const option = Array.from(document.querySelectorAll('button, [role="button"], [role="option"], li, [data-value], [data-size], [value], [class*="font"]'))
      .filter((element) => element instanceof HTMLElement && isVisible(element) && matches(element))[0]
    if (!option) return false
    option.click()
    return true
  }, sizeLabel).catch(() => false)
}

async function clickFontSizeOptionAcrossPage(page, sizeLabel, timeoutMs = 3500) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    for (const scope of getFormattingScopes(page)) {
      const clicked = await scope.evaluate((sizeLabel) => {
        const normalize = (value = '') => String(value).replace(/\s+/g, ' ').trim().toLowerCase()
        const target = normalize(sizeLabel)
        const isVisible = (element) => {
          const rect = element.getBoundingClientRect()
          const style = window.getComputedStyle(element)
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
        }
        const valuesOf = (element) => [
          element.textContent,
          element.getAttribute?.('aria-label'),
          element.getAttribute?.('title'),
          element.getAttribute?.('data-value'),
          element.getAttribute?.('data-size'),
          element.getAttribute?.('value'),
          element.getAttribute?.('data-font-size'),
          element.className,
        ].map(normalize)
        const matches = (element) => valuesOf(element).some((value) => (
          value === target ||
          value === `${target}px` ||
          value === `${target} px` ||
          value.startsWith(`${target}px`) ||
          value.startsWith(`${target} px`) ||
          value.includes(` ${target}`) ||
          value.includes(`${target}px`) ||
          value.includes(`${target} px`)
        ))
        const options = Array.from(document.querySelectorAll([
          'button',
          '[role="button"]',
          '[role="option"]',
          '[role="menuitem"]',
          'li',
          'a',
          'span',
          '[data-value]',
          '[data-size]',
          '[data-font-size]',
          '[value]',
          '[class*="font"]',
          '[class*="size"]',
        ].join(',')))
          .filter((element) => element instanceof HTMLElement && isVisible(element) && matches(element))
          .sort((left, right) => {
            const leftText = normalize(left.textContent)
            const rightText = normalize(right.textContent)
            const leftExact = leftText === target || leftText === `${target}px` || leftText === `${target} px`
            const rightExact = rightText === target || rightText === `${target}px` || rightText === `${target} px`
            return Number(rightExact) - Number(leftExact)
          })

        const option = options[0]
        if (!option) return false
        option.scrollIntoView({ block: 'center', inline: 'center' })
        option.click()
        option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }))
        option.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }))
        option.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
        return true
      }, sizeLabel).catch(() => false)

      if (clicked) return true
    }

    await page.waitForTimeout(250)
  }

  return false
}

async function selectQuoteStyleOption(page, quoteStyle) {
  const styleKey = normalizeQuoteStyle(quoteStyle)
  if (!styleKey) return false

  const labels = QUOTE_STYLE_LABELS[styleKey] || []
  for (const scope of getFormattingScopes(page)) {
    const clicked = await scope.evaluate((styleLabels) => {
      const normalize = (value = '') => String(value).replace(/\s+/g, ' ').trim().toLowerCase()
      const normalizedLabels = styleLabels.map((label) => normalize(label))
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
      }
      const labelOf = (element) => normalize([
        element.textContent,
        element.getAttribute?.('aria-label'),
        element.getAttribute?.('title'),
        element.getAttribute?.('data-name'),
        element.getAttribute?.('data-command'),
        element.getAttribute?.('data-tool'),
        element.className,
      ].filter(Boolean).join(' '))

      const candidates = Array.from(document.querySelectorAll('button, [role="button"], li, [data-name], [data-command], [data-tool]'))
        .filter((element) => element instanceof HTMLElement && isVisible(element))
        .map((element) => ({ element, label: labelOf(element) }))
        .filter(({ label }) => normalizedLabels.some((target) => label.includes(target)))

      if (!candidates.length) return false

      candidates[0].element.click()
      return true
    }, labels).catch(() => false)

    if (clicked) {
      await page.waitForTimeout(180)
      return true
    }
  }

  return false
}

async function clickDividerToolbarButton(scope) {
  const selectors = [
    'button[aria-label*="divider" i]',
    '[role="button"][aria-label*="divider" i]',
    'button[aria-label*="separator" i]',
    '[role="button"][aria-label*="separator" i]',
    'button[aria-label*="horizontal line" i]',
    '[role="button"][aria-label*="horizontal line" i]',
    'button[title*="divider" i]',
    '[role="button"][title*="divider" i]',
    'button[title*="separator" i]',
    '[role="button"][title*="separator" i]',
    '[data-name="divider"]',
    '[data-name="separator"]',
    '[data-command="divider"]',
    '[data-command="separator"]',
    '[data-tool="divider"]',
    '[data-tool="separator"]',
    '[data-click-area*="divider"]',
    '[data-click-area*="separator"]',
    '[data-click-area*="line"]',
    'button.se-toolbar-item-line',
    '.se-toolbar-item-line button',
    'button.se-toolbar-item-divider',
    '.se-toolbar-item-divider button',
    '[class*="divider"] button',
    '[class*="separator"] button',
  ]

  return scope.evaluate((dividerSelectors) => {
    const normalize = (value = '') => String(value).replace(/\s+/g, ' ').trim().toLowerCase()
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    }
    const labelOf = (element) => normalize([
      element.textContent,
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('title'),
      element.getAttribute?.('data-name'),
      element.getAttribute?.('data-command'),
      element.getAttribute?.('data-tool'),
      element.getAttribute?.('data-click-area'),
      element.className,
    ].filter(Boolean).join(' '))
    const score = (element) => {
      const label = labelOf(element)
      if (label.includes('horizontal line')) return 100
      if (label.includes('divider')) return 98
      if (label.includes('separator')) return 96
      if (label.includes('구분선')) return 94
      if (label.includes('hr')) return 90
      return 0
    }

    const button = dividerSelectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter((element) => element instanceof HTMLElement && isVisible(element))
      .sort((left, right) => score(right) - score(left))
      .find((element) => score(element) > 0)

    if (!button) return false
    button.click()
    return true
  }, selectors).catch(() => false)
}

async function selectFirstDividerStyle(page) {
  for (const scope of getFormattingScopes(page)) {
    const clicked = await scope.evaluate(() => {
      const normalize = (value = '') => String(value).replace(/\s+/g, ' ').trim().toLowerCase()
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
      }
      const hasPopupAncestor = (element) => {
        let current = element.parentElement
        while (current) {
          const meta = normalize([
            current.className,
            current.getAttribute?.('role'),
            current.getAttribute?.('data-name'),
            current.getAttribute?.('data-tool'),
          ].filter(Boolean).join(' '))
          if (
            meta.includes('popup') ||
            meta.includes('popover') ||
            meta.includes('layer') ||
            meta.includes('dropdown') ||
            meta.includes('menu') ||
            meta.includes('list') ||
            meta.includes('dialog')
          ) {
            return true
          }
          current = current.parentElement
        }
        return false
      }
      const labelOf = (element) => normalize([
        element.textContent,
        element.getAttribute?.('aria-label'),
        element.getAttribute?.('title'),
        element.getAttribute?.('data-name'),
        element.getAttribute?.('data-command'),
        element.getAttribute?.('data-tool'),
        element.getAttribute?.('data-click-area'),
        element.className,
      ].filter(Boolean).join(' '))
      const looksLikeDividerOption = (element) => {
        const label = labelOf(element)
        return (
          label.includes('divider') ||
          label.includes('separator') ||
          label.includes('horizontal line') ||
          label.includes('구분선') ||
          label.includes('hr') ||
          label.includes('line')
        )
      }

      const popupElements = Array.from(document.querySelectorAll([
        '[role="menu"] button',
        '[role="menu"] [role="menuitem"]',
        '[role="dialog"] button',
        '[role="dialog"] [role="button"]',
        '[class*="popup"] button',
        '[class*="popover"] button',
        '[class*="layer"] button',
        '[class*="dropdown"] button',
        '[class*="menu"] button',
        '[class*="list"] button',
        'li[role="menuitem"]',
        'li button',
        '[class*="divider"]',
        '[class*="separator"]',
        '[class*="line"]',
      ].join(',')))
        .filter((element) => element instanceof HTMLElement && isVisible(element))
        .filter((element) => hasPopupAncestor(element))

      const candidates = popupElements
        .filter((element) => looksLikeDividerOption(element))
        .sort((left, right) => {
          const topDiff = left.getBoundingClientRect().top - right.getBoundingClientRect().top
          if (Math.abs(topDiff) > 2) return topDiff
          return left.getBoundingClientRect().left - right.getBoundingClientRect().left
        })

      const fallbackCandidates = popupElements
        .filter((element) => element.matches?.('button, [role="button"], [role="menuitem"]'))
        .sort((left, right) => {
          const topDiff = left.getBoundingClientRect().top - right.getBoundingClientRect().top
          if (Math.abs(topDiff) > 2) return topDiff
          return left.getBoundingClientRect().left - right.getBoundingClientRect().left
        })

      const option = candidates[0] || fallbackCandidates[0]
      if (!option) return false
      option.scrollIntoView({ block: 'center', inline: 'center' })
      option.click()
      option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }))
      option.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }))
      option.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      return true
    }).catch(() => false)

    if (clicked) {
      await page.waitForTimeout(180)
      return true
    }
  }

  return false
}

async function insertDividerByToolbar(page) {
  const clicked = await clickBodyField(page, true)
  const focused = clicked || await focusEditableEnd(page, BODY_SELECTORS, false)
  if (!focused) throw new Error('Naver blog body input was not found.')

  for (const scope of getFormattingScopes(page)) {
    const opened = await clickDividerToolbarButton(scope)
    if (!opened) continue
    await page.waitForTimeout(250)
    if (await selectFirstDividerStyle(page)) {
      await page.waitForTimeout(250)
      await clickBodyField(page, true)
      return true
    }
  }

  return false
}

async function setBoldFormatting(page, enabled, currentState = null) {
  for (const scope of getFormattingScopes(page)) {
    const state = await findToolbarButtonStateByKind(scope, 'bold')
    if (state && state.active === enabled) return enabled
    if (state && await clickToolbarButtonByKind(scope, 'bold')) {
      await page.waitForTimeout(120)
      return enabled
    }
  }
  return currentState
}

async function setQuoteFormatting(page, enabled, currentState = null, quoteStyle = '') {
  for (const scope of getFormattingScopes(page)) {
    const state = await findToolbarButtonStateByKind(scope, 'quote')
    if (enabled && state?.active) {
      if (quoteStyle) {
        const selected = await selectQuoteStyleOption(page, quoteStyle)
        if (!selected && await clickToolbarButtonByKind(scope, 'quote')) {
          await page.waitForTimeout(120)
          await selectQuoteStyleOption(page, quoteStyle)
        }
      }
      return true
    }
    if (state && state.active === enabled) return enabled
    if (state && await clickToolbarButtonByKind(scope, 'quote')) {
      await page.waitForTimeout(120)
      if (enabled && quoteStyle) {
        await selectQuoteStyleOption(page, quoteStyle)
      }
      return enabled
    }
  }
  return currentState
}

async function setFontSizeFormatting(page, sizeLabel, currentState = null) {
  for (const scope of getFormattingScopes(page)) {
    const state = await findToolbarButtonStateByKind(scope, 'fontSize')
    if (state?.size === sizeLabel) return sizeLabel
    if (!(await clickToolbarButtonByKind(scope, 'fontSize'))) continue
    await page.waitForTimeout(350)
    if (await clickFontSizeOption(scope, sizeLabel) || await clickFontSizeOptionAcrossPage(page, sizeLabel)) {
      await page.waitForTimeout(250)
      return sizeLabel
    }
  }
  return currentState
}

async function clickBodyField(page, preferLast = false) {
  const selectors = [
    '.se-section-text .se-text-paragraph',
    '.se-section-text [contenteditable="true"]',
    '[class*="section-text"] .se-text-paragraph',
    '[class*="section-text"] [contenteditable="true"]',
    '.se-text-paragraph',
    '.content_input',
  ]

  for (const scope of [page, ...page.frames()]) {
    for (const selector of selectors) {
      const locators = await scope.locator(selector).all().catch(() => [])
      const candidates = preferLast ? locators.reverse() : locators
      for (const locator of candidates) {
      try {
        if (!(await locator.isVisible({ timeout: 500 }))) continue
        await locator.click({ timeout: 1500 })
        await page.waitForTimeout(250)
        return true
      } catch {}
      }
    }

    const placeholders = await scope.getByText(/\uB0B4\uC6A9|\uBCF8\uBB38/, { exact: false }).all().catch(() => [])
    const placeholderCandidates = preferLast ? placeholders.reverse() : placeholders
    for (const placeholder of placeholderCandidates) {
    try {
      if (await placeholder.isVisible({ timeout: 500 })) {
        await placeholder.click({ timeout: 1500 })
        await page.waitForTimeout(250)
        return true
      }
    } catch {}
    }
  }

  return false
}

async function insertBodyTextV4(
  page,
  text,
  quoteStyle = '',
  textStylePreset = 'default',
  clear = false,
  formatState = { bold: null, fontSize: null, quote: null },
  preferLast = false,
  trailingEnterCount = 2
) {
  const style = BLOG_TEXT_STYLE_PRESETS[getBlogTextStylePreset(textStylePreset)]
  const clicked = await clickBodyField(page, preferLast)
  const focused = clicked || await focusEditableEnd(page, BODY_SELECTORS, clear)
  if (!focused) throw new Error('Naver blog body input was not found.')

  const bodyBlocks = buildBodyTextBlocks(text)
  if (!bodyBlocks.length) return
  if (clear) await page.keyboard.press('Control+A')

  for (const [index, block] of bodyBlocks.entries()) {
    if (block.type === 'divider') {
      formatState.bold = await setBoldFormatting(page, false, formatState.bold)
      formatState.fontSize = await setFontSizeFormatting(page, style.bodyFontSize, formatState.fontSize)
      formatState.quote = await setQuoteFormatting(page, false, formatState.quote)
      if (index > 0) {
        await page.keyboard.press('Enter')
      }
      const insertedDivider = await insertDividerByToolbar(page)
      if (!insertedDivider) {
        throw new Error('네이버 블로그 구분선 메뉴에서 첫 번째 스타일을 선택하지 못했습니다.')
      }
      await page.keyboard.press('Enter')
      await page.waitForTimeout(200)
      continue
    }

    if (index > 0 && bodyBlocks[index - 1]?.type !== 'divider') {
      await page.keyboard.press('Enter')
      if (block.type === 'heading') {
        await page.keyboard.press('Enter')
      }
    }
    if (block.type === 'heading') {
      formatState.quote = await setQuoteFormatting(page, false, formatState.quote)
      formatState.fontSize = await setFontSizeFormatting(page, style.headingFontSize, formatState.fontSize)
      formatState.bold = await setBoldFormatting(page, style.headingBold, formatState.bold)
    } else if (block.type === 'quote') {
      formatState.bold = await setBoldFormatting(page, false, formatState.bold)
      formatState.fontSize = await setFontSizeFormatting(page, style.bodyFontSize, formatState.fontSize)
      formatState.quote = await setQuoteFormatting(page, true, formatState.quote, quoteStyle)
    } else {
      formatState.bold = await setBoldFormatting(page, false, formatState.bold)
      formatState.fontSize = await setFontSizeFormatting(page, style.bodyFontSize, formatState.fontSize)
      formatState.quote = await setQuoteFormatting(page, false, formatState.quote)
    }
    await page.keyboard.insertText(preserveLeadingEmojiSpace(block.text || ' '))
  }

  formatState.bold = await setBoldFormatting(page, false, formatState.bold)
  formatState.fontSize = await setFontSizeFormatting(page, style.bodyFontSize, formatState.fontSize)
  formatState.quote = await setQuoteFormatting(page, false, formatState.quote)
  for (let index = 0; index < trailingEnterCount; index += 1) {
    await page.keyboard.press('Enter')
  }
  await page.waitForTimeout(300)
  return formatState
}

async function insertBodyContentWithImagesV4(page, content, photoPaths = [], quoteStyle = '', textStylePreset = 'default') {
  updateUploadStage('fill-body', { stageLabel: 'fill body' })
  const parts = splitContentByImageMarkers(content)
  let insertedText = false
  const usedPhotoIndexes = new Set()
  const formatState = { bold: null, fontSize: null, quote: null }
  const style = BLOG_TEXT_STYLE_PRESETS[getBlogTextStylePreset(textStylePreset)]

  for (const [index, part] of parts.entries()) {
    if (part.type === 'text') {
      const nextPart = parts[index + 1]
      await insertBodyTextV4(page, part.text, quoteStyle, textStylePreset, !insertedText, formatState, insertedText, nextPart?.type === 'image' ? 1 : 2)
      insertedText = true
      continue
    }

    const photoPath = photoPaths[part.index]
    if (photoPath) {
      await clickBodyField(page, true)
      await uploadPhotosV2(page, [photoPath])
      await page.waitForTimeout(500)
      await clickBodyField(page, true)
      formatState.bold = await setBoldFormatting(page, false, null)
      formatState.fontSize = await setFontSizeFormatting(page, style.bodyFontSize, null)
      formatState.quote = await setQuoteFormatting(page, false, null)
      usedPhotoIndexes.add(part.index)
    }
  }

  const remainingPhotos = photoPaths.filter((_, index) => !usedPhotoIndexes.has(index))
  if (remainingPhotos.length) {
    await clickBodyField(page, true)
    await uploadPhotosV2(page, remainingPhotos)
  }
}

async function setTitle(page, title) {
  updateUploadStage('fill-title', { stageLabel: '제목 입력' })
  const editables = await findEditableElements(page)
  const titleTarget = editables.find((item) => /title|subject|documenttitle|제목/.test(item.text)) || editables[0]
  if (!titleTarget) throw new Error('네이버 블로그 제목 입력 영역을 찾지 못했습니다.')

  await focusEditableByIndex(page, titleTarget.scopeIndex, titleTarget.index)
  await page.keyboard.press('Control+A')
  await page.keyboard.type(stripMarkdown(title), { delay: 10 })
}

async function insertBodyHtml(page, html) {
  updateUploadStage('fill-body', { stageLabel: '본문 입력' })
  const editables = await findEditableElements(page)
  const bodyTarget =
    editables.find((item) => /body|content|본문|se-section-text/.test(item.text)) ||
    editables.find((item) => item.index !== editables[0]?.index) ||
    editables[1]

  if (!bodyTarget) throw new Error('네이버 블로그 본문 입력 영역을 찾지 못했습니다.')

  await focusEditableByIndex(page, bodyTarget.scopeIndex, bodyTarget.index)
  await page.keyboard.press('Control+A')
  const scope = [page, ...page.frames()][bodyTarget.scopeIndex]
  await scope.evaluate((bodyHtml) => {
    document.execCommand('insertHTML', false, bodyHtml)
  }, html)
}

async function uploadPhotos(page, photoPaths = []) {
  const existingPaths = photoPaths.filter((photoPath) => photoPath && fs.existsSync(photoPath))
  if (!existingPaths.length) return

  updateUploadStage('upload-photos', { stageLabel: '이미지 첨부', photoCount: existingPaths.length })

  const input = page.locator('input[type="file"]').first()
  if (await input.count()) {
    await input.setInputFiles(existingPaths)
    await page.waitForTimeout(2000)
    return
  }

  const photoButtons = [
    'button:has-text("사진")',
    'button[aria-label*="사진"]',
    'button[title*="사진"]',
    '[role="button"]:has-text("사진")',
  ]

  for (const selector of photoButtons) {
    const button = page.locator(selector).first()
    try {
      if (!(await button.isVisible({ timeout: 1000 }))) continue
      const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5000 })
      await button.click()
      const fileChooser = await fileChooserPromise
      await fileChooser.setFiles(existingPaths)
      await page.waitForTimeout(2500)
      return
    } catch {}
  }

  throw new Error('이미지 첨부 버튼 또는 파일 입력을 찾지 못했습니다.')
}

async function uploadPhotosV2(page, photoPaths = []) {
  const existingPaths = photoPaths.filter((photoPath) => photoPath && fs.existsSync(photoPath))
  if (!existingPaths.length) return

  updateUploadStage('upload-photos', { stageLabel: 'image upload', photoCount: existingPaths.length })

  const setInputFilesInScopes = async () => {
    for (const scope of [page, ...page.frames()]) {
      const input = scope.locator('input[type="file"]').first()
      try {
        if (await input.count()) {
          await input.setInputFiles(existingPaths)
          await page.waitForTimeout(2500)
          return true
        }
      } catch {}
    }

    return false
  }

  if (await setInputFilesInScopes()) return

  const knownPhotoSelectors = [
    '.se-image-toolbar-button',
    '.se-toolbar-button-image',
    '.se-toolbar-item-image button',
    '.se-toolbar-item-image [role="button"]',
    'button[class*="image"]',
    'button[class*="photo"]',
    'button[class*="picture"]',
    'button[class*="camera"]',
    'button[class*="attach"]',
    '[role="button"][class*="image"]',
    '[role="button"][class*="photo"]',
    '[role="button"][class*="picture"]',
    '[role="button"][class*="camera"]',
    '[role="button"][class*="attach"]',
    '[data-name*="image"]',
    '[data-name*="photo"]',
    '[data-testid*="image"]',
    '[data-testid*="photo"]',
  ]

  for (const scope of [page, ...page.frames()]) {
    for (const selector of knownPhotoSelectors) {
      const buttons = await scope.locator(selector).all().catch(() => [])
      for (const button of buttons) {
        try {
          if (!(await button.isVisible({ timeout: 500 }))) continue
          const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null)
          await button.click({ timeout: 1000 })
          const fileChooser = await fileChooserPromise
          if (fileChooser) {
            await fileChooser.setFiles(existingPaths)
            await page.waitForTimeout(2500)
            return
          }
          if (await setInputFilesInScopes()) return
        } catch {}
      }
    }
  }

  const clickPhotoButtonInScope = async (scope) => scope.evaluate(() => {
    const labelPatterns = [
      /\uC0AC\uC9C4/u,
      /\uC774\uBBF8\uC9C0/u,
      /\uCCA8\uBD80/u,
      /photo/i,
      /image/i,
      /picture/i,
      /upload/i,
      /camera/i,
      /attach/i,
      /file/i,
    ]
    const selector = [
      'button',
      'a',
      'input[type="button"]',
      '[role="button"]',
      '[class*="toolbar"]',
      '[class*="photo"]',
      '[class*="image"]',
      '[class*="picture"]',
      '[class*="camera"]',
      '[class*="attach"]',
      '[class*="file"]',
      '[data-name]',
      '[data-testid]',
      '[aria-label]',
      '[title]',
    ].join(',')
    const normalize = (value = '') => String(value).replace(/\s+/g, ' ').trim()
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    }
    const getLabel = (element) => normalize([
      element.textContent,
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('title'),
      element.getAttribute?.('value'),
      element.getAttribute?.('data-name'),
      element.getAttribute?.('data-testid'),
      element.className,
    ].filter(Boolean).join(' '))

    const candidates = Array.from(document.querySelectorAll(selector)).filter(isVisible)
    const target = candidates.find((element) => labelPatterns.some((pattern) => pattern.test(getLabel(element))))
    if (!target) return false
    target.scrollIntoView({ block: 'center', inline: 'center' })
    target.click()
    return true
  }).catch(() => false)

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 7000 }).catch(() => null)
    let clicked = false

    for (const scope of [page, ...page.frames()]) {
      if (await clickPhotoButtonInScope(scope)) {
        clicked = true
        break
      }
    }

    if (!clicked) {
      await page.waitForTimeout(700)
      continue
    }

    const fileChooser = await fileChooserPromise
    if (fileChooser) {
      await fileChooser.setFiles(existingPaths)
      await page.waitForTimeout(2500)
      return
    }

    await page.waitForTimeout(1000)
    if (await setInputFilesInScopes()) return
  }

  const toolbarSelectors = [
    '.se-toolbar button',
    '.se-toolbar [role="button"]',
    '[class*="toolbar"] button',
    '[class*="toolbar"] [role="button"]',
  ]

  for (const scope of [page, ...page.frames()]) {
    for (const selector of toolbarSelectors) {
      const buttons = await scope.locator(selector).all().catch(() => [])
      for (const button of buttons) {
        try {
          if (!(await button.isVisible({ timeout: 300 }))) continue
          const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 2000 }).catch(() => null)
          await button.click({ timeout: 1000 })
          const fileChooser = await fileChooserPromise
          if (fileChooser) {
            await fileChooser.setFiles(existingPaths)
            await page.waitForTimeout(2500)
            return
          }
        } catch {}
      }
    }
  }

  throw new Error('이미지 첨부 버튼 또는 파일 입력을 찾지 못했습니다.')
}

async function setTags(page, tags = []) {
  const normalizedTags = tags.map((tag) => String(tag).replace(/^#/, '').trim()).filter(Boolean).slice(0, 20)
  if (!normalizedTags.length) return

  updateUploadStage('fill-tags', { stageLabel: '태그 입력', tagCount: normalizedTags.length })

  const tagSelectors = [
    'textarea[placeholder*="태그"]',
    'input[placeholder*="태그"]',
    '[contenteditable="true"][aria-label*="태그"]',
  ]

  for (const selector of tagSelectors) {
    const locator = page.locator(selector).first()
    try {
      if (!(await locator.isVisible({ timeout: 1000 }))) continue
      await locator.click()
      await locator.fill(normalizedTags.join(', '))
      return
    } catch {}
  }
}

async function clickPublish(page) {
  updateUploadStage('publish-open', { stageLabel: '발행 창 열기' })
  const publishOpenSelectors = [
    'button:has-text("발행")',
    'button:has-text("공개 발행")',
    '[role="button"]:has-text("발행")',
  ]

  for (const selector of publishOpenSelectors) {
    const button = page.locator(selector).first()
    try {
      if (!(await button.isVisible({ timeout: 2000 }))) continue
      await button.click()
      await page.waitForTimeout(1200)
      break
    } catch {}
  }

  updateUploadStage('publish-confirm', { stageLabel: '최종 발행' })
  const confirmSelectors = [
    'button:has-text("발행")',
    'button:has-text("확인")',
    'button:has-text("등록")',
    '[role="button"]:has-text("발행")',
  ]

  for (const selector of confirmSelectors) {
    const buttons = await page.locator(selector).all()
    for (const button of buttons.reverse()) {
      try {
        if (!(await button.isVisible({ timeout: 1000 }))) continue
        await button.click()
        await page.waitForTimeout(2000)
        return
      } catch {}
    }
  }

  throw new Error('최종 발행 버튼을 찾지 못했습니다.')
}

async function clickButtonByPatterns(page, patterns, timeoutMs = 12000) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    for (const scope of [page, ...page.frames()]) {
      const clicked = await scope.evaluate((patterns) => {
        const regexes = patterns.map((source) => new RegExp(source, 'iu'))
        const normalize = (value = '') => String(value).replace(/\s+/g, ' ').trim()
        const isVisible = (element) => {
          const rect = element.getBoundingClientRect()
          const style = window.getComputedStyle(element)
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
        }
        const labelOf = (element) => normalize([
          element.textContent,
          element.getAttribute?.('aria-label'),
          element.getAttribute?.('title'),
          element.getAttribute?.('value'),
          element.getAttribute?.('data-name'),
          element.getAttribute?.('data-testid'),
          element.className,
        ].filter(Boolean).join(' '))
        const selector = 'button, a, input[type="button"], input[type="submit"], [role="button"]'
        const candidates = Array.from(document.querySelectorAll(selector)).filter(isVisible)
        const target = candidates
          .map((element) => ({ element, label: labelOf(element), rect: element.getBoundingClientRect() }))
          .filter((item) => regexes.some((regex) => regex.test(item.label)))
          .sort((a, b) => (b.rect.top - a.rect.top) || (b.rect.left - a.rect.left))[0]?.element

        if (!target) return false
        target.scrollIntoView({ block: 'center', inline: 'center' })
        target.click()
        return true
      }, patterns).catch(() => false)

      if (clicked) return true
    }

    await page.waitForTimeout(500)
  }

  return false
}

async function isPublishDialogVisibleV2(page) {
  for (const scope of [page, ...page.frames()]) {
    const visible = await scope.evaluate(() => {
      const normalize = (value = '') => String(value).replace(/\s+/g, ' ').trim()
      const isVisible = (element) => {
        if (!(element instanceof Element)) return false
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          Number(style.opacity || '1') > 0
      }

      const roots = Array.from(document.querySelectorAll([
        '[data-group="popupLayer"]',
        '[role="dialog"]',
        '[class*="popup"]',
        '[class*="Popup"]',
        '[class*="layer"]',
        '[class*="Layer"]',
      ].join(','))).filter(isVisible)

      return roots.some((root) => {
        const text = normalize(root.textContent)
        return /(\uD0DC\uADF8|\uACF5\uAC1C|\uBC1C\uD589|\uC608\uC57D)/u.test(text)
      })
    }).catch(() => false)

    if (visible) return true
  }

  return false
}

async function clickPublishOpenButtonV2(page) {
  for (const scope of [page, ...page.frames()]) {
    const clicked = await scope.evaluate(() => {
      const normalize = (value = '') => String(value).replace(/\s+/g, ' ').trim()
      const isVisible = (element) => {
        if (!(element instanceof Element)) return false
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          Number(style.opacity || '1') > 0
      }
      const labelOf = (element) => normalize([
        element.textContent,
        element.getAttribute?.('aria-label'),
        element.getAttribute?.('title'),
        element.getAttribute?.('value'),
        element.getAttribute?.('data-click-area'),
        element.getAttribute?.('data-name'),
        element.getAttribute?.('data-testid'),
        element.className,
      ].filter(Boolean).join(' '))

      const candidates = Array.from(document.querySelectorAll(
        'button, a, input[type="button"], input[type="submit"], [role="button"]'
      ))
        .filter(isVisible)
        .map((element) => {
          const rect = element.getBoundingClientRect()
          const label = labelOf(element)
          let score = 0
          if (/\uBC1C\uD589/u.test(label)) score += 100
          if (/\uACF5\uAC1C\s*\uBC1C\uD589/u.test(label)) score += 20
          if (/publish/i.test(label)) score += 20
          if (/tpb\.publish|btn_publish|publish/i.test(label)) score += 85
          if (element.closest('[data-group="popupLayer"], [role="dialog"], [class*="popup"], [class*="Popup"]')) score -= 100
          score += Math.max(0, 1000 - rect.top) / 100
          score += rect.left / 1000
          return { element, label, rect, score }
        })
        .filter((item) => item.score >= 80)
        .sort((a, b) => b.score - a.score)

      const target = candidates[0]?.element
      if (!target) return false
      target.scrollIntoView({ block: 'center', inline: 'center' })
      target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }))
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }))
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }))
      target.click()
      return true
    }).catch(() => false)

    if (clicked) return true
  }

  return false
}

async function openPublishDialogV2(page, targets) {
  updateUploadStage('publish-open', { stageLabel: 'open publish' })

  const iframe = page.frameLocator('iframe#mainFrame')
  await iframe.locator('button[data-click-area="tpb.publish"]').first().click({ timeout: 5000 })
  console.log('[Naver Blog V2] Clicked mainFrame publish button (first)')
  await page.waitForTimeout(1200)

  if (await isPublishDialogVisibleV2(page)) return

  throw new Error('Naver blog publish popup did not open after mainFrame simple click.')
}

function normalizeCategoryPath(categoryPath = '') {
  return String(categoryPath)
    .split('>')
    .map((segment) => segment.trim())
    .filter(Boolean)
}

async function clickCategorySelectorInScope(scope) {
  return scope.evaluate(() => {
    const normalize = (value = '') => String(value).replace(/\s+/g, ' ').trim()
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        Number(style.opacity || '1') > 0
    }
    const getLabel = (element) => normalize([
      element.textContent,
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('title'),
      element.getAttribute?.('value'),
      element.getAttribute?.('data-name'),
      element.getAttribute?.('data-testid'),
      element.className,
    ].filter(Boolean).join(' '))
    const dialogRoots = Array.from(document.querySelectorAll([
      '[data-group="popupLayer"]',
      '[role="dialog"]',
      '[class*="popup"]',
      '[class*="Popup"]',
      '[class*="layer"]',
      '[class*="Layer"]',
    ].join(','))).filter(isVisible)
    const dialogRoot = dialogRoots.find((root) => {
      const text = normalize(root.textContent)
      return text.includes('카테고리') && (text.includes('공개') || text.includes('발행') || text.includes('예약') || text.includes('태그'))
    })
    if (!dialogRoot) return { clicked: false, reason: 'dialog-not-found' }

    const selector = [
      'button',
      'a',
      'input[type="button"]',
      'input[type="submit"]',
      '[role="button"]',
      '[class*="category"]',
      '[class*="Category"]',
      '[class*="select"]',
      '[class*="Select"]',
    ].join(',')

    const candidates = Array.from(dialogRoot.querySelectorAll(selector))
      .filter(isVisible)
      .map((element) => {
        const label = getLabel(element)
        const lower = label.toLowerCase()
        let score = 0
        if (label.includes('카테고리')) score += 120
        if (lower.includes('category')) score += 80
        if (/\b(category|select|dropdown)\b/i.test(String(element.className || ''))) score += 30
        if (label.includes('태그') || label.includes('발행') || label.includes('공개') || label.includes('예약')) score -= 80
        return { element, label, score }
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)

    const target = candidates[0]
    if (!target) return { clicked: false, reason: 'selector-not-found' }
    target.element.scrollIntoView({ block: 'center', inline: 'center' })
    target.element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }))
    target.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }))
    target.element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }))
    target.element.click()
    return { clicked: true, label: target.label }
  }).catch(() => ({ clicked: false, reason: 'scope-error' }))
}

async function clickCategoryOptionInScope(scope, categoryPath) {
  return scope.evaluate(({ categoryPath }) => {
    const segments = String(categoryPath)
      .split('>')
      .map((segment) => segment.trim())
      .filter(Boolean)
    const fullPath = segments.join(' > ')
    const leaf = segments[segments.length - 1] || ''
    const normalize = (value = '') => String(value).replace(/\s+/g, ' ').trim()
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        Number(style.opacity || '1') > 0
    }
    const getLabel = (element) => normalize([
      element.textContent,
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('title'),
      element.getAttribute?.('value'),
    ].filter(Boolean).join(' '))
    const roots = Array.from(document.querySelectorAll([
      '[data-group="popupLayer"]',
      '[role="dialog"]',
      '[class*="popup"]',
      '[class*="Popup"]',
      '[class*="layer"]',
      '[class*="Layer"]',
      '[role="listbox"]',
      'ul',
      'ol',
    ].join(',')))
      .filter(isVisible)
      .filter((element) => {
        const text = normalize(element.textContent)
        return (
          text.includes('카테고리') ||
          text.includes(leaf) ||
          (fullPath && text.includes(fullPath))
        )
      })
    const selector = [
      'button',
      'a',
      'input[type="button"]',
      'input[type="submit"]',
      '[role="button"]',
      'li',
      'label',
      '[class*="item"]',
      '[class*="Item"]',
      '[class*="option"]',
      '[class*="Option"]',
      '[class*="category"]',
      '[class*="Category"]',
      'div',
      'span',
    ].join(',')

    const candidatePool = roots.length > 0
      ? roots.flatMap((root) => Array.from(root.querySelectorAll(selector)))
      : Array.from(document.querySelectorAll(selector))

    const candidates = candidatePool
      .filter(isVisible)
      .map((element) => {
        const label = getLabel(element)
        if (!label) return null
        if (label.includes('카테고리') || label.includes('태그') || label.includes('발행') || label.includes('공개') || label.includes('예약')) {
          return null
        }

        const rect = element.getBoundingClientRect()
        let score = 0
        if (label === fullPath) score += 200
        if (label === leaf) score += 160
        if (leaf && label.endsWith(leaf)) score += 100
        if (fullPath && label.includes(fullPath)) score += 90
        if (leaf && label.includes(leaf)) score += 70
        if (/\b(category|item|option|list)\b/i.test(String(element.className || ''))) score += 20
        if (element.closest('[role="listbox"], ul, ol, [class*="list"], [class*="option"], [class*="Option"]')) score += 20
        if (rect.top > 0 && rect.left > 0) score += 1

        return score > 0 ? { element, label, score } : null
      })
      .filter(Boolean)
      .sort((left, right) => right.score - left.score)

    const target = candidates[0]
    if (!target) {
      return { clicked: false, reason: 'option-not-found' }
    }

    target.element.scrollIntoView({ block: 'center', inline: 'center' })
    target.element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }))
    target.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }))
    target.element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }))
    target.element.click()
    return { clicked: true, label: target.label }
  }, { categoryPath }).catch(() => ({ clicked: false, reason: 'scope-error' }))
}

async function selectPublishCategory(page, targets, categoryPath) {
  const segments = normalizeCategoryPath(categoryPath)
  if (!segments.length) return

  const normalizedPath = segments.join(' > ')
  updateUploadStage('select-category', {
    stageLabel: 'select category',
    categoryPath: normalizedPath,
  })

  const dialogTargets = getPublishDialogTargets(targets)
  const attempts = []

  for (let attempt = 0; attempt < 3; attempt += 1) {
    for (const target of dialogTargets) {
      const result = await clickCategoryOptionInScope(target.scope, normalizedPath)
      if (result.clicked) {
        console.log(`[Naver Blog V2] Selected category via ${target.label}: ${result.label}`)
        await page.waitForTimeout(500)
        return
      }
      attempts.push(`${target.label}:${result.reason}`)
    }

    for (const target of dialogTargets) {
      const result = await clickCategorySelectorInScope(target.scope)
      if (result.clicked) {
        console.log(`[Naver Blog V2] Opened category selector via ${target.label}: ${result.label}`)
        await page.waitForTimeout(500)
        break
      }
      attempts.push(`${target.label}:${result.reason}`)
    }
  }

  throw new Error(`설정한 블로그 카테고리를 네이버 발행창에서 찾지 못했습니다: ${normalizedPath} (${attempts.slice(0, 6).join(' | ')})`)
}

async function clickPublishV2(page) {
  updateUploadStage('publish-open', { stageLabel: 'open publish' })
  const opened = await clickButtonByPatterns(page, [
    '\\uBC1C\\uD589',
    '\\uACF5\\uAC1C\\s*\\uBC1C\\uD589',
    'publish',
  ], 15000)
  if (!opened) throw new Error('Naver blog publish button was not found.')

  await page.waitForTimeout(1200)
  updateUploadStage('publish-confirm', { stageLabel: 'confirm publish' })
  const confirmed = await clickButtonByPatterns(page, [
    '\\uBC1C\\uD589',
    '\\uD655\\uC778',
    '\\uB4F1\\uB85D',
    'publish',
    'confirm',
    'submit',
  ], 15000)
  if (!confirmed) throw new Error('Naver blog final publish button was not found.')

  await page.waitForTimeout(2000)
}

async function waitForPublishResult(page) {
  updateUploadStage('publish-wait', { stageLabel: '발행 완료 확인' })
  const startedAt = Date.now()

  while (Date.now() - startedAt < PUBLISH_TIMEOUT_MS) {
    const url = page.url()
    if (/PostView\.naver|blog\.naver\.com\/[^/]+\/\d+/i.test(url)) {
      return url
    }

    const successText = await page.locator('text=/발행되었습니다|등록되었습니다|완료/').first().isVisible({ timeout: 1000 }).catch(() => false)
    if (successText) return page.url()
    await page.waitForTimeout(1500)
  }

  return page.url()
}

async function uploadToNaverBlogV2({
  title,
  categoryPath = '',
  content,
  tags = [],
  photoPaths = [],
  headless = true,
  quoteStyle = '',
  textStylePreset = 'default',
  scheduledAt = null,
}) {
  if (!title || !String(title).trim()) throw new Error('블로그 제목이 필요합니다.')
  if (!content || !String(content).trim()) throw new Error('블로그 본문이 필요합니다.')

  const storageState = loadSessionState()
  if (!storageState) throw new Error('저장된 네이버 세션이 없습니다. 먼저 desktop helper에서 네이버 로그인을 진행하세요.')

  const active = startUpload({
    bot: 'naver-blog-rpa-v2',
    photoCount: photoPaths.length,
    scheduled: Boolean(scheduledAt),
    scheduledAt,
    title: String(title).slice(0, 80),
  })

  let browser = null
  let context = null

  try {
    updateUploadStage('browser-start', { stageLabel: '브라우저 시작' })
    browser = await chromium.launch({
      headless,
      args: ['--disable-blink-features=AutomationControlled'],
    })

    context = await browser.newContext({
      locale: 'ko-KR',
      storageState,
      timezoneId: 'Asia/Seoul',
      viewport: { width: 1360, height: 900 },
    })

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    })

    const page = await context.newPage()
    updateUploadStage('open-editor', { stageLabel: '네이버 글쓰기 열기' })
    await page.goto(WRITE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(2500)

    if (LOGIN_URL_PATTERN.test(page.url())) {
      throw new Error('네이버 로그인이 필요합니다. desktop helper에서 네이버 로그인을 다시 진행하세요.')
    }

    await discardExistingDraftIfPromptedV2(page)
    await dismissBlockingDialogsV2(page)
    await waitForEditorReady(page)

    await setTitleV5(page, title)
    await applyTitleTextStyle(page, textStylePreset)
    await insertBodyContentWithImagesV4(page, content, photoPaths, quoteStyle, textStylePreset)

    const targets = getEditorTargets(page)
    await openPublishDialogV2(page, targets)
    await selectPublishCategory(page, targets, categoryPath)

    // 본문에 입력된 해시태그(#태그) 가 Naver SmartEditor 에 의해 자동으로 발행 다이얼로그
    // 태그 칩으로 동기화되므로, 여기서 fillPublishDialogTags 로 다시 입력하면 칩이 중복된다.
    // tags 파라미터는 호환을 위해 시그니처에 남기되 별도 입력 단계는 수행하지 않는다.

    if (scheduledAt) {
      updateUploadStage('configure-schedule', { stageLabel: 'configure schedule', scheduledAt })
      const normalizedSchedule = await configureScheduledPublish(page, targets, scheduledAt)
      updateUploadStage('configure-schedule-complete', {
        stageLabel: 'schedule configured',
        scheduledAt: normalizedSchedule.iso,
      })
    }

    updateUploadStage('publish-confirm', { stageLabel: scheduledAt ? 'confirm schedule' : 'confirm publish' })
    const confirmTargets = getPublishDialogTargets(targets)
    await clickFinalPublishButton(page, confirmTargets, { scheduledAt })

    const publishOutcome = await resolvePublishOutcome(page, targets, { scheduledAt, timeout: 60000 })
    if (!publishOutcome) {
      throw new Error(scheduledAt
        ? 'Scheduled publish was submitted, but confirmation was not detected.'
        : 'Publish was submitted, but final post URL was not detected.')
    }

    return finishUpload({
      bot: 'naver-blog-rpa-v2',
      mode: publishOutcome.mode,
      scheduled: Boolean(publishOutcome.scheduled),
      scheduledAt,
      url: publishOutcome.url,
      requestId: active.id,
    })
  } catch (error) {
    failUpload(error)
    throw error
  } finally {
    if (context) await context.close().catch(() => {})
    if (browser) await browser.close().catch(() => {})
  }
}

module.exports = {
  buildBodyHtml,
  parseBlogBlocks,
  uploadToNaverBlogV2,
}
