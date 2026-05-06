const fs = require('fs')
const path = require('path')
const { app, dialog } = require('electron')
const { applyPlaywrightEnvironment } = require('./playwright-runtime')
const { saveBandSessionState } = require('./session-state')

applyPlaywrightEnvironment()

const { chromium } = require('playwright')

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000
const ENTRY_URL = 'https://band.us/feed'
const LEGACY_PROFILE_DIR = path.join(app.getPath('userData'), 'chromium-band-profile')
const URL_STABLE_MS = 4000

function isLoggedInLandingUrl(href) {
  return /^https:\/\/(?:www\.)?band\.us\/(feed|my|band\/\d+)/i.test(href)
}

async function bandLogin() {
  await dialog.showMessageBox({
    type: 'info',
    title: '밴드 로그인',
    message: '브라우저가 열리면 직접 밴드(BAND)에 로그인하세요.',
    detail: [
      '1. 네이버 연동 또는 이메일/휴대폰 로그인을 직접 진행합니다.',
      '2. 2단계 인증이 있다면 직접 처리합니다.',
      '3. 로그인 후 밴드 피드/홈 화면으로 이동하면 세션이 자동 저장됩니다.',
      '',
      `대기 시간은 최대 ${Math.floor(LOGIN_TIMEOUT_MS / 60000)}분입니다.`,
    ].join('\n'),
  })

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  })

  const context = await browser.newContext({
    locale: 'ko-KR',
    viewport: { width: 1360, height: 860 },
    timezoneId: 'Asia/Seoul',
  })

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  const page = await context.newPage()

  try {
    console.log('[band-login] entry url =', ENTRY_URL)
    await page.goto(ENTRY_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })

    const deadline = Date.now() + LOGIN_TIMEOUT_MS
    let landed = false
    while (Date.now() < deadline && !landed) {
      const remaining = deadline - Date.now()
      try {
        await page.waitForURL(
          (url) => {
            const href = typeof url === 'string' ? url : url?.href || String(url)
            return isLoggedInLandingUrl(href)
          },
          { timeout: Math.min(remaining, 60000) }
        )
      } catch {
        continue
      }

      try {
        await page.waitForLoadState('networkidle', { timeout: 15000 })
      } catch {
        // networkidle may never trigger on heavy SPAs; fall through
      }

      await new Promise((resolve) => setTimeout(resolve, URL_STABLE_MS))
      if (isLoggedInLandingUrl(page.url())) {
        landed = true
      }
    }

    if (!landed) {
      throw new Error('로그인을 시간 안에 완료하지 못했습니다. 다시 시도해주세요.')
    }

    const storageState = await context.storageState()
    console.log('[band-login] cookie count =', (storageState.cookies || []).length)
    const sessionPath = saveBandSessionState(storageState)
    fs.rmSync(LEGACY_PROFILE_DIR, { recursive: true, force: true })
    return { sessionPath }
  } finally {
    await context.close()
    await browser.close()
  }
}

module.exports = { bandLogin }
