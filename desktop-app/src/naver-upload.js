const fs = require('fs')
const path = require('path')
const { applyPlaywrightEnvironment, getPlaywrightDiagnostics } = require('./playwright-runtime')
const { getSessionPath, loadSessionState } = require('./session-state')
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
const PUBLISHED_POST_URL_PATTERN = /^https:\/\/blog\.naver\.com\/[^/]+\/\d+(?:\?.*)?$/i

const TITLE_TEXT = '\uC81C\uBAA9'
const BODY_TEXT = '\uBCF8\uBB38'
const PUBLISH_TEXT = '\uBC1C\uD589'
const TAG_TEXT = '\uD0DC\uADF8'
const CATEGORY_TEXT = '\uCE74\uD14C\uACE0\uB9AC'
const VISIBILITY_TEXT = '\uACF5\uAC1C'
const SCHEDULE_TEXT = '\uBC1C\uD589 \uC2DC\uAC04'
const RESERVE_TEXT = '\uC608\uC57D'
const RESERVED_POSTS_TEXT = '\uC608\uC57D \uBC1C\uD589 \uAE00'
const INVALID_SCHEDULE_TIME_TEXT = '\uD604\uC7AC \uC2DC\uAC04 \uC774\uD6C4\uB85C \uC124\uC815\uD574\uC8FC\uC138\uC694.'
const SCHEDULE_READY_TEXT = '\uC124\uC815\uD55C \uC2DC\uAC04\uC73C\uB85C \uC608\uC57D \uBC1C\uD589\uB429\uB2C8\uB2E4.'
const WRITE_URL_HINTS = ['Redirect=Write', 'PostWriteForm', 'GoBlogWrite.naver']

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

  const actualDate = normalizeDateDigits(scheduleState.dateValue)
  const expectedDate = normalizeDateDigits(schedule.dateValue)
  const actualHour = normalizeTwoDigitValue(scheduleState.hourValue)
  const actualMinute = normalizeTwoDigitValue(scheduleState.minuteValue)

  if (
    actualDate === expectedDate &&
    actualHour === schedule.hour24 &&
    actualMinute === schedule.minute
  ) {
    return true
  }

  return Boolean(scheduleState.scheduleReady && hasCompleteScheduleFields)
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
  try {
    const state = loadSessionState()
    if (!state) {
      return false
    }

    return (state.cookies || []).some((cookie) => cookie.name === 'NID_AUT' || cookie.name === 'NID_SES')
  } catch {
    return false
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

function getPublishDialogTargets(targets) {
  const mainFrameTargets = targets.filter((target) => /frame:mainFrame/i.test(target.label))
  if (mainFrameTargets.length > 0) {
    return mainFrameTargets
  }

  const frameTargets = targets.filter((target) => target.label.startsWith('frame:'))
  return frameTargets.length > 0 ? frameTargets : targets
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

function isPublishedPostUrl(url) {
  return PUBLISHED_POST_URL_PATTERN.test(String(url || ''))
}

function isEditorWriteUrl(url) {
  const value = String(url || '')
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

  const roundedDate = roundUpDateToMinuteStep(requestedDate) || requestedDate
  const date = ensureMinimumScheduledDate(roundedDate)

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

function findPublishedPostUrl(page) {
  if (isPublishedPostUrl(page.url())) {
    return page.url()
  }

  for (const frame of page.frames()) {
    try {
      if (isPublishedPostUrl(frame.url())) {
        return frame.url()
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

async function waitForPublishProgress(page, targets, { scheduledAt = null, timeout = 2500 } = {}) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeout) {
    if (findPublishedPostUrl(page)) {
      return true
    }

    if (scheduledAt && findScheduledPostUrl(page)) {
      return true
    }

    if (!(await isPublishDialogVisible(targets))) {
      return true
    }

    await sleep(250)
  }

  return false
}

async function resolvePublishOutcome(page, targets, { scheduledAt, timeout = 60000 } = {}) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeout) {
    const publishedUrl = findPublishedPostUrl(page)
    if (publishedUrl) {
      return { mode: 'published', scheduled: false, url: publishedUrl }
    }

    if (scheduledAt) {
      const scheduledUrl = findScheduledPostUrl(page)
      if (scheduledUrl) {
        return { mode: 'scheduled', scheduled: true, url: scheduledUrl }
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

async function fillScheduledPublishInputs(targets, schedule) {
  const attempts = []

  for (const target of targets) {
    try {
      const reserveRadio = target.scope.locator('input[data-testid="preTimeRadioBtn"], input[value="pre"], #radio_time2').first()
      await reserveRadio.waitFor({ state: 'visible', timeout: 1500 })
      if (!(await reserveRadio.isChecked().catch(() => false))) {
        await reserveRadio.check({ force: true, timeout: 3000 })
      }

      const hourSelect = target.scope.locator('select[class*="hour"], select[title*="\uC2DC\uAC04"]').first()
      const minuteSelect = target.scope.locator('select[class*="minute"], select[title*="\uBD84"]').first()
      await hourSelect.waitFor({ state: 'visible', timeout: 1500 })
      await minuteSelect.waitFor({ state: 'visible', timeout: 1500 })
      await hourSelect.selectOption(schedule.hour24)
      await minuteSelect.selectOption(schedule.minute)
      const selectedHour = await hourSelect.inputValue()
      const selectedMinute = await minuteSelect.inputValue()
      await hourSelect.evaluate((element) => element.blur?.())
      await minuteSelect.evaluate((element) => element.blur?.())

      const dateInput = target.scope.locator('input[class*="input_date"], input[readonly][type="text"]').first()
      let dateValue = null
      try {
        await dateInput.waitFor({ state: 'visible', timeout: 1000 })
        dateValue = await dateInput.inputValue()
      } catch {}

      const normalizedDate = normalizeDateDigits(dateValue)
      const expectedDate = normalizeDateDigits(schedule.dateValue)
      if ((!normalizedDate || normalizedDate === expectedDate) && selectedHour === schedule.hour24 && selectedMinute === schedule.minute) {
        console.log(
          `[Naver Upload] Filled schedule inputs via ${target.label} -> locator hour=${selectedHour} minute=${selectedMinute} date="${dateValue || ''}"`
        )
        return
      }

      attempts.push(`${target.label}: locator value mismatch (date=${dateValue || ''} hour=${selectedHour} minute=${selectedMinute})`)
    } catch (error) {
      attempts.push(`${target.label}: locator schedule fill failed (${error.message})`)
    }

    try {
      const result = await target.scope.evaluate((input) => {
        const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
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
          candidate.value = value
          candidate.dispatchEvent(inputEvent())
          candidate.dispatchEvent(changeEvent())
          return true
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
          const option = Array.from(candidate.options).find((item) => {
            const text = normalize(item.textContent)
            return variants.includes(item.value) || variants.includes(text)
          })

          if (!option) {
            return false
          }

          candidate.value = option.value
          candidate.dispatchEvent(inputEvent())
          candidate.dispatchEvent(changeEvent())
          return true
        }

        const lower = (value) => String(value).toLowerCase()

        clickMatch([input.reserveText])

        const filledDate =
          setInputValue((meta) => lower(meta).includes('date') || lower(meta).includes('calendar') || meta.includes('\uB0A0\uC9DC'), input.dateValue) ||
          setInputValue((meta) => lower(meta).includes('year') || meta.includes('\uB144') || meta.includes('\uC6D4') || meta.includes('\uC77C'), input.dateValue)

        const filledTime =
          setInputValue((meta) => lower(meta).includes('time') || meta.includes('\uC2DC\uAC04'), `${input.hour24}:${input.minute}`) ||
          setInputValue((meta) => meta.includes('\uC2DC') || lower(meta).includes('hour'), input.hour24) ||
          setInputValue((meta) => meta.includes('\uBD84') || lower(meta).includes('minute'), input.minute)

        const selectResults = [
          setSelectValue((meta) => lower(meta).includes('year') || meta.includes('\uB144'), [input.year]),
          setSelectValue((meta) => lower(meta).includes('month') || meta.includes('\uC6D4'), [Number(input.month), input.month]),
          setSelectValue((meta) => lower(meta).includes('day') || meta.includes('\uC77C'), [Number(input.day), input.day]),
          setSelectValue((meta) => lower(meta).includes('hour') || meta.includes('\uC2DC'), [Number(input.hour24), input.hour24]),
          setSelectValue((meta) => lower(meta).includes('minute') || meta.includes('\uBD84'), [Number(input.minute), input.minute]),
        ].filter(Boolean).length

        if (!filledDate && !filledTime && selectResults === 0) {
          return { error: 'schedule inputs not found' }
        }

        return { clicks, filledDate, filledTime, selectResults }
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
  const expectedHour = schedule.hour24
  const expectedMinute = schedule.minute

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
      await dismissEditorPopups(page, scheduleTargets)
      return schedule
    }

    const actualDate = normalizeDateDigits(lastScheduleState?.dateValue)
    const actualHour = normalizeTwoDigitValue(lastScheduleState?.hourValue)
    const actualMinute = normalizeTwoDigitValue(lastScheduleState?.minuteValue)
    console.warn(
      `[Naver Upload] Scheduled publish confirmation retry ${attempt}/3 failed. reserveModeActive=${lastScheduleState?.reserveModeActive} scheduleReady=${lastScheduleState?.scheduleReady} date="${lastScheduleState?.dateValue}" hour="${lastScheduleState?.hourValue}" minute="${lastScheduleState?.minuteValue}" expectedDate="${expectedDate}" expectedHour="${expectedHour}" expectedMinute="${expectedMinute}" actualDate="${actualDate}" actualHour="${actualHour}" actualMinute="${actualMinute}" validationError="${lastScheduleState?.validationError || ''}"`
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

async function openPublishDialog(page, targets) {
  const attempts = []

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (await clickToolbarPublishButton(page, targets)) {
      console.log(`[Naver Upload] Publish dialog opened on attempt ${attempt}`)
      return
    }

    await clickPublishButton(page, targets, 'first')
    await sleep(1200)

    if (await waitForPublishDialogVisible(targets, 1200)) {
      console.log(`[Naver Upload] Publish dialog opened on attempt ${attempt}`)
      return
    }

    attempts.push(`attempt ${attempt}: dialog not visible`)
    await dismissEditorPopups(page, targets)
    await sleep(500)
  }

  throw new Error(`[${RUNTIME_SOURCE}] Publish dialog did not open. ${attempts.join(' | ')}`)
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

async function focusAndType(page, targets, selectors, text, fieldName) {
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
        await sleep(300)
        await typeMultiline(page, text)
        console.log(`[Naver Upload] Filled ${fieldName} via ${target.label} -> ${selector}`)
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
          `[Naver Upload] Filled ${fieldName} via ${target.label} -> dom score=${result.score} top=${result.top} placeholder="${result.placeholder}" class="${result.className}"`
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

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await clickPublishButton(page, targets, 'last')
    const progressed = await waitForPublishProgress(page, targets, { scheduledAt, timeout: scheduledAt ? 3500 : 2500 })
    if (progressed) {
      return
    }

    lastVisible = await isPublishDialogVisible(targets)
    console.warn(
      `[Naver Upload] Final publish click attempt ${attempt}/${attempts} did not change publish state. dialogVisible=${lastVisible}`
    )
    await dismissEditorPopups(page, targets)
    await sleep(300)
  }

  throw new Error(
    `[${RUNTIME_SOURCE}] Final publish action did not progress after click attempts. dialogVisible=${lastVisible}`
  )
}

async function fillTags(page, targets, tags) {
  if (!Array.isArray(tags) || tags.length === 0) {
    return
  }

  for (const target of targets) {
    try {
      const tagInput = target.scope.locator(`input[placeholder*="${TAG_TEXT}"]`).first()
      await withPopupRecovery(
        page,
        targets,
        () => tagInput.click({ timeout: 3000 }),
        `tag input via ${target.label}`
      )

      for (const tag of tags.slice(0, 10)) {
        await page.keyboard.type(String(tag), { delay: 25 })
        await page.keyboard.press('Enter')
        await sleep(150)
      }

      console.log(`[Naver Upload] Filled tags via ${target.label}`)
      return
    } catch {}
  }

  console.warn('[Naver Upload] Failed to set tags. Continuing without tags.')
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

  if (photoPaths.length > 0) {
    console.warn('[Naver Upload] Photo upload automation is not implemented yet. Ignoring attached files.')
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
      markStep(currentStep, 'fill-body-focus')
      await focusAndType(page, targets, BODY_SELECTORS, content, 'body')
      markStep(currentStep, 'fill-body-complete')
    } catch (error) {
      markStep(currentStep, 'fill-body-fallback-tab', { lastBodyError: error.message })
      await page.keyboard.press('Tab')
      await sleep(400)
      markStep(currentStep, 'fill-body-fallback-type')
      await typeMultiline(page, content)
      markStep(currentStep, 'fill-body-fallback-complete')
      console.warn('[Naver Upload] Body field fallback used after selector failure:', error.message)
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
      const confirmTargets = scheduledAt ? getPublishDialogTargets(targets) : targets
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
    clickPublishButtonByDom,
    findScheduledPostUrl,
    isScheduledPublishStateConfirmed,
    isPopupInterceptionError,
    isPublishedPostUrl,
    normalizeScheduledPublishAt,
    withPopupRecovery,
  },
  getPlaywrightDiagnostics,
  getSessionPath,
  hasSavedSession,
  uploadToNaver,
}
