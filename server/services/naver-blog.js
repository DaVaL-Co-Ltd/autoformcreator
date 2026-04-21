/**
 * 네이버 블로그 자동 업로드 서비스
 * 저장된 쿠키(naver-cookies.json)를 사용하여 로그인 상태로 글 작성
 *
 * 리스크 최소화 설정:
 * - webdriver 탐지 우회
 * - 실제 Chrome User-Agent
 * - 한국 IP처럼 동작 (ko-KR, Asia/Seoul)
 * - 인간스러운 타이핑 딜레이
 * - 실패 시 자동 재시도 없음 (무한루프 방지)
 */
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')

const COOKIES_PATH = path.join(__dirname, '..', 'naver-cookies.json')

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
]

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function randomDelay(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }

// 인간스러운 타이핑
async function humanType(page, selector, text) {
  await page.click(selector)
  for (const ch of text) {
    await page.keyboard.type(ch, { delay: randomDelay(30, 100) })
  }
}

// 쿠키 유효성 검증
async function validateCookies() {
  if (!fs.existsSync(COOKIES_PATH)) {
    throw new Error('naver-cookies.json 파일이 없습니다. 로컬에서 naver-login.js를 실행하세요.')
  }
  const storage = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'))
  if (!storage.cookies?.length) throw new Error('쿠키 데이터가 비어있습니다')
  return storage
}

// 로그인 상태 확인
async function checkLoggedIn(page) {
  await page.goto('https://www.naver.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await sleep(randomDelay(1500, 2500))
  // 로그인 상태면 'MY' 메뉴 또는 프로필 요소 존재
  const loggedIn = await page.evaluate(() => {
    return !!document.querySelector('.MyView-module__my_menu___eRsjm, #account, [class*="MyView"]')
  })
  return loggedIn
}

/**
 * 네이버 블로그에 글 업로드
 * @param {Object} params
 * @param {string} params.title - 제목
 * @param {string} params.content - 본문 (plain text 또는 HTML)
 * @param {Array<string>} params.tags - 태그 (최대 10개)
 * @param {Array<Buffer>} params.images - 이미지 버퍼 배열 (optional)
 * @returns {{ url: string }}
 */
async function uploadToNaverBlog({ title, content, tags = [], images = [] }) {
  if (!title) throw new Error('제목이 필요합니다')
  if (!content) throw new Error('본문이 필요합니다')

  const storage = await validateCookies()

  const browser = await chromium.launch({
    headless: true,
    args: BROWSER_ARGS,
  })

  try {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 800 },
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
      storageState: storage,
    })

    // webdriver 탐지 우회
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
      Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko'] })
    })

    const page = await context.newPage()

    // 1) 로그인 확인
    const loggedIn = await checkLoggedIn(page)
    if (!loggedIn) {
      throw new Error('쿠키 만료 또는 로그인 실패. 로컬에서 naver-login.js를 다시 실행하세요.')
    }

    // 2) 블로그 글쓰기 페이지 진입
    await sleep(randomDelay(1000, 2000))
    await page.goto('https://blog.naver.com/GoBlogWrite.naver', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    })

    // 임시저장 글 복구 팝업 자동 취소
    await sleep(3000)
    try {
      const cancelBtn = await page.waitForSelector('button:has-text("취소")', { timeout: 3000 })
      if (cancelBtn) await cancelBtn.click()
    } catch {}

    // 3) 에디터 iframe 진입 (SmartEditor)
    const iframe = page.frameLocator('iframe#mainFrame')

    // 제목 입력
    const titleSel = '.se-section-documentTitle .se-text-paragraph'
    await iframe.locator(titleSel).click({ timeout: 15000 })
    await sleep(randomDelay(300, 700))
    for (const ch of title) {
      await page.keyboard.type(ch, { delay: randomDelay(30, 80) })
    }

    // 본문 입력
    await sleep(randomDelay(500, 1200))
    const bodySel = '.se-section-text .se-text-paragraph'
    await iframe.locator(bodySel).first().click({ timeout: 10000 })
    await sleep(randomDelay(300, 600))
    for (const ch of content) {
      await page.keyboard.type(ch, { delay: randomDelay(20, 60) })
    }

    // 4) 발행 버튼 클릭
    await sleep(randomDelay(1500, 2500))
    await iframe.locator('button:has-text("발행")').first().click()

    // 발행 팝업에서 태그 입력
    await sleep(randomDelay(1000, 2000))
    if (tags.length > 0) {
      try {
        const tagInput = iframe.locator('input[placeholder*="태그"]')
        for (const tag of tags.slice(0, 10)) {
          await tagInput.click()
          await page.keyboard.type(tag, { delay: randomDelay(30, 80) })
          await page.keyboard.press('Enter')
          await sleep(randomDelay(200, 500))
        }
      } catch (e) {
        console.warn('[네이버 블로그] 태그 입력 실패:', e.message)
      }
    }

    // 최종 발행 버튼
    await sleep(randomDelay(1000, 2000))
    await iframe.locator('button:has-text("발행"), .confirm_btn__Nevj2').last().click()

    // 완료 대기 — 블로그 포스트 URL로 리다이렉트
    await page.waitForURL(/blog\.naver\.com\/.+\/\d+/, { timeout: 60000 })
    const url = page.url()

    return { url }
  } finally {
    await browser.close()
  }
}

module.exports = { uploadToNaverBlog, validateCookies }
