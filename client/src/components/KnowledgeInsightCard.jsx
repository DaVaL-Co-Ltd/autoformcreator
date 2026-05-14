// 지식 공유(카드뉴스) 카테고리 전용 카드 컴포넌트.
// 배경 스타일과 내부 디자인을 인덱스 기반으로 결정해 카드마다 변주를 준다.
// 우하단 꼭짓점에 본문 관련 대표 이미지를 배치한다.

const BACKGROUND_STYLES = [
  // 0. 회색 격자 종이 (11.png 스타일)
  {
    wrapper: 'relative w-full max-w-xl aspect-square rounded-3xl flex items-center justify-center',
    wrapperStyle: {
      backgroundColor: '#dbe1e4',
      backgroundImage:
        'linear-gradient(to right, rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.6) 1px, transparent 1px)',
      backgroundSize: '24px 24px',
    },
  },
  // 1. 베이지 단색 (12.png 스타일)
  {
    wrapper: 'relative w-full max-w-xl aspect-square rounded-3xl flex items-center justify-center',
    wrapperStyle: { backgroundColor: '#f4ece1' },
  },
  // 2. 연파스텔 핑크
  {
    wrapper: 'relative w-full max-w-xl aspect-square rounded-3xl flex items-center justify-center',
    wrapperStyle: { backgroundColor: '#fbe8ec' },
  },
  // 3. 연민트
  {
    wrapper: 'relative w-full max-w-xl aspect-square rounded-3xl flex items-center justify-center',
    wrapperStyle: { backgroundColor: '#e1f2ec' },
  },
]

function NotebookInnerDesign({ headline, bullets, fontFamily }) {
  return (
    <div className="relative w-[80%] h-[80%] bg-stone-50 border-2 border-gray-900 rounded-2xl px-6 py-8 overflow-hidden flex items-center">
      {/* 좌측 빈더링(원 2개) */}
      <div className="absolute left-6 top-1/3 w-7 h-7 rounded-full border-2 border-gray-900 bg-white" />
      <div className="absolute left-6 bottom-1/3 w-7 h-7 rounded-full border-2 border-gray-900 bg-white" />
      {/* 좌측 세로 점선 */}
      <div className="absolute left-16 top-8 bottom-8 border-l-2 border-dashed border-gray-700" />
      {/* 본문 */}
      <div className="ml-20 w-full" style={{ fontFamily, wordBreak: 'keep-all', overflowWrap: 'break-word' }}>
        {headline && (
          <h3 className="text-3xl font-black leading-snug text-gray-900 mb-6">
            {headline}
          </h3>
        )}
        {bullets.length > 0 && (
          <ul className="space-y-4 text-lg leading-relaxed text-gray-800">
            {bullets.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function BookCardInnerDesign({ headline, bullets, fontFamily }) {
  return (
    <div
      className="relative w-[80%] h-[80%] bg-white border-2 border-gray-900 rounded-2xl px-6 py-8 overflow-hidden flex flex-col justify-center"
      style={{ fontFamily, wordBreak: 'keep-all', overflowWrap: 'break-word' }}
    >
      {headline && (
        <>
          <h3 className="text-center text-4xl font-black leading-tight text-gray-900 mb-4">
            {headline}
          </h3>
          <div className="border-t border-gray-900 mb-6" />
        </>
      )}
      {bullets.length > 0 && (
        <ul className="space-y-5 text-center text-lg leading-relaxed text-gray-800">
          {bullets.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

const INNER_DESIGNS = [NotebookInnerDesign, BookCardInnerDesign]

function pickIndex(seedIndex, length) {
  const safe = Math.abs(Number.isFinite(seedIndex) ? seedIndex : 0)
  return safe % length
}

export default function KnowledgeInsightCard({
  index = 0,
  headline = '',
  bullets = [],
  imageUrl = null,
  fontFamily = "'SBAggro', 'Pretendard', sans-serif",
}) {
  const bgChoice = BACKGROUND_STYLES[pickIndex(index, BACKGROUND_STYLES.length)]
  const InnerDesign = INNER_DESIGNS[pickIndex(index + 1, INNER_DESIGNS.length)]
  const safeBullets = Array.isArray(bullets)
    ? bullets.map((line) => String(line || '').trim()).filter(Boolean)
    : []

  if (!headline && safeBullets.length === 0) return null

  return (
    <div className={bgChoice.wrapper} style={bgChoice.wrapperStyle}>
      <InnerDesign
        headline={headline}
        bullets={safeBullets}
        fontFamily={fontFamily}
      />
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          aria-hidden
          className="absolute bottom-2 right-2 z-20 w-28 h-28 sm:w-32 sm:h-32 object-contain pointer-events-none drop-shadow-md"
        />
      )}
    </div>
  )
}
