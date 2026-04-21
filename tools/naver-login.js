/**
 * 네이버 로그인 후 쿠키 저장 (로컬에서 최초 1회 실행)
 *
 * 사용법:
 *   npx playwright install chromium   (최초 1회)
 *   node tools/naver-login.js
 *
 * 실행되면:
 *   1. Chromium 브라우저가 열림
 *   2. 네이버 로그인 페이지 표시
 *   3. 본인이 직접 로그인 (ID/PW + 2단계 인증 포함)
 *   4. 로그인 완료 후 자동으로 naver-cookies.json 생성
 *   5. 이 파일을 VM에 업로드 (scp)
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const OUTPUT_PATH = path.resolve(__dirname, 'naver-cookies.json')

;(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
    ],
  })

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  })

  // webdriver 탐지 우회
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  const page = await context.newPage()

  console.log('\n=====================================================')
  console.log('네이버 로그인을 진행해주세요.')
  console.log('  1. 열린 브라우저에서 본인의 ID/PW로 로그인')
  console.log('  2. 2단계 인증 있으면 완료')
  console.log('  3. 네이버 메인(www.naver.com) 또는 블로그로 이동')
  console.log('  4. 여기 콘솔에서 Enter 키를 누르면 쿠키 저장')
  console.log('=====================================================\n')

  await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'domcontentloaded' })

  // Enter 입력 대기
  process.stdin.resume()
  await new Promise((resolve) => {
    process.stdin.once('data', () => resolve())
  })

  // 쿠키 저장
  await context.storageState({ path: OUTPUT_PATH })
  console.log(`\n✅ 쿠키 저장 완료: ${OUTPUT_PATH}`)
  console.log('이 파일을 VM에 업로드하세요.')

  await browser.close()
  process.exit(0)
})().catch((err) => {
  console.error('실패:', err)
  process.exit(1)
})
