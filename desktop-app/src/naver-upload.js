const fs = require('fs')
const path = require('path')
const { applyPlaywrightEnvironment, getPlaywrightDiagnostics } = require('./playwright-runtime')
const { clearSessionState, getSessionPath, hasUsableSessionState, loadSessionState } = require('./session-state')
const { failUpload, finishUpload, startUpload, updateUploadStage } = require('./upload-runtime')

applyPlaywrightEnvironment()

const { chromium } = require('playwright')

const BROWSER_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
]

const DEFAULT_VIEWPORT = { width: 1360, height: 860 }
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
const RUNTIME_SOURCE = 'desktop-helper'
const RUNTIME_ENDPOINT = 'http://127.0.0.1:3000/api/upload'
const PUBLISHED_POST_URL_PATTERN = /^https:\/\/(?:m\.)?blog\.naver\.com\/[^/]+\/\d+(?:[/?#].*)?$/i
const IMAGE_MARKER_PATTERN = /\[IMG:(\d+)\]/gi

const TITLE_TEXT = '\uC81C\uBAA9'
const BODY_TEXT = '\uBCF8\uBB38'
const PUBLISH_TEXT = '\uBC1C\uD589'
const TAG_TEXT = '\uD0DC\uADF8'
const PHOTO_TEXT = '\uC0AC\uC9C4'
const PHOTO_ADD_TEXT = '\uC0AC\uC9C4 \uCD94\uAC00'
const MYBOX_TEXT = 'MYBOX'
const CATEGORY_TEXT = '\uCE74\uD14C\uACE0\uB9AC'
const VISIBILITY_TEXT = '\uACF5\uAC1C'
const SCHEDULE_TEXT = '\uBC1C\uD589 \uC2DC\uAC04'
const FONT_SIZE_TEXT = '\uAE00\uC790 \uD06C\uAE30'
const RESERVE_TEXT = '\uC608\uC57D'
const CONFIRM_TEXT = '\uD655\uC778'
const REGISTER_TEXT = '\uB4F1\uB85D'
const COMPLETE_TEXT = '\uC644\uB8CC'
const PUBLISHED_DONE_TEXT = '\uBC1C\uD589\uB418\uC5C8\uC2B5\uB2C8\uB2E4'
const REGISTERED_DONE_TEXT = '\uB4F1\uB85D\uB418\uC5C8\uC2B5\uB2C8\uB2E4'
const RESERVED_DONE_TEXT = '\uC608\uC57D\uB418\uC5C8\uC2B5\uB2C8\uB2E4'
const RESERVED_POSTS_TEXT = '\uC608\uC57D \uBC1C\uD589 \uAE00'
const INVALID_SCHEDULE_TIME_TEXT = '\uD604\uC7AC \uC2DC\uAC04 \uC774\uD6C4\uB85C \uC124\uC815\uD574\uC8FC\uC138\uC694.'
const SCHEDULE_READY_TEXT = '\uC124\uC815\uD55C \uC2DC\uAC04\uC73C\uB85C \uC608\uC57D \uBC1C\uD589\uB429\uB2C8\uB2E4.'
const WRITE_URL_HINTS = ['redirect=write', 'postwriteform', 'goblogwrite.naver', 'blog.editor.naver.com']

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
const POPUP_SAFE_BUTTON_LABELS = [
  'new-post',
  'cancel',
  'close',
  'confirm',
  'later',
]
const SCHEDULE_MINUTE_STEP = 10
const SCHEDULE_MIN_LEAD_MINUTES = 10

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function roundUpDateToMinuteStep(input, step = SCHEDULE_MINUTE_STEP) {
  const date = input instanceof Date ? new Date(input) : new Date(input)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const roundedMinutes = Math.ceil(date.getMinutes() / step) * step
  date.setSeconds(0, 0)

  if (roundedMinutes >= 60) {
    date.setHours(date.getHours() + 1, 0, 0, 0)
    return date
  }

  date.setMinutes(roundedMinutes, 0, 0)
  return date
}

function ensureMinimumScheduledDate(date) {
  const minimumDate = roundUpDateToMinuteStep(new Date(Date.now() + SCHEDULE_MIN_LEAD_MINUTES * 60 * 1000))
  if (!minimumDate) {
    return date
  }

  if (date.getTime() >= minimumDate.getTime()) {
    return date
  }

  return minimumDate
}

function normalizeDateDigits(value) {
  return String(value || '').replace(/\D+/g, '')
}

function normalizeTwoDigitValue(value) {
  const digits = String(value || '').replace(/\D+/g, '')
  if (!digits) {
    return ''
  }

  return digits.padStart(2, '0').slice(-2)
}

function formatNaverScheduleDate(year, month, day) {
  return `${String(year).padStart(4, '0')}. ${String(month).padStart(2, '0')}. ${String(day).padStart(2, '0')}`
}

function getScheduleComparison(scheduleState, schedule) {
  const actualDate = normalizeDateDigits(scheduleState?.dateValue)
  const expectedDate = normalizeDateDigits(schedule?.dateValue)
  const actualHour = normalizeTwoDigitValue(scheduleState?.hourValue)
  const expectedHour = normalizeTwoDigitValue(schedule?.hour24)
  const actualMinute = normalizeTwoDigitValue(scheduleState?.minuteValue)
  const expectedMinute = normalizeTwoDigitValue(schedule?.minute)

  return {
    actualDate,
    expectedDate,
    actualHour,
    expectedHour,
    actualMinute,
    expectedMinute,
    matches: Boolean(
      actualDate &&
        expectedDate &&
        actualDate === expectedDate &&
        actualHour &&
        expectedHour &&
        actualHour === expectedHour &&
        actualMinute &&
        expectedMinute &&
        actualMinute === expectedMinute
    ),
  }
}

function parseScheduledAtValue(scheduledAt) {
  if (!scheduledAt) {
    return null
  }

  if (scheduledAt instanceof Date) {
    return new Date(scheduledAt)
  }

  const value = String(scheduledAt).trim()
  const koreaWallClockMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (koreaWallClockMatch) {
    const [, year, month, day, hour, minute, second = '00'] = koreaWallClockMatch
    return new Date(Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour) - 9,
      Number(minute),
      Number(second),
      0
    ))
  }

  return new Date(value)
}

function isScheduledPublishStateConfirmed(scheduleState, schedule) {
  if (!scheduleState?.panelVisible || !scheduleState.reserveModeActive || scheduleState.validationError) {
    return false
  }

  const hasCompleteScheduleFields = Boolean(
    scheduleState.dateValue &&
      scheduleState.hourValue &&
      scheduleState.minuteValue
  )

  if (!schedule) {
    return hasCompleteScheduleFields
  }

  if (getScheduleComparison(scheduleState, schedule).matches) {
    return true
  }

  return false
}

// SmartEditor auto-format에 쓰이는 마커를 제거해 일반 본문 입력으로 바꾼다.
function sanitizeForTyping(raw) {
  return String(raw || '')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/--([^\n-]+)--/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\s][^*]*[^*\s])\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_\s][^_]*[^_\s])_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/~/g, '')
}

// 본문 입력 전처리에 사용한다. **bold** 마커는 parseBoldInlineSegments가 따로 처리하므로 보존하고
// 그 외 SmartEditor가 자동 변환할 수 있는 마커만 제거한다.
function sanitizeForFormattingTyping(raw) {
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
  const sanitized = sanitizeForTyping(text)
  const lines = sanitized.split(/\r?\n/)

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
  // releaseFormattingModifiers가 먼저 modifier를 정리하므로 여기서는 Control+B 한 번만 보낸다.
  // SmartEditor가 중복 keyup 이벤트를 과도하게 처리하지 않도록 최소 입력만 유지한다.
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyB')
  await page.keyboard.up('Control')
  await sleep(50)
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

// SmartEditor 소제목 버튼을 찾는다. 클릭 성공 여부만 반환하고, 실패하면 호출 측에서 우회한다.
// SmartEditor 2 환경마다 "제목1/2/3", "소제목", heading 계열 버튼 이름이 달라서
// aria-label, data 속성, 클래스명을 함께 본다.
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

// 호출 측에서 현재 상태를 추적하므로 setSubheadingFormatting(page, true/false, currentState) 형태로 사용한다.
// 버튼을 못 찾으면 currentState를 그대로 반환해 wraparound 입력을 계속 진행한다.
let subheadingButtonAvailable = null
async function setSubheadingFormatting(page, enabled, currentState) {
  if (currentState === enabled) return currentState
  if (subheadingButtonAvailable === false) return currentState  // 이전 탐색에서 버튼이 없다고 확인됨

  // typeMultilineWithFormatting 진입 전에 modifier를 정리하므로 불필요한 keyup을 줄인다.
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
      console.warn('[Naver Upload] Subheading toolbar button not found ??sections will use bold-only formatting (no enlarged size).')
    }
    return currentState
  }

  subheadingButtonAvailable = true
  await sleep(80)
  return enabled
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

let fontSizeControlAvailable = null
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
      console.warn('[Naver Upload] Font size control not found ??headings will keep the editor default size.')
    }
    return currentState
  }

  fontSizeControlAvailable = true
  return sizeLabel
}

// `## ` 로 시작하는 줄은 섹션 소제목으로 간주하고 SmartEditor 서식을 적용한다.
const SUBHEADING_PREFIX = /^##\s+/
const SUBHEADING_FONT_SIZE = '24'
const BODY_FONT_SIZE = '16'

async function typeMultilineWithFormatting(page, text) {
  // **bold** 마커는 인라인 세그먼트로 분리해 SmartEditor 자동 포맷과 충돌하지 않게 한다.
  const lines = sanitizeForFormattingTyping(text).split(/\r?\n/)
  // 남아 있는 modifier 상태를 한 번만 정리해 이후 줄마다 keyup이 반복되지 않게 한다.
  await releaseFormattingModifiers(page)
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
      // `## ` 마커는 제거하고 본문만 입력한다. 마커 자체가 에디터에 남지 않게 한다.
      line = line.replace(SUBHEADING_PREFIX, '')
      subheadingEnabled = await setSubheadingFormatting(page, true, subheadingEnabled)
      fontSize = await setFontSizeFormatting(page, SUBHEADING_FONT_SIZE, fontSize)
    } else if (subheadingEnabled) {
      // 일반 본문 줄로 돌아오면 소제목 서식을 해제한다.
      subheadingEnabled = await setSubheadingFormatting(page, false, subheadingEnabled)
      fontSize = await setFontSizeFormatting(page, BODY_FONT_SIZE, fontSize)
    }

    const inlineSegments = parseBoldInlineSegments(line)

    for (const segment of inlineSegments) {
      if (!segment.text) continue

      if (segment.bold) {
        boldEnabled = await setBoldFormatting(page, true, boldEnabled)
        await page.keyboard.type(segment.text, { delay: 12 })
        boldEnabled = await setBoldFormatting(page, false, boldEnabled)
      } else {
        await page.keyboard.type(segment.text, { delay: 12 })
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

function getDebugDir() {
  return path.join(path.dirname(getSessionPath()), 'naver-upload-debug')
}

function ensureDebugDir() {
  fs.mkdirSync(getDebugDir(), { recursive: true })
}

async function saveDebug(page, name) {
  try {
    ensureDebugDir()
    const timestamp = Date.now()
    const screenshotPath = path.join(getDebugDir(), `${timestamp}-${name}.png`)
    const htmlPath = path.join(getDebugDir(), `${timestamp}-${name}.html`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
    fs.writeFileSync(htmlPath, await page.content(), 'utf8')
    const frames = page.frames().filter((frame) => frame !== page.mainFrame())
    for (const [index, frame] of frames.entries()) {
      const frameLabel = (frame.name() || `frame-${index}`).replace(/[^\w.-]+/g, '_')
      const frameHtmlPath = path.join(getDebugDir(), `${timestamp}-${name}-${frameLabel}.html`)
      try {
        fs.writeFileSync(frameHtmlPath, await frame.content(), 'utf8')
      } catch {}
    }
    console.log(`[Naver Upload] Saved debug artifacts: ${path.basename(screenshotPath)}`)
    return { screenshotPath, htmlPath }
  } catch (error) {
    console.warn('[Naver Upload] Failed to save debug artifacts:', error.message)
    return null
  }
}

function hasSavedSession() {
  return hasUsableSessionState()
}

function isNaverLoginUrl(url = '') {
  return /^https:\/\/nid\.naver\.com\/nidlogin\.login/i.test(String(url))
}

function isLikelyWriteUrl(url = '') {
  return WRITE_URL_HINTS.some((hint) => String(url).includes(hint))
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

function getPublishDialogTargets(targets) {
  const mainFrameTargets = targets.filter((target) => /frame:mainFrame/i.test(target.label))
  if (mainFrameTargets.length > 0) {
    return mainFrameTargets
  }

  const frameTargets = targets.filter((target) => target.label.startsWith('frame:'))
  return frameTargets.length > 0 ? frameTargets : targets
}

function getExistingPhotoPaths(photoPaths = []) {
  return photoPaths.filter((photoPath) => {
    try {
      return Boolean(photoPath) && fs.existsSync(photoPath) && fs.statSync(photoPath).isFile()
    } catch {
      return false
    }
  })
}

function parseContentWithImageMarkers(content) {
  const normalizedContent = String(content || '')
  const segments = []
  let lastIndex = 0
  let match = null

  IMAGE_MARKER_PATTERN.lastIndex = 0
  while ((match = IMAGE_MARKER_PATTERN.exec(normalizedContent)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: normalizedContent.slice(lastIndex, match.index) })
    }

    segments.push({
      type: 'image',
      index: Number(match[1]),
      marker: match[0],
    })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < normalizedContent.length) {
    segments.push({ type: 'text', text: normalizedContent.slice(lastIndex) })
  }

  return segments.length > 0 ? segments : [{ type: 'text', text: normalizedContent }]
}

function isPopupInterceptionError(error) {
  return /intercepts pointer events/i.test(error?.message || '')
}

function formatPopupActionLog(result, targetLabel) {
  const action = result?.action || 'unknown'
  const detail = result?.label || result?.textCode || result?.text
  return detail ? `${targetLabel}:${action}:${detail}` : `${targetLabel}:${action}`
}

async function waitForPopupLayerToClear(scope, timeout = 2000) {
  try {
    await scope.waitForFunction(
      (selector) => {
        const isVisible = (element) => {
          if (!(element instanceof Element)) {
            return false
          }

          const style = window.getComputedStyle(element)
          const rect = element.getBoundingClientRect()
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.pointerEvents !== 'none' &&
            rect.width > 0 &&
            rect.height > 0
          )
        }

        return !Array.from(document.querySelectorAll(selector)).some(isVisible)
      },
      POPUP_BLOCKING_SELECTOR,
      { timeout }
    )
  } catch {}
}

async function evaluatePopupAction(scope) {
  return scope.evaluate(
    ({ closeSelector, helpRootSelector, patternLabels, patterns, rootSelector }) => {
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

      for (let index = 0; index < compiledPatterns.length; index += 1) {
        const matcher = compiledPatterns[index]
        const matchedButton = buttons.find((button) =>
          matcher.test(normalize(button.textContent || button.getAttribute('aria-label')))
        )
        if (matchedButton) {
          matchedButton.click()
          return {
            action: 'button',
            label: patternLabels[index] || 'button',
          }
        }
      }

      const closeButton = roots
        .flatMap((root) => Array.from(root.querySelectorAll(closeSelector)).filter(isClickable))
        .find(Boolean)

      if (closeButton) {
        closeButton.click()
        return { action: 'close', label: 'close-control' }
      }

      const dim = popupRoots
        .flatMap((root) => Array.from(root.querySelectorAll('.se-popup-dim')).filter(isClickable))
        .find(Boolean)

      if (dim) {
        dim.click()
        return { action: 'dim', label: 'popup-dim' }
      }

      const helpRoot = helpRoots.find(Boolean)
      if (helpRoot instanceof HTMLElement) {
        helpRoot.style.setProperty('display', 'none', 'important')
        helpRoot.style.setProperty('pointer-events', 'none', 'important')
        helpRoot.setAttribute('data-autoform-dismissed', 'true')
        return { action: 'hide-help', label: 'help-overlay' }
      }

      return { action: 'visible', label: 'overlay-still-visible' }
    },
    {
      closeSelector: POPUP_CLOSE_SELECTOR,
      helpRootSelector: HELP_OVERLAY_ROOT_SELECTOR,
      patternLabels: POPUP_SAFE_BUTTON_LABELS,
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
          dismissals.push(formatPopupActionLog(result, target.label))
          changed = true
          await waitForPopupLayerToClear(target.scope)
        }
      } catch {}
    }

    if (!changed) {
      break
    }

    await sleep(400)
  }

  if (dismissals.length > 0) {
    console.log(`[Naver Upload] Popup recovery actions: ${dismissals.join(', ')}`)
  }
}

