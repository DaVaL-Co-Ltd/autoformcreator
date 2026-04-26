const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const GEMINI_IMAGE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent'

async function generateImage(prompt, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${GEMINI_IMAGE_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
        }),
      })

      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 5000))
        continue
      }

      if (!res.ok) {
        const err = await res.text()
        throw new Error(`이미지 생성 실패: ${res.status} - ${err.slice(0, 200)}`)
      }

      const data = await res.json()
      const parts = data.candidates?.[0]?.content?.parts || []
      const imagePart = parts.find(p => p.inlineData)

      if (!imagePart) throw new Error('이미지를 생성하지 못했습니다.')

      const base64 = imagePart.inlineData.data
      const mimeType = imagePart.inlineData.mimeType || 'image/png'
      return `data:${mimeType};base64,${base64}`
    } catch (err) {
      if (attempt === retries) throw err
      await new Promise(r => setTimeout(r, 3000))
    }
  }
}

const STYLE_PROMPTS = {
  pastel: 'Soft pastel illustration style. Gentle hand-crafted illustration look, matte surfaces, light grain, soft edges, warm editorial composition, cute but clearly illustrated rather than rendered.',
  '3d': 'Highly polished 3D rendered style. Glossy materials, clear depth, strong dimensional lighting, soft reflections, toy-like objects, bold foreground/background separation.',
  minimal: 'Soft pastel illustration style. Gentle hand-crafted illustration look, matte surfaces, light grain, soft edges, warm editorial composition.',
  photo: 'Ultra photorealistic photography style. Documentary-grade real photo look, realistic lens behavior, natural depth of field, authentic lighting, detailed textures, real-world materials, actual people, real classrooms, real school buildings, real campuses, and believable studying situations. No painterly, illustrated, cartoon, CG, or rendered appearance.',
  watercolor: 'Soft watercolor painting style. Delicate washes of color, gentle blends.',
  'solid-pattern': 'Simple poster background style with a solid color base or a very subtle repeating pattern. Use broad clean shapes, dots, lines, grid motifs, or soft geometric accents. Keep the composition minimal and uncluttered.',
}

const COLOR_PROMPTS = {
  blue: 'Color palette: soft sky blue, light cyan, navy accents.',
  pink: 'Color palette: soft pink, rose, light coral.',
  green: 'Color palette: mint green, sage, light teal.',
  purple: 'Color palette: soft lavender, light purple, violet accents.',
}

const NO_LETTER_PROMPT = 'CRITICAL TEXT RULE: the image must contain zero readable letters or words. Absolutely no Korean text, no Hangul, no English letters, no Japanese characters, no Chinese characters, no Arabic letters, no words, no fake text, no handwritten marks, no logo text, no signage text, no labels, no captions, and no typography of any kind. If any text-like shape appears, it is a failed image. Regenerate mentally and keep the background free of all letters. Only plain numeric digits 0-9 are allowed when truly necessary; otherwise prefer no symbols at all.'

const AUTO_COLOR_PALETTES = [
  'Color palette: muted slate blue, dusty navy, cool gray accents, soft mist highlights.',
  'Color palette: sage green, eucalyptus, soft cream, deep forest accents.',
  'Color palette: dusty mauve, muted plum, rose beige, warm ivory accents.',
  'Color palette: teal blue, desaturated cyan, deep petrol, pale stone highlights.',
  'Color palette: soft lavender gray, smoky violet, cool white, charcoal accents.',
  'Color palette: muted blush, rose taupe, sand beige, cocoa accents.',
]

const INSTAGRAM_COLORFUL_PALETTES = [
  'Color palette: coral, apricot, sky blue, cream, and muted teal with a lively but tasteful multicolor balance.',
  'Color palette: lavender, butter yellow, mint, powder blue, and warm ivory with cheerful contrast.',
  'Color palette: peach, cherry blossom pink, aqua, lilac, and soft orange accents with social-media energy.',
  'Color palette: teal, denim blue, blush pink, light gold, and pale peach with varied but soft saturation.',
  'Color palette: rose, periwinkle, mint green, soft lemon, and cloudy white with colorful layered accents.',
]

