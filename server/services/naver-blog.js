import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const COOKIES_PATH = path.join(__dirname, '..', 'naver-cookies.json')
const DEBUG_DIR = path.join(__dirname, '..', 'debug-screenshots')

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
]

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
const RUNTIME_SOURCE = 'server-api'
const RUNTIME_ENDPOINT = '/api/naver/publish'

const TITLE_TEXT = '\uC81C\uBAA9'
const BODY_TEXT = '\uBCF8\uBB38'
const PUBLISH_TEXT = '\uBC1C\uD589'
const TAG_TEXT = '\uD0DC\uADF8'

const TITLE_SELECTORS = [
  '.se-section-documentTitle .se-text-paragraph',
  '.se-section-documentTitle [contenteditable="true"]',
  '[class*="documentTitle"] [contenteditable="true"]',
  '[class*="title"] [contenteditable="true"]',
  `.se-placeholder:has-text("${TITLE_TEXT}")`,
  `[placeholder*="${TITLE_TEXT}"]`,
  `[aria-label*="${TITLE_TEXT}"]`,
  `[data-placeholder*="${TITLE_TEXT}"]`,
  `[contenteditable="true"][aria-label*="${TITLE_TEXT}"]`,
  `[contenteditable="true"][data-placeholder*="${TITLE_TEXT}"]`,
  '.tit_input',
  `textarea[placeholder*="${TITLE_TEXT}"]`,
  `input[placeholder*="${TITLE_TEXT}"]`,
]

const BODY_SELECTORS = [
  '.se-section-text .se-text-paragraph',
  `.se-placeholder:has-text("${BODY_TEXT}")`,
  `[placeholder*="${BODY_TEXT}"]`,
  '.content_input',
]

const PUBLISH_SELECTORS = [
  '[data-click-area="tpb.publish"]',
  `button:has-text("${PUBLISH_TEXT}")`,
  '.btn_publish',
  '[class*="publish"]',
]

const POPUP_ROOT_SELECTOR = '[data-group="popupLayer"]'
const HELP_OVERLAY_ROOT_SELECTOR = '.container__HW_tc'
const POPUP_BLOCKING_SELECTOR = '.se-popup-dim, [data-group="popupLayer"], .container__HW_tc'
const POPUP_CLOSE_SELECTOR = '[aria-label*="\uB2EB\uAE30"], .se-popup-close, .btn_close, [class*="close"], [data-click-area*="close"]'
const POPUP_SAFE_BUTTON_PATTERNS = [
  /\uC0C8\s*\uAE00/,
  /\uCDE8\uC18C/,
  /\uB2EB\uAE30/,
  /\uD655\uC778/,
  /\uB098\uC911\uC5D0/,
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function typeMultiline(page, text) {
  const lines = String(text).split(/\r?\n/)

  return lines.reduce(async (previous, line, index) => {
    await previous
    await page.keyboard.type(line, { delay: 20 })

    if (index < lines.length - 1) {
      await page.keyboard.press('Enter')
    }
  }, Promise.resolve())
}

function parseBoldInlineSegments(text) {
  const normalizedText = String(text || '')
  const segments = []
  const boldPattern = /\*\*([\s\S]+?)\*\*/g
  let lastIndex = 0
  let match = null

  while ((match = boldPattern.exec(normalizedText)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: normalizedText.slice(lastIndex, match.index), bold: false })
    }

    segments.push({ text: match[1], bold: true })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < normalizedText.length) {
    segments.push({ text: normalizedText.slice(lastIndex), bold: false })
  }

  return segments.length > 0 ? segments : [{ text: normalizedText, bold: false }]
}

async function toggleBoldFormatting(page) {
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyB')
  await page.keyboard.up('Control')
  await sleep(120)
}

function getStrikeSelectors() {
  return [
    'button[aria-label*="취소선"]',
    '[role="button"][aria-label*="취소선"]',
    'button[aria-label*="strikethrough" i]',
    '[role="button"][aria-label*="strikethrough" i]',
    'button[aria-label*="strike through" i]',
    '[role="button"][aria-label*="strike through" i]',
    '[data-click-area*="strike"]',
    '[data-name*="strike"]',
    '[data-command*="strike"]',
    '[data-command*="lineThrough" i]',
    'button.se-toolbar-item-lineThrough',
    '.se-toolbar-item-lineThrough button',
    'button.se-toolbar-item-strikethrough',
    '.se-toolbar-item-strikethrough button',
  ]
}