function normalizePublishedPostUrl(url) {
  const value = String(url || '').trim()
  if (!value || isEditorWriteUrl(value)) {
    return null
  }

  try {
    const parsed = new URL(value)
    const hostname = parsed.hostname.toLowerCase()
    if (hostname !== 'blog.naver.com' && hostname !== 'm.blog.naver.com') {
      return null
    }

    const pathParts = parsed.pathname.split('/').filter(Boolean)
    if (pathParts.length >= 2 && /^\d+$/.test(pathParts[1])) {
      return `https://blog.naver.com/${pathParts[0]}/${pathParts[1]}`
    }

    if (pathParts[0]?.toLowerCase() === 'postview.naver') {
      const blogId = parsed.searchParams.get('blogId')
      const logNo = parsed.searchParams.get('logNo')
      if (blogId && /^\d+$/.test(logNo || '')) {
        return `https://blog.naver.com/${blogId}/${logNo}`
      }
    }
  } catch {}

  if (PUBLISHED_POST_URL_PATTERN.test(value)) {
    return value
  }

  return null
}

function isPublishedPostUrl(url) {
  return Boolean(normalizePublishedPostUrl(url))
}

function isEditorWriteUrl(url) {
  const value = String(url || '').toLowerCase()
  return WRITE_URL_HINTS.some((hint) => value.includes(hint))
}

function normalizeScheduledPublishAt(scheduledAt) {
  if (!scheduledAt) {
    return null
  }

  const requestedDate = parseScheduledAtValue(scheduledAt)
  if (Number.isNaN(requestedDate.getTime())) {
    throw new Error(`Invalid scheduledAt value: ${scheduledAt}`)
  }

  const date = requestedDate

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  )

  const hour24 = parts.hour
  const hourNumber = Number(hour24)
  const hour12 = String(((hourNumber + 11) % 12) + 1).padStart(2, '0')

  return {
    adjusted: date.getTime() !== requestedDate.getTime(),
    dateDisplayValue: formatNaverScheduleDate(parts.year, parts.month, parts.day),
    dateValue: `${parts.year}-${parts.month}-${parts.day}`,
    day: parts.day,
    hour12,
    hour24,
    iso: date.toISOString(),
    requestedIso: requestedDate.toISOString(),
    meridiem: hourNumber < 12 ? 'AM' : 'PM',
    meridiemKo: hourNumber < 12 ? '\uC624\uC804' : '\uC624\uD6C4',
    minute: parts.minute,
    month: parts.month,
    year: parts.year,
  }
}

async function collectPublishedPostUrlCandidates(scope) {
  try {
    return await scope.evaluate(() => {
      const urls = new Set([window.location.href, document.URL])
      const selector = [
        'a[href]',
        'area[href]',
        'form[action]',
        'iframe[src]',
        'link[rel="canonical"][href]',
        'meta[property="og:url"][content]',
      ].join(',')

      for (const element of Array.from(document.querySelectorAll(selector))) {
        const value =
          element.getAttribute('href') ||
          element.getAttribute('action') ||
          element.getAttribute('src') ||
          element.getAttribute('content')
        if (value) {
          urls.add(new URL(value, window.location.href).href)
        }
      }

      return Array.from(urls)
    })
  } catch {
    return []
  }
}

async function findPublishedPostUrl(page) {
  const currentUrl = normalizePublishedPostUrl(page.url())
  if (currentUrl) {
    return currentUrl
  }

  for (const frame of page.frames()) {
    try {
      const frameUrl = normalizePublishedPostUrl(frame.url())
      if (frameUrl) {
        return frameUrl
      }

      const candidates = await collectPublishedPostUrlCandidates(frame)
      for (const candidate of candidates) {
        const normalized = normalizePublishedPostUrl(candidate)
        if (normalized) {
          return normalized
        }
      }
    } catch {}
  }

  return null
}

function findScheduledPostUrl(page) {
  const candidateUrls = [page.url()]

  for (const frame of page.frames()) {
    const frameName = String(frame.name() || '')
    if (frameName === 'mainFrame' || frameName.includes('mainFrame')) {
      try {
        candidateUrls.push(frame.url())
      } catch {}
    }
  }

  return (
    candidateUrls.find((url) => {
      const value = String(url || '')
      return value && value !== 'about:blank' && !isEditorWriteUrl(value)
    }) || null
  )
}

async function hasPublishCompletionText(page, { scheduledAt = null } = {}) {
  const completionTexts = [
    PUBLISHED_DONE_TEXT,
    REGISTERED_DONE_TEXT,
    COMPLETE_TEXT,
    scheduledAt ? RESERVED_DONE_TEXT : null,
  ].filter(Boolean)

  for (const frame of page.frames()) {
    try {
      const found = await frame.evaluate((texts) => {
        const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
        const text = normalize(document.body?.textContent)
        return texts.some((value) => text.includes(value))
      }, completionTexts)

      if (found) {
        return true
      }
    } catch {}
  }

  return false
}

async function waitForPublishProgress(page, targets, { scheduledAt = null, timeout = 2500 } = {}) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeout) {
    if (await findPublishedPostUrl(page)) {
      return true
    }

    if (scheduledAt && findScheduledPostUrl(page)) {
      return true
    }

    if (await hasPublishCompletionText(page, { scheduledAt })) {
      return true
    }

    if (!(await isPublishDialogVisible(targets))) {
      const editorStillReady = await isEditorStillReadyToPublish(page, targets)
      if (!editorStillReady) {
        return true
      }
    }

    await sleep(250)
  }

  return false
}

async function resolvePublishOutcome(page, targets, { scheduledAt, timeout = 60000 } = {}) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeout) {
    const publishedUrl = await findPublishedPostUrl(page)
    if (publishedUrl) {
      return { mode: 'published', scheduled: false, url: publishedUrl }
    }

    if (scheduledAt) {
      const scheduledUrl = findScheduledPostUrl(page)
      if (scheduledUrl) {
        return { mode: 'scheduled', scheduled: true, url: scheduledUrl }
      }
    }

    if (await hasPublishCompletionText(page, { scheduledAt })) {
      if (scheduledAt) {
        const scheduledUrl = findScheduledPostUrl(page)
        if (scheduledUrl) {
          return { mode: 'scheduled', scheduled: true, url: scheduledUrl }
        }
      }

      const completedUrl = await findPublishedPostUrl(page)
      if (completedUrl) {
        return { mode: 'published', scheduled: false, url: completedUrl }
      }
    }

    await sleep(300)
  }

  return null
}

async function collectVisibleHints(page) {
  const scopes = getEditorTargets(page).map((target) => ({ label: target.label, scope: target.scope }))
  const hints = []

  for (const target of scopes) {
    try {
      const scopeHints = await target.scope.evaluate(({ helpRootSelector, popupRootSelector }) => {
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
      const isVisible = (element) => {
        if (!(element instanceof Element)) {
          return false
        }

        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
      }

      const popupTexts = Array.from(document.querySelectorAll(popupRootSelector))
        .filter(isVisible)
        .map((root) => normalize(root.textContent))
        .filter(Boolean)

      const helpTexts = Array.from(document.querySelectorAll(helpRootSelector))
        .filter(isVisible)
        .filter((root) => root.querySelector('.se-help-title'))
        .map((root) => normalize(root.textContent))
        .filter(Boolean)

        return [...popupTexts, ...helpTexts].slice(0, 3)
      }, {
        helpRootSelector: HELP_OVERLAY_ROOT_SELECTOR,
        popupRootSelector: POPUP_ROOT_SELECTOR,
      })

      for (const hint of scopeHints) {
        hints.push(`${target.label}:${hint}`)
        if (hints.length >= 5) {
          return hints
        }
      }
    } catch {}
  }

  return hints
}

async function isPublishDialogVisible(targets) {
  for (const target of targets) {
    try {
      const visible = await target.scope.evaluate(({ categoryText, scheduleText, visibilityText }) => {
        const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
        const isVisible = (element) => {
          if (!(element instanceof Element)) {
            return false
          }

          const style = window.getComputedStyle(element)
          const rect = element.getBoundingClientRect()
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
        }

        return Array.from(document.querySelectorAll('body *'))
          .filter((element) => element instanceof HTMLElement)
          .filter(isVisible)
          .some((element) => {
            const text = normalize(element.textContent)
            return text.includes(categoryText) && text.includes(visibilityText) && text.includes(scheduleText)
          })
      }, {
        categoryText: CATEGORY_TEXT,
        scheduleText: SCHEDULE_TEXT,
        visibilityText: VISIBILITY_TEXT,
      })

      if (visible) {
        return true
      }
    } catch {}
  }

  return false
}

async function isEditorStillReadyToPublish(page, targets) {
  if (!isEditorWriteUrl(page.url())) {
    return false
  }

  for (const frame of page.frames()) {
    try {
      if (!isEditorWriteUrl(frame.url())) {
        return false
      }
    } catch {}
  }

  for (const target of targets) {
    try {
      const state = await target.scope.evaluate(({ bodyText, publishText, titleText }) => {
        const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
        const isVisible = (element) => {
          if (!(element instanceof Element)) {
            return false
          }

          const style = window.getComputedStyle(element)
          const rect = element.getBoundingClientRect()
          return style.display !== 'none' && style.visibility !== 'hidden' && style.pointerEvents !== 'none' && rect.width > 0 && rect.height > 0
        }

        const interactiveSelectors = [
          '[contenteditable="true"]',
          'textarea',
          'input[type="text"]',
          'input:not([type])',
          '[role="textbox"]',
          'button',
          '[role="button"]',
          'a',
          '[data-click-area]',
        ]

        let hasVisiblePublishButton = false
        let hasVisibleEditorField = false

        for (const element of Array.from(document.querySelectorAll(interactiveSelectors.join(',')))) {
          if (!(element instanceof HTMLElement) || !isVisible(element)) {
            continue
          }

          const text = normalize(
            element.textContent ||
              element.getAttribute?.('aria-label') ||
              element.getAttribute?.('placeholder') ||
              element.getAttribute?.('value')
          )

          if (text.includes(publishText) || normalize(element.getAttribute?.('data-click-area')).toLowerCase().includes('publish')) {
            hasVisiblePublishButton = true
          }

          if (
            element.matches('[contenteditable="true"], textarea, input[type="text"], input:not([type]), [role="textbox"]') &&
            (text.includes(titleText) ||
              text.includes(bodyText) ||
              normalize(element.getAttribute?.('placeholder')).includes(titleText) ||
              normalize(element.getAttribute?.('placeholder')).includes(bodyText) ||
              normalize(element.getAttribute?.('aria-label')).includes(titleText) ||
              normalize(element.getAttribute?.('aria-label')).includes(bodyText))
          ) {
            hasVisibleEditorField = true
          }
        }

        return {
          hasVisibleEditorField,
          hasVisiblePublishButton,
        }
      }, {
        bodyText: BODY_TEXT,
        publishText: PUBLISH_TEXT,
        titleText: TITLE_TEXT,
      })

      if (state?.hasVisiblePublishButton || state?.hasVisibleEditorField) {
        return true
      }
    } catch {}
  }

  return false
}

