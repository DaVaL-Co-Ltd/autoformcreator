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
const CATEGORY_TEXT = '\uCE74\uD14C\uACE0\uB9AC'
const VISIBILITY_TEXT = '\uACF5\uAC1C \uC124\uC815'
const SCHEDULE_TEXT = '\uBC1C\uD589 \uC2DC\uAC04'
const FONT_SIZE_TEXT = '\uAE00\uC790 \uD06C\uAE30'

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

const TAG_INPUT_SELECTORS = [
  `input[placeholder*="${TAG_TEXT}"]`,
  `textarea[placeholder*="${TAG_TEXT}"]`,
  `input[aria-label*="${TAG_TEXT}"]`,
  `textarea[aria-label*="${TAG_TEXT}"]`,
  `[contenteditable="true"][aria-label*="${TAG_TEXT}"]`,
  `[contenteditable="true"][data-placeholder*="${TAG_TEXT}"]`,
  `[class*="tag"] input`,
  `[class*="tag"] textarea`,
  `[class*="tag"] [contenteditable="true"]`,
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

// SmartEditor媛 ?占쎈젰 占?auto-format?占쎈줈 蹂?占쏀븯??留덉빱???占쎄굅 (痍⑥냼????諛⑼옙?)
// ?? 蹂쇰뱶 泥섎━??parseBoldInlineSegments媛 蹂꾨룄占?泥섎━?占쏙옙?占?** ???占쎄린???占쎄굅 ????
function stripAutoFormatMarkers(raw) {
  return String(raw || '')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/--([^\n-]+)--/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^\*])\*([^*\s][^*]*[^*\s])\*(?!\*)/g, '$1$2')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_\s][^_]*[^_\s])_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/~/g, '')
}

function typeMultiline(page, text) {
  const lines = stripAutoFormatMarkers(text).split(/\r?\n/)

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
  await releaseFormattingModifiers(page)
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyB')
  await page.keyboard.up('Control')
  await sleep(120)
}

function getFormattingScopes(page) {
  if (!page?.frames) return [page]
  const frames = page.frames().filter((frame) => frame !== page.mainFrame())
  return [page, ...frames]
}