function getFormattingScopes(page) {
  if (!page?.frames) return [page]
  const frames = page.frames().filter((frame) => frame !== page.mainFrame())
  return [page, ...frames]
}

async function findBoldButtonState(scope) {
  return scope.evaluate(() => {
    const candidates = [
      'button[aria-label*="굵게"]',
      '[role="button"][aria-label*="굵게"]',
      'button[aria-label*="bold" i]',
      '[role="button"][aria-label*="bold" i]',
      '[data-click-area*="bold"]',
      '[data-name="bold"]',
      '[data-command="bold"]',
      'button.se-toolbar-item-bold',
      '.se-toolbar-item-bold button',
    ]

    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }

    const score = (element) => {
      const text = normalize(element.textContent || element.getAttribute('aria-label'))
      if (text.includes('굵게')) return 100
      if (text.includes('bold')) return 90
      if (normalize(element.getAttribute('data-click-area')).includes('bold')) return 80
      if (normalize(element.getAttribute('data-name')).includes('bold')) return 70
      if (normalize(element.className).includes('bold')) return 60
      return 0
    }

    const nodes = candidates
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter((element) => element instanceof HTMLElement && isVisible(element))
      .sort((left, right) => score(right) - score(left))

    const button = nodes.find((element) => score(element) > 0)
    if (!button) return null

    const ariaPressed = normalize(button.getAttribute('aria-pressed'))
    const ariaChecked = normalize(button.getAttribute('aria-checked'))
    const classText = normalize(button.className)
    const parentClassText = normalize(button.parentElement?.className)
    const active = ariaPressed === 'true' ||
      ariaChecked === 'true' ||
      classText.includes('active') ||
      classText.includes('selected') ||
      classText.includes('on') ||
      parentClassText.includes('active') ||
      parentClassText.includes('selected') ||
      parentClassText.includes('on')

    return { active }
  })
}

async function clickBoldButton(scope) {
  return scope.evaluate(() => {
    const candidates = [
      'button[aria-label*="굵게"]',
      '[role="button"][aria-label*="굵게"]',
      'button[aria-label*="bold" i]',
      '[role="button"][aria-label*="bold" i]',
      '[data-click-area*="bold"]',
      '[data-name="bold"]',
      '[data-command="bold"]',
      'button.se-toolbar-item-bold',
      '.se-toolbar-item-bold button',
    ]

    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }

    const score = (element) => {
      const text = normalize(element.textContent || element.getAttribute('aria-label'))
      if (text.includes('굵게')) return 100
      if (text.includes('bold')) return 90
      if (normalize(element.getAttribute('data-click-area')).includes('bold')) return 80
      if (normalize(element.getAttribute('data-name')).includes('bold')) return 70
      if (normalize(element.className).includes('bold')) return 60
      return 0
    }

    const button = candidates
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter((element) => element instanceof HTMLElement && isVisible(element))
      .sort((left, right) => score(right) - score(left))
      .find((element) => score(element) > 0)

    if (!button) return false
    button.click()
    return true
  })
}

