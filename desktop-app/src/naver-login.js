const fs = require('fs')
const path = require('path')
const { app, dialog } = require('electron')
const { applyPlaywrightEnvironment } = require('./playwright-runtime')
const { saveSessionState } = require('./session-state')

applyPlaywrightEnvironment()

const { chromium } = require('playwright')

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000
const LOGIN_URL = 'https://nid.naver.com/nidlogin.login'
const LEGACY_PROFILE_DIR = path.join(app.getPath('userData'), 'chromium-profile')

function hasAuthCookie(storageState) {
  return (storageState.cookies || []).some((cookie) => cookie.name === 'NID_AUT' || cookie.name === 'NID_SES')
}

async function naverLogin() {
  await dialog.showMessageBox({
    type: 'info',
    title: '네이버 로그인',
    message: '브라우저가 열리면 직접 네이버에 로그인하세요.',
    detail: [
      '1. ID/PW와 2단계 인증까지 직접 진행합니다.',
      '2. 로그인 뒤 네이버 메인 또는 블로그 화면으로 이동합니다.',
      '3. 화면이 전환되면 세션을 자동 저장합니다.',
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
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })

    await page.waitForURL(
      (url) => {
        const href = typeof url === 'string' ? url : url?.href || String(url)
        return href.startsWith('https://www.naver.com') || href.startsWith('https://blog.naver.com')
      },
      { timeout: LOGIN_TIMEOUT_MS }
    )

    const storageState = await context.storageState()
    if (!hasAuthCookie(storageState)) {
      throw new Error('로그인 후 인증 쿠키를 찾지 못했습니다. 로그인 절차를 다시 확인하세요.')
    }

    const sessionPath = saveSessionState(storageState)
    fs.rmSync(LEGACY_PROFILE_DIR, { recursive: true, force: true })
    return { sessionPath }
  } finally {
    await context.close()
    await browser.close()
  }
}

module.exports = { naverLogin }