async function waitForPublishDialogVisible(targets, timeout = 2500) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeout) {
    if (await isPublishDialogVisible(targets)) {
      return true
    }
    await sleep(200)
  }

  return false
}

async function ensurePublishDialogVisible(page, targets) {
  if (await waitForPublishDialogVisible(targets, 600)) {
    return
  }

  console.warn('[Naver Upload] Publish dialog was not visible before confirmation. Reopening it.')
  await openPublishDialog(page, targets)
}

async function activateReservePublishModeByDom(scope) {
  return scope.evaluate(({ categoryText, reserveText, reservedPostsText, scheduleText, visibilityText }) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
    const INTERACTIVE_SELECTOR = 'button, [role="button"], [role="radio"], label, input, a, [data-click-area], [class*="reserve"], [class*="schedule"]'
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

      return !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true'
    }
    const getText = (element) => normalize(
      element.textContent ||
      element.getAttribute?.('aria-label') ||
      element.getAttribute?.('value') ||
      element.getAttribute?.('placeholder')
    )
    const getAttrs = (element) => normalize([
      element.getAttribute?.('class'),
      element.getAttribute?.('data-click-area'),
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('name'),
      element.getAttribute?.('role'),
      element.getAttribute?.('type'),
    ].join(' '))
    const lower = (value) => String(value || '').toLowerCase()

    const panelRoots = Array.from(document.querySelectorAll('body *'))
      .filter((element) => element instanceof HTMLElement)
      .filter(isVisible)
      .filter((element) => {
        const text = normalize(element.textContent)
        return (
          text.includes(categoryText) &&
          text.includes(visibilityText) &&
          text.includes(scheduleText) &&
          !text.includes(reservedPostsText)
        )
      })
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect()
        const rightRect = right.getBoundingClientRect()
        return rightRect.width * rightRect.height - leftRect.width * leftRect.height
      })

    const targetRoot = panelRoots[0]
    if (!targetRoot) {
      return { error: 'publish dialog not visible' }
    }

    const rootRect = targetRoot.getBoundingClientRect()
    const candidates = Array.from(targetRoot.querySelectorAll(INTERACTIVE_SELECTOR))
      .filter((element) => element instanceof HTMLElement)
      .filter(isVisible)
      .filter(isEnabled)
      .map((element) => {
        const rect = element.getBoundingClientRect()
        const text = getText(element)
        const attrs = getAttrs(element)
        const lowerAttrs = lower(attrs)
        const ancestorText = normalize(element.parentElement?.textContent)
        const lowerText = lower(text)
        let score = 0

        if (lowerAttrs.includes('tpb*t.schedule') || lowerAttrs.includes('schedulecl')) {
          score -= 200
        }
        if (text.includes(reservedPostsText) || ancestorText.includes(reservedPostsText)) {
          score -= 200
        }
        if (text === reserveText) score += 40
        if (text.includes(reserveText)) score += 28
        if (lowerText.includes('reserve')) score += 18
        if (lowerAttrs.includes('reserve')) score += 20
        if (lowerAttrs.includes('schedule')) score += 10
        if (String(element.getAttribute('role') || '').toLowerCase() === 'radio') score += 14
        if (String(element.getAttribute('type') || '').toLowerCase() === 'radio') score += 12
        if (String(element.tagName || '').toLowerCase() === 'button') score += 8
        if (rect.top >= rootRect.top + 40) score += 8
        if (rect.left >= rootRect.left + Math.max(rootRect.width * 0.35, 120)) score += 4

        return { attrs, element, rect, score, text }
      })
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || right.rect.top - left.rect.top || right.rect.left - left.rect.left)

    const candidate = candidates[0]
    if (!candidate) {
      return { error: 'reserve option not found inside publish dialog' }
    }

    candidate.element.focus?.()
    candidate.element.click?.()
    candidate.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))

    return {
      attrs: candidate.attrs,
      score: candidate.score,
      text: candidate.text,
      top: Math.round(candidate.rect.top),
    }
  }, {
    categoryText: CATEGORY_TEXT,
    reserveText: RESERVE_TEXT,
    reservedPostsText: RESERVED_POSTS_TEXT,
    scheduleText: SCHEDULE_TEXT,
    visibilityText: VISIBILITY_TEXT,
  })
}

async function activateReservePublishMode(targets) {
  const attempts = []

  for (const target of targets) {
    try {
      const result = await activateReservePublishModeByDom(target.scope)

      if (result?.error) {
        attempts.push(`${target.label}: ${result.error}`)
        continue
      }

      if (result) {
        console.log(
          `[Naver Upload] Activated reserve publish mode via ${target.label} text="${result.text}" top=${result.top} score=${result.score} attrs="${result.attrs}"`
        )
        return
      }

      attempts.push(`${target.label}: reserve option not found`)
    } catch (error) {
      attempts.push(`${target.label}: ${error.message}`)
    }
  }

  throw new Error(`[${RUNTIME_SOURCE}] Unable to activate reserve publish mode. ${attempts.slice(0, 4).join(' | ')}`)
}

async function setScheduleInputValue(locator, value) {
  return locator.evaluate((element, nextValue) => {
    element.focus?.()
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.removeAttribute?.('readonly')
      element.select?.()
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')
      if (descriptor?.set) {
        descriptor.set.call(element, '')
        element.dispatchEvent(new InputEvent('input', { bubbles: true, data: null, inputType: 'deleteContentBackward' }))
        descriptor.set.call(element, nextValue)
      } else {
        element.value = ''
        element.dispatchEvent(new InputEvent('input', { bubbles: true, data: null, inputType: 'deleteContentBackward' }))
        element.value = nextValue
      }
      element.dispatchEvent(new InputEvent('input', { bubbles: true, data: nextValue, inputType: 'insertText' }))
      element.dispatchEvent(new Event('change', { bubbles: true }))
      element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true }))
      element.blur?.()
      return element.value
    }

    return ''
  }, value)
}

async function setScheduleSelectValue(locator, valueVariants) {
  return locator.evaluate((element, variants) => {
    if (!(element instanceof HTMLSelectElement)) {
      return { matched: false, value: '', text: '' }
    }

    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
    const normalizeDigits = (value) => String(value || '').replace(/\D+/g, '')
    const normalizedVariants = variants.map((value) => normalize(value))
    const digitVariants = variants.map((value) => normalizeDigits(value)).filter(Boolean)
    const option = Array.from(element.options).find((item) => {
      const value = normalize(item.value)
      const text = normalize(item.textContent)
      const valueDigits = normalizeDigits(value)
      const textDigits = normalizeDigits(text)
      return normalizedVariants.includes(value) ||
        normalizedVariants.includes(text) ||
        digitVariants.includes(valueDigits) ||
        digitVariants.includes(textDigits)
    })

    if (!option) {
      return { matched: false, value: element.value, text: '' }
    }

    element.focus?.()
    element.value = option.value
    option.selected = true
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
    element.blur?.()
    return { matched: true, value: element.value, text: normalize(option.textContent) }
  }, valueVariants.map((value) => String(value)))
}

async function clickScheduleCalendarDate(scope, schedule) {
  const dateInput = scope.locator('input[class*="input_date"], input[readonly][type="text"]').first()
  await dateInput.waitFor({ state: 'visible', timeout: 1500 })
  await dateInput.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {})
  await dateInput.click({ force: true, timeout: 1500 })
  await sleep(500)

  const candidateHandle = await scope.evaluateHandle((input) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
    const normalizeDigits = (value) => String(value || '').replace(/\D+/g, '')
    const isVisible = (element, { requirePointerEvents = true } = {}) => {
      if (!(element instanceof Element)) {
        return false
      }

      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        (!requirePointerEvents || style.pointerEvents !== 'none') &&
        rect.width > 0 &&
        rect.height > 0
    }
    const scrollCalendarIntoView = (dateElement) => {
      if (!(dateElement instanceof Element)) {
        return
      }

      const rect = dateElement.getBoundingClientRect()
      if (rect.bottom <= window.innerHeight - 12 && rect.top >= 0) {
        return
      }

      const scrollableParents = []
      let current = dateElement.parentElement
      while (current instanceof HTMLElement) {
        const style = window.getComputedStyle(current)
        const canScroll = /(auto|scroll)/.test(`${style.overflow}${style.overflowY}`) && current.scrollHeight > current.clientHeight
        if (canScroll) {
          scrollableParents.push(current)
        }
        current = current.parentElement
      }

      const delta = rect.bottom - window.innerHeight + 24
      const target = scrollableParents[0]
      if (target) {
        target.scrollTop += delta > 0 ? delta : -80
      } else {
        window.scrollBy(0, delta > 0 ? delta : -80)
      }
    }
    const getContext = (element) => {
      const parts = []
      let current = element
      for (let depth = 0; current instanceof HTMLElement && depth < 5; depth += 1) {
        parts.push(
          normalize([
            current.className,
            current.id,
            current.getAttribute('aria-label'),
            current.getAttribute('role'),
            current.getAttribute('data-date'),
            current.textContent,
          ].join(' '))
        )
        current = current.parentElement
      }
      return normalize(parts.join(' '))
    }
    const findClickableDateElement = (element) => {
      let current = element
      for (let depth = 0; current instanceof HTMLElement && depth < 5; depth += 1) {
        const tag = current.tagName.toLowerCase()
        const role = normalize(current.getAttribute('role')).toLowerCase()
        const label = normalize([
          current.textContent,
          current.getAttribute('aria-label'),
          current.getAttribute('title'),
          current.getAttribute('data-date'),
          current.getAttribute('value'),
        ].join(' '))
        const exactDay = normalize(current.textContent) === expectedDay || normalize(current.textContent) === input.day
        const hasFullDate = normalizeDigits(label) === expectedDigits
        const clickableTag = ['button', 'a', 'td', 'li'].includes(tag)
        const clickableRole = role === 'button' || role === 'option' || role === 'gridcell'
        const hasClickAttr = current.hasAttribute?.('onclick') || current.hasAttribute?.('data-date')

        if (
          isVisible(current) &&
          !current.hasAttribute?.('disabled') &&
          current.getAttribute?.('aria-disabled') !== 'true' &&
          (hasFullDate || (exactDay && (clickableTag || clickableRole || hasClickAttr)))
        ) {
          return current
        }

        current = current.parentElement
      }

      return element
    }

    const expectedDay = String(Number(input.day))
    const expectedMonth = String(Number(input.month))
    const expectedDigits = `${input.year}${input.month}${input.day}`
    const dateInput =
      document.querySelector('input[class*="input_date"]') ||
      document.querySelector('input[readonly][type="text"]')
    const dateRect = dateInput instanceof Element ? dateInput.getBoundingClientRect() : null
    const clickableSelector = 'button, a, td, li, div, span, [role="button"], [role="option"], [aria-label], [data-date]'
    const elements = Array.from(document.querySelectorAll(clickableSelector))
      .filter((element) => element instanceof HTMLElement)
      .filter((element) => isVisible(element, { requirePointerEvents: false }))
      .filter((element) => {
        const tag = element.tagName.toLowerCase()
        const type = normalize(element.getAttribute('type')).toLowerCase()
        return !(tag === 'input' || tag === 'textarea' || type === 'text')
      })
      .map((element) => {
        const rect = element.getBoundingClientRect()
        const text = normalize(element.textContent)
        const context = getContext(element)
        const lowerContext = context.toLowerCase()
        const label = normalize([
          text,
          element.getAttribute('aria-label'),
          element.getAttribute('title'),
          element.getAttribute('data-date'),
          element.getAttribute('value'),
          element.className,
        ].join(' '))
        const digits = normalizeDigits(label)
        const lowerClass = normalize(element.className).toLowerCase()
        const calendarish = lowerContext.includes('calendar') ||
          lowerContext.includes('datepicker') ||
          lowerContext.includes('date') ||
          context.includes('\uB0A0\uC9DC') ||
          context.includes('\uB2EC\uB825') ||
          context.includes('\uC6D4') ||
          /[일월화수목금토]/.test(context)
        const nearDateInput = !dateRect || (
          rect.top >= dateRect.top - 80 &&
          rect.top <= dateRect.top + 680 &&
          rect.left >= dateRect.left - 360 &&
          rect.left <= dateRect.left + 520
        )
        const exactDayText = /^\d{1,2}$/.test(text) && Number(text) === Number(input.day)
        let score = 0

        if (digits === expectedDigits) score += 200
        if (label.includes(input.year)) score += 25
        if (label.includes(`${expectedMonth}\uC6D4`) || label.includes(`${input.month}\uC6D4`)) score += 35
        if (text === expectedDay || text === input.day) score += 80
        if (exactDayText) score += 90
        if (digits.endsWith(input.month + input.day) || digits.endsWith(expectedMonth + input.day)) score += 35
        if (calendarish) score += 40
        if (nearDateInput) score += 20
        if (!calendarish && digits !== expectedDigits && !exactDayText) score -= 120
        if (!nearDateInput && digits !== expectedDigits) score -= 80
        if (lowerClass.includes('calendar') || lowerClass.includes('datepicker') || lowerClass.includes('day')) score += 20
        if (lowerClass.includes('disabled') || lowerClass.includes('outside') || lowerClass.includes('prev') || lowerClass.includes('next')) score -= 100
        if (element.hasAttribute?.('disabled') || element.getAttribute?.('aria-disabled') === 'true') score -= 100

        const clickTarget = findClickableDateElement(element)
        const targetRect = clickTarget instanceof Element ? clickTarget.getBoundingClientRect() : rect
        return { clickTarget, element, label, score, text, top: targetRect.top, left: targetRect.left }
      })
      .filter((candidate) => candidate.score >= 70)
      .sort((left, right) => right.score - left.score || left.top - right.top || left.left - right.left)

    const target = elements[0]
    if (!target) {
      return null
    }

    scrollCalendarIntoView(target.clickTarget || target.element)
    return target.clickTarget || target.element
  }, schedule)

  const candidateElement = candidateHandle.asElement()
  if (!candidateElement) {
    await candidateHandle.dispose().catch(() => {})
    const reason = await scope.evaluate(() => {
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
      const isVisible = (element) => {
        if (!(element instanceof Element)) return false
        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
      }
      const clickableSelector = 'button, a, td, li, div, span, [role="button"], [role="option"], [aria-label], [data-date]'
      const visibleNumericCandidates = Array.from(document.querySelectorAll(clickableSelector))
        .filter((element) => element instanceof HTMLElement)
        .filter(isVisible)
        .map((element) => normalize([
          element.textContent,
          element.getAttribute('aria-label'),
          element.getAttribute('title'),
          element.className,
        ].join(' ')))
        .filter((label) => label && /\d/.test(label))
        .slice(0, 8)
      return `date candidate not found candidates=${visibleNumericCandidates.join(' | ')}`
    }).catch(() => 'date candidate not found')
    return { clicked: false, reason }
  }

  const info = await candidateElement.evaluate((element) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
    return {
      label: normalize([
        element.textContent,
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
        element.getAttribute('data-date'),
        element.className,
      ].join(' ')),
      text: normalize(element.textContent),
    }
  }).catch(() => ({}))

  await candidateElement.scrollIntoViewIfNeeded().catch(() => {})
  await candidateElement.click({ force: true, timeout: 2000 })
  await candidateHandle.dispose().catch(() => {})
  return {
    clicked: true,
    label: info.label,
    text: info.text,
  }
}

