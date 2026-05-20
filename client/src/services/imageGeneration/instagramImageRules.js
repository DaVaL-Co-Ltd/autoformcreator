import { generateImage } from './commonImageRules'
import {
  KNOWLEDGE_INSIGHT_CORNER_LAYOUT_PROMPT,
  KNOWLEDGE_INSIGHT_CUTOUT_RULE,
  KNOWLEDGE_INSIGHT_EMOJI_STYLE,
  KNOWLEDGE_INSIGHT_NO_TEXT_RULE,
  KNOWLEDGE_INSIGHT_THEME_MOTIFS,
  buildKnowledgeTextFallbackClause,
  inferConceptDigestTheme,
  removeWhiteBackgroundFromDataUrl,
} from './blogImageRules'

function buildSectionFromCard(card = {}) {
  return {
    heading: String(card?.title || card?.headline || card?.heading || '').trim(),
    keyPhrase: String(card?.dataPoint || card?.subtitle || card?.headline || '').trim(),
    content: String(card?.content || card?.summary || '').trim(),
  }
}

function buildInstagramCornerPrompt(card, options = {}) {
  const section = buildSectionFromCard(card)
  const theme = inferConceptDigestTheme(section, options)
  const subjectPrompt = KNOWLEDGE_INSIGHT_THEME_MOTIFS[theme] || KNOWLEDGE_INSIGHT_THEME_MOTIFS.generic
  const topicHint = section.heading
    ? `directly and specifically related to "${section.heading}"${section.keyPhrase ? ` and key idea "${section.keyPhrase}"` : ''}`
    : 'related to one clear study concept'
  const extraHint = options.extra ? ` Highest-priority user override: ${options.extra}.` : ''
  const textFallbackClause = buildKnowledgeTextFallbackClause(section.heading || section.keyPhrase)

  return [
    'Generate a 1:1 square educational illustration asset to be displayed in a small slot of a Korean knowledge-sharing card.',
    KNOWLEDGE_INSIGHT_NO_TEXT_RULE,
    KNOWLEDGE_INSIGHT_EMOJI_STYLE,
    KNOWLEDGE_INSIGHT_CORNER_LAYOUT_PROMPT,
    `Use one main motif, or at most two tightly related motifs, ${topicHint}. Prefer ${subjectPrompt}.`,
    'Do not generate a full background scene, landscape, room, poster, or card layout. The subject must be precisely centered on the canvas with even empty white margin on all four sides. Do not use people unless the concept absolutely requires a human action, and even then keep the figure simple and secondary. Avoid text, labels, many mini icons, repeated decorations, notebook paper textures, stickers, and collage composition. Prefer a single isolated object or one tiny object pair with bold linework and simplified color blocking.',
    KNOWLEDGE_INSIGHT_CUTOUT_RULE,
    KNOWLEDGE_INSIGHT_NO_TEXT_RULE,
  ].join(' ') + textFallbackClause + extraHint
}

export async function generateInstagramImages(cards, options = {}) {
  const safeCards = Array.isArray(cards) ? cards : []
  const results = []
  for (let i = 0; i < safeCards.length; i += 1) {
    const card = safeCards[i] || {}
    const cardNumber = card?.cardNumber || i + 1
    try {
      const generatedImageUrl = await generateImage(buildInstagramCornerPrompt(card, options), 2, options.signal)
      const imageUrl = await removeWhiteBackgroundFromDataUrl(generatedImageUrl)
      results.push({ cardNumber, imageUrl })
    } catch {
      results.push({ cardNumber, imageUrl: null })
    }
  }
  // buildInstagramDisplayCards 가 cardTopics 뒤에 CTA 카드 1개를 더 붙이므로,
  // 결과 페이지 캡처 흐름에서 CTA 카드의 PNG 가 instagramImages 와 매칭되도록
  // CTA placeholder 항목을 함께 추가한다. CTA 자체는 코너 일러스트가 없으므로 imageUrl 은 null.
  if (results.length > 0) {
    results.push({
      cardNumber: results.length + 1,
      imageUrl: null,
      isCaptionCta: true,
    })
  }
  return results
}