async function findStrikeButtonState(scope) {
  const candidates = getStrikeSelectors()
  return scope.evaluate((selectors) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }

    const score = (element) => {
      const text = normalize(element.textContent || element.getAttribute('aria-label'))
      if (text.includes('취소선')) return 100
      if (text.includes('strikethrough')) return 90
      if (text.includes('strike through')) return 85
      if (normalize(element.getAttribute('data-click-area')).includes('strike')) return 80
      if (normalize(element.getAttribute('data-name')).includes('strike')) return 70
      if (normalize(element.getAttribute('data-command')).includes('linethrough')) return 65
      if (normalize(element.className).includes('linethrough')) return 60
      if (normalize(element.className).includes('strikethrough')) return 55
      return 0
    }

    const nodes = selectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter((element) => element instanceof HTMLElement && isVisible(element))
      .sort((left, right) => score(right) - score(left))

    const button = nodes.find((element) => score(element) > 0)
    if (!button) return null

    const ariaPressed = String(button.getAttribute('aria-pressed') || '').trim().toLowerCase()
    const ariaChecked = String(button.getAttribute('aria-checked') || '').trim().toLowerCase()
    const classText = normalize(button.className)
    const parentClassText = normalize(button.parentElement?.className)
    const active = ariaPressed === 'true' ||
      ariaChecked === 'true' ||
      classText.includes('active') ||
      classText.includes('selected') ||
      classText.includes('on') ||
      parentClassText.includes('active') ||
      parentClassText.includes('selected') ||
      parentClassText.includes('on')

    return { active }
  }, candidates)
}

async function clickStrikeButton(scope) {
  const candidates = getStrikeSelectors()
  return scope.evaluate((selectors) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }

    const score = (element) => {
      const text = normalize(element.textContent || element.getAttribute('aria-label'))
      if (text.includes('취소선')) return 100
      if (text.includes('strikethrough')) return 90
      if (text.includes('strike through')) return 85
      if (normalize(element.getAttribute('data-click-area')).includes('strike')) return 80
      if (normalize(element.getAttribute('data-name')).includes('strike')) return 70
      if (normalize(element.getAttribute('data-command')).includes('linethrough')) return 65
      if (normalize(element.className).includes('linethrough')) return 60
      if (normalize(element.className).includes('strikethrough')) return 55
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
  }, candidates)
}

async function releaseFormattingModifiers(page) {
  for (const key of ['Shift', 'Control', 'Alt', 'Meta']) {
    try {
      await page.keyboard.up(key)
    } catch {}
  }
}

async function setBoldFormatting(page, enabled) {
  await releaseFormattingModifiers(page)

  for (const scope of getFormattingScopes(page)) {
    try {
      const state = await findBoldButtonState(scope)
      if (!state) continue
      if (state.active !== enabled) {
        const clicked = await clickBoldButton(scope)
        if (clicked) {
          await sleep(120)
        }
      }
      return
    } catch {}
  }

  await toggleBoldFormatting(page)
}

async function ensureStrikeFormattingOff(page) {
  await releaseFormattingModifiers(page)

  for (const scope of getFormattingScopes(page)) {
    try {
      const state = await findStrikeButtonState(scope)
      if (!state) continue
      if (state.active) {
        const clicked = await clickStrikeButton(scope)
        if (clicked) {
          await sleep(120)
        }
      }
      return
    } catch {}
  }
}

async function typeMultilineWithFormatting(page, text) {
  const lines = String(text).split(/\r?\n/)

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]
    const inlineSegments = parseBoldInlineSegments(line)
    await ensureStrikeFormattingOff(page)

    for (const segment of inlineSegments) {
      if (!segment.text) continue

      if (segment.bold) {
        await ensureStrikeFormattingOff(page)
        await setBoldFormatting(page, true)
        await page.keyboard.type(segment.text, { delay: 20 })
        await setBoldFormatting(page, false)
        await ensureStrikeFormattingOff(page)
      } else {
        await ensureStrikeFormattingOff(page)
        await page.keyboard.type(segment.text, { delay: 20 })
      }
    }

    if (lineIndex < lines.length - 1) {
      await setBoldFormatting(page, false)
      await ensureStrikeFormattingOff(page)
      await page.keyboard.press('Enter')
    }
  }

  await setBoldFormatting(page, false)
  await ensureStrikeFormattingOff(page)
}

function ensureDebugDir() {
  if (!fs.existsSync(DEBUG_DIR)) {
    fs.mkdirSync(DEBUG_DIR, { recursive: true })
  }
}

async function validateCookies() {
  if (!fs.existsSync(COOKIES_PATH)) {
    throw new Error('naver-cookies.json file is missing.')
  }

  const storage = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'))
  if (!storage.cookies?.length) {
    throw new Error('Saved Naver cookies are empty.')
  }

  return storage
}