async function fillScheduledPublishInputs(targets, schedule) {
  const attempts = []

  for (const target of targets) {
    try {
      const reserveRadio = target.scope.locator('input[data-testid="preTimeRadioBtn"], input[value="pre"], #radio_time2').first()
      await reserveRadio.waitFor({ state: 'visible', timeout: 1500 })
      if (!(await reserveRadio.isChecked().catch(() => false))) {
        await reserveRadio.check({ force: true, timeout: 3000 })
      }

      const dateInput = target.scope.locator('input[class*="input_date"], input[readonly][type="text"]').first()
      const hourSelect = target.scope.locator('select[class*="hour"], select[title*="\uC2DC\uAC04"]').first()
      const minuteSelect = target.scope.locator('select[class*="minute"], select[title*="\uBD84"]').first()
      await dateInput.waitFor({ state: 'visible', timeout: 1500 })
      await hourSelect.waitFor({ state: 'visible', timeout: 1500 })
      await minuteSelect.waitFor({ state: 'visible', timeout: 1500 })
      const hourResult = await setScheduleSelectValue(hourSelect, [schedule.hour24, Number(schedule.hour24), `${Number(schedule.hour24)}\uC2DC`, `${schedule.hour24}\uC2DC`])
      const minuteResult = await setScheduleSelectValue(minuteSelect, [schedule.minute, Number(schedule.minute), `${Number(schedule.minute)}\uBD84`, `${schedule.minute}\uBD84`])
      if (!hourResult.matched || !minuteResult.matched) {
        attempts.push(`${target.label}: locator option mismatch (hourMatched=${hourResult.matched} minuteMatched=${minuteResult.matched})`)
        throw new Error('schedule select option was not found')
      }
      const selectedHour = normalizeTwoDigitValue(await hourSelect.inputValue())
      const selectedMinute = normalizeTwoDigitValue(await minuteSelect.inputValue())
      let dateValue = null
      try {
        dateValue = await dateInput.inputValue()
      } catch {}

      let normalizedDate = normalizeDateDigits(dateValue)
      const expectedDate = normalizeDateDigits(schedule.dateValue)
      const expectedHour = normalizeTwoDigitValue(schedule.hour24)
      const expectedMinute = normalizeTwoDigitValue(schedule.minute)

      if (normalizedDate !== expectedDate) {
        const calendarResult = await clickScheduleCalendarDate(target.scope, schedule)
        await sleep(300)
        dateValue = null
        try {
          dateValue = await dateInput.inputValue()
        } catch {}
        const calendarDate = normalizeDateDigits(dateValue)
        if (calendarResult?.clicked && calendarDate === expectedDate) {
          normalizedDate = calendarDate
          console.log(
            `[Naver Upload] Filled schedule date via calendar ${target.label} -> date="${dateValue || ''}" match="${calendarResult.label || calendarResult.text || ''}"`
          )
        } else {
          attempts.push(`${target.label}: calendar date mismatch (clicked=${Boolean(calendarResult?.clicked)} date=${dateValue || ''} expectedDate=${expectedDate} match=${calendarResult?.label || calendarResult?.reason || ''})`)
          await setScheduleInputValue(dateInput, schedule.dateDisplayValue || schedule.dateValue)
          await sleep(150)
          try {
            dateValue = await dateInput.inputValue()
          } catch {}
          normalizedDate = normalizeDateDigits(dateValue)
        }
      }

      if (normalizedDate === expectedDate && selectedHour === expectedHour && selectedMinute === expectedMinute) {
        console.log(
          `[Naver Upload] Filled schedule inputs via ${target.label} -> locator hour=${selectedHour} minute=${selectedMinute} date="${dateValue || ''}"`
        )
        return
      }

      attempts.push(`${target.label}: locator value mismatch (date=${dateValue || ''} hour=${selectedHour} minute=${selectedMinute} expectedDate=${expectedDate} expectedHour=${expectedHour} expectedMinute=${expectedMinute})`)
    } catch (error) {
      attempts.push(`${target.label}: locator schedule fill failed (${error.message})`)
    }

    try {
      const result = await target.scope.evaluate((input) => {
        const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
        const normalizeDateDigits = (value) => String(value || '').replace(/\D+/g, '')
        const normalizeTwoDigit = (value) => {
          const digits = String(value || '').replace(/\D+/g, '')
          return digits ? digits.padStart(2, '0').slice(-2) : ''
        }
        const isVisible = (element) => {
          if (!(element instanceof Element)) {
            return false
          }

          const style = window.getComputedStyle(element)
          const rect = element.getBoundingClientRect()
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
        }

        const inputEvent = () => new Event('input', { bubbles: true })
        const changeEvent = () => new Event('change', { bubbles: true })
        const clicks = []
        const getValue = (element) => {
          if (!element) {
            return ''
          }

          if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
            return normalize(element.value)
          }

          return normalize(element.textContent || element.getAttribute?.('aria-label') || element.getAttribute?.('value'))
        }

        const visibleElements = Array.from(document.querySelectorAll('body *'))
          .filter((element) => element instanceof HTMLElement)
          .filter(isVisible)

        const panelRoot = visibleElements
          .filter((element) => {
            const text = normalize(element.textContent)
            return (
              text.includes(input.categoryText) &&
              text.includes(input.visibilityText) &&
              text.includes(input.scheduleText) &&
              !text.includes(input.reservedPostsText)
            )
          })
          .sort((left, right) => {
            const leftRect = left.getBoundingClientRect()
            const rightRect = right.getBoundingClientRect()
            return rightRect.width * rightRect.height - leftRect.width * leftRect.height
          })[0]

        if (!panelRoot) {
          return { error: 'publish dialog not visible' }
        }

        const clickMatch = (texts) => {
          const lowered = texts.map((text) => String(text).toLowerCase())
          const candidates = Array.from(panelRoot.querySelectorAll('button, [role="button"], [role="option"], label, a'))
            .filter((element) => element instanceof HTMLElement)
            .filter(isVisible)
            .map((element) => ({
              attrs: normalize([
                element.getAttribute('class'),
                element.getAttribute('data-click-area'),
                element.getAttribute('aria-label'),
              ].join(' ')),
              element,
              rect: element.getBoundingClientRect(),
              text: normalize(element.textContent || element.getAttribute('aria-label') || element.getAttribute('value')),
            }))
            .filter((candidate) => {
              const lowerAttrs = candidate.attrs.toLowerCase()
              return !lowerAttrs.includes('tpb*t.schedule') && !lowerAttrs.includes('schedulecl')
            })
            .filter((candidate) => candidate.text)
            .sort((left, right) => right.rect.top - left.rect.top)

          const match = candidates.find((candidate) => lowered.some((value) => candidate.text.toLowerCase() === value || candidate.text.toLowerCase().includes(value)))
          if (!match) {
            return false
          }

          match.element.focus?.()
          match.element.click?.()
          match.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
          clicks.push(match.text)
          return true
        }

        const setInputValue = (matcher, value) => {
          const candidate = Array.from(panelRoot.querySelectorAll('input, textarea'))
            .filter((element) => element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)
            .filter(isVisible)
            .find((element) => matcher(normalize([
              element.type,
              element.name,
              element.id,
              element.className,
              element.placeholder,
              element.getAttribute('aria-label'),
              element.getAttribute('data-placeholder'),
            ].join(' '))))

          if (!candidate) {
            return false
          }

          candidate.focus()
          candidate.removeAttribute?.('readonly')
          const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(candidate), 'value')
          if (descriptor?.set) {
            descriptor.set.call(candidate, value)
          } else {
            candidate.value = value
          }
          candidate.dispatchEvent(inputEvent())
          candidate.dispatchEvent(changeEvent())
          candidate.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true }))
          candidate.blur?.()
          return true
        }

        const findDateInput = () => Array.from(panelRoot.querySelectorAll('input, textarea'))
          .filter((element) => element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)
          .filter(isVisible)
          .find((element) => {
            const meta = normalize([
              element.type,
              element.name,
              element.id,
              element.className,
              element.placeholder,
              element.getAttribute('aria-label'),
              element.getAttribute('data-placeholder'),
              element.getAttribute('title'),
            ].join(' '))
            const lowered = lower(meta)
            return lowered.includes('date') || lowered.includes('calendar') || meta.includes('\uB0A0\uC9DC')
          }) || null

        const clickElement = (element) => {
          element.scrollIntoView?.({ block: 'center', inline: 'center' })
          element.focus?.()
          element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }))
          element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }))
          element.click?.()
          element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
        }

        const clickCalendarDate = () => {
          const dateInput = findDateInput()
          if (!dateInput) {
            return false
          }

          clickElement(dateInput)

          const expectedDay = String(Number(input.day))
          const expectedMonth = String(Number(input.month))
          const expectedDigits = `${input.year}${input.month}${input.day}`
          const roots = Array.from(document.querySelectorAll('body *'))
            .filter((element) => element instanceof HTMLElement)
            .filter(isVisible)
            .filter((element) => {
              const text = normalize(element.textContent)
              return text.includes(expectedDay) &&
                (
                  text.includes(input.year) ||
                  text.includes(`${expectedMonth}\uC6D4`) ||
                  text.includes(`${input.month}\uC6D4`) ||
                  lower(normalize(element.className)).includes('calendar') ||
                  lower(normalize(element.className)).includes('datepicker')
                )
            })
            .sort((left, right) => {
              const leftRect = left.getBoundingClientRect()
              const rightRect = right.getBoundingClientRect()
              return (leftRect.width * leftRect.height) - (rightRect.width * rightRect.height)
            })

          for (const root of roots) {
            const candidates = Array.from(root.querySelectorAll('button, a, td, [role="button"], [role="option"]'))
              .filter((element) => element instanceof HTMLElement)
              .filter(isVisible)
              .filter((element) => !element.hasAttribute?.('disabled') && element.getAttribute?.('aria-disabled') !== 'true')
              .map((element) => {
                const text = normalize(element.textContent)
                const label = normalize([
                  text,
                  element.getAttribute('aria-label'),
                  element.getAttribute('title'),
                  element.getAttribute('data-date'),
                  element.getAttribute('value'),
                ].join(' '))
                const digits = label.replace(/\D+/g, '')
                let score = 0
                if (text === expectedDay || text === input.day) score += 60
                if (digits === expectedDigits) score += 120
                if (digits.endsWith(input.month + input.day) || digits.endsWith(expectedMonth + input.day)) score += 25
                if (label.includes(input.year)) score += 20
                if (label.includes(`${expectedMonth}\uC6D4`) || label.includes(`${input.month}\uC6D4`)) score += 20
                return { element, label, score, text }
              })
              .filter((candidate) => candidate.score > 0)
              .sort((left, right) => right.score - left.score)

            if (candidates[0]) {
              clickElement(candidates[0].element)
              clicks.push(`calendar:${candidates[0].label || candidates[0].text}`)
              return true
            }
          }

          return false
        }

        const setSelectValue = (matcher, valueVariants) => {
          const candidate = Array.from(panelRoot.querySelectorAll('select'))
            .filter((element) => element instanceof HTMLSelectElement)
            .filter(isVisible)
            .find((element) => matcher(normalize([
              element.name,
              element.id,
              element.className,
              element.getAttribute('aria-label'),
            ].join(' '))))

          if (!candidate) {
            return false
          }

          const variants = valueVariants.map((value) => String(value))
          const digitVariants = variants.map((value) => value.replace(/\D+/g, '')).filter(Boolean)
          const option = Array.from(candidate.options).find((item) => {
            const text = normalize(item.textContent)
            const value = normalize(item.value)
            const valueDigits = value.replace(/\D+/g, '')
            const textDigits = text.replace(/\D+/g, '')
            return variants.includes(value) ||
              variants.includes(text) ||
              digitVariants.includes(valueDigits) ||
              digitVariants.includes(textDigits)
          })

          if (!option) {
            return false
          }

          candidate.value = option.value
          option.selected = true
          candidate.dispatchEvent(inputEvent())
          candidate.dispatchEvent(changeEvent())
          candidate.blur?.()
          return true
        }

        const lower = (value) => String(value).toLowerCase()

        clickMatch([input.reserveText])

        const desiredDateValue = input.dateDisplayValue || input.dateValue
        let filledDate =
          setInputValue((meta) => lower(meta).includes('date') || lower(meta).includes('calendar') || meta.includes('\uB0A0\uC9DC'), desiredDateValue) ||
          setInputValue((meta) => lower(meta).includes('year') || meta.includes('\uB144') || meta.includes('\uC6D4') || meta.includes('\uC77C'), desiredDateValue)

        const dateInputAfterTyping =
          panelRoot.querySelector('input[class*="input_date"]') ||
          panelRoot.querySelector('input[readonly][type="text"]')
        const typedDateValue = getValue(dateInputAfterTyping)
        const expectedDate = normalizeDateDigits(input.dateValue)
        if (normalizeDateDigits(typedDateValue) !== expectedDate) {
          filledDate = clickCalendarDate() || filledDate
        }

        const filledTime =
          setInputValue((meta) => lower(meta).includes('time') || meta.includes('\uC2DC\uAC04'), `${input.hour24}:${input.minute}`) ||
          setInputValue((meta) => meta.includes('\uC2DC') || lower(meta).includes('hour'), input.hour24) ||
          setInputValue((meta) => meta.includes('\uBD84') || lower(meta).includes('minute'), input.minute)

        const selectResults = [
          setSelectValue((meta) => lower(meta).includes('year') || meta.includes('\uB144'), [input.year]),
          setSelectValue((meta) => lower(meta).includes('month') || meta.includes('\uC6D4'), [Number(input.month), input.month]),
          setSelectValue((meta) => lower(meta).includes('day') || meta.includes('\uC77C'), [Number(input.day), input.day]),
          setSelectValue((meta) => lower(meta).includes('hour') || meta.includes('\uC2DC'), [Number(input.hour24), input.hour24, `${Number(input.hour24)}\uC2DC`, `${input.hour24}\uC2DC`]),
          setSelectValue((meta) => lower(meta).includes('minute') || meta.includes('\uBD84'), [Number(input.minute), input.minute, `${Number(input.minute)}\uBD84`, `${input.minute}\uBD84`]),
        ].filter(Boolean).length

        if (!filledDate && !filledTime && selectResults === 0) {
          return { error: 'schedule inputs not found' }
        }

        const dateInput =
          panelRoot.querySelector('input[class*="input_date"]') ||
          panelRoot.querySelector('input[readonly][type="text"]')
        const hourSelect =
          panelRoot.querySelector('select[class*="hour"]') ||
          panelRoot.querySelector('select[title*="\uC2DC\uAC04"]')
        const minuteSelect =
          panelRoot.querySelector('select[class*="minute"]') ||
          panelRoot.querySelector('select[title*="\uBD84"]')

        const dateValue = getValue(dateInput)
        const hourValue = getValue(hourSelect)
        const minuteValue = getValue(minuteSelect)
        const actualDate = normalizeDateDigits(dateValue)
        const actualHour = normalizeTwoDigit(hourValue)
        const actualMinute = normalizeTwoDigit(minuteValue)
        const expectedHour = normalizeTwoDigit(input.hour24)
        const expectedMinute = normalizeTwoDigit(input.minute)

        if (actualDate !== expectedDate || actualHour !== expectedHour || actualMinute !== expectedMinute) {
          return {
            error: `schedule value mismatch (date=${dateValue || ''} hour=${hourValue || ''} minute=${minuteValue || ''} expectedDate=${expectedDate} expectedHour=${expectedHour} expectedMinute=${expectedMinute})`,
            clicks,
            filledDate,
            filledTime,
            selectResults,
          }
        }

        return { clicks, filledDate, filledTime, selectResults, dateValue, hourValue, minuteValue }
      }, {
        ...schedule,
        categoryText: CATEGORY_TEXT,
        reserveText: RESERVE_TEXT,
        reservedPostsText: RESERVED_POSTS_TEXT,
        scheduleText: SCHEDULE_TEXT,
        visibilityText: VISIBILITY_TEXT,
      })

      if (result?.error) {
        attempts.push(`${target.label}: ${result.error}`)
        continue
      }

      if (result) {
        console.log(
          `[Naver Upload] Filled schedule inputs via ${target.label} date=${result.filledDate} time=${result.filledTime} selects=${result.selectResults} matches=${result.clicks.join('|')}`
        )
        return
      }

      attempts.push(`${target.label}: schedule inputs not found`)
    } catch (error) {
      attempts.push(`${target.label}: ${error.message}`)
    }
  }

  throw new Error(`[${RUNTIME_SOURCE}] Unable to fill scheduled publish inputs. ${attempts.slice(0, 4).join(' | ')}`)
}