async function findBoldButtonState(scope) {
  return scope.evaluate(() => {
    const candidates = [
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

    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }

    const score = (element) => {
      const text = normalize([
        element.textContent,
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
        element.getAttribute('data-name'),
        element.getAttribute('data-command'),
        element.getAttribute('data-tool'),
      ].filter(Boolean).join(' '))
      if (text.includes('bold')) return 100
      if (normalize(element.getAttribute('data-click-area')).includes('bold')) return 90
      if (normalize(element.getAttribute('data-name')).includes('bold')) return 80
      if (normalize(element.className).includes('bold')) return 70
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
    const dataActive = normalize(button.getAttribute('data-active'))
    const dataSelected = normalize(button.getAttribute('data-selected'))
    const classText = normalize(button.className)
    const parentClassText = normalize(button.parentElement?.className)
    const active = ariaPressed === 'true' ||
      ariaChecked === 'true' ||
      dataActive === 'true' ||
      dataSelected === 'true' ||
      classText.includes('active') ||
      classText.includes('selected') ||
      classText.includes('on') ||
      classText.includes('is-active') ||
      classText.includes('is-selected') ||
      parentClassText.includes('active') ||
      parentClassText.includes('selected') ||
      parentClassText.includes('on') ||
      parentClassText.includes('is-active') ||
      parentClassText.includes('is-selected')

    return {
      active,
      selectorText: button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent || '',
    }
  })
}

async function clickBoldButton(scope) {
  return scope.evaluate(() => {
    const candidates = [
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

    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }

    const score = (element) => {
      const text = normalize([
        element.textContent,
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
        element.getAttribute('data-name'),
        element.getAttribute('data-command'),
        element.getAttribute('data-tool'),
      ].filter(Boolean).join(' '))
      if (text.includes('bold')) return 100
      if (normalize(element.getAttribute('data-click-area')).includes('bold')) return 90
      if (normalize(element.getAttribute('data-name')).includes('bold')) return 80
      if (normalize(element.className).includes('bold')) return 70
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

async function findStrikethroughButtonState(scope) {
  return scope.evaluate(() => {
    const candidates = [
      'button[aria-label*="strike" i]',
      'button[aria-label*="strikethrough" i]',
      'button[aria-label*="line through" i]',
      'button[aria-label*="취소선"]',
      '[role="button"][aria-label*="strike" i]',
      '[role="button"][aria-label*="strikethrough" i]',
      '[role="button"][aria-label*="line through" i]',
      '[role="button"][aria-label*="취소선"]',
      '[data-click-area*="strike"]',
      '[data-click-area*="line-through"]',
      '[data-name="strikeThrough"]',
      '[data-name="strikethrough"]',
      '[data-command="strikeThrough"]',
      '[data-command="strikethrough"]',
      '[data-tool="strikeThrough"]',
      '[data-tool="strikethrough"]',
      '[data-testid*="strike"]',
      'button.se-toolbar-item-strikethrough',
      '.se-toolbar-item-strikethrough button',
    ]

    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }

    const score = (element) => {
      const text = normalize([
        element.textContent,
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
        element.getAttribute('data-name'),
        element.getAttribute('data-command'),
        element.getAttribute('data-tool'),
      ].filter(Boolean).join(' '))
      if (text.includes('strikethrough')) return 100
      if (text.includes('line through')) return 95
      if (text.includes('strike through')) return 95
      if (text.includes('strike')) return 90
      if (text.includes('취소선')) return 90
      if (normalize(element.getAttribute('data-click-area')).includes('strike')) return 85
      if (normalize(element.className).includes('strike')) return 75
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
    const dataActive = normalize(button.getAttribute('data-active'))
    const dataSelected = normalize(button.getAttribute('data-selected'))
    const classText = normalize(button.className)
    const parentClassText = normalize(button.parentElement?.className)
    const active = ariaPressed === 'true' ||
      ariaChecked === 'true' ||
      dataActive === 'true' ||
      dataSelected === 'true' ||
      classText.includes('active') ||
      classText.includes('selected') ||
      classText.includes('on') ||
      classText.includes('is-active') ||
      classText.includes('is-selected') ||
      parentClassText.includes('active') ||
      parentClassText.includes('selected') ||
      parentClassText.includes('on') ||
      parentClassText.includes('is-active') ||
      parentClassText.includes('is-selected')

    return { active }
  })
}

async function clickStrikethroughButton(scope) {
  return scope.evaluate(() => {
    const candidates = [
      'button[aria-label*="strike" i]',
      'button[aria-label*="strikethrough" i]',
      'button[aria-label*="line through" i]',
      'button[aria-label*="취소선"]',
      '[role="button"][aria-label*="strike" i]',
      '[role="button"][aria-label*="strikethrough" i]',
      '[role="button"][aria-label*="line through" i]',
      '[role="button"][aria-label*="취소선"]',
      '[data-click-area*="strike"]',
      '[data-click-area*="line-through"]',
      '[data-name="strikeThrough"]',
      '[data-name="strikethrough"]',
      '[data-command="strikeThrough"]',
      '[data-command="strikethrough"]',
      '[data-tool="strikeThrough"]',
      '[data-tool="strikethrough"]',
      '[data-testid*="strike"]',
      'button.se-toolbar-item-strikethrough',
      '.se-toolbar-item-strikethrough button',
    ]

    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }

    const score = (element) => {
      const text = normalize([
        element.textContent,
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
        element.getAttribute('data-name'),
        element.getAttribute('data-command'),
        element.getAttribute('data-tool'),
      ].filter(Boolean).join(' '))
      if (text.includes('strikethrough')) return 100
      if (text.includes('line through')) return 95
      if (text.includes('strike through')) return 95
      if (text.includes('strike')) return 90
      if (text.includes('취소선')) return 90
      if (normalize(element.getAttribute('data-click-area')).includes('strike')) return 85
      if (normalize(element.className).includes('strike')) return 75
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

async function releaseFormattingModifiers(page) {
  for (const key of ['Shift', 'Control', 'Alt', 'Meta']) {
    try {
      await page.keyboard.up(key)
    } catch {}
  }
}

async function recoverFormattingContext(page) {
  try {
    const targets = getEditorTargets(page)
    await dismissEditorPopups(page, targets)
    await focusField(page, targets, BODY_SELECTORS, 'body')
    await sleep(120)
  } catch {}
}

async function setStrikethroughFormatting(page, enabled, currentState) {
  if (currentState === enabled) return currentState

  const scopes = getFormattingScopes(page)
  const readStrikethroughState = async () => {
    for (const scope of scopes) {
      try {
        const state = await findStrikethroughButtonState(scope)
        if (state && typeof state.active === 'boolean') {
          return state.active
        }
      } catch {}
    }
    return null
  }

  let observedState = await readStrikethroughState()
  if (observedState === null) {
    await recoverFormattingContext(page)
    observedState = await readStrikethroughState()
  }
  if (observedState === enabled) return enabled

  for (let attempt = 0; attempt < 3; attempt += 1) {
    for (const scope of scopes) {
      try {
        if (await clickStrikethroughButton(scope)) {
          await sleep(80)
          const nextState = await readStrikethroughState()
          if (nextState === enabled) {
            return enabled
          }
          break
        }
      } catch {}
    }
    await recoverFormattingContext(page)
    await sleep(80)
  }

  return observedState === null ? currentState : observedState
}

async function setBoldFormatting(page, enabled, currentState) {
  if (currentState === enabled) return currentState

  const scopes = getFormattingScopes(page)
  const readBoldState = async () => {
    for (const scope of scopes) {
      try {
        const state = await findBoldButtonState(scope)
        if (state && typeof state.active === 'boolean') {
          return state.active
        }
      } catch {}
    }
    return null
  }

  let observedState = await readBoldState()
  if (observedState === null) {
    await recoverFormattingContext(page)
    observedState = await readBoldState()
  }
  if (observedState === enabled) return enabled

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await toggleBoldFormatting(page)
    const nextState = await readBoldState()
    if (nextState === enabled) {
      return enabled
    }
    if (nextState === null) {
      for (const scope of scopes) {
        try {
          if (await clickBoldButton(scope)) {
            await sleep(80)
            const clickedState = await readBoldState()
            if (clickedState === enabled) {
              return enabled
            }
            break
          }
        } catch {}
      }
      await recoverFormattingContext(page)
      await sleep(80)
    }
  }

  return observedState === null ? enabled : observedState
}

async function clickSubheadingButton(scope) {
  return scope.evaluate(() => {
    const candidates = [
      'button[aria-label*="Heading" i]',
      'button[aria-label*="Subtitle" i]',
      '[role="button"][aria-label*="Heading" i]',
      '[role="button"][aria-label*="Subtitle" i]',
      '[data-name="header1"]',
      '[data-name="header2"]',
      '[data-name="header3"]',
      '[data-name="heading"]',
      '[data-name="subtitle"]',
      '[data-click-area*="header"]',
      '[data-click-area*="heading"]',
      '[data-click-area*="subtitle"]',
      'button.se-toolbar-item-h1',
      'button.se-toolbar-item-h2',
      'button.se-toolbar-item-h3',
      'button.se-toolbar-item-headline',
      'button.se-toolbar-item-subtitle',
      'button.se-toolbar-item-paragraph-style',
    ]

    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }

    const score = (element) => {
      const text = normalize([
        element.textContent,
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
        element.getAttribute('data-name'),
        element.getAttribute('data-click-area'),
      ].filter(Boolean).join(' '))
      if (text.includes('subtitle')) return 100
      if (text.includes('heading')) return 95
      if (text.includes('header2')) return 90
      if (text.includes('header1')) return 85
      if (text.includes('header3')) return 80
      if (text.includes('header')) return 75
      if (normalize(element.className).includes('headline') || normalize(element.className).includes('subtitle')) return 70
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

async function clickFontSizeButton(scope) {
  return scope.evaluate(() => {
    const koreanFontSizeText = '\uAE00\uC790 \uD06C\uAE30'.toLowerCase()
    const candidates = [
      `button[aria-label*="${FONT_SIZE_TEXT}"]`,
      `button[title*="${FONT_SIZE_TEXT}"]`,
      `[title*="${FONT_SIZE_TEXT}"]`,
      `[role="button"][aria-label*="${FONT_SIZE_TEXT}"]`,
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

    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }

    const score = (element) => {
      const text = normalize([
        element.textContent,
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
        element.getAttribute('data-name'),
        element.getAttribute('data-command'),
        element.getAttribute('data-tool'),
        element.getAttribute('data-click-area'),
      ].filter(Boolean).join(' '))
      if (text.includes(koreanFontSizeText)) return 100
      if (text.includes('font size')) return 95
      if (text.includes('fontsize')) return 92
      if (normalize(element.getAttribute('data-name')).includes('fontsize')) return 85
      if (normalize(element.getAttribute('data-click-area')).includes('font')) return 75
      if (normalize(element.getAttribute('data-click-area')).includes('size')) return 72
      if (normalize(element.className).includes('font')) return 65
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

async function findFontSizeState(scope) {
  return scope.evaluate(() => {
    const candidates = [
      `button[aria-label*="${FONT_SIZE_TEXT}"]`,
      `button[title*="${FONT_SIZE_TEXT}"]`,
      `[title*="${FONT_SIZE_TEXT}"]`,
      `[role="button"][aria-label*="${FONT_SIZE_TEXT}"]`,
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

    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }

    const extract = (value) => {
      const normalized = normalize(value)
      const match = normalized.match(/\b(\d{1,2})(?:\s*px)?\b/)
      return match ? match[1] : null
    }

    const score = (element) => {
      const text = normalize([
        element.textContent,
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
        element.getAttribute('data-name'),
        element.getAttribute('data-command'),
        element.getAttribute('data-tool'),
        element.getAttribute('data-click-area'),
      ].filter(Boolean).join(' '))
      if (text.includes('font size')) return 100
      if (text.includes('fontsize')) return 95
      if (text.includes(normalize(FONT_SIZE_TEXT))) return 92
      if (normalize(element.className).includes('font')) return 70
      return 0
    }

    const button = candidates
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter((element) => element instanceof HTMLElement && isVisible(element))
      .sort((left, right) => score(right) - score(left))
      .find((element) => score(element) > 0)

    if (!button) return null

    const values = [
      button.textContent,
      button.getAttribute('aria-label'),
      button.getAttribute('title'),
      button.getAttribute('data-value'),
      button.getAttribute('data-size'),
      button.getAttribute('value'),
      button.getAttribute('data-current-size'),
      button.getAttribute('data-current-value'),
    ]

    for (const value of values) {
      const size = extract(value)
      if (size) return size
    }

    const descendants = Array.from(button.querySelectorAll('*'))
    for (const node of descendants) {
      const size = extract(node.textContent)
      if (size) return size
    }

    const selectedOption = Array.from(document.querySelectorAll('[aria-selected="true"], [data-selected="true"], [aria-checked="true"], .active, .selected'))
      .find((element) => isVisible(element) && extract(element.textContent || element.getAttribute('title') || element.getAttribute('aria-label')))

    if (!selectedOption) return null
    return extract(selectedOption.textContent || selectedOption.getAttribute('title') || selectedOption.getAttribute('aria-label'))
  })
}

async function clickFontSizeOption(scope, sizeLabel) {
  return scope.evaluate((targetSize) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
    const target = normalize(targetSize)
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }

    const matchesTarget = (element) => {
      const values = [
        element.textContent,
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
        element.getAttribute('data-value'),
        element.getAttribute('data-size'),
        element.getAttribute('value'),
      ].map(normalize)

      return values.some((value) =>
        value === target ||
        value === `${target}px` ||
        value === `${target} px` ||
        value.startsWith(`${target}px`) ||
        value.startsWith(`${target} px`) ||
        value.includes(` ${target}`) ||
        value.includes(`${target}px`) ||
        value.includes(`${target} px`)
      )
    }

    const option = Array.from(document.querySelectorAll('button, [role="button"], [role="option"], li, [data-value], [data-size], [value], [class*="font"]'))
      .filter((element) => element instanceof HTMLElement && isVisible(element) && matchesTarget(element))
      .sort((left, right) => {
        const leftText = normalize(left.textContent)
        const rightText = normalize(right.textContent)
        const leftExact = leftText === target || leftText === `${target}px` || leftText === `${target} px`
        const rightExact = rightText === target || rightText === `${target}px` || rightText === `${target} px`
        return Number(rightExact) - Number(leftExact)
      })[0]

    if (!option) return false
    option.click()
    return true
  }, sizeLabel)
}

let subheadingButtonAvailable = null
let fontSizeControlAvailable = null

async function setSubheadingFormatting(page, enabled, currentState) {
  if (currentState === enabled) return currentState
  if (subheadingButtonAvailable === false) return currentState

  const scopes = getFormattingScopes(page)
  let clicked = false
  for (const scope of scopes) {
    try {
      if (await clickSubheadingButton(scope)) {
        clicked = true
        break
      }
    } catch {}
  }

  if (!clicked) {
    if (subheadingButtonAvailable === null) {
      subheadingButtonAvailable = false
      console.warn('[Naver Blog] Subheading toolbar button not found ??headings will use bold-only formatting.')
    }
    return currentState
  }

  subheadingButtonAvailable = true
  await sleep(80)
  return enabled
}

async function setFontSizeFormatting(page, sizeLabel, currentState) {
  if (currentState === sizeLabel) return currentState
  if (fontSizeControlAvailable === false) return currentState

  const scopes = getFormattingScopes(page)
  const readFontSizeState = async () => {
    for (const scope of scopes) {
      try {
        const state = await findFontSizeState(scope)
        if (state) return state
      } catch {}
    }
    return null
  }

  let observedState = await readFontSizeState()
  if (observedState === sizeLabel) return sizeLabel

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let clicked = false
    for (const scope of scopes) {
      try {
        if (!(await clickFontSizeButton(scope))) continue
        await sleep(80)
        if (await clickFontSizeOption(scope, sizeLabel)) {
          clicked = true
          break
        }
      } catch {}
    }

    if (!clicked) {
      break
    }

    await sleep(120)
    observedState = await readFontSizeState()
    if (observedState === sizeLabel) {
      fontSizeControlAvailable = true
      return sizeLabel
    }

    await recoverFormattingContext(page)
    await sleep(120)
    observedState = await readFontSizeState()
    if (observedState === sizeLabel) {
      fontSizeControlAvailable = true
      return sizeLabel
    }
  }

  if (observedState !== sizeLabel) {
    if (fontSizeControlAvailable === null) {
      fontSizeControlAvailable = false
      console.warn('[Naver Blog] Font size control not found ??headings will keep the editor default size.')
    }
    return currentState
  }

  fontSizeControlAvailable = true
  return sizeLabel
}

const SUBHEADING_PREFIX = /^##\s+/
const SUBHEADING_FONT_SIZE = '24'
const BODY_FONT_SIZE = '16'

async function typeMultilineWithFormatting(page, text) {
  // 蹂쇰뱶 留덉빱(**)??parseBoldInlineSegments媛 泥섎━?占쏙옙?占?蹂댁〈
  // 占???~~, __, _, --, ` ??auto-format ?占쎈━占?留덉빱占??占쎄굅
  const lines = stripAutoFormatMarkers(text).split(/\r?\n/)
  await recoverFormattingContext(page)
  let boldEnabled = false
  let strikethroughEnabled = false
  let subheadingEnabled = false
  let fontSize = null
  strikethroughEnabled = await setStrikethroughFormatting(page, false, strikethroughEnabled)
  boldEnabled = await setBoldFormatting(page, false, boldEnabled)

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    let line = lines[lineIndex]
    const isSubheading = SUBHEADING_PREFIX.test(line)
    if (isSubheading) {
      line = line.replace(SUBHEADING_PREFIX, '')
      subheadingEnabled = await setSubheadingFormatting(page, true, subheadingEnabled)
      fontSize = await setFontSizeFormatting(page, SUBHEADING_FONT_SIZE, fontSize)
    } else if (subheadingEnabled) {
      subheadingEnabled = await setSubheadingFormatting(page, false, subheadingEnabled)
      fontSize = await setFontSizeFormatting(page, BODY_FONT_SIZE, fontSize)
    }

    const inlineSegments = parseBoldInlineSegments(line)

    for (const segment of inlineSegments) {
      if (!segment.text) continue

      if (segment.bold) {
        boldEnabled = await setBoldFormatting(page, true, boldEnabled)
        await page.keyboard.type(segment.text, { delay: 20 })
        boldEnabled = await setBoldFormatting(page, false, boldEnabled)
      } else {
        await page.keyboard.type(segment.text, { delay: 20 })
      }
    }

    if (lineIndex < lines.length - 1) {
      if (strikethroughEnabled) {
        strikethroughEnabled = await setStrikethroughFormatting(page, false, strikethroughEnabled)
      }
      if (boldEnabled) {
        boldEnabled = await setBoldFormatting(page, false, boldEnabled)
      }
      if (isSubheading) {
        subheadingEnabled = await setSubheadingFormatting(page, false, subheadingEnabled)
        fontSize = await setFontSizeFormatting(page, BODY_FONT_SIZE, fontSize)
      }
      await page.keyboard.press('Enter')
      if (isSubheading) {
        await recoverFormattingContext(page)
      }
    }
  }

  if (strikethroughEnabled) {
    await setStrikethroughFormatting(page, false, strikethroughEnabled)
  }
  if (boldEnabled) {
    await setBoldFormatting(page, false, boldEnabled)
  }
  if (subheadingEnabled) {
    await setSubheadingFormatting(page, false, subheadingEnabled)
  }
  if (fontSize) {
    await setFontSizeFormatting(page, BODY_FONT_SIZE, fontSize)
  }
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
          return text.includes(CATEGORY_TEXT.toLowerCase()) &&
            text.includes(VISIBILITY_TEXT.toLowerCase()) &&
            text.includes(SCHEDULE_TEXT.toLowerCase())
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

function normalizeUploadTags(tags) {
  const seen = new Set()
  const output = []

  for (const value of Array.isArray(tags) ? tags : []) {
    const tag = String(value || '')
      .replace(/^#+/, '')
      .replace(/[^\p{L}\p{N}_-]+/gu, '')
      .trim()
    if (!tag || tag.length < 2) continue

    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    output.push(tag)
    if (output.length >= 10) break
  }

  return output
}

async function focusTagInputByDom(scope) {
  return scope.evaluate((tagText) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
    const isVisible = (element) => {
      if (!element) return false
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        Number(style.opacity || '1') > 0
    }
    const describe = (element) => normalize([
      element.getAttribute?.('placeholder'),
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('data-placeholder'),
      element.getAttribute?.('title'),
      element.className,
      element.closest?.('[class*="tag"], [class*="Tag"]')?.textContent,
      element.parentElement?.textContent,
    ].filter(Boolean).join(' '))
    const focusElement = (element, selector) => {
      element.scrollIntoView?.({ block: 'center', inline: 'center' })
      element.click?.()
      element.focus?.()
      return { focused: document.activeElement === element || element.matches(':focus'), selector }
    }

    const editables = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]'))
      .filter(isVisible)
    const direct = editables.find((element) => describe(element).includes(tagText))
    if (direct) return focusElement(direct, 'tag-editable')

    const tagLabels = Array.from(document.querySelectorAll('button, label, div, span, p'))
      .filter(isVisible)
      .filter((element) => normalize(element.textContent).includes(tagText))
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)

    for (const label of tagLabels) {
      label.click?.()
      const labelRect = label.getBoundingClientRect()
      const nearby = editables
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => Math.abs(rect.top - labelRect.top) < 180 || rect.top > labelRect.top)
        .sort((a, b) => Math.abs(a.rect.top - labelRect.top) - Math.abs(b.rect.top - labelRect.top))[0]?.element
      if (nearby) return focusElement(nearby, 'near-tag-label')
    }

    return { focused: false, selector: null }
  }, TAG_TEXT)
}

async function fillTags(page, targets, tags) {
  const normalizedTags = normalizeUploadTags(tags)
  if (normalizedTags.length === 0) {
    return
  }

  for (const target of targets) {
    for (const selector of TAG_INPUT_SELECTORS) {
      try {
        const tagInput = target.scope.locator(selector).first()
        await withPopupRecovery(
          page,
          targets,
          () => tagInput.click({ timeout: 3000 }),
          `tag input via ${target.label} -> ${selector}`
        )

        for (const tag of normalizedTags) {
          await page.keyboard.type(tag, { delay: 25 })
          await page.keyboard.press('Enter')
          await sleep(180)
        }

        console.log(`[Naver Blog] Filled tags via ${target.label} -> ${selector}: ${normalizedTags.join(', ')}`)
        return
      } catch {}
    }

    try {
      const result = await focusTagInputByDom(target.scope)
      if (result?.focused) {
        for (const tag of normalizedTags) {
          await page.keyboard.type(tag, { delay: 25 })
          await page.keyboard.press('Enter')
          await sleep(180)
        }

        console.log(`[Naver Blog] Filled tags via ${target.label} -> dom ${result.selector || ''}: ${normalizedTags.join(', ')}`)
        return
      }
    } catch (error) {
      console.warn(`[Naver Blog] DOM tag focus failed via ${target.label}: ${error.message}`)
    }
  }

  console.warn(`[Naver Blog] Failed to set tags. tags=${normalizedTags.join(', ')}`)
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












