const fs = require('fs')
const path = require('path')
const { app } = require('electron')
const { applyPlaywrightEnvironment } = require('./playwright-runtime')
const { loadBandSessionState } = require('./session-state')

applyPlaywrightEnvironment()

const { chromium } = require('playwright')

const BROWSER_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
]

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'

const WRITE_BUTTON_TEXT = '글쓰기'

const WRITE_BUTTON_SELECTORS = [
  `a[role="button"]:has-text("${WRITE_BUTTON_TEXT}")`,
  `button:has-text("${WRITE_BUTTON_TEXT}")`,
  `a:has-text("${WRITE_BUTTON_TEXT}")`,
  `[aria-label="${WRITE_BUTTON_TEXT}"]`,
  `[aria-label*="${WRITE_BUTTON_TEXT}"]`,
  '[class*="postWrite"]',
  '[class*="writeButton"]',
  '[class*="WriteButton"]',
  '[data-uiselector*="writePost"]',
]

const BODY_EDITOR_SELECTORS = [
  '[contenteditable="true"][data-name="post"]',
  'textarea[placeholder*="공유"]',
  'textarea[placeholder*="글을"]',
  '[class*="writeBody"] [contenteditable="true"]',
  '[class*="postWrite"] [contenteditable="true"]',
  '[role="textbox"]',
  'div[contenteditable="true"]',
]

function getDebugDir() {
  const dir = path.join(app.getPath('userData'), 'band-debug')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

async function captureFailure(page, label) {
  const dir = getDebugDir()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const screenshot = path.join(dir, `${stamp}-${label}.png`)
  const html = path.join(dir, `${stamp}-${label}.html`)
  try {
    await page.screenshot({ path: screenshot, fullPage: true })
  } catch (error) {
    console.warn('[band-upload] screenshot failed', error.message)
  }
  try {
    const content = await page.content()
    fs.writeFileSync(html, content, 'utf8')
  } catch (error) {
    console.warn('[band-upload] dump html failed', error.message)
  }
  return { screenshot, html }
}

async function findFirstVisible(page, selectors) {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first()
      if (await locator.isVisible({ timeout: 1500 })) {
        return { selector, locator }
      }
    } catch {
      // selector invalid or not present, continue
    }
  }
  return null
}

async function openBandWriteModal({ bandUrl, headless = false, holdMs = 5000 }) {
  const session = loadBandSessionState()
  if (!session) {
    throw new Error('Band 세션이 없습니다. 먼저 로그인하세요.')
  }

  if (!bandUrl) {
    throw new Error('bandUrl이 필요합니다.')
  }

  const browser = await chromium.launch({ headless, args: BROWSER_ARGS })
  const context = await browser.newContext({
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    storageState: session,
    userAgent: USER_AGENT,
    viewport: { width: 1360, height: 860 },
  })

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  const page = await context.newPage()
  const stages = []

  try {
    stages.push({ stage: 'navigate', url: bandUrl })
    await page.goto(bandUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

    if (/\/login/i.test(page.url())) {
      const debug = await captureFailure(page, 'redirected-to-login')
      const error = new Error(`세션 무효 - 로그인 페이지로 리다이렉트됨: ${page.url()}`)
      return { success: false, error: error.message, stages, debug }
    }
    stages.push({ stage: 'arrived', url: page.url() })

    const writeButton = await findFirstVisible(page, WRITE_BUTTON_SELECTORS)
    if (!writeButton) {
      const debug = await captureFailure(page, 'no-write-button')
      return {
        success: false,
        error: '글쓰기 버튼을 찾지 못했습니다.',
        stages,
        debug,
      }
    }
    stages.push({ stage: 'write-button-found', selector: writeButton.selector })

    await writeButton.locator.click()
    stages.push({ stage: 'write-button-clicked' })

    await page.waitForTimeout(1500)
    const editor = await findFirstVisible(page, BODY_EDITOR_SELECTORS)
    if (!editor) {
      const debug = await captureFailure(page, 'no-editor')
      return {
        success: false,
        error: '글쓰기 본문 편집 영역을 찾지 못했습니다.',
        stages,
        debug,
      }
    }
    stages.push({ stage: 'editor-found', selector: editor.selector, currentUrl: page.url() })

    if (holdMs > 0) {
      await page.waitForTimeout(holdMs)
    }

    return { success: true, stages, finalUrl: page.url() }
  } catch (error) {
    const debug = await captureFailure(page, 'unexpected-error')
    return { success: false, error: error.message, stages, debug }
  } finally {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }
}

module.exports = { openBandWriteModal }