async function readScheduledPublishState(targets) {
  for (const target of targets) {
    try {
      const result = await target.scope.evaluate(({ categoryText, invalidScheduleTimeText, reservedPostsText, scheduleReadyText, scheduleText, visibilityText }) => {
        const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
        const isVisible = (element) => {
          if (!(element instanceof Element)) {
            return false
          }

          const style = window.getComputedStyle(element)
          const rect = element.getBoundingClientRect()
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
        }
        const getValue = (element) => {
          if (!element) {
            return null
          }

          if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
            return normalize(element.value)
          }

          return normalize(element.textContent || element.getAttribute?.('aria-label') || element.getAttribute?.('value'))
        }

        const visibleElements = Array.from(document.querySelectorAll('body *'))
          .filter((element) => element instanceof HTMLElement)
          .filter(isVisible)

        const panelRoot = visibleElements
          .filter((element) => {
            const text = normalize(element.textContent)
            return (
              text.includes(categoryText) &&
              text.includes(visibilityText) &&
              text.includes(scheduleText) &&
              !text.includes(reservedPostsText)
            )
          })
          .sort((left, right) => {
            const leftRect = left.getBoundingClientRect()
            const rightRect = right.getBoundingClientRect()
            return rightRect.width * rightRect.height - leftRect.width * leftRect.height
          })[0] || null

        const reserveRadio =
          panelRoot?.querySelector('input[data-testid="preTimeRadioBtn"]') ||
          panelRoot?.querySelector('input[value="pre"]') ||
          panelRoot?.querySelector('#radio_time2')
        const dateInput =
          panelRoot?.querySelector('input[class*="input_date"]') ||
          panelRoot?.querySelector('input[readonly][type="text"]')
        const hourSelect =
          panelRoot?.querySelector('select[class*="hour"]') ||
          panelRoot?.querySelector('select[title*="\uC2DC\uAC04"]')
        const minuteSelect =
          panelRoot?.querySelector('select[class*="minute"]') ||
          panelRoot?.querySelector('select[title*="\uBD84"]')
        const validationError = panelRoot
          ? Array.from(panelRoot.querySelectorAll('[class*="error_message"], [class*="errorMessage"], [role="alert"], p, span'))
            .filter((element) => element instanceof HTMLElement)
            .filter(isVisible)
            .map((element) => normalize(element.textContent || element.getAttribute?.('aria-label')))
            .filter(Boolean)
            .sort((left, right) => left.length - right.length)
            .find((text) => text === invalidScheduleTimeText || text.includes(invalidScheduleTimeText)) || null
          : null
        const panelText = panelRoot ? normalize(panelRoot.textContent) : null

        return {
          dateValue: getValue(dateInput),
          hourValue: getValue(hourSelect),
          minuteValue: getValue(minuteSelect),
          panelVisible: Boolean(panelRoot),
          reserveModeActive: Boolean(reserveRadio?.checked),
          scheduleReady: Boolean(panelText && panelText.includes(scheduleReadyText)),
          validationError,
        }
      }, {
        categoryText: CATEGORY_TEXT,
        invalidScheduleTimeText: INVALID_SCHEDULE_TIME_TEXT,
        reservedPostsText: RESERVED_POSTS_TEXT,
        scheduleReadyText: SCHEDULE_READY_TEXT,
        scheduleText: SCHEDULE_TEXT,
        visibilityText: VISIBILITY_TEXT,
      })

      if (result) {
        return { label: target.label, ...result }
      }
    } catch {}
  }

  return null
}

async function configureScheduledPublish(page, targets, scheduledAt) {
  const schedule = normalizeScheduledPublishAt(scheduledAt)
  const scheduleTargets = getPublishDialogTargets(targets)
  if (schedule.adjusted) {
    console.warn(
      `[Naver Upload] Adjusted scheduled publish time from ${schedule.requestedIso} to ${schedule.iso} to satisfy Naver lead-time validation`
    )
  }

  let lastScheduleState = null
  const expectedDate = normalizeDateDigits(schedule.dateValue)
  const expectedHour = normalizeTwoDigitValue(schedule.hour24)
  const expectedMinute = normalizeTwoDigitValue(schedule.minute)

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await dismissEditorPopups(page, scheduleTargets)
    await ensurePublishDialogVisible(page, scheduleTargets)
    await activateReservePublishMode(scheduleTargets)
    await sleep(500)
    await fillScheduledPublishInputs(scheduleTargets, schedule)
    await sleep(500)

    lastScheduleState = await readScheduledPublishState(scheduleTargets)
    if (isScheduledPublishStateConfirmed(lastScheduleState, schedule)) {
      console.log(
        `[Naver Upload] Scheduled publish configured via ${lastScheduleState.label} date="${lastScheduleState.dateValue}" hour="${lastScheduleState.hourValue}" minute="${lastScheduleState.minuteValue}" panelVisible=${lastScheduleState.panelVisible} scheduleReady=${lastScheduleState.scheduleReady}`
      )
      await sleep(300)
      return schedule
    }

    const comparison = getScheduleComparison(lastScheduleState, schedule)
    console.warn(
      `[Naver Upload] Scheduled publish confirmation retry ${attempt}/3 failed. reserveModeActive=${lastScheduleState?.reserveModeActive} scheduleReady=${lastScheduleState?.scheduleReady} date="${lastScheduleState?.dateValue}" hour="${lastScheduleState?.hourValue}" minute="${lastScheduleState?.minuteValue}" expectedDate="${expectedDate}" expectedHour="${expectedHour}" expectedMinute="${expectedMinute}" actualDate="${comparison.actualDate}" actualHour="${comparison.actualHour}" actualMinute="${comparison.actualMinute}" validationError="${lastScheduleState?.validationError || ''}"`
    )
    await sleep(400)
  }

  const details = lastScheduleState
    ? `panelVisible=${lastScheduleState.panelVisible} reserveModeActive=${lastScheduleState.reserveModeActive} scheduleReady=${lastScheduleState.scheduleReady} dateValue=${lastScheduleState.dateValue} hourValue=${lastScheduleState.hourValue} minuteValue=${lastScheduleState.minuteValue} expectedDate=${schedule.dateValue} expectedHour=${schedule.hour24} expectedMinute=${schedule.minute} validationError=${lastScheduleState.validationError || 'none'}`
    : 'state unavailable'
  throw new Error(`[${RUNTIME_SOURCE}] Scheduled publish time was not confirmed after input. ${details}`)
}

async function clickToolbarPublishButton(page, targets) {
  const attempts = []

  for (const target of targets) {
    try {
      const button = target.scope.locator('button[data-click-area="tpb.publish"]').first()
      await button.waitFor({ state: 'visible', timeout: 2000 })

      await withPopupRecovery(
        page,
        targets,
        () => button.click({ timeout: 3000 }),
        `toolbar publish via ${target.label}`
      )

      if (await waitForPublishDialogVisible(targets, 1200)) {
        console.log(`[Naver Upload] Opened publish dialog via toolbar click on ${target.label}`)
        return true
      }

      await button.evaluate((element) => {
        if (!(element instanceof HTMLElement)) {
          return
        }

        element.focus()
        element.click()
        element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      })

      if (await waitForPublishDialogVisible(targets, 1200)) {
        console.log(`[Naver Upload] Opened publish dialog via toolbar DOM click on ${target.label}`)
        return true
      }

      await button.focus()
      await page.keyboard.press('Enter')
      if (await waitForPublishDialogVisible(targets, 1200)) {
        console.log(`[Naver Upload] Opened publish dialog via toolbar Enter key on ${target.label}`)
        return true
      }

      attempts.push(`${target.label}: dialog not visible after toolbar click`)
    } catch (error) {
      attempts.push(`${target.label}: ${error.message}`)
    }
  }

  console.warn(`[Naver Upload] Toolbar publish click did not open dialog. ${attempts.slice(0, 4).join(' | ')}`)
  return false
}

