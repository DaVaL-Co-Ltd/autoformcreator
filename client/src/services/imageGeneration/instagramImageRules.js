import {
  DOM_TEXT_OVERLAY_PROMPT,
  NO_LETTER_PROMPT,
  STYLE_PROMPTS,
  generateImage,
  getStylePrompt,
  pickPalette,
} from './commonImageRules'

const INSTAGRAM_COLORFUL_PALETTES = [
  'Color palette: coral, apricot, sky blue, cream, and muted teal with a lively but tasteful multicolor balance.',
  'Color palette: lavender, butter yellow, mint, powder blue, and warm ivory with cheerful contrast.',
  'Color palette: peach, cherry blossom pink, aqua, lilac, and soft orange accents with social-media energy.',
  'Color palette: teal, denim blue, blush pink, light gold, and pale peach with varied but soft saturation.',
  'Color palette: rose, periwinkle, mint green, soft lemon, and cloudy white with colorful layered accents.',
]

function normalizeInstagramCardStyle(value = '') {
  if (value === 'center-card' || value === 'center-focus') return 'center-card'
  return 'background-text'
}

function buildInstagramImagePrompt(card, options = {}) {
  const styleHint = getStylePrompt(options.imageStyle, STYLE_PROMPTS.pastel)
  const isPhotoStyle = options.imageStyle === 'photo'
  const instagramCardStyle = normalizeInstagramCardStyle(options.instagramCardStyle)
  const promptText = card.imagePrompt || `${card.headline || ''} ${card.content || ''}`
  const colorHint = ` ${pickPalette(`${card.headline || ''}|${card.content || ''}|${options.imageStyle || ''}|${instagramCardStyle}|instagram`, INSTAGRAM_COLORFUL_PALETTES)}`
  const extraHint = options.extra ? ` ${options.extra}.` : ''
  const layoutHint = isPhotoStyle
    ? 'Create one full-bleed square realistic photo that fills the entire frame with a single continuous real-world scene. Use actual students, teachers, classrooms, school corridors, libraries, desks, laptops, notebooks, or campus settings so it feels like a genuine photo captured on location. Do not use poster layouts, pattern backgrounds, split zones, graphic panels, abstract color fields, or designed card backdrops.'
    : instagramCardStyle === 'center-card'
      ? 'Create a square composition with the main subject or color energy framing the edges while leaving a calm, balanced center zone for a centered DOM text card overlay. Keep the center readable and uncluttered, like a highlight card sitting in the middle of the frame.'
      : 'Create a rich square Instagram card background using a photo-like or illustration-like scene with a readable lower text zone and enough calm negative space for a bottom-aligned DOM text block. The background itself should feel like a polished social media visual without any text baked in.'
  const textureHint = isPhotoStyle
    ? 'Prefer true documentary-style school photography over stylized illustrations or painted scenes. Avoid cartoon softness, avoid CG-looking compositions, avoid abstract patterns, and avoid any repeated or segmented background treatment.'
    : instagramCardStyle === 'center-card'
      ? 'Prefer soft edge framing, subtle depth falloff, and a visually quiet center rather than busy all-over detail.'
      : 'Prefer expressive scene-based visuals or strong subject imagery with a cleaner lower third, so a bottom information panel can sit on top without fighting the background.'
  const aestheticHint = isPhotoStyle
    ? 'Keep the composition polished for social media, unmistakably photographic, grounded in reality, and visually dominated by one realistic photo scene. Let books, clothes, stationery, posters, and classroom props introduce varied colorful accents rather than a single dominant monochrome tone.'
    : 'Soft, cute aesthetic with clean composition and a lively multicolor look instead of a single dominant brand color.'

  return `Generate an image: ${styleHint}${colorHint} ${layoutHint} ${textureHint} ${promptText.trim()}. If the selected style suggests a solid color or subtle pattern background, keep the background simple, poster-like, and clean enough for DOM text overlay. ${DOM_TEXT_OVERLAY_PROMPT} ${NO_LETTER_PROMPT} ${aestheticHint}${extraHint}`
}

export async function generateInstagramImages(cards, options = {}) {
  const results = []
  for (const card of cards) {
    try {
      const imageUrl = await generateImage(buildInstagramImagePrompt(card, options))
      results.push({ cardNumber: card.cardNumber, imageUrl })
    } catch (err) {
      results.push({ cardNumber: card.cardNumber, imageUrl: null, error: err.message })
    }
  }
  return results
}
