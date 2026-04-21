/**
 * 네이버 블로그 자동 업로드 서비스 (ES Module)
 */
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

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

function ensureDebugDir() {
  if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true })
}

async function validateCookies() {
  if (!fs.existsSync(COOKIES_PATH)) throw new Error('naver-cookies.json 파일이 없습니다.')
  const storage = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'))
  if (!storage.cookies?.length) throw new Error('쿠키 데이터가 비어있습니다')
  return storage
}

async function saveDebug(page, name) {
  try {
    ensureDebugDir()
    const ts = Date.now()
    await page.screenshot({ path: path.join(DEBUG_DIR, `${ts}-${name}.png`), fullPage: true })
    const html = await page.content()
    fs.writeFileSync(path.join(DEBUG_DIR, `${ts}-${name}.html`), html)
    console.log(`[디버그] 스크린샷 저장: ${ts}-${name}.png`)
  } catch (e) {
    console.warn('스크린샷 실패:', e.message)
  }
}

export async function uploadToNaverBlog({ title, content, tags = [] }) {
  if (!title) throw new Error('제목이 필요합니다')
  if (!content) throw new Error('본문이 필요합니다')

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

    // 1) 네이버 접속 → 로그인 확인
    await page.goto('https://www.naver.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await sleep(randomDelay(1500, 2500))

    // 2) 블로그 작성 페이지 (본인 블로그 ID 기반으로 이동)
    // 우선 blog.naver.com 메인에서 본인 블로그 주소 추출
    await page.goto('https://blog.naver.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await sleep(randomDelay(2000, 3000))

    // 본인 블로그 링크 찾기 (예: https://blog.naver.com/BLOG_ID)
    const blogUrl = await page.evaluate(() => {
      const anchor = document.querySelector('a[href*="blog.naver.com/"][href*="PostList"]')
        || document.querySelector('a[href*="blog.naver.com/"][class*="myMenu"]')
        || document.querySelector('.link_my a, .my_blog a, a.link_blog_home')
      return anchor?.href || null
    })

    // 바로 글쓰기 페이지 시도
    const writeUrls = [
      'https://blog.naver.com/GoBlogWrite.naver',
      blogUrl ? `${blogUrl.replace(/\/+$/, '')}?Redirect=Write` : null,
    ].filter(Boolean)

    let loadedUrl = null
    for (const url of writeUrls) {
      try {
        console.log(`[Naver Blog] 페이지 시도: ${url}`)
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
        await sleep(3000)
        loadedUrl = page.url()
        console.log(`[Naver Blog] 로드됨: ${loadedUrl}`)
        break
      } catch (e) {
        console.warn(`[Naver Blog] 페이지 로드 실패: ${e.message}`)
      }
    }

    // 임시저장 글 복구 팝업 닫기
    await sleep(2000)
    try {
      const cancelBtn = await page.waitForSelector('button:has-text("취소"), button:has-text("새 글 작성")', { timeout: 3000 })
      if (cancelBtn) {
        await cancelBtn.click()
        console.log('[Naver Blog] 팝업 닫음')
      }
    } catch {}
    await sleep(2000)

    // 3) iframe 찾기 - 여러 가능성 시도
    const frames = page.frames()
    console.log(`[Naver Blog] iframe 개수: ${frames.length}, URLs:`, frames.map(f => f.url()).slice(0, 5))

    // 스크린샷 저장 (디버그)
    await saveDebug(page, 'editor-loaded')

    // iframe 후보들
    const iframeCandidates = [
      page.frameLocator('iframe#mainFrame'),
      page.frameLocator('iframe[name="mainFrame"]'),
      page.frameLocator('iframe'),
    ]

    // 제목 입력 셀렉터 후보
    const titleSelectors = [
      '.se-section-documentTitle .se-text-paragraph',
      '.se-placeholder:has-text("제목")',
      '[placeholder*="제목"]',
      '.tit_input',
      'textarea[placeholder*="제목"]',
      'input[placeholder*="제목"]',
    ]

    let titleFilled = false
    for (const iframe of iframeCandidates) {
      for (const sel of titleSelectors) {
        try {
          await iframe.locator(sel).first().click({ timeout: 3000 })
          await sleep(500)
          for (const ch of title) {
            await page.keyboard.type(ch, { delay: randomDelay(30, 80) })
          }
          titleFilled = true
          console.log(`[Naver Blog] 제목 입력 성공: ${sel}`)
          break
        } catch (e) {}
      }
      if (titleFilled) break
    }

    // 페이지 레벨 셀렉터도 시도
    if (!titleFilled) {
      for (const sel of titleSelectors) {
        try {
          await page.locator(sel).first().click({ timeout: 3000 })
          await sleep(500)
          for (const ch of title) {
            await page.keyboard.type(ch, { delay: randomDelay(30, 80) })
          }
          titleFilled = true
          console.log(`[Naver Blog] 제목 입력 성공 (page): ${sel}`)
          break
        } catch (e) {}
      }
    }

    if (!titleFilled) {
      await saveDebug(page, 'title-fail')
      throw new Error('제목 입력 필드를 찾을 수 없습니다. 네이버 에디터 구조가 변경되었을 가능성이 있습니다.')
    }

    // 본문 입력
    await sleep(randomDelay(500, 1200))
    const bodySelectors = [
      '.se-section-text .se-text-paragraph',
      '.se-placeholder:has-text("본문")',
      '[placeholder*="본문"]',
      '.content_input',
    ]

    let bodyFilled = false
    for (const iframe of iframeCandidates) {
      for (const sel of bodySelectors) {
        try {
          await iframe.locator(sel).first().click({ timeout: 3000 })
          await sleep(500)
          for (const ch of content) {
            await page.keyboard.type(ch, { delay: randomDelay(20, 60) })
          }
          bodyFilled = true
          console.log(`[Naver Blog] 본문 입력 성공: ${sel}`)
          break
        } catch (e) {}
      }
      if (bodyFilled) break
    }

    if (!bodyFilled) {
      // Tab 누르고 본문 영역으로 이동 시도
      await page.keyboard.press('Tab')
      await sleep(500)
      await page.keyboard.type(content, { delay: randomDelay(20, 60) })
      console.log('[Naver Blog] 본문 입력 Tab fallback')
      bodyFilled = true
    }

    await saveDebug(page, 'content-filled')

    // 4) 발행 버튼
    await sleep(randomDelay(1500, 2500))
    const publishSelectors = [
      'button:has-text("발행")',
      '.btn_publish',
      '[class*="publish"]',
    ]

    let published = false
    for (const iframe of iframeCandidates) {
      for (const sel of publishSelectors) {
        try {
          await iframe.locator(sel).first().click({ timeout: 3000 })
          published = true
          console.log(`[Naver Blog] 발행 버튼 클릭: ${sel}`)
          break
        } catch (e) {}
      }
      if (published) break
    }

    if (!published) {
      await saveDebug(page, 'publish-fail')
      throw new Error('발행 버튼을 찾을 수 없습니다')
    }

    // 발행 팝업 대기
    await sleep(randomDelay(2000, 3500))

    // 태그 입력 (옵션)
    if (tags.length > 0) {
      try {
        for (const iframe of iframeCandidates) {
          try {
            const tagInput = iframe.locator('input[placeholder*="태그"]').first()
            await tagInput.click({ timeout: 3000 })
            for (const tag of tags.slice(0, 10)) {
              await page.keyboard.type(tag, { delay: randomDelay(30, 80) })
              await page.keyboard.press('Enter')
              await sleep(randomDelay(200, 500))
            }
            break
          } catch {}
        }
      } catch (e) {
        console.warn('태그 입력 실패 (무시):', e.message)
      }
    }

    // 최종 발행 버튼
    await sleep(randomDelay(1000, 2000))
    for (const iframe of iframeCandidates) {
      try {
        await iframe.locator('button:has-text("발행"), .confirm_btn__Nevj2').last().click({ timeout: 5000 })
        break
      } catch {}
    }

    // 완료 URL 대기
    try {
      await page.waitForURL(/blog\.naver\.com\/.+\/\d+/, { timeout: 60000 })
    } catch {
      await saveDebug(page, 'after-publish')
      // URL이 패턴에 안 맞아도 현재 URL 반환
    }
    const url = page.url()

    return { url }
  } catch (err) {
    console.error('[Naver Blog] 오류:', err.message)
    throw err
  } finally {
    await browser.close()
  }
}
