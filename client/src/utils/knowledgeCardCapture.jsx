// 지식공유(카드뉴스) 최종 카드를 업로드용 PNG 로 합성한다.
// 결과 화면과 동일한 KnowledgeInsightCard 컴포넌트를 화면 밖에 렌더한 뒤
// modern-screenshot 으로 캡쳐해, 코너 일러스트가 아닌 "완성된 카드"가 업로드되도록 보장한다.

import { createRoot } from 'react-dom/client'
import { domToPng } from 'modern-screenshot'
import KnowledgeInsightCard from '../components/KnowledgeInsightCard'

// KnowledgeInsightCard 의 max-w-xl(36rem=576px) 과 맞춰 캡쳐한다.
const CARD_RENDER_WIDTH = 576
const CAPTURE_SCALE = 2

function waitForImages(container) {
  const images = Array.from(container.querySelectorAll('img'))
  return Promise.all(
    images.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve()
      return new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true })
        img.addEventListener('error', resolve, { once: true })
      })
    }),
  )
}

function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  })
}

export async function renderKnowledgeCardDataUrl({ headline, bullets, imageUrl, index = 0 }) {
  if (typeof document === 'undefined') return null

  const safeBullets = Array.isArray(bullets)
    ? bullets.map((line) => String(line || '').trim()).filter(Boolean)
    : []
  const safeHeadline = String(headline || '').trim()
  if (!safeHeadline && safeBullets.length === 0) return null

  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.position = 'fixed'
  host.style.left = '-100000px'
  host.style.top = '0'
  host.style.width = `${CARD_RENDER_WIDTH}px`
  host.style.pointerEvents = 'none'
  host.style.zIndex = '-1'
  document.body.appendChild(host)

  const root = createRoot(host)

  try {
    root.render(
      <div style={{ width: CARD_RENDER_WIDTH }}>
        <KnowledgeInsightCard
          index={index}
          headline={safeHeadline}
          bullets={safeBullets}
          imageUrl={imageUrl || null}
        />
      </div>,
    )

    await nextFrame()
    await waitForImages(host)
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready
      } catch {
        // 폰트 로딩 대기 실패 시에도 캡쳐는 계속 진행
      }
    }
    await nextFrame()

    const target = host.firstElementChild
    if (!target) return null

    return await domToPng(target, {
      scale: CAPTURE_SCALE,
      quality: 1,
      fetchOptions: { mode: 'cors' },
    })
  } catch (error) {
    console.warn('[knowledgeCardCapture] 카드 합성 실패:', error)
    return null
  } finally {
    try {
      root.unmount()
    } catch {
      // 이미 언마운트된 경우 무시
    }
    host.remove()
  }
}
