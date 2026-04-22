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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

function isPopupInterceptionError(error) {
  return /intercepts pointer events/i.test(error?.message || '')
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

async function tryDismissRestorePopup(page) {
  await dismissEditorPopups(page)
}

function isPublishedPostUrl(url) {
  return PUBLISHED_POST_URL_PATTERN.test(String(url || ''))
}

async function resolvePublishedPostUrl(page, timeout = 60000) {
  if (isPublishedPostUrl(page.url())) {
    return page.url()
  }

  try {
    await page.waitForURL((url) => isPublishedPostUrl(url.toString()), { timeout })
  } catch {
    return null
  }

  return isPublishedPostUrl(page.url()) ? page.url() : null
}

async function collectVisibleHints(page) {
  try {
    return await page.evaluate(({ helpRootSelector, popupRootSelector }) => {
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
        .map((root) => normalize(root.textContent))
        .filter(Boolean)

      return [...popupTexts, ...helpTexts].slice(0, 3)
    }, {
      helpRootSelector: HELP_OVERLAY_ROOT_SELECTOR,
      popupRootSelector: POPUP_ROOT_SELECTOR,
    })
  } catch {
    return []
  }
}

function formatDebugFiles(debugArtifacts) {
  return [debugArtifacts?.screenshotPath, debugArtifacts?.htmlPath].filter(Boolean).join(', ')
}

function buildPublishConfirmationError({ currentUrl, debugArtifacts, visibleHints }) {
  const parts = ['Publish was clicked, but the final Naver post URL was not confirmed.']

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

async function uploadToNaver({ title, content, tags = [], photoPaths = [], headless = true }) {
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
    markStep(currentStep, '브라우저 초기화')
    currentStep = 'resolve-write-url'
    markStep(currentStep, '에디터 진입 URL 확인')
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
    markStep(currentStep, '초기 팝업 정리', { editorUrl: loadedUrl })
    await tryDismissRestorePopup(page)
    await sleep(1500)

    currentStep = 'capture-editor'
    markStep(currentStep, '초기 에디터 화면 저장')
    await saveDebug(page, 'editor-loaded')

    currentStep = 'discover-targets'
    markStep(currentStep, '에디터 타겟 탐색')
    targets = getEditorTargets(page)
    console.log(
      '[Naver Upload] Editor targets:',
      targets.map((target) => target.label).join(', ')
    )

    currentStep = 'fill-title'
    markStep(currentStep, '제목 입력')
    await focusAndType(page, targets, TITLE_SELECTORS, title, 'title')

    currentStep = 'fill-body'
    markStep(currentStep, '본문 입력')
    await sleep(500)
    try {
      await focusAndType(page, targets, BODY_SELECTORS, content, 'body')
    } catch (error) {
      await page.keyboard.press('Tab')
      await sleep(400)
      await typeMultiline(page, content)
      console.warn('[Naver Upload] Body field fallback used after selector failure:', error.message)
    }

    currentStep = 'open-publish-dialog'
    markStep(currentStep, '발행 패널 열기')
    await sleep(1500)
    await clickPublishButton(page, targets, 'first')

    currentStep = 'fill-tags'
    markStep(currentStep, '태그 입력')
    await sleep(1500)
    await fillTags(page, targets, tags)

    currentStep = 'confirm-publish'
    markStep(currentStep, '최종 발행 확인')
    await sleep(1000)
    await clickPublishButton(page, targets, 'last')

    currentStep = 'await-result'
    markStep(currentStep, '최종 게시글 URL 확인')
    {
      const publishedUrl = await resolvePublishedPostUrl(page, 60000)
      if (!publishedUrl) {
        const debugArtifacts = await saveDebug(page, 'after-publish')
        const visibleHints = await collectVisibleHints(page)
        throw new Error(
          buildPublishConfirmationError({
            currentUrl: page.url(),
            debugArtifacts,
            visibleHints,
          })
        )
      }

      finishUpload({
        id: runtimeUpload.id,
        stage: currentStep,
        stageLabel: '게시 완료',
        url: publishedUrl,
      })
      return {
        endpoint: RUNTIME_ENDPOINT,
        source: RUNTIME_SOURCE,
        success: true,
        url: publishedUrl,
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
    buildPublishConfirmationError,
    clickPublishButtonByDom,
    isPopupInterceptionError,
    isPublishedPostUrl,
    withPopupRecovery,
  },
  getPlaywrightDiagnostics,
  getSessionPath,
  hasSavedSession,
  uploadToNaver,
}