async function saveDebug(page, name) {
  try {
    ensureDebugDir()
    const ts = Date.now()
    await page.screenshot({ path: path.join(DEBUG_DIR, `${ts}-${name}.png`), fullPage: true })
    fs.writeFileSync(path.join(DEBUG_DIR, `${ts}-${name}.html`), await page.content(), 'utf8')
    console.log(`[Naver Blog] Saved debug snapshot: ${ts}-${name}.png`)
  } catch (error) {
    console.warn('[Naver Blog] Failed to save debug snapshot:', error.message)
  }
}

function getEditorTargets(page) {
  const frames = page
    .frames()
    .filter((frame) => frame !== page.mainFrame())
    .sort((left, right) => {
      const leftName = left.name() || ''
      const rightName = right.name() || ''
      const leftPriority = leftName === 'mainFrame' ? 0 : leftName.includes('mainFrame') ? 1 : 2
      const rightPriority = rightName === 'mainFrame' ? 0 : rightName.includes('mainFrame') ? 1 : 2
      return leftPriority - rightPriority
    })
    .map((frame, index) => ({
      label: `frame:${frame.name() || index}`,
      scope: frame,
    }))

  return [...frames, { label: 'page', scope: page }]
}

function isPopupInterceptionError(error) {
  return /intercepts pointer events/i.test(error?.message || '')
}

async function evaluatePopupAction(scope) {
  return scope.evaluate(
    ({ closeSelector, helpRootSelector, patterns, rootSelector }) => {
      const isVisible = (element) => {
        if (!(element instanceof Element)) {
          return false
        }

        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
      }

      const isClickable = (element) => {
        if (!(element instanceof HTMLElement)) {
          return false
        }

        const style = window.getComputedStyle(element)
        return isVisible(element) && style.pointerEvents !== 'none' && !element.hasAttribute('disabled')
      }

      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
      const popupRoots = Array.from(document.querySelectorAll(rootSelector)).filter(isVisible)
      const helpRoots = Array.from(document.querySelectorAll(helpRootSelector))
        .filter((root) => isVisible(root) && root.querySelector('.se-help-title'))

      if (popupRoots.length === 0 && helpRoots.length === 0) {
        return null
      }

      const roots = [...popupRoots, ...helpRoots]
      const buttons = roots.flatMap((root) => Array.from(root.querySelectorAll('button')).filter(isClickable))
      const compiledPatterns = patterns.map((pattern) => new RegExp(pattern, 'i'))

      for (const matcher of compiledPatterns) {
        const matchedButton = buttons.find((button) =>
          matcher.test(normalize(button.textContent || button.getAttribute('aria-label')))
        )
        if (matchedButton) {
          matchedButton.click()
          return { action: 'button', text: normalize(matchedButton.textContent || matchedButton.getAttribute('aria-label')) }
        }
      }

      const closeButton = roots
        .flatMap((root) => Array.from(root.querySelectorAll(closeSelector)).filter(isClickable))
        .find(Boolean)

      if (closeButton) {
        closeButton.click()
        return { action: 'close' }
      }

      const dim = popupRoots
        .flatMap((root) => Array.from(root.querySelectorAll('.se-popup-dim')).filter(isClickable))
        .find(Boolean)

      if (dim) {
        dim.click()
        return { action: 'dim' }
      }

      const helpRoot = helpRoots.find(Boolean)
      if (helpRoot instanceof HTMLElement) {
        helpRoot.style.setProperty('display', 'none', 'important')
        helpRoot.style.setProperty('pointer-events', 'none', 'important')
        helpRoot.setAttribute('data-autoform-dismissed', 'true')
        return { action: 'hide-help' }
      }

      return { action: 'visible' }
    },
    {
      closeSelector: POPUP_CLOSE_SELECTOR,
      helpRootSelector: HELP_OVERLAY_ROOT_SELECTOR,
      patterns: POPUP_SAFE_BUTTON_PATTERNS.map((pattern) => pattern.source),
      rootSelector: POPUP_ROOT_SELECTOR,
    }
  )
}

