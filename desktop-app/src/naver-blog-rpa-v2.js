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
const HEADING_FONT_SIZE = '24'
const BODY_FONT_SIZE = '15'
const {
  clickFinalPublishButton,
  clickPublishButton,
  configureScheduledPublish,
  fillTags: fillPublishDialogTags,
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

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function parseBlogBlocks(content = '') {
  const lines = String(content || '').replace(/\r/g, '').split('\n')
  const blocks = []
  let paragraph = []

  const flushParagraph = () => {
    const text = paragraph.join(' ').replace(/\s+/g, ' ').trim()
    if (text) blocks.push({ type: 'paragraph', text })
    paragraph = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      flushParagraph()
      continue
    }

    const headingMatch = line.match(/^#{1,3}\s+(.+)$/)
    if (headingMatch) {
      flushParagraph()
      blocks.push({ type: 'heading', text: stripMarkdown(headingMatch[1]) })
      continue
    }

    const listMatch = line.match(/^[-*]\s+(.+)$/)
    if (listMatch) {
      flushParagraph()
      blocks.push({ type: 'paragraph', text: `- ${stripMarkdown(listMatch[1])}` })
      continue
    }

    paragraph.push(stripMarkdown(line))
  }

  flushParagraph()
  return blocks
}

function buildBodyHtml(content = '') {
  const blocks = parseBlogBlocks(content)
  return blocks.map((block) => {
    const text = escapeHtml(block.text)
    if (block.type === 'heading') {
      return `<p style="font-size:24px;font-weight:700;line-height:1.45;margin:24px 0 10px 0;">${text}</p>`
    }

    return `<p style="font-size:15px;font-weight:400;line-height:1.75;margin:0 0 14px 0;">${text}</p>`
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
  return parseBlogBlocks(content).filter((block) => block.text)
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

function getFormattingScopes(page) {
  return [page, ...page.frames()]
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

async function setBoldFormatting(page, enabled, currentState = null) {
  for (const scope of getFormattingScopes(page)) {
    const state = await findToolbarButtonState(scope, 'bold')
    if (state && state.active === enabled) return enabled
    if (state && await clickToolbarButton(scope, 'bold')) {
      await page.waitForTimeout(120)
      return enabled
    }
  }
  return currentState
}

async function setFontSizeFormatting(page, sizeLabel, currentState = null) {
  for (const scope of getFormattingScopes(page)) {
    const state = await findToolbarButtonState(scope, 'fontSize')
    if (state?.size === sizeLabel) return sizeLabel
    if (!(await clickToolbarButton(scope, 'fontSize'))) continue
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
  clear = false,
  formatState = { bold: null, fontSize: null },
  preferLast = false,
  trailingEnterCount = 2
) {
  const clicked = await clickBodyField(page, preferLast)
  const focused = clicked || await focusEditableEnd(page, BODY_SELECTORS, clear)
  if (!focused) throw new Error('Naver blog body input was not found.')

  const bodyBlocks = buildBodyTextBlocks(text)
  if (!bodyBlocks.length) return
  if (clear) await page.keyboard.press('Control+A')

  for (const [index, block] of bodyBlocks.entries()) {
    if (index > 0) {
      await page.keyboard.press('Enter')
      if (block.type === 'heading') {
        await page.keyboard.press('Enter')
      }
    }
    if (block.type === 'heading') {
      formatState.fontSize = await setFontSizeFormatting(page, HEADING_FONT_SIZE, formatState.fontSize)
      formatState.bold = await setBoldFormatting(page, true, formatState.bold)
    } else {
      formatState.bold = await setBoldFormatting(page, false, formatState.bold)
      formatState.fontSize = await setFontSizeFormatting(page, BODY_FONT_SIZE, formatState.fontSize)
    }
    await page.keyboard.insertText(block.text)
  }

  formatState.bold = await setBoldFormatting(page, false, formatState.bold)
  formatState.fontSize = await setFontSizeFormatting(page, BODY_FONT_SIZE, formatState.fontSize)
  for (let index = 0; index < trailingEnterCount; index += 1) {
    await page.keyboard.press('Enter')
  }
  await page.waitForTimeout(300)
  return formatState
}

async function insertBodyContentWithImagesV4(page, content, photoPaths = []) {
  updateUploadStage('fill-body', { stageLabel: 'fill body' })
  const parts = splitContentByImageMarkers(content)
  let insertedText = false
  const usedPhotoIndexes = new Set()
  const formatState = { bold: null, fontSize: null }

  for (const [index, part] of parts.entries()) {
    if (part.type === 'text') {
      const nextPart = parts[index + 1]
      await insertBodyTextV4(page, part.text, !insertedText, formatState, insertedText, nextPart?.type === 'image' ? 1 : 2)
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
      formatState.fontSize = await setFontSizeFormatting(page, BODY_FONT_SIZE, null)
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

async function uploadToNaverBlogV2({ title, content, tags = [], photoPaths = [], headless = true, scheduledAt = null }) {
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
    await insertBodyContentWithImagesV4(page, content, photoPaths)

    const targets = getEditorTargets(page)
    await openPublishDialogV2(page, targets)

    updateUploadStage('fill-tags', { stageLabel: 'fill tags', tagCount: tags.length })
    await fillPublishDialogTags(page, targets, tags)

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