function hashString(value = '') {
  let hash = 0
  const text = String(value)
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function pickAutoColorPalette(seed = '') {
  const index = hashString(seed) % AUTO_COLOR_PALETTES.length
  return AUTO_COLOR_PALETTES[index]
}

function pickInstagramColorPalette(seed = '') {
  const index = hashString(seed) % INSTAGRAM_COLORFUL_PALETTES.length
  return INSTAGRAM_COLORFUL_PALETTES[index]
}

function normalizeInstagramCardStyle(value = '') {
  if (value === 'center-card' || value === 'center-focus') return 'center-card'
  return 'background-text'
}

export async function generateBlogImages(sections, options = {}) {
  const styleHint = options.imageStyle && options.imageStyle !== 'auto' && STYLE_PROMPTS[options.imageStyle]
    ? STYLE_PROMPTS[options.imageStyle]
    : STYLE_PROMPTS.pastel
  const isPhotoStyle = options.imageStyle === 'photo'
  const extraHint = options.extra ? ` ${options.extra}.` : ''
  const targetSections = (isPhotoStyle ? sections : sections.slice(0, 1)).filter(Boolean)

  const results = []
  for (let i = 0; i < targetSections.length; i++) {
    const section = targetSections[i]
    try {
      const visualVariations = [
        { icons: 'books, pencils, paper scrolls, reading glasses, study notes' },
        { icons: 'calculator, ruler, compass, geometric shapes, graph paper' },
        { icons: 'microscope, test tubes, magnifying glass, lightbulb, seedling' },
        { icons: 'notebook, graduation cap, star, clock, abacus' },
        { icons: 'trophy, target, checklist, heart, pencil case' },
      ]
      const variation = visualVariations[i % visualVariations.length]
      const paletteDesc = options.mainColor && options.mainColor !== 'auto' && COLOR_PROMPTS[options.mainColor]
        ? COLOR_PROMPTS[options.mainColor]
        : pickAutoColorPalette(`${section.heading}|${section.keyPhrase || ''}|${options.imageStyle || ''}|blog`)
      const mediumHint = isPhotoStyle
        ? 'Generate a 1:1 square realistic photo for a Korean education blog image'
        : 'Generate a 1:1 square illustration for a Korean education blog image'
      const sceneHint = isPhotoStyle
        ? `Show one authentic full-bleed real-world education photo related to "${section.heading}", such as students studying, a teacher guiding a class, a real classroom, a real school hallway, a library, a campus building, notebooks on a real desk, or hands-on learning materials. The image must look like it was captured with a camera in a real school or study environment, with one continuous photographic scene filling the entire square frame. Do not use tiled backgrounds, poster layouts, split zones, abstract patterns, or graphic panels.`
        : `Include visual elements such as ${variation.icons} across the whole composition.`
      const styleConstraint = isPhotoStyle
        ? 'Prefer realistic human presence, real interiors, natural classroom lighting, believable school furniture, real books and stationery, and genuine documentary-style composition. The whole image should read as a single real photograph rather than a designed card.'
        : 'No realistic photos, no people. Cute Korean educational style with a clean full-bleed composition.'
      const bgPrompt = `${mediumHint} about "${section.heading}". ${styleHint} Color palette: ${paletteDesc}. ${sceneHint} Fill the full canvas with a cohesive composition. DO NOT leave an empty center for text. DO NOT add any placeholder panel, blurred box, translucent square, floating frame, empty badge, or reserved text area. ${NO_LETTER_PROMPT} ${styleConstraint} If the selected style suggests a solid color or subtle pattern background, keep it visually simple and readable under DOM text overlays.${extraHint}`
      const imageUrl = await generateImage(bgPrompt)
      results.push({
        heading: section.heading,
        imageUrl,
        keyPhrase: section.keyPhrase || section.heading,
        style: 'overlay',
      })
    } catch {
      results.push({
        heading: section.heading,
        imageUrl: null,
        keyPhrase: section.keyPhrase || section.heading,
        style: 'overlay',
      })
    }
  }
  return results
}

export async function generateInstagramImages(cards, options = {}) {
  const styleHint = options.imageStyle && options.imageStyle !== 'auto' && STYLE_PROMPTS[options.imageStyle]
    ? STYLE_PROMPTS[options.imageStyle]
    : STYLE_PROMPTS.pastel
  const isPhotoStyle = options.imageStyle === 'photo'
  const instagramCardStyle = normalizeInstagramCardStyle(options.instagramCardStyle)
  const extraHint = options.extra ? ` ${options.extra}.` : ''

  const results = []
  for (const card of cards) {
    const promptText = card.imagePrompt || `${card.headline || ''} ${card.content || ''}`
    try {
      const colorHint = ` ${pickInstagramColorPalette(`${card.headline || ''}|${card.content || ''}|${options.imageStyle || ''}|${instagramCardStyle}|instagram`)}`
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
      const instaPrompt = `Generate an image: ${styleHint}${colorHint} ${layoutHint} ${textureHint} ${promptText.trim()}. If the selected style suggests a solid color or subtle pattern background, keep the background simple, poster-like, and clean enough for DOM text overlay. ${NO_LETTER_PROMPT} ${aestheticHint}${extraHint}`
      const imageUrl = await generateImage(instaPrompt)
      results.push({ cardNumber: card.cardNumber, imageUrl })
    } catch (err) {
      results.push({ cardNumber: card.cardNumber, imageUrl: null, error: err.message })
    }
  }
  return results
}