async function dismissEditorPopups(page, targets = getEditorTargets(page)) {
  const dismissals = []

  for (let attempt = 0; attempt < 4; attempt += 1) {
    let changed = false

    try {
      await page.keyboard.press('Escape')
      changed = true
      await sleep(150)
    } catch {}

    for (const target of targets) {
      try {
        const result = await evaluatePopupAction(target.scope)
        if (result) {
          dismissals.push(result.text ? `${target.label}:${result.action}:${result.text}` : `${target.label}:${result.action}`)
          changed = true
        }
      } catch {}
    }

    if (!changed) {
      break
    }

    await sleep(400)
  }

  if (dismissals.length > 0) {
    console.log(`[Naver Blog] Popup recovery actions: ${dismissals.join(', ')}`)
  }
}

async function focusByDom(field) {
  await field.evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      return
    }

    element.focus()
    element.click?.()
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  })
}

async function focusEditableFieldByDom(scope, fieldName) {
  return scope.evaluate(({ bodyText, field, titleText }) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
    const isVisible = (element) => {
      if (!(element instanceof Element)) {
        return false
      }

      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && style.pointerEvents !== 'none' && rect.width > 0 && rect.height > 0
    }

    const getMeta = (element) => {
      const ancestors = []
      let current = element.parentElement
      while (current && ancestors.length < 4) {
        ancestors.push(current)
        current = current.parentElement
      }
      const ancestorText = ancestors.map((node) => normalize(node.textContent)).join(' ')
      const placeholder = normalize(
        element.getAttribute?.('placeholder') ||
        element.getAttribute?.('aria-label') ||
        element.getAttribute?.('data-placeholder')
      )
      const text = normalize(element.textContent)
      const className = normalize(element.className)
      const rect = element.getBoundingClientRect()
      const parentClass = normalize(element.parentElement?.className)
      const ancestorClass = normalize(ancestors.map((node) => node.className).join(' '))
      const nearestSectionClass = normalize(element.closest?.('[class]')?.className)
      return { ancestorClass, ancestorText, className, nearestSectionClass, parentClass, placeholder, rect, text }
    }

    const candidates = Array.from(document.querySelectorAll('[contenteditable="true"], textarea, input[type="text"], input:not([type]), [role="textbox"]'))
      .filter((element) => element instanceof HTMLElement)
      .filter(isVisible)
      .map((element) => ({ element, ...getMeta(element) }))
      .map((candidate) => {
        const haystack = [
          candidate.placeholder,
          candidate.text,
          candidate.className,
          candidate.parentClass,
          candidate.ancestorClass,
          candidate.ancestorText,
          candidate.nearestSectionClass,
        ]
          .join(' ')
          .toLowerCase()
        let score = 0

        if (field === 'title') {
          if (haystack.includes(titleText.toLowerCase())) score += 12
          if (haystack.includes('documenttitle') || haystack.includes('section-documenttitle')) score += 10
          if (haystack.includes('title')) score += 8
          if (haystack.includes('se-section-documenttitle')) score += 10
          if (candidate.rect.top < 200) score += 12
          if (candidate.rect.top < 320) score += 8
          if (candidate.rect.height >= 40) score += 3
          if (candidate.rect.width >= 240) score += 2
        } else {
          if (haystack.includes(bodyText.toLowerCase())) score += 10
          if (haystack.includes('content') || haystack.includes('text')) score += 6
          if (candidate.rect.top >= 180) score += 6
          if (candidate.rect.height >= 20) score += 2
        }

        return { ...candidate, score }
      })
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.rect.top - right.rect.top)

    const target = candidates[0]
    if (!target) {
      return null
    }

    target.element.focus()
    target.element.click?.()
    target.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      return {
        ancestorClass: target.ancestorClass,
        className: target.className,
        placeholder: target.placeholder,
        score: target.score,
        top: Math.round(target.rect.top),
      }
  }, { bodyText: BODY_TEXT, field: fieldName, titleText: TITLE_TEXT })
}