async function clickMainFramePublishButton(page, which = 'first', { scheduledAt = null } = {}) {
  const iframe = page.frameLocator('iframe#mainFrame')
  if (which === 'last') {
    const mainFrame = page.frame({ name: 'mainFrame' }) || page.frames().find((frame) => /mainFrame/i.test(frame.name()))
    if (!mainFrame) {
      throw new Error(`[${RUNTIME_SOURCE}] mainFrame was not found for final publish click.`)
    }

    const result = await mainFrame.evaluate(({ categoryText, publishText, reserveText, scheduleText, scheduledMode, visibilityText }) => {
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
      const isVisible = (element) => {
        if (!(element instanceof Element)) return false
        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.pointerEvents !== 'none' &&
          rect.width > 0 &&
          rect.height > 0
      }
      const isEnabled = (element) => !element.hasAttribute?.('disabled') && element.getAttribute?.('aria-disabled') !== 'true'
      const getLabel = (element) => normalize([
        element.textContent,
        element.getAttribute?.('aria-label'),
        element.getAttribute?.('value'),
        element.getAttribute?.('data-click-area'),
        element.className,
      ].filter(Boolean).join(' '))

      const dialogRoots = Array.from(document.querySelectorAll([
        '[data-group="popupLayer"]',
        '[role="dialog"]',
        '[class*="popup"]',
        '[class*="Popup"]',
        '[class*="layer"]',
        '[class*="Layer"]',
        'body *',
      ].join(',')))
        .filter((element) => element instanceof HTMLElement)
        .filter(isVisible)
        .filter((element) => {
          const text = normalize(element.textContent)
          return text.includes(categoryText) && text.includes(visibilityText) && text.includes(scheduleText)
        })
        .sort((left, right) => {
          const leftRect = left.getBoundingClientRect()
          const rightRect = right.getBoundingClientRect()
          const leftArea = leftRect.width * leftRect.height
          const rightArea = rightRect.width * rightRect.height
          return rightArea - leftArea
        })

      const root = dialogRoots[0] || document
      const rootRect = root instanceof Element ? root.getBoundingClientRect() : { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight }
      const candidates = Array.from(root.querySelectorAll('button, [role="button"], a, input[type="button"], input[type="submit"]'))
        .filter((element) => element instanceof HTMLElement)
        .filter(isVisible)
        .filter(isEnabled)
        .map((element) => {
          const rect = element.getBoundingClientRect()
          const label = getLabel(element)
          const lower = label.toLowerCase()
          const clickArea = normalize(element.getAttribute?.('data-click-area')).toLowerCase()
          const isToolbarPublish = clickArea === 'tpb.publish'
          const isReserveCandidate =
            label.includes(reserveText) ||
            lower.includes('reserve') ||
            lower.includes('schedule') ||
            clickArea.includes('reserve') ||
            clickArea.includes('schedule')
          const isToolbarScheduleToggle =
            clickArea === 'tpb*t.schedule' ||
            clickArea === 'schedulecl' ||
            clickArea.includes('schedulecl') ||
            lower.includes('reserve_btn')
          const looksFinal =
            label.includes(publishText) ||
            (scheduledMode && label.includes(reserveText)) ||
            lower.includes('confirm') ||
            lower.includes('publish')
          const bottomScore = rect.top >= rootRect.top + rootRect.height * 0.55 ? 40 : 0
          const rightScore = rect.left >= rootRect.left + rootRect.width * 0.45 ? 30 : 0
          const textScore = label.includes(publishText) ? 30 : 0
          const reserveScore = scheduledMode && label.includes(reserveText) ? 25 : 0
          const classScore = lower.includes('confirm') ? 25 : 0
          const score = bottomScore + rightScore + textScore + reserveScore + classScore + rect.left / 1000 + rect.top / 1000

          return { clickArea, element, isReserveCandidate, isToolbarPublish, isToolbarScheduleToggle, label, rect, score, looksFinal }
        })
        .filter((candidate) => candidate.looksFinal)
        .filter((candidate) => scheduledMode || !candidate.isReserveCandidate)
        .filter((candidate) => !candidate.isToolbarPublish && !candidate.isToolbarScheduleToggle)
        .sort((left, right) => right.score - left.score)

      const target = candidates[0]
      if (!target) {
        return null
      }

      target.element.scrollIntoView?.({ block: 'center', inline: 'center' })
      target.element.focus()
      target.element.click()
      target.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))

      return {
        clickArea: target.clickArea,
        label: target.label,
        score: Math.round(target.score),
        top: Math.round(target.rect.top),
      }
    }, {
      categoryText: CATEGORY_TEXT,
      publishText: PUBLISH_TEXT,
      reserveText: RESERVE_TEXT,
      scheduleText: SCHEDULE_TEXT,
      scheduledMode: Boolean(scheduledAt),
      visibilityText: VISIBILITY_TEXT,
    })

    if (!result) {
      throw new Error(`[${RUNTIME_SOURCE}] Final publish button was not found inside publish dialog.`)
    }

    console.log(
      `[Naver Upload] Clicked mainFrame final publish button top=${result.top} score=${result.score} area="${result.clickArea}" label="${String(result.label || '').slice(0, 120)}"`
    )
    return result
  }

  const selector = which === 'last'
    ? `.confirm_btn__Nevj2, button:has-text("${PUBLISH_TEXT}")`
    : 'button[data-click-area="tpb.publish"]'
  const button = iframe.locator(selector)[which]()
  await button.click({ timeout: 5000 })
  console.log(`[Naver Upload] Clicked mainFrame publish button (${which}) -> ${selector}`)
  return { label: selector }
}

async function clickScheduledPublishConfirmation(page) {
  const mainFrame = page.frame({ name: 'mainFrame' }) || page.frames().find((frame) => /mainFrame/i.test(frame.name()))
  if (!mainFrame) {
    return null
  }

  const result = await mainFrame.evaluate(({ categoryText, confirmText, publishText, registerText, reserveText, scheduleText }) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.pointerEvents !== 'none' &&
        rect.width > 0 &&
        rect.height > 0
    }
    const isEnabled = (element) => !element.hasAttribute?.('disabled') && element.getAttribute?.('aria-disabled') !== 'true'
    const getLabel = (element) => normalize([
      element.textContent,
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('value'),
      element.getAttribute?.('data-click-area'),
      element.className,
    ].filter(Boolean).join(' '))

    const roots = Array.from(document.querySelectorAll([
      '[data-group="popupLayer"]',
      '[role="dialog"]',
      '[class*="popup"]',
      '[class*="Popup"]',
      '[class*="layer"]',
      '[class*="Layer"]',
      'body *',
    ].join(',')))
      .filter((element) => element instanceof HTMLElement)
      .filter(isVisible)
      .filter((element) => {
        const text = normalize(element.textContent)
        if (!text.includes(reserveText)) return false
        return !(text.includes(categoryText) && text.includes(scheduleText))
      })
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect()
        const rightRect = right.getBoundingClientRect()
        return (leftRect.width * leftRect.height) - (rightRect.width * rightRect.height)
      })

    for (const root of roots) {
      const rootRect = root.getBoundingClientRect()
      const candidates = Array.from(root.querySelectorAll('button, [role="button"], a, input[type="button"], input[type="submit"]'))
        .filter((element) => element instanceof HTMLElement)
        .filter(isVisible)
        .filter(isEnabled)
        .map((element) => {
          const rect = element.getBoundingClientRect()
          const label = getLabel(element)
          const lower = label.toLowerCase()
          let score = 0

          if (label === confirmText) score += 80
          if (label.includes(confirmText)) score += 55
          if (label.includes(publishText)) score += 45
          if (label.includes(registerText)) score += 35
          if (lower.includes('confirm') || lower.includes('submit')) score += 30
          if (rect.left >= rootRect.left + rootRect.width * 0.45) score += 15
          if (rect.top >= rootRect.top + rootRect.height * 0.45) score += 12

          return { element, label, rect, score }
        })
        .filter((candidate) => candidate.score > 0)
        .sort((left, right) => right.score - left.score || right.rect.left - left.rect.left)

      const target = candidates[0]
      if (!target) {
        continue
      }

      target.element.scrollIntoView?.({ block: 'center', inline: 'center' })
      target.element.focus()
      target.element.click()
      target.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))

      return {
        label: target.label,
        score: Math.round(target.score),
        top: Math.round(target.rect.top),
      }
    }

    return null
  }, {
    categoryText: CATEGORY_TEXT,
    confirmText: CONFIRM_TEXT,
    publishText: PUBLISH_TEXT,
    registerText: REGISTER_TEXT,
    reserveText: RESERVE_TEXT,
    scheduleText: SCHEDULE_TEXT,
  })

  if (result) {
    console.log(
      `[Naver Upload] Clicked scheduled publish confirmation top=${result.top} score=${result.score} label="${String(result.label || '').slice(0, 120)}"`
    )
  }

  return result
}

async function clickScheduledFinalPublishButton(page) {
  const mainFrame = page.frame({ name: 'mainFrame' }) || page.frames().find((frame) => /mainFrame/i.test(frame.name()))
  if (!mainFrame) {
    throw new Error(`[${RUNTIME_SOURCE}] mainFrame was not found for scheduled final publish click.`)
  }

  const result = await mainFrame.evaluate(({ categoryText, publishText, reserveText, scheduleText, visibilityText }) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.pointerEvents !== 'none' &&
        rect.width > 0 &&
        rect.height > 0
    }
    const isEnabled = (element) => !element.hasAttribute?.('disabled') && element.getAttribute?.('aria-disabled') !== 'true'
    const getLabel = (element) => normalize([
      element.textContent,
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('title'),
      element.getAttribute?.('value'),
      element.getAttribute?.('data-click-area'),
      element.className,
    ].filter(Boolean).join(' '))

    const roots = Array.from(document.querySelectorAll([
      '[data-group="popupLayer"]',
      '[role="dialog"]',
      '[class*="popup"]',
      '[class*="Popup"]',
      '[class*="layer"]',
      '[class*="Layer"]',
      'body *',
    ].join(',')))
      .filter((element) => element instanceof HTMLElement)
      .filter(isVisible)
      .filter((element) => {
        const text = normalize(element.textContent)
        return text.includes(categoryText) && text.includes(visibilityText) && text.includes(scheduleText)
      })
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect()
        const rightRect = right.getBoundingClientRect()
        return (rightRect.width * rightRect.height) - (leftRect.width * leftRect.height)
      })

    const root = roots[0] || document
    const rootRect = root instanceof Element
      ? root.getBoundingClientRect()
      : { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight }

    const candidates = Array.from(root.querySelectorAll('button, [role="button"], a, input[type="button"], input[type="submit"], [data-click-area]'))
      .filter((element) => element instanceof HTMLElement)
      .filter(isVisible)
      .filter(isEnabled)
      .map((element) => {
        const rect = element.getBoundingClientRect()
        const label = getLabel(element)
        const lower = label.toLowerCase()
        const clickArea = normalize(element.getAttribute?.('data-click-area')).toLowerCase()
        const className = normalize(element.className).toLowerCase()
        const isToolbarPublish = clickArea === 'tpb.publish'
        const isScheduleToggle =
          clickArea === 'tpb*t.schedule' ||
          clickArea === 'tpb*i.schedule' ||
          clickArea === 'schedulecl' ||
          clickArea.includes('schedulecl')
        const hasFinalText =
          label.includes(publishText) ||
          label.includes(reserveText) ||
          lower.includes('publish') ||
          lower.includes('confirm') ||
          lower.includes('submit')

        let score = 0
        if (label.includes(publishText)) score += 70
        if (label.includes(reserveText)) score += 55
        if (lower.includes('confirm') || lower.includes('submit')) score += 40
        if (clickArea.includes('publish') || clickArea.includes('confirm') || clickArea.includes('reserve')) score += 25
        if (className.includes('confirm') || className.includes('publish') || className.includes('reserve')) score += 20
        if (rect.top >= rootRect.top + rootRect.height * 0.55) score += 35
        if (rect.left >= rootRect.left + rootRect.width * 0.45) score += 25
        score += rect.left / 1000 + rect.top / 1000

        return { clickArea, element, hasFinalText, isScheduleToggle, isToolbarPublish, label, rect, score }
      })
      .filter((candidate) => candidate.hasFinalText)
      .filter((candidate) => !candidate.isToolbarPublish && !candidate.isScheduleToggle)
      .sort((left, right) => right.score - left.score)

    const target = candidates[0]
    if (!target) {
      return null
    }

    target.element.scrollIntoView?.({ block: 'center', inline: 'center' })
    target.element.focus()
    target.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }))
    target.element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }))
    target.element.click()
    target.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))

    return {
      clickArea: target.clickArea,
      label: target.label,
      score: Math.round(target.score),
      top: Math.round(target.rect.top),
    }
  }, {
    categoryText: CATEGORY_TEXT,
    publishText: PUBLISH_TEXT,
    reserveText: RESERVE_TEXT,
    scheduleText: SCHEDULE_TEXT,
    visibilityText: VISIBILITY_TEXT,
  })

  if (!result) {
    throw new Error(`[${RUNTIME_SOURCE}] Scheduled final publish button was not found inside publish dialog.`)
  }

  console.log(
    `[Naver Upload] Clicked scheduled final publish button top=${result.top} score=${result.score} area="${result.clickArea}" label="${String(result.label || '').slice(0, 120)}"`
  )
  return result
}

async function openPublishDialog(page, targets) {
  await sleep(1500)
  await clickMainFramePublishButton(page, 'first')
  await sleep(1200)

  if (await waitForPublishDialogVisible(targets, 2500)) {
    console.log('[Naver Upload] Publish dialog opened via mainFrame simple click')
    return
  }

  throw new Error(`[${RUNTIME_SOURCE}] Publish dialog did not open after mainFrame publish click.`)
}

function formatDebugFiles(debugArtifacts) {
  return [debugArtifacts?.screenshotPath, debugArtifacts?.htmlPath].filter(Boolean).join(', ')
}

function buildPublishConfirmationError({ currentUrl, debugArtifacts, scheduledAt, visibleHints }) {
  const parts = [
    scheduledAt
      ? 'Publish was clicked, but the scheduled publish confirmation was not confirmed.'
      : 'Publish was clicked, but the final Naver post URL was not confirmed.',
  ]

  if (currentUrl) {
    parts.push(`Current URL: ${currentUrl}`)
  }

  if (visibleHints.length > 0) {
    parts.push(`Visible overlays: ${visibleHints.join(' | ')}`)
  }

  const debugFiles = formatDebugFiles(debugArtifacts)
  if (debugFiles) {
    parts.push(`Debug files: ${debugFiles}`)
  }

  return parts.join(' ')
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

async function clickPhotoButtonByDom(scope) {
  return scope.evaluate(({ myboxText, photoAddText, photoText }) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
    const INTERACTIVE_SELECTOR = 'button, [role="button"], a, input[type="button"], input[type="submit"], [data-click-area], [class*="image"], [class*="photo"]'
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
    const getAttrs = (element) => normalize([
      element.getAttribute?.('class'),
      element.getAttribute?.('data-click-area'),
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('name'),
      element.getAttribute?.('role'),
      element.getAttribute?.('type'),
    ].join(' '))

    const candidates = Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR))
      .filter((element) => element instanceof HTMLElement)
      .filter(isVisible)
      .filter(isEnabled)
      .map((element) => {
        const text = getText(element)
        const attrs = getAttrs(element)
        const lowerText = text.toLowerCase()
        const lowerAttrs = attrs.toLowerCase()
        const rect = element.getBoundingClientRect()
        let score = 0

        if (text === photoText) score += 40
        if (text === photoAddText) score += 42
        if (text.startsWith(photoText)) score += 24
        if (text.includes(photoAddText)) score += 20
        if (lowerAttrs.includes('photo')) score += 10
        if (lowerAttrs.includes('image')) score += 8
        if (rect.top >= 140 && rect.top <= 460) score += 10
        if (String(element.tagName || '').toLowerCase() === 'button') score += 8

        if (text.includes(myboxText) || lowerAttrs.includes(myboxText.toLowerCase())) {
          score -= 120
        }
        if (lowerText.includes('\uBC30\uACBD') || lowerText.includes('\uC81C\uBAA9')) {
          score -= 40
        }

        return { attrs, element, rect, score, text }
      })
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.rect.top - right.rect.top || left.rect.left - right.rect.left)

    const target = candidates[0]
    if (!target) {
      return null
    }

    target.element.focus()
    target.element.click()
    target.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    return {
      attrs: target.attrs,
      score: target.score,
      text: target.text,
      top: Math.round(target.rect.top),
    }
  }, {
    myboxText: MYBOX_TEXT,
    photoAddText: PHOTO_ADD_TEXT,
    photoText: PHOTO_TEXT,
  })
}

