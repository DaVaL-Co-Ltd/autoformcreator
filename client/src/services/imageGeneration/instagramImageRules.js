import { generateBlogImages } from './blogImageRules'

const KNOWLEDGE_INSIGHT_CATEGORY_ID = 'knowledge_insight'

function adaptCardToSection(card = {}, index = 0) {
  const heading = card.headline || card.title || card.heading || `카드 ${card.cardNumber || index + 1}`
  const keyPhrase = card.dataPoint || card.content || card.summary || heading
  return {
    heading,
    keyPhrase,
    content: card.content || '',
  }
}

export async function generateInstagramImages(cards, options = {}) {
  const safeCards = Array.isArray(cards) ? cards : []
  if (safeCards.length === 0) return []

  const adaptedSections = safeCards.map((card, idx) => adaptCardToSection(card, idx))
  const blogResults = await generateBlogImages(adaptedSections, {
    ...options,
    categoryId: KNOWLEDGE_INSIGHT_CATEGORY_ID,
    title: options.title || '',
    textOverlay: 'without-text',
  })

  return blogResults.map((result, idx) => ({
    cardNumber: safeCards[idx]?.cardNumber || idx + 1,
    imageUrl: result?.imageUrl || null,
    heading: result?.heading || adaptedSections[idx]?.heading || '',
    keyPhrase: result?.keyPhrase || adaptedSections[idx]?.keyPhrase || '',
    overlayMode: result?.overlayMode || 'none',
    variant: result?.variant || 'plain',
    imageVersion: result?.imageVersion || 'knowledge-insight-corner',
    subjectTheme: result?.subjectTheme || 'generic',
  }))
}