async function clickPublishButtonByDom(scope, which = 'first') {
  return scope.evaluate(({ publishText, whichButton }) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
    const isVisible = (element) => {
      if (!(element instanceof Element)) {
        return false
      }

      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && style.pointerEvents !== 'none' && rect.width > 0 && rect.height > 0
    }

    const isEnabled = (element) => {
      if (element instanceof HTMLButtonElement) {
        return !element.disabled
      }

      return !element.hasAttribute?.('disabled') && element.getAttribute?.('aria-disabled') !== 'true'
    }
    const getText = (element) => normalize(element.textContent || element.getAttribute?.('aria-label') || element.getAttribute?.('value'))
    const getClickArea = (element) => normalize(element.getAttribute?.('data-click-area'))
    const getClassName = (element) => normalize(element.className)
    const getCandidates = (root) => Array.from(root.querySelectorAll('button, [role="button"], a, input[type="button"], input[type="submit"], [data-click-area], [class*="publish"]'))
      .filter((element) => element instanceof HTMLElement)
      .filter((element) => isVisible(element) && isEnabled(element))
      .map((element) => {
        const text = getText(element)
        const className = getClassName(element)
        const clickArea = getClickArea(element)
        const rect = element.getBoundingClientRect()
        const lowerClass = className.toLowerCase()
        const lowerClickArea = clickArea.toLowerCase()
        const looksLikePublish =
          text.includes(publishText) ||
          lowerClass.includes('publish') ||
          lowerClickArea.includes('publish')

        return looksLikePublish ? { element, rect, text, clickArea } : null
      })
      .filter(Boolean)

    const sortCandidates = (candidates) => candidates.sort((left, right) => {
      if (whichButton === 'last') {
        return right.rect.top - left.rect.top || right.rect.left - left.rect.left
      }

      return left.rect.top - right.rect.top || left.rect.left - right.rect.left
    })

    if (whichButton === 'last') {
      const panelRoot = Array.from(document.querySelectorAll('body *'))
        .filter((element) => element instanceof HTMLElement)
        .filter(isVisible)
        .find((element) => {
          const text = normalize(element.textContent)
          return text.includes('카테고리') && text.includes('공개 설정') && text.includes('발행 시간')
        })

      if (panelRoot) {
        const panelRect = panelRoot.getBoundingClientRect()
        const panelCandidates = getCandidates(panelRoot)
          .map((candidate) => {
            const isBottomArea = candidate.rect.top >= panelRect.top + panelRect.height * 0.65
            const isRightArea = candidate.rect.left >= panelRect.left + panelRect.width * 0.45
            const score =
              (candidate.text.includes(publishText) ? 4 : 0) +
              (candidate.clickArea.toLowerCase().includes('publish') ? 6 : 0) +
              (String(candidate.element.tagName || '').toLowerCase() === 'button' ? 2 : 0) +
              (isBottomArea ? 10 : 0) +
              (isRightArea ? 6 : 0)

            return { ...candidate, score }
          })
          .sort((left, right) => right.score - left.score || right.rect.top - left.rect.top || right.rect.left - left.rect.left)

        if (panelCandidates[0]) {
          const target = panelCandidates[0]
          target.element.focus()
          target.element.click()
          target.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
          return {
            clickArea: target.clickArea,
            text: target.text,
            top: Math.round(target.rect.top),
          }
        }
      }
    }

    const publishCandidates = sortCandidates(getCandidates(document))

    const target = publishCandidates[0]
    if (!target) {
      return null
    }

    target.element.focus()
    target.element.click()
    target.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    return {
      clickArea: target.clickArea,
      text: target.text,
      top: Math.round(target.rect.top),
    }
  }, { publishText: PUBLISH_TEXT, whichButton: which })
}

async function withPopupRecovery(page, targets, action, label, options = {}) {
  const attempts = options.attempts || 4

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await dismissEditorPopups(page, targets)

    try {
      return await action()
    } catch (error) {
      if (!isPopupInterceptionError(error) || attempt === attempts) {
        throw error
      }

      console.warn(`[Naver Blog] ${label} was blocked by a popup. Retrying (${attempt}/${attempts})`)
      await dismissEditorPopups(page, targets)
      await sleep(250 * attempt)
    }
  }
}