async function countInsertedEditorImages(targets) {
  const counts = await Promise.all(
    targets.map(async (target) => {
      try {
        return await target.scope.evaluate(() => {
          const isVisible = (element) => {
            if (!(element instanceof Element)) {
              return false
            }

            const style = window.getComputedStyle(element)
            const rect = element.getBoundingClientRect()
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
          }

          const containers = Array.from(document.querySelectorAll('.se-section-image, [class*="se-section-image"], [data-module-type*="image"], [class*="imageStrip"], [class*="imageBundle"]'))
            .filter((element) => element instanceof HTMLElement)
            .filter(isVisible)

          if (containers.length > 0) {
            return containers.length
          }

          return Array.from(document.querySelectorAll('.se-main-container img, .se-component-content img, .se-section-content img'))
            .filter((element) => element instanceof HTMLImageElement)
            .filter(isVisible)
            .filter((element) => !String(element.src || '').startsWith('data:'))
            .length
        })
      } catch {
        return 0
      }
    })
  )

  return Math.max(0, ...counts)
}

async function setPhotoFilesOnExistingInput(targets, photoPaths) {
  const attempts = []

  for (const target of targets) {
    try {
      const fileInputs = target.scope.locator('input[type="file"]')
      const inputCount = await fileInputs.count()
      if (inputCount === 0) {
        attempts.push(`${target.label}: no file input`)
        continue
      }

      await fileInputs.nth(inputCount - 1).setInputFiles(photoPaths, { timeout: 5000 })
      return { label: target.label, method: 'input' }
    } catch (error) {
      attempts.push(`${target.label}: ${error.message}`)
    }
  }

  return { attempts, label: null, method: null }
}

async function waitForInsertedEditorImages(targets, beforeCount, timeout = 45000) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeout) {
    const currentCount = await countInsertedEditorImages(targets)
    if (currentCount > beforeCount) {
      return currentCount
    }

    await sleep(400)
  }

  return beforeCount
}

async function uploadPhotos(page, targets, photoPaths) {
  const validPhotoPaths = getExistingPhotoPaths(photoPaths)
  if (validPhotoPaths.length === 0) {
    return
  }

  const uploadTargets = getPublishDialogTargets(targets)
  const beforeCount = await countInsertedEditorImages(uploadTargets)
  let uploadSource = null

  const directInputResult = await setPhotoFilesOnExistingInput(uploadTargets, validPhotoPaths)
  if (directInputResult.method) {
    uploadSource = `${directInputResult.label}:${directInputResult.method}`
  } else {
    const chooserPromise = page.waitForEvent('filechooser', { timeout: 3000 }).catch(() => null)
    let photoClickResult = null
    const clickAttempts = []

    for (const target of uploadTargets) {
      try {
        photoClickResult = await clickPhotoButtonByDom(target.scope)
        if (photoClickResult) {
          uploadSource = `${target.label}:button`
          console.log(
            `[Naver Upload] Opened photo picker via ${target.label} text="${photoClickResult.text}" top=${photoClickResult.top} score=${photoClickResult.score} attrs="${photoClickResult.attrs}"`
          )
          break
        }

        clickAttempts.push(`${target.label}: photo button not found`)
      } catch (error) {
        clickAttempts.push(`${target.label}: ${error.message}`)
      }
    }

    const chooser = await chooserPromise
    if (chooser) {
      await chooser.setFiles(validPhotoPaths)
      uploadSource = uploadSource || 'filechooser'
    } else {
      const delayedInputResult = await setPhotoFilesOnExistingInput(uploadTargets, validPhotoPaths)
      if (delayedInputResult.method) {
        uploadSource = `${delayedInputResult.label}:${delayedInputResult.method}`
      } else {
        throw new Error(
          `[${RUNTIME_SOURCE}] Unable to attach blog photos. ${[...clickAttempts, ...directInputResult.attempts, ...delayedInputResult.attempts].slice(0, 6).join(' | ')}`
        )
      }
    }
  }

  const afterCount = await waitForInsertedEditorImages(uploadTargets, beforeCount)
  if (afterCount <= beforeCount) {
    throw new Error(
      `[${RUNTIME_SOURCE}] Photo upload was triggered but no editor images appeared. before=${beforeCount} after=${afterCount}`
    )
  }

  console.log(
    `[Naver Upload] Uploaded ${validPhotoPaths.length} photo(s) via ${uploadSource}. editorImages ${beforeCount} -> ${afterCount}`
  )
}

async function insertBodyContentWithMarkers(page, targets, content, photoPaths) {
  const segments = parseContentWithImageMarkers(content)
  const validPhotoPaths = getExistingPhotoPaths(photoPaths)
  const usedPhotoIndexes = new Set()

  await focusField(page, targets, BODY_SELECTORS, 'body')
  await sleep(300)

  for (const segment of segments) {
    if (segment.type === 'text') {
      if (segment.text) {
        await typeMultilineWithFormatting(page, segment.text)
      }
      continue
    }

    const photoIndex = Number(segment.index) - 1
    const photoPath = validPhotoPaths[photoIndex]
    if (!photoPath) {
      console.warn(`[Naver Upload] Skipping missing image marker ${segment.marker}`)
      continue
    }

    await sleep(250)
    await uploadPhotos(page, targets, [photoPath])
    usedPhotoIndexes.add(photoIndex)
    await sleep(500)
  }

  const unusedPhotoIndexes = validPhotoPaths
    .map((_, index) => index)
    .filter((index) => !usedPhotoIndexes.has(index))

  if (unusedPhotoIndexes.length > 0) {
    console.warn(
      `[Naver Upload] ${unusedPhotoIndexes.length} photo(s) were not referenced by [IMG:N] markers and were not inserted.`
    )
  }
}

async function clickPublishButtonByDom(scope, which = 'first') {
  return scope.evaluate(({ categoryText, publishText, scheduleText, visibilityText, whichButton }) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
    const INTERACTIVE_SELECTOR = 'button, [role="button"], a, input[type="button"], input[type="submit"], [data-click-area], [class*="publish"]'
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
    const getAncestorContext = (element) => {
      const ancestors = []
      let current = element.parentElement
      while (current && ancestors.length < 5) {
        ancestors.push(current)
        current = current.parentElement
      }

      return {
        ancestorClass: normalize(ancestors.map((node) => node.className).join(' ')),
        ancestorText: normalize(ancestors.map((node) => node.textContent).join(' ')),
      }
    }
    const resolveInteractiveCandidate = (element) => {
      if (!(element instanceof HTMLElement)) {
        return null
      }

      if (element.matches?.(INTERACTIVE_SELECTOR)) {
        return element
      }

      return element.closest?.(INTERACTIVE_SELECTOR) || null
    }
    const getCandidates = (root) => {
      const candidates = new Map()
      const addCandidate = (element) => {
        if (!(element instanceof HTMLElement) || !isVisible(element) || !isEnabled(element)) {
          return
        }

        const text = getText(element)
        const className = getClassName(element)
        const clickArea = getClickArea(element)
        const rect = element.getBoundingClientRect()
        const context = getAncestorContext(element)
        const lowerClass = className.toLowerCase()
        const lowerClickArea = clickArea.toLowerCase()
        const looksLikePublish =
          text.includes(publishText) ||
          lowerClass.includes('publish') ||
          lowerClickArea.includes('publish')

        if (!looksLikePublish && whichButton !== 'last') {
          return
        }

        candidates.set(element, { ...context, className, clickArea, element, rect, text })
      }

      Array.from(root.querySelectorAll(INTERACTIVE_SELECTOR))
        .filter((element) => element instanceof HTMLElement)
        .forEach(addCandidate)

      if (whichButton === 'last') {
        Array.from(root.querySelectorAll('body *'))
          .filter((element) => element instanceof HTMLElement)
          .filter(isVisible)
          .filter((element) => getText(element).includes(publishText))
          .forEach((element) => {
            const candidate = resolveInteractiveCandidate(element)
            if (candidate) {
              addCandidate(candidate)
            }
          })
      }

      return Array.from(candidates.values())
        .filter((candidate) => {
          const lowerClass = candidate.className.toLowerCase()
          const lowerClickArea = candidate.clickArea.toLowerCase()
          return (
            whichButton === 'last' ||
            candidate.text.includes(publishText) ||
            lowerClass.includes('publish') ||
            lowerClickArea.includes('publish')
          )
        })
    }

    const sortCandidates = (candidates) => candidates.sort((left, right) => {
      if (whichButton === 'last') {
        return right.rect.top - left.rect.top || right.rect.left - left.rect.left
      }

      return left.rect.top - right.rect.top || left.rect.left - right.rect.left
    })

    if (whichButton === 'last') {
      const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0
      const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0
      const publishCandidates = getCandidates(document)
        .filter((candidate) => {
          const lowerClickArea = candidate.clickArea.toLowerCase()
          if (lowerClickArea === 'tpb.publish') {
            return false
          }

          if (viewportHeight > 0 && candidate.rect.top <= viewportHeight * 0.2) {
            return false
          }

          return true
        })
        .map((candidate) => {
          const lowerClass = candidate.className.toLowerCase()
          const lowerClickArea = candidate.clickArea.toLowerCase()
          const lowerAncestorClass = candidate.ancestorClass.toLowerCase()
          const ancestorText = candidate.ancestorText
          const panelText =
            ancestorText.includes(categoryText) ||
            ancestorText.includes(visibilityText) ||
            ancestorText.includes(scheduleText)
          const topRatio = viewportHeight > 0 ? candidate.rect.top / viewportHeight : 0
          const leftRatio = viewportWidth > 0 ? candidate.rect.left / viewportWidth : 0
          let score = 0

          if (candidate.text.includes(publishText)) score += 14
          if (lowerClass.includes('publish')) score += 10
          if (lowerClickArea.includes('publish')) score += 12
          if (lowerAncestorClass.includes('publish')) score += 8
          if (panelText) score += 32
          if (String(candidate.element.tagName || '').toLowerCase() === 'button') score += 8
          if (candidate.rect.width >= 72 && candidate.rect.height >= 30) score += 4
          if (viewportHeight > 0 && candidate.rect.top >= viewportHeight * 0.5) score += 18
          if (viewportWidth > 0 && candidate.rect.left >= viewportWidth * 0.45) score += 12
          score += Math.round(topRatio * 20)
          score += Math.round(leftRatio * 12)

          return { ...candidate, score }
        })
        .sort((left, right) => right.score - left.score || right.rect.top - left.rect.top || right.rect.left - left.rect.left)

      const target = publishCandidates[0]
      if (!target) {
        return null
      }

      target.element.focus()
      target.element.click()
      target.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      return {
        ancestorText: target.ancestorText,
        clickArea: target.clickArea,
        score: target.score,
        text: target.text,
        top: Math.round(target.rect.top),
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
      ancestorText: target.ancestorText,
      clickArea: target.clickArea,
      score: null,
      text: target.text,
      top: Math.round(target.rect.top),
    }
  }, {
    categoryText: CATEGORY_TEXT,
    publishText: PUBLISH_TEXT,
    scheduleText: SCHEDULE_TEXT,
    visibilityText: VISIBILITY_TEXT,
    whichButton: which,
  })
}

async function withPopupRecovery(page, targets, action, label, options = {}) {
  const attempts = options.attempts || 4
  const sleepFn = options.sleep || sleep

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await dismissEditorPopups(page, targets)

    try {
      return await action()
    } catch (error) {
      if (!isPopupInterceptionError(error) || attempt === attempts) {
        throw error
      }

      console.warn(`[Naver Upload] ${label} was blocked by a popup. Retrying (${attempt}/${attempts})`)
      await dismissEditorPopups(page, targets)
      await sleepFn(250 * attempt)
    }
  }
}

