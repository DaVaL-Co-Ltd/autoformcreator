// 인스타그램 카드 이미지는 지식 공유(카드뉴스) 디자인으로 렌더하되,
// 우하단 코너 일러스트를 사용하지 않으므로 별도의 Gemini 이미지를 생성하지 않는다.
// 단, 결과 페이지의 카드별 cardNumber 매칭과 DOM 캡처 후 renderedImageUrl 첨부 흐름이
// 동작하려면 카드 개수만큼의 placeholder 항목이 필요하므로 빈 imageUrl 로 채워 반환한다.

export async function generateInstagramImages(cards) {
  const safeCards = Array.isArray(cards) ? cards : []
  return safeCards.map((card, idx) => ({
    cardNumber: card?.cardNumber || idx + 1,
    imageUrl: null,
  }))
}