async function resolveWriteUrls(page) {
  await page.goto('https://www.naver.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await sleep(randomDelay(1500, 2500))

  await page.goto('https://blog.naver.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await sleep(randomDelay(2000, 3000))

  const blogUrl = await page.evaluate(() => {
    const anchor =
      document.querySelector('a[href*="blog.naver.com/"][href*="PostList"]') ||
      document.querySelector('a[href*="blog.naver.com/"][class*="myMenu"]') ||
      document.querySelector('.link_my a, .my_blog a, a.link_blog_home')
    return anchor?.href || null
  })

  return [
    'https://blog.naver.com/GoBlogWrite.naver',
    blogUrl ? `${blogUrl.replace(/\/+$/, '')}?Redirect=Write` : null,
  ].filter(Boolean)
}

async function focusAndType(page, targets, selectors, text, fieldName) {
  const attempts = []

  for (const target of targets) {
    for (const selector of selectors) {
      try {
        const field = target.scope.locator(selector).first()
        await field.waitFor({ state: 'visible', timeout: 3000 })

        try {
          await withPopupRecovery(
            page,
            targets,
            () => field.click({ timeout: 3000 }),
            `${fieldName} click via ${target.label} -> ${selector}`
          )
        } catch (error) {
          if (!isPopupInterceptionError(error)) {
            throw error
          }

          await dismissEditorPopups(page, targets)
          await focusByDom(field)
        }

        await sleep(300)
        await typeMultiline(page, text)
        console.log(`[Naver Blog] Filled ${fieldName} via ${target.label} -> ${selector}`)
        return
      } catch (error) {
        attempts.push(`${target.label} -> ${selector}: ${error.message}`)
      }
    }

    try {
      await dismissEditorPopups(page, targets)
      const result = await focusEditableFieldByDom(target.scope, fieldName)
      if (result) {
        await sleep(300)
        await typeMultiline(page, text)
        console.log(
          `[Naver Blog] Filled ${fieldName} via ${target.label} -> dom score=${result.score} top=${result.top} placeholder="${result.placeholder}" class="${result.className}"`
        )
        return
      }
    } catch (error) {
      attempts.push(`${target.label} -> dom-editable: ${error.message}`)
    }
  }

  throw new Error(`[${RUNTIME_SOURCE}] Unable to focus ${fieldName}. ${attempts.slice(0, 6).join(' | ')}`)
}

async function clickPublishButton(page, targets, which = 'first') {
  const attempts = []

  for (const target of targets) {
    try {
      const button = target.scope.getByRole('button', { name: /\uBC1C\uD589/ })[which]()
      try {
        await withPopupRecovery(page, targets, () => button.click({ timeout: 3000 }), `publish button (${which}) via ${target.label}`)
      } catch (error) {
        if (!isPopupInterceptionError(error)) {
          throw error
        }

        await dismissEditorPopups(page, targets)
        await focusByDom(button)
      }
      console.log(`[Naver Blog] Clicked publish button via ${target.label} (${which})`)
      return
    } catch (error) {
      attempts.push(`${target.label} -> role=button[name*=publish]: ${error.message}`)
    }

    for (const selector of PUBLISH_SELECTORS) {
      try {
        const button = target.scope.locator(selector)[which]()
        try {
          await withPopupRecovery(
            page,
            targets,
            () => button.click({ timeout: 3000 }),
            `publish button (${which}) via ${target.label} -> ${selector}`
          )
        } catch (error) {
          if (!isPopupInterceptionError(error)) {
            throw error
          }

          await dismissEditorPopups(page, targets)
          await focusByDom(button)
        }
        console.log(`[Naver Blog] Clicked publish button via ${target.label} -> ${selector} (${which})`)
        return
      } catch (error) {
        attempts.push(`${target.label} -> ${selector}: ${error.message}`)
      }
    }

    try {
      const result = await clickPublishButtonByDom(target.scope, which)
      if (result) {
        console.log(
          `[Naver Blog] Clicked publish button via ${target.label} -> dom (${which}) top=${result.top} text="${result.text}" area="${result.clickArea}"`
        )
        return
      }
    } catch (error) {
      attempts.push(`${target.label} -> dom-publish: ${error.message}`)
    }
  }

  throw new Error(`[${RUNTIME_SOURCE}] Unable to click publish button. ${attempts.slice(0, 6).join(' | ')}`)
}

async function fillTags(page, targets, tags) {
  if (!Array.isArray(tags) || tags.length === 0) {
    return
  }

  for (const target of targets) {
    try {
      const tagInput = target.scope.locator(`input[placeholder*="${TAG_TEXT}"]`).first()
      await withPopupRecovery(page, targets, () => tagInput.click({ timeout: 3000 }), `tag input via ${target.label}`)

      for (const tag of tags.slice(0, 10)) {
        await page.keyboard.type(String(tag), { delay: 25 })
        await page.keyboard.press('Enter')
        await sleep(150)
      }

      console.log(`[Naver Blog] Filled tags via ${target.label}`)
      return
    } catch {}
  }

  console.warn('[Naver Blog] Failed to set tags. Continuing without tags.')
}

export async function uploadToNaverBlog({ title, content, tags = [] }) {
  if (!title) {
    throw new Error('Title is required.')
  }

  if (!content) {
    throw new Error('Content is required.')
  }

  const storage = await validateCookies()
  const browser = await chromium.launch({ headless: true, args: BROWSER_ARGS })

  try {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 800 },
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
      storageState: storage,
    })

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
      Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko'] })
    })

    const page = await context.newPage()
    let currentStep = 'initialize'

    try {
      currentStep = 'resolve-write-url'
      const writeUrls = await resolveWriteUrls(page)
      let loadedUrl = null

      for (const url of writeUrls) {
        try {
          console.log(`[Naver Blog] Opening editor candidate: ${url}`)
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
          await sleep(3000)
          loadedUrl = page.url()
          console.log(`[Naver Blog] Editor loaded: ${loadedUrl}`)
          break
        } catch (error) {
          console.warn(`[Naver Blog] Failed to open ${url}: ${error.message}`)
        }
      }

      if (!loadedUrl) {
        throw new Error('Unable to open the Naver blog editor.')
      }

      currentStep = 'capture-editor'
      await saveDebug(page, 'editor-loaded')

      currentStep = 'discover-targets'
      const targets = getEditorTargets(page)
      console.log('[Naver Blog] Editor targets:', targets.map((target) => target.label).join(', '))

      currentStep = 'dismiss-popup'
      await dismissEditorPopups(page, targets)
      await sleep(1000)

      currentStep = 'fill-title'
      await focusAndType(page, targets, TITLE_SELECTORS, title, 'title')

      currentStep = 'fill-body'
      await sleep(randomDelay(500, 1200))
      try {
        await focusField(page, targets, BODY_SELECTORS, 'body')
        await sleep(300)
        await typeMultilineWithFormatting(page, content)
      } catch (error) {
        await page.keyboard.press('Tab')
        await sleep(500)
        await typeMultilineWithFormatting(page, content)
        console.warn('[Naver Blog] Body field fallback used after selector failure:', error.message)
      }

      currentStep = 'open-publish-dialog'
      await sleep(randomDelay(1500, 2500))
      await clickPublishButton(page, targets, 'first')

      currentStep = 'fill-tags'
      await sleep(randomDelay(1200, 2000))
      await fillTags(page, targets, tags)

      currentStep = 'confirm-publish'
      await sleep(randomDelay(1000, 2000))
      await clickPublishButton(page, targets, 'last')

      currentStep = 'await-result'
      try {
        await page.waitForURL(/blog\.naver\.com\/.+\/\d+/, { timeout: 60000 })
      } catch {
        await saveDebug(page, 'after-publish')
      }

      return { endpoint: RUNTIME_ENDPOINT, source: RUNTIME_SOURCE, url: page.url() }
    } catch (error) {
      await saveDebug(page, `failure-${currentStep}`)
      throw new Error(`[${RUNTIME_SOURCE}] Naver upload failed during ${currentStep}: ${error.message}`)
    } finally {
      await context.close()
    }
  } finally {
    await browser.close()
  }
}