async function resolveWriteUrls(page) {
  await page.goto('https://www.naver.com', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await sleep(1500)

  await page.goto('https://blog.naver.com', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await sleep(2000)

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

async function focusField(page, targets, selectors, fieldName) {
  const attempts = []

  for (const target of targets) {
    console.log(`[Naver Upload] Trying ${fieldName} target: ${target.label}`)
    for (const selector of selectors) {
      try {
        const field = target.scope.locator(selector).first()
        console.log(`[Naver Upload] Waiting for ${fieldName} selector on ${target.label}: ${selector}`)
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
        console.log(`[Naver Upload] Focused ${fieldName} via ${target.label} -> ${selector}`)
        return { label: target.label, selector, via: 'selector' }
      } catch (error) {
        attempts.push(`${target.label} -> ${selector}: ${error.message}`)
      }
    }

    try {
      await dismissEditorPopups(page, targets)
      const result = await focusEditableFieldByDom(target.scope, fieldName)
      if (result) {
        console.log(
          `[Naver Upload] Focused ${fieldName} via ${target.label} -> dom score=${result.score} top=${result.top} placeholder="${result.placeholder}" class="${result.className}"`
        )
        return { ...result, label: target.label, via: 'dom' }
      }
    } catch (error) {
      attempts.push(`${target.label} -> dom-editable: ${error.message}`)
    }
  }

  throw new Error(`[${RUNTIME_SOURCE}] Unable to focus ${fieldName}. ${attempts.slice(0, 6).join(' | ')}`)
}

async function focusAndType(page, targets, selectors, text, fieldName) {
  await focusField(page, targets, selectors, fieldName)
  await sleep(300)
  await typeMultiline(page, text)
}

async function clickPublishButton(page, targets, which = 'first') {
  const attempts = []

  for (const target of targets) {
    if (which === 'last') {
      try {
        const result = await clickPublishButtonByDom(target.scope, which)
        if (result) {
          console.log(
            `[Naver Upload] Clicked publish button via ${target.label} -> dom (${which}) top=${result.top} text="${result.text}" area="${result.clickArea}" context="${String(result.ancestorText || '').slice(0, 120)}"`
          )
          return
        }
      } catch (error) {
        attempts.push(`${target.label} -> dom-publish: ${error.message}`)
      }
      continue
    }

    try {
      const button = target.scope.getByRole('button', { name: /\uBC1C\uD589/ })[which]()
      try {
        await withPopupRecovery(
          page,
          targets,
          () => button.click({ timeout: 3000 }),
          `publish button (${which}) via ${target.label}`
        )
      } catch (error) {
        if (!isPopupInterceptionError(error)) {
          throw error
        }

        await dismissEditorPopups(page, targets)
        await focusByDom(button)
      }
      console.log(`[Naver Upload] Clicked publish button via ${target.label} (${which})`)
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
        console.log(`[Naver Upload] Clicked publish button via ${target.label} -> ${selector} (${which})`)
        return
      } catch (error) {
        attempts.push(`${target.label} -> ${selector}: ${error.message}`)
      }
    }

    try {
      const result = await clickPublishButtonByDom(target.scope, which)
      if (result) {
        console.log(
          `[Naver Upload] Clicked publish button via ${target.label} -> dom (${which}) top=${result.top} text="${result.text}" area="${result.clickArea}"`
        )
        return
      }
    } catch (error) {
      attempts.push(`${target.label} -> dom-publish: ${error.message}`)
    }
  }

  throw new Error(`[${RUNTIME_SOURCE}] Unable to click publish button. ${attempts.slice(0, 6).join(' | ')}`)
}

async function clickFinalPublishButton(page, targets, { scheduledAt = null } = {}) {
  const attempts = scheduledAt ? 3 : 2
  let lastVisible = null
  let lastFinalClick = null
  let lastConfirmClick = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    lastFinalClick = scheduledAt
      ? await clickScheduledFinalPublishButton(page)
      : await clickMainFramePublishButton(page, 'last', { scheduledAt })
    if (scheduledAt) {
      await sleep(700)
      lastConfirmClick = await clickScheduledPublishConfirmation(page)
      if (!lastConfirmClick) {
        await page.keyboard.press('Enter').catch(() => {})
        console.warn('[Naver Upload] Scheduled publish confirmation button was not found. Sent Enter as fallback.')
      }
    }
    const progressed = await waitForPublishProgress(page, targets, { scheduledAt, timeout: scheduledAt ? 8000 : 2500 })
    if (progressed) {
      return
    }

    lastVisible = await isPublishDialogVisible(targets)
    console.warn(
      `[Naver Upload] Final publish click attempt ${attempt}/${attempts} did not change publish state. dialogVisible=${lastVisible}`
    )
    if (!lastVisible) {
      await dismissEditorPopups(page, targets)
    }
    await sleep(500)
  }

  const visibleHints = await collectVisibleHints(page).catch(() => [])
  throw new Error(
    `[${RUNTIME_SOURCE}] Final publish action did not progress after click attempts. dialogVisible=${lastVisible} lastFinalClick="${String(lastFinalClick?.label || '').slice(0, 120)}" lastFinalArea="${String(lastFinalClick?.clickArea || '')}" lastConfirmClick="${String(lastConfirmClick?.label || 'none').slice(0, 120)}" visibleHints="${visibleHints.join(' | ').slice(0, 240)}"`
  )
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

  const waitForTagVisible = async (scope, tag) => {
    try {
      await scope.waitForFunction(
        (value) => {
          const normalize = (input) => String(input || '').replace(/\s+/g, ' ').trim()
          const text = normalize(document.body?.textContent)
          return text.includes(value)
        },
        tag,
        { timeout: 1500 }
      )
    } catch {}
  }

  const typeTags = async (scope) => {
    for (const tag of normalizedTags) {
      await page.keyboard.type(tag, { delay: 25 })
      await page.keyboard.press('Space')
      await waitForTagVisible(scope, tag)
      await sleep(350)
    }
  }

  for (const target of targets) {
    for (const selector of TAG_INPUT_SELECTORS) {
      try {
        const tagInput = target.scope.locator(selector).first()
        await tagInput.click({ timeout: 3000 })

        await typeTags(target.scope)

        console.log(`[Naver Upload] Filled tags via ${target.label} -> ${selector}: ${normalizedTags.join(', ')}`)
        return
      } catch {}
    }

    try {
      const result = await focusTagInputByDom(target.scope)
      if (result?.focused) {
        await typeTags(target.scope)

        console.log(
          `[Naver Upload] Filled tags via ${target.label} -> dom ${result.selector || ''}: ${normalizedTags.join(', ')}`
        )
        return
      }
    } catch (error) {
      console.warn(`[Naver Upload] DOM tag focus failed via ${target.label}: ${error.message}`)
    }
  }

  console.warn(`[Naver Upload] Failed to set tags. tags=${normalizedTags.join(', ')}`)
}

async function uploadToNaver({ title, content, tags = [], photoPaths = [], headless = true, scheduledAt = null }) {
  if (!title) {
    throw new Error('Title is required.')
  }

  if (!content) {
    throw new Error('Content is required.')
  }

  if (!hasSavedSession()) {
    throw new Error('Naver session is missing. Log in again from the desktop app first.')
  }

  const playwright = getPlaywrightDiagnostics()
  if (!playwright.bundledBrowserFound && !playwright.systemBrowserCacheDetected) {
    throw new Error('Chromium is missing. Run the bundled Chromium install step before building the desktop app.')
  }

  const storageState = loadSessionState()
  if (!storageState) {
    throw new Error('Saved Naver session could not be loaded. Please log in again.')
  }

  const runtimeUpload = startUpload({
    headless,
    photoCount: photoPaths.length,
    tagCount: tags.length,
    titleLength: String(title).length,
  })

  const markStep = (stage, stageLabel = stage, extras = {}) => {
    updateUploadStage(stage, {
      ...extras,
      stageLabel,
    })
  }

  let browser = null
  let context = null
  let page = null
  let currentStep = 'initialization'
  let targets = []

  try {
    markStep(currentStep, 'browser-init')
    browser = await chromium.launch({
      headless,
      args: BROWSER_ARGS,
    })

    context = await browser.newContext({
      storageState,
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
      userAgent: USER_AGENT,
      viewport: DEFAULT_VIEWPORT,
    })

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
      Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko'] })
    })

    page = await context.newPage()
    markStep(currentStep, 'page-ready')
    currentStep = 'resolve-write-url'
    markStep(currentStep, 'resolve-write-url')
    const writeUrls = await resolveWriteUrls(page)
    let loadedUrl = null

    for (const url of writeUrls) {
      try {
        console.log(`[Naver Upload] Opening editor candidate: ${url}`)
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 45000,
        })
        await sleep(2500)
        loadedUrl = page.url()
        console.log(`[Naver Upload] Editor loaded: ${loadedUrl}`)
        break
      } catch (error) {
        console.warn(`[Naver Upload] Failed to open ${url}: ${error.message}`)
      }
    }

    if (!loadedUrl) {
      throw new Error('Unable to open the Naver blog editor.')
    }

    if (isNaverLoginUrl(loadedUrl) || !isLikelyWriteUrl(loadedUrl)) {
      clearSessionState()
      throw new Error('Saved Naver session expired. Please log in again from the desktop app.')
    }

    currentStep = 'dismiss-popup'
    markStep(currentStep, 'dismiss-popup', { editorUrl: loadedUrl })
    await dismissEditorPopups(page)
    await sleep(1500)

    currentStep = 'capture-editor'
    markStep(currentStep, 'capture-editor')
    await saveDebug(page, 'editor-loaded')

    currentStep = 'discover-targets'
    markStep(currentStep, 'discover-targets')
    targets = getEditorTargets(page)
    console.log(
      '[Naver Upload] Editor targets:',
      targets.map((target) => target.label).join(', ')
    )

    currentStep = 'fill-title'
    markStep(currentStep, 'fill-title')
    await focusAndType(page, targets, TITLE_SELECTORS, title, 'title')

    currentStep = 'fill-body'
    markStep(currentStep, 'fill-body')
    await sleep(500)
    try {
      const hasImageMarkers = parseContentWithImageMarkers(content).some((segment) => segment.type === 'image')
      if (hasImageMarkers) {
        markStep(currentStep, 'fill-body-with-images', { photoCount: photoPaths.length })
        await insertBodyContentWithMarkers(page, targets, content, photoPaths)
        markStep(currentStep, 'fill-body-with-images-complete')
      } else {
        markStep(currentStep, 'fill-body-focus')
        await focusField(page, targets, BODY_SELECTORS, 'body')
        await sleep(300)
        await typeMultilineWithFormatting(page, content)
        markStep(currentStep, 'fill-body-complete')
      }
    } catch (error) {
      markStep(currentStep, 'fill-body-fallback-tab', { lastBodyError: error.message })
      await page.keyboard.press('Tab')
      await sleep(400)
      markStep(currentStep, 'fill-body-fallback-type')
      await typeMultilineWithFormatting(page, content)
      markStep(currentStep, 'fill-body-fallback-complete')
      console.warn('[Naver Upload] Body field fallback used after selector failure:', error.message)
    }

    if (photoPaths.length > 0 && !parseContentWithImageMarkers(content).some((segment) => segment.type === 'image')) {
      currentStep = 'upload-photos'
      markStep(currentStep, 'upload-photos', { photoCount: photoPaths.length })
      await sleep(500)
      await uploadPhotos(page, targets, photoPaths)
    }

    currentStep = 'open-publish-dialog'
    markStep(currentStep, 'open-publish-dialog')
    await sleep(1500)
    await openPublishDialog(page, targets)

    currentStep = 'fill-tags'
    markStep(currentStep, 'fill-tags')
    await sleep(1500)
    await fillTags(page, targets, tags)

    if (scheduledAt) {
      currentStep = 'configure-schedule'
      markStep(currentStep, 'configure-schedule', { scheduledAt })
      await sleep(400)
      const normalizedSchedule = await configureScheduledPublish(page, targets, scheduledAt)
      markStep(currentStep, 'configure-schedule-complete', { scheduledAt: normalizedSchedule.iso })
    }

      currentStep = 'confirm-publish'
      markStep(currentStep, 'confirm-publish')
      const confirmTargets = getPublishDialogTargets(targets)
      await ensurePublishDialogVisible(page, confirmTargets)
      await sleep(300)
      await clickFinalPublishButton(page, confirmTargets, { scheduledAt })

    currentStep = 'await-result'
    markStep(currentStep, 'await-result')
    {
      const publishOutcome = await resolvePublishOutcome(page, targets, { scheduledAt, timeout: 60000 })
      if (!publishOutcome) {
        const debugArtifacts = await saveDebug(page, 'after-publish')
        const visibleHints = await collectVisibleHints(page)
        throw new Error(
          buildPublishConfirmationError({
            currentUrl: page.url(),
            debugArtifacts,
            scheduledAt,
            visibleHints,
          })
        )
      }

      finishUpload({
        id: runtimeUpload.id,
        stage: currentStep,
        stageLabel: publishOutcome.scheduled ? 'schedule-complete' : 'publish-complete',
        mode: publishOutcome.mode,
        scheduled: Boolean(publishOutcome.scheduled),
        scheduledAt,
        url: publishOutcome.url,
      })
      return {
        endpoint: RUNTIME_ENDPOINT,
        mode: publishOutcome.mode,
        scheduled: publishOutcome.scheduled,
        scheduledAt,
        source: RUNTIME_SOURCE,
        success: true,
        url: publishOutcome.url,
      }
    }
  } catch (error) {
    failUpload(new Error(`stage=${currentStep}; ${error.message}`))
    const debugArtifacts = await saveDebug(page, `failure-${currentStep}`)
    const debugFiles = formatDebugFiles(debugArtifacts)
    throw new Error(
      `[${RUNTIME_SOURCE}] Naver upload failed during ${currentStep}: ${error.message}${debugFiles ? ` Debug files: ${debugFiles}` : ''}`
    )
  } finally {
    await context.close()
    await browser.close()
  }
}

module.exports = {
  __private: {
    activateReservePublishModeByDom,
    buildPublishConfirmationError,
    clickPhotoButtonByDom,
    clickPublishButton,
    clickFinalPublishButton,
    clickPublishButtonByDom,
    clickScheduledFinalPublishButton,
    configureScheduledPublish,
    fillTags,
    findScheduledPostUrl,
    getEditorTargets,
    getPublishDialogTargets,
    openPublishDialog,
    isScheduledPublishStateConfirmed,
    isPopupInterceptionError,
    isPublishedPostUrl,
    normalizePublishedPostUrl,
    normalizeScheduledPublishAt,
    parseContentWithImageMarkers,
    resolvePublishOutcome,
    withPopupRecovery,
  },
  getPlaywrightDiagnostics,
  getSessionPath,
  hasSavedSession,
  uploadToNaver,
}












