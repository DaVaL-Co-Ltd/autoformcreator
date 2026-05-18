// 지식 공유(카드뉴스) 카테고리 전용 카드 컴포넌트.
// 배경 스타일을 인덱스 기반으로 결정해 카드마다 변주를 준다.
// imageUrl 이 전달되면 우하단에 본문 관련 대표 이미지를 함께 배치한다.

const CARD_WRAPPER_CLASS = 'relative w-full max-w-xl aspect-square rounded-3xl flex items-center justify-center'

const BACKGROUND_STYLES = [
  // 0. 회색 격자 종이
  {
    wrapper: CARD_WRAPPER_CLASS,
    wrapperStyle: {
      backgroundColor: '#dbe1e4',
      backgroundImage:
        'linear-gradient(to right, rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.6) 1px, transparent 1px)',
      backgroundSize: '24px 24px',
    },
  },
  // 1. 베이지 단색
  {
    wrapper: CARD_WRAPPER_CLASS,
    wrapperStyle: { backgroundColor: '#f4ece1' },
  },
  // 2. 연파스텔 핑크 + 도트 패턴
  {
    wrapper: CARD_WRAPPER_CLASS,
    wrapperStyle: {
      backgroundColor: '#fbe8ec',
      backgroundImage: 'radial-gradient(rgba(220, 120, 150, 0.18) 1.5px, transparent 1.5px)',
      backgroundSize: '20px 20px',
    },
  },
  // 3. 연민트 단색
  {
    wrapper: CARD_WRAPPER_CLASS,
    wrapperStyle: { backgroundColor: '#e1f2ec' },
  },
  // 4. 스카이 블루 단색
  {
    wrapper: CARD_WRAPPER_CLASS,
    wrapperStyle: { backgroundColor: '#e0f2fe' },
  },
  // 5. 라벤더 + 대각선 줄무늬
  {
    wrapper: CARD_WRAPPER_CLASS,
    wrapperStyle: {
      backgroundColor: '#ede9fe',
      backgroundImage:
        'repeating-linear-gradient(45deg, rgba(167, 139, 250, 0.14) 0, rgba(167, 139, 250, 0.14) 1.5px, transparent 1.5px, transparent 14px)',
    },
  },
  // 6. 소프트 피치 단색
  {
    wrapper: CARD_WRAPPER_CLASS,
    wrapperStyle: { backgroundColor: '#ffedd5' },
  },
  // 7. 버터 옐로우 + 가로 라인
  {
    wrapper: CARD_WRAPPER_CLASS,
    wrapperStyle: {
      backgroundColor: '#fef3c7',
      backgroundImage:
        'linear-gradient(to bottom, rgba(245, 158, 11, 0.12) 1px, transparent 1px)',
      backgroundSize: '100% 18px',
    },
  },
  // 8. 라일락 단색
  {
    wrapper: CARD_WRAPPER_CLASS,
    wrapperStyle: { backgroundColor: '#f3e8ff' },
  },
  // 9. 아쿠아 + 도트 패턴
  {
    wrapper: CARD_WRAPPER_CLASS,
    wrapperStyle: {
      backgroundColor: '#ccfbf1',
      backgroundImage: 'radial-gradient(rgba(20, 184, 166, 0.16) 1.3px, transparent 1.3px)',
      backgroundSize: '22px 22px',
    },
  },
]

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
  const safeBullets = Array.isArray(bullets)
    ? bullets.map((line) => String(line || '').trim()).filter(Boolean)
    : []

  if (!headline && safeBullets.length === 0) return null

  return (
    <div className={bgChoice.wrapper} style={bgChoice.wrapperStyle}>
      <BookCardInnerDesign
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
