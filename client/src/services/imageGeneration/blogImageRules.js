import {
  COLOR_PROMPTS,
  DOM_TEXT_OVERLAY_PROMPT,
  NO_LETTER_PROMPT,
  generateImage,
  getStylePrompt,
  pickPalette,
} from './commonImageRules'
import { deriveBlogHeadline, deriveBlogTitleKeywordHeadline } from '../../utils/contentImageOverlay'

const BLOG_AUTO_COLOR_PALETTES = [
  'Color palette: muted slate blue, dusty navy, cool gray accents, soft mist highlights.',
  'Color palette: sage green, eucalyptus, soft cream, deep forest accents.',
  'Color palette: dusty mauve, muted plum, rose beige, warm ivory accents.',
  'Color palette: teal blue, desaturated cyan, deep petrol, pale stone highlights.',
  'Color palette: soft lavender gray, smoky violet, cool white, charcoal accents.',
  'Color palette: muted blush, rose taupe, sand beige, cocoa accents.',
]

const ADMISSIONS_KEYWORD_COLOR_PALETTES = [
  'Color palette: bright ivory, pale sage, soft eucalyptus, muted moss accents.',
  'Color palette: light buttercream, warm sand, pale apricot, desaturated terracotta accents.',
  'Color palette: airy powder blue, pale sky, mist gray, soft steel accents.',
  'Color palette: light blush beige, pale rose, warm cream, muted cocoa accents.',
  'Color palette: soft mint cream, pale celadon, light oatmeal, muted olive accents.',
  'Color palette: light dove gray, pale lavender gray, cool white, muted navy accents.',
]

const BLOG_VISUAL_VARIATIONS = [
  { icons: 'books, pencils, paper scrolls, reading glasses, study notes' },
  { icons: 'calculator, ruler, compass, geometric shapes, graph paper' },
  { icons: 'microscope, test tubes, magnifying glass, lightbulb, seedling' },
  { icons: 'notebook, graduation cap, star, clock, abacus' },
  { icons: 'trophy, target, checklist, heart, pencil case' },
]
const ADMISSIONS_STRATEGY_LONGFORM_CATEGORY_ID = 'admissions_strategy_style_1'
const ADMISSIONS_STRATEGY_KEYWORD_CATEGORY_ID = 'admissions_strategy_style_2'
const KNOWLEDGE_INSIGHT_CATEGORY_ID = 'knowledge_insight'
const INTERVIEW_PREP_CATEGORY_ID = 'interview_prep'
const CARD_NEWS_CATEGORY_IDS = new Set([KNOWLEDGE_INSIGHT_CATEGORY_ID, INTERVIEW_PREP_CATEGORY_ID])
const BOOK_PROMO_CATEGORY_ID = 'book_promo'
const LATIN_NUMBER_ONLY_PROMPT = 'TEXT RULE: avoid readable text whenever possible. If text must appear on books, posters, notes, computer screens, whiteboards, signs, stationery, clothing, or props, it may contain only English alphabet letters A-Z or a-z and numeric digits 0-9. Absolutely no Hangul, no Korean words, no Japanese, no Chinese, no Arabic, no Cyrillic, and no other writing systems.'
export const KNOWLEDGE_INSIGHT_CUTOUT_RULE = 'BACKGROUND RULE: create the subject as an isolated cutout on a pure white background, or transparent-looking background if supported. Do not draw a scene, room, sky, desk surface, paper sheet, color wash, pattern, gradient, shadow box, or decorative backdrop behind it. The white area should act like removable empty background around the object. CRITICAL CANVAS FRAME RULE: never draw any border line, outline frame, rectangle stroke, rounded-corner frame, dashed edge, colored boundary, vignette, drop-shadow rim, or any continuous line that follows the canvas edges. The four canvas edges and corners must look like pure empty white, not a framed picture. Only the subject itself may have its own thick illustration outlines. If any frame-like line appears along the canvas perimeter, the image is failed and must be redone without it.'

export const KNOWLEDGE_INSIGHT_NO_TEXT_RULE = 'ABSOLUTE TEXT BAN: the image must contain ZERO readable characters of any writing system. No Hangul, no Korean letters, no Korean syllables, no Korean words, no romanized Korean, no Japanese kana, no Japanese kanji, no Chinese characters, no Arabic letters, no Cyrillic letters, no Thai letters, no Devanagari, no handwritten marks resembling letters, no logos with letters, no signage text, no labels, no captions, no watermarks, no fake text, no typography of any kind. If the motif is intrinsically composed of letters or digits (for example a math formula, a scientific symbol, or a number-pattern shape), only English letters A-Z/a-z and digits 0-9 are tolerated, and they must look like an integral part of the motif rather than a label or caption. In every other case, generate zero characters whatsoever — even a single Hangul character is a failure that must be regenerated.'
export const KNOWLEDGE_INSIGHT_EMOJI_STYLE = 'Create a clean emoji-like educational icon illustration with thick outlines, simple shapes, clear silhouette, flat or lightly stepped colors, and low visual complexity. It should feel closer to a friendly sticker or textbook-side emoticon than to a pastel painting, watercolor illustration, or detailed poster artwork.'
export const KNOWLEDGE_INSIGHT_CORNER_LAYOUT_PROMPT = 'Create a compact square illustration asset intended to be displayed inside a small fixed-size slot of a knowledge card. CRITICAL CENTERING RULE: the subject must be EXACTLY centered on the canvas — its visual center of mass must align with the canvas center point. Place equal empty white margin on all four sides (top, bottom, left, right). Do not bias the subject toward any corner or edge. SIZE RULE: keep the subject SMALL — occupy roughly 50% to 65% of the canvas inside a centered square region (about 60% by 60% centered on the canvas), with the remaining outer band fully empty white. Subject scale may vary across images, but the centering must stay consistent. Do not design a full poster, do not fill the whole frame, and do not add a text panel, badge, frame, border, sticker sheet, decorative background scene, or any line along the canvas edges.'
const KNOWLEDGE_INSIGHT_WHITE_BG_THRESHOLD = 245

const CONCEPT_DIGEST_EMPTY_CENTER_RULE = 'CRITICAL LAYOUT RULE: the central area covering the inner 70% by 70% of the square canvas must be completely empty — no motifs, no objects, no decorations, no badges, no circles, no white plates, no text containers, just the smooth solid-color background. The app will place its own white circle and text on top of this central area later, so any object you draw there will be hidden or look broken. Place the four motifs ONLY in the four outer corners, each motif kept strictly inside the outer 15% band measured from the nearest two canvas edges. Do not let any motif cross into the inner 70% empty zone. Use a single smooth solid-color background that fills the entire canvas behind the motifs.'

const CONCEPT_DIGEST_SHARED_RULES = 'Do not create separate circle badges, square badges, frames, or panels around the motifs. Do not draw any white circle, white disc, or white title plate anywhere on the canvas. Do not render any Korean letters or Korean words anywhere in the image. English letters and numbers are acceptable only if they are part of the motif.'

const ADMISSIONS_KEYWORD_LAYOUT_RULE = 'Create a square educational poster with a bright, low-saturation background. Use a smooth solid-color field or a very soft blended color wash only. Keep the center visually calm and readable so the app can place one bold headline directly in the middle of the image. Do not draw any white circle, white disc, white badge, title panel, text box, translucent plate, or reserved text container. Keep supporting motifs away from the central 45% by 45% zone and bias them toward the outer edges so the centered headline remains fully readable. Avoid chalkboard texture, notebook texture, lined paper, graph paper, check patterns, repeated doodles, stickers, collage layouts, decorative borders, and busy classroom clutter. Do not render any Korean letters or Korean words anywhere in the image. English letters and numbers are acceptable only if they are part of the motif.'

// Default fallback (카테고리 미지정) 전용 규칙.
// 디자인 톤: 4개 코너에 부드러운 organic blob + 각 코너에 한 개씩 학습 모티프, 중앙 70% 는 크림/연한 단색 빈 공간.
// 흰 원형 + 키워드 텍스트는 앱이 DOM 으로 덧붙이므로 빈 공간은 반드시 비워야 한다.
const DEFAULT_CARDNEWS_LAYOUT_RULE = 'CRITICAL LAYOUT RULE: the inner 70% by 70% center area must remain completely empty and visually calm with one clean light cream or ivory tone, because the app will place its own white circle and a centered keyword on top afterward — anything drawn in that inner zone will be hidden or look broken. Add soft organic blob shapes that use the chosen color palette only in the four outer corners, hugging the canvas edges and never crossing into the inner 70% empty zone. Place exactly four simple study motifs, one in each corner region, sitting on top of the colored corner blobs, with each motif kept inside the outer 18% band measured from the nearest two canvas edges. Use hand-drawn outline illustration style with clean linework, soft pastel fills, gentle matte surfaces, and no shading complexity. Do not add any white circle, title plate, text panel, badge, frame, sticker sheet, collage layout, or busy decorative background. Do not render any Korean letters or Korean words anywhere in the image. English letters and numbers are acceptable only if they are part of the motif.'

const CONCEPT_DIGEST_THEME_PROMPTS = {
  math: `Create a simple math-study poster on a square canvas. ${CONCEPT_DIGEST_EMPTY_CENTER_RULE} Use simple corner motifs such as a compass, ruler, graph line, geometric sketch, or formula symbol. ${CONCEPT_DIGEST_SHARED_RULES}`,
  science: `Create a simple science-study poster on a square canvas. ${CONCEPT_DIGEST_EMPTY_CENTER_RULE} Use simple corner motifs such as a beaker, microscope, atom icon, leaf-energy diagram, or experiment symbol. ${CONCEPT_DIGEST_SHARED_RULES}`,
  korean: `Create a simple Korean language study poster on a square canvas. ${CONCEPT_DIGEST_EMPTY_CENTER_RULE} Use simple corner motifs such as an open book, fountain pen, reading symbol, or text-flow visual cue. ${CONCEPT_DIGEST_SHARED_RULES}`,
  social: `Create a simple social-studies poster on a square canvas. ${CONCEPT_DIGEST_EMPTY_CENTER_RULE} Use simple corner motifs such as a map, globe, chart, civic symbol, or economy icon. ${CONCEPT_DIGEST_SHARED_RULES}`,
  english: `Create a simple English-study poster on a square canvas. ${CONCEPT_DIGEST_EMPTY_CENTER_RULE} Use simple corner motifs such as a dictionary, reading symbol, speech bubble icon, or flash-card motif. Avoid any readable letters. ${CONCEPT_DIGEST_SHARED_RULES}`,
  history: `Create a simple history-study poster on a square canvas. ${CONCEPT_DIGEST_EMPTY_CENTER_RULE} Use simple corner motifs such as an old map silhouette, artifact, document icon, or timeline cue. ${CONCEPT_DIGEST_SHARED_RULES}`,
  computing: `Create a simple computing-study poster on a square canvas. ${CONCEPT_DIGEST_EMPTY_CENTER_RULE} Use simple corner motifs such as a circuit line, logic block, laptop silhouette, or algorithm flow icon. ${CONCEPT_DIGEST_SHARED_RULES}`,
  generic: `Create a simple textbook-study poster on a square canvas. ${CONCEPT_DIGEST_EMPTY_CENTER_RULE} Use simple corner motifs such as a pencil, ruler, notebook symbol, or learning object. ${CONCEPT_DIGEST_SHARED_RULES}`,
}

export const KNOWLEDGE_INSIGHT_THEME_MOTIFS = {
  math: 'a formula notebook, compass, graph curve, geometric sketch, or number-pattern object',
  science: 'a beaker, microscope, atom visual, leaf-energy science cue, or experiment object',
  korean: 'an open book, fountain pen, reading cue, text-flow symbol, or literature-study object',
  social: 'a map, globe, civic symbol, chart, economy cue, or society-related study object',
  english: 'a dictionary, reading cue, speech bubble symbol, listening-study object, or flash-card motif without readable text',
  history: 'an old map silhouette, artifact, document cue, timeline object, or history-study symbol',
  computing: 'a circuit line, logic block, laptop silhouette, algorithm-flow cue, or computing-study object',
  generic: 'a notebook, pencil, study note, planner, magnifier, or one clear learning-related object',
}

const CONCEPT_DIGEST_THEME_KEYWORDS = [
  { id: 'math', keywords: ['수학', '함수', '방정식', '도형', '확률', '통계', '기하', '피보나치', '소수', '인수분해', '미분', '적분'] },
  { id: 'science', keywords: ['과학', '물리', '화학', '생물', '지구과학', '원자', '분자', '세포', '에너지', '실험', '광합성', '힘'] },
  { id: 'korean', keywords: ['국어', '문학', '비문학', '시', '소설', '작문', '독해', '문법', '화법', '작품', '서술', '어휘'] },
  { id: 'social', keywords: ['사회', '경제', '정치', '지리', '문화', '시민', '시장', '국가', '산업', '인권', '법', '무역'] },
  { id: 'english', keywords: ['영어', '영문법', '영단어', '독해', '리스닝', '스피킹', '문장', '해석', '어휘', '영작문'] },
  { id: 'history', keywords: ['역사', '한국사', '세계사', '조선', '고려', '근대', '현대사', '전쟁', '왕조', '개항', '혁명'] },
  { id: 'computing', keywords: ['컴퓨터', '정보', '인공지능', 'AI', '알고리즘', '코딩', '프로그래밍', '데이터', '네트워크', '보안', '소프트웨어'] },
]

function describeConceptDigestTopic(section = {}) {
  const topic = String(section?.keyPhrase || section?.heading || '').trim()

  if (!topic) {
    return 'Use one single study-related motif that directly represents the lesson topic, placed only in a corner of the canvas.'
  }

  return `Choose simple visual motifs that are directly and specifically related to the lesson topic "${topic}". Place exactly four motifs, one in each of the four corners of the square canvas, with each motif kept strictly inside the outer 15% band measured from the nearest two canvas edges. The inner 70% by 70% central area must remain completely empty — no motif may cross into it. Do not add a separate background plate, badge, frame, circle, or square behind any motif. Do not fall back to generic subject icons unless the topic is too abstract. If the topic is about Fibonacci sequence, prefer a spiral, number growth pattern, shell-like mathematical spiral, or geometric sequence visual. If the topic is about photosynthesis, prefer a leaf, sunlight, chloroplast-like cell diagram, plant growth, or light-to-energy science visual. Keep the motifs literal, educational, and easy to recognize at a glance. Do not render any Korean letters or Korean words anywhere in the image. English letters and numbers are acceptable only if they are part of the motif.`
}

export function inferConceptDigestTheme(section = {}, options = {}) {
  if (options.subjectTheme && CONCEPT_DIGEST_THEME_PROMPTS[options.subjectTheme]) {
    return options.subjectTheme
  }

  const haystack = [
    section?.heading || '',
    section?.keyPhrase || '',
    section?.content || '',
    options.extra || '',
  ].join(' ').toLowerCase()

  let bestTheme = 'generic'
  let bestScore = 0

  for (const candidate of CONCEPT_DIGEST_THEME_KEYWORDS) {
    const score = candidate.keywords.reduce((total, keyword) => (
      total + (haystack.includes(String(keyword).toLowerCase()) ? 1 : 0)
    ), 0)

    if (score > bestScore) {
      bestScore = score
      bestTheme = candidate.id
    }
  }

  return bestTheme
}

function getBlogImageVersionConfig(options = {}) {
  if (options.categoryId === 'concept_digest') {
    const subjectTheme = inferConceptDigestTheme(options.section, options)
    return {
      version: 'image_keyword',
      variant: 'circle-text-only',
      overlayMode: 'headline-only',
      overlayFont: 'pretendard',
      layoutPrompt: `Create a square educational cover with one smooth solid-color background filling the entire canvas. ${CONCEPT_DIGEST_EMPTY_CENTER_RULE} The app will overlay its own white circle and headline text on the empty central area afterward, so anything you draw inside the inner 70% area will be hidden or look wrong. Avoid chalkboard texture, notebook texture, graph paper, lined paper, check patterns, repeated doodles, many small props, decorative borders, collage layouts, stickers, confetti, wallpaper-like textures, or busy classroom clutter. The result should feel like a clean school poster cover with a fully empty stable center and simple corner motifs only. ${CONCEPT_DIGEST_SHARED_RULES}`,
      subjectTheme,
      subjectPrompt: CONCEPT_DIGEST_THEME_PROMPTS[subjectTheme] || CONCEPT_DIGEST_THEME_PROMPTS.generic,
    }
  }

  if (options.categoryId === ADMISSIONS_STRATEGY_KEYWORD_CATEGORY_ID) {
    const subjectTheme = inferConceptDigestTheme(options.section, options)
    return {
      version: 'image_keyword',
      variant: 'poster-title',
      overlayMode: 'headline-only',
      overlayFont: 'knowledge',
      layoutPrompt: `${ADMISSIONS_KEYWORD_LAYOUT_RULE} The centered headline will be added directly on top of the image afterward, so the middle of the canvas must stay visually simple and free of high-contrast objects.`,
      subjectTheme,
      subjectPrompt: CONCEPT_DIGEST_THEME_PROMPTS[subjectTheme] || CONCEPT_DIGEST_THEME_PROMPTS.generic,
    }
  }

  if (CARD_NEWS_CATEGORY_IDS.has(options.categoryId)) {
    const subjectTheme = inferConceptDigestTheme(options.section, options)
    return {
      version: 'knowledge-insight-corner',
      variant: 'plain',
      overlayMode: 'none',
      overlayFont: options.overlayFont || 'pretendard',
      subjectTheme,
      layoutPrompt: KNOWLEDGE_INSIGHT_CORNER_LAYOUT_PROMPT,
      subjectPrompt: KNOWLEDGE_INSIGHT_THEME_MOTIFS[subjectTheme] || KNOWLEDGE_INSIGHT_THEME_MOTIFS.generic,
    }
  }

  if (isHumanSceneBlogCategory(options)) {
    return {
      version: 'human-photo-scene',
      variant: 'plain',
      overlayMode: 'none',
      overlayFont: options.overlayFont || 'pretendard',
      subjectTheme: 'generic',
      layoutPrompt: 'Fill the entire square canvas with one coherent human-centered scene. Do not leave a reserved text area. Do not add title plates, badges, quote cards, empty circles, poster frames, or any designed text container.',
      subjectPrompt: '',
    }
  }

  // Default fallback: 4-코너 organic blob + 모서리 학습 모티프 + 중앙 키워드 오버레이
  const subjectTheme = inferConceptDigestTheme(options.section, options)
  return {
    version: 'default_keyword',
    variant: 'circle-text-only',
    overlayMode: 'headline-only',
    overlayFont: options.overlayFont || 'pretendard',
    subjectTheme,
    layoutPrompt: DEFAULT_CARDNEWS_LAYOUT_RULE,
    subjectPrompt: KNOWLEDGE_INSIGHT_THEME_MOTIFS[subjectTheme] || KNOWLEDGE_INSIGHT_THEME_MOTIFS.generic,
  }
}

function getBlogPalette(section, options = {}) {
  if (isAdmissionsStrategyKeywordCategory(options)) {
    return options.mainColor && options.mainColor !== 'auto' && COLOR_PROMPTS[options.mainColor]
      ? COLOR_PROMPTS[options.mainColor]
      : pickPalette(`${section.heading}|${section.keyPhrase || ''}|${options.imageStyle || ''}|admissions-keyword`, ADMISSIONS_KEYWORD_COLOR_PALETTES)
  }

  return options.mainColor && options.mainColor !== 'auto' && COLOR_PROMPTS[options.mainColor]
    ? COLOR_PROMPTS[options.mainColor]
    : pickPalette(`${section.heading}|${section.keyPhrase || ''}|${options.imageStyle || ''}|blog`, BLOG_AUTO_COLOR_PALETTES)
}

async function loadDataUrlImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('지식공유 이미지 로딩에 실패했습니다.'))
    image.src = dataUrl
  })
}

export async function removeWhiteBackgroundFromDataUrl(dataUrl) {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return dataUrl
  if (!String(dataUrl || '').startsWith('data:image/')) return dataUrl

  try {
    const image = await loadDataUrlImage(dataUrl)
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth || image.width
    canvas.height = image.naturalHeight || image.height

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return dataUrl

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const { data } = frame

    for (let i = 0; i < data.length; i += 4) {
      const red = data[i]
      const green = data[i + 1]
      const blue = data[i + 2]
      const alpha = data[i + 3]

      if (alpha === 0) continue

      const minChannel = Math.min(red, green, blue)
      const maxChannel = Math.max(red, green, blue)

      if (minChannel >= KNOWLEDGE_INSIGHT_WHITE_BG_THRESHOLD) {
        data[i + 3] = 0
        continue
      }

      if (maxChannel >= 235 && (maxChannel - minChannel) <= 18) {
        const whiteness = (red + green + blue) / 3
        const fadeRatio = Math.max(0, Math.min(1, (245 - whiteness) / 10))
        data[i + 3] = Math.round(alpha * fadeRatio)
      }
    }

    ctx.putImageData(frame, 0, 0)
    return canvas.toDataURL('image/png')
  } catch {
    return dataUrl
  }
}

function isAdmissionsStrategyLongformCategory(options = {}) {
  return options.categoryId === ADMISSIONS_STRATEGY_LONGFORM_CATEGORY_ID
}

function isBookPromoCategory(options = {}) {
  return options.categoryId === BOOK_PROMO_CATEGORY_ID
}

function isHumanSceneBlogCategory(options = {}) {
  return isAdmissionsStrategyLongformCategory(options) || isBookPromoCategory(options)
}

function isAdmissionsStrategyKeywordCategory(options = {}) {
  return options.categoryId === ADMISSIONS_STRATEGY_KEYWORD_CATEGORY_ID
}

function isKnowledgeInsightCategory(options = {}) {
  return CARD_NEWS_CATEGORY_IDS.has(options.categoryId)
}

function buildAdmissionsStrategySectionContext(section = {}) {
  const heading = String(section?.heading || '').trim()
  const keyPhrase = String(section?.keyPhrase || '').trim()
  const content = String(section?.content || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280)

  return [
    heading ? `Section heading: "${heading}".` : '',
    keyPhrase ? `Key phrase: "${keyPhrase}".` : '',
    content ? `Match this section content closely: "${content}".` : '',
  ].filter(Boolean).join(' ')
}

function buildBlogImagePrompt(section, options = {}, index = 0) {
  const mergedOptions = { ...options, section }
  const versionConfig = getBlogImageVersionConfig(mergedOptions)
  const isHumanSceneCategory = isHumanSceneBlogCategory(options)
  const isKnowledgeInsight = isKnowledgeInsightCategory(options)
  const isDefaultKeyword = versionConfig.version === 'default_keyword'
  const styleHint = isKnowledgeInsight
    ? KNOWLEDGE_INSIGHT_EMOJI_STYLE
    : versionConfig.version === 'image_keyword'
    ? getStylePrompt(options.imageStyle, 'Simple poster background style with a flat solid-color field, minimal shading, one clean educational motif, and a very uncluttered composition.')
    : isDefaultKeyword
    ? getStylePrompt(options.imageStyle, 'Hand-drawn outline illustration style with soft pastel fills, clean linework, gentle matte surfaces, and a calm minimal composition with generous empty space in the center.')
    : getStylePrompt(options.imageStyle)
  const isPhotoStyle = options.imageStyle === 'photo'
  const variation = BLOG_VISUAL_VARIATIONS[index % BLOG_VISUAL_VARIATIONS.length]
  const paletteDesc = getBlogPalette(section, options)
  const extraHint = options.extra ? ` Highest-priority user override: ${options.extra}.` : ''
  const topicPrompt = (versionConfig.version === 'image_keyword' || isDefaultKeyword)
    ? describeConceptDigestTopic(section)
    : ''
  const sectionContext = isHumanSceneCategory
    ? buildAdmissionsStrategySectionContext(section)
    : ''
  const mediumHint = isHumanSceneCategory
    ? (isPhotoStyle
      ? 'Generate a 1:1 square photorealistic human-centered education photo for a Korean admissions and study-strategy blog image'
      : 'Generate a 1:1 square anime-inspired human-centered education illustration for a Korean admissions and study-strategy blog image')
    : isKnowledgeInsight
    ? 'Generate a 1:1 square educational illustration asset to be displayed in a small slot of a Korean knowledge-sharing card'
    : isPhotoStyle
    ? 'Generate a 1:1 square realistic photo for a Korean education blog image'
    : 'Generate a 1:1 square illustration for a Korean education blog image'
  const sceneHint = isHumanSceneCategory
    ? (isPhotoStyle
      ? `Show one or two believable Korean people whose role matches the section, such as a student, parent, teacher, counselor, tutor, or mentor, inside one coherent real study scene. The action, facial expression, props, and location must clearly match the section topic and advice. Use real classrooms, libraries, desks, school corridors, counseling rooms, campus spaces, notebooks, exam papers, planners, or laptops only when they fit the section context. ${sectionContext} The full square frame must read as one authentic camera photograph, not a poster, collage, pattern sheet, or graphic card.`
      : `Show one or two Korean human characters in one coherent anime-inspired study scene that matches the section. The characters should look like students, parents, teachers, counselors, tutors, or mentors depending on the section topic. Their action, expression, clothing, props, and background must visually express the advice in the section. Use study desks, books, laptops, planners, exam sheets, libraries, classrooms, or counseling scenes only when they fit the section context. ${sectionContext} The full square frame must read as one polished animation-style key visual with human presence, not as icons, symbols, abstract patterns, or a poster layout.`)
    : isKnowledgeInsight
    ? `${versionConfig.subjectPrompt || 'Use one small educational motif related to the section topic.'} Use only one main motif, or at most two tightly related motifs, that directly match the section's idea "${section.heading}" and key phrase "${section.keyPhrase || section.heading}". The motif should feel like a clean textbook-side illustration, not a decorative wallpaper. If the section is about a study habit, use a directly relevant object such as a planner, notebook, timer, memory cue, or review cycle visual. If the section is about a social, humanities, or science idea, choose a literal symbol or object that represents that exact concept. Keep the motif compact, readable, perfectly centered on the canvas (its visual center aligned with the canvas center point with equal empty white margin on every side), and easy to recognize at a glance like a sticker or emoticon.`
    : isPhotoStyle
    ? `Show one authentic full-bleed real-world education photo related to "${section.heading}", such as students studying, a teacher guiding a class, a real classroom, a real school hallway, a library, a campus building, notebooks on a real desk, or hands-on learning materials. The image must look like it was captured with a camera in a real school or study environment, with one continuous photographic scene filling the entire square frame. Do not use tiled backgrounds, poster layouts, split zones, abstract patterns, or graphic panels.`
    : `${versionConfig.subjectPrompt || `Use only one or two simple study motifs such as ${variation.icons}, and keep them small and sparse rather than spread across the whole composition.`} ${topicPrompt}`
  const styleConstraint = isHumanSceneCategory
    ? (isPhotoStyle
      ? 'Use consistent documentary-style realism across the whole article: real human proportions, natural skin, authentic lighting, believable interiors, and camera-photo detail. Avoid illustration, CG, poster design, split layouts, infographic treatment, and decorative pattern backgrounds.'
      : 'Use consistent anime-style or animation-key-visual treatment across the whole article: expressive human characters, clean linework, polished shading, cinematic composition, and a believable study environment. Avoid realistic photo texture, generic icon posters, abstract pattern sheets, flat symbol-only layouts, and non-human compositions.')
    : isKnowledgeInsight
    ? `Do not generate a full background scene, landscape, room, poster, or card layout. The subject must be precisely centered on the canvas with even empty white margin on all four sides. Do not use people unless the concept absolutely requires a human action, and even then keep the figure simple and secondary. Avoid text, labels, many mini icons, repeated decorations, notebook paper textures, stickers, and collage composition. Prefer a single isolated object or one tiny object pair with bold linework and simplified color blocking. ${KNOWLEDGE_INSIGHT_CUTOUT_RULE} ${KNOWLEDGE_INSIGHT_NO_TEXT_RULE} The result should behave like one contextual illustration asset that the app will scale and place into a fixed card slot.`
    : isPhotoStyle
    ? 'Prefer realistic human presence, real interiors, natural classroom lighting, believable school furniture, real books and stationery, and genuine documentary-style composition. The whole image should read as a single real photograph rather than a designed card.'
    : isDefaultKeyword
      ? 'No realistic photos, no people. Keep four corner motifs only — never fill the inner 70% center area. Soft organic blob shapes in the four corners use the chosen palette color. Hand-drawn outline illustration with soft pastel fills, clean linework, gentle matte surfaces, and a calm uncluttered composition. Do not use notebook lines, paper textures, check patterns, chalkboard grain, white plates, badges, or text containers.'
    : versionConfig.version === 'image_keyword'
      ? 'No realistic photos, no people. Keep the illustration flat, simple, and poster-like. Prefer one clear object, broad empty space, and a smooth solid-color background that supports the main object. Do not use notebook lines, paper textures, check patterns, chalkboard grain, or many mini icons.'
      : 'No realistic photos, no people. Cute Korean educational style with a clean full-bleed composition.'
  const textRulePrompt = isHumanSceneCategory ? LATIN_NUMBER_ONLY_PROMPT : NO_LETTER_PROMPT

  return `${mediumHint} about "${section.heading}". ${styleHint} Color palette: ${paletteDesc}. ${sceneHint} ${versionConfig.layoutPrompt} ${DOM_TEXT_OVERLAY_PROMPT} ${textRulePrompt} ${styleConstraint} If the selected style suggests a solid color or subtle pattern background, keep it visually simple and readable under DOM text overlays.${extraHint}`
}

export async function generateBlogImages(sections, options = {}) {
  const reuseSingleBackground = !isHumanSceneBlogCategory(options)
    && !isAdmissionsStrategyKeywordCategory(options)
    && !isKnowledgeInsightCategory(options)
    && options.textOverlay !== 'without-text'
  const allSections = sections.filter(Boolean)
  const targetSections = reuseSingleBackground ? allSections.slice(0, 1) : allSections
  const sharedOverlayHeadline = isAdmissionsStrategyKeywordCategory(options)
    ? deriveBlogTitleKeywordHeadline(options.title || '')
    : ''
  const resolveOverlayHeadline = (section = {}) => {
    if (isAdmissionsStrategyKeywordCategory(options)) {
      return deriveBlogHeadline(section.keyPhrase || '', section.heading || '')
        || deriveBlogTitleKeywordHeadline(options.title || '')
    }

    const versionConfig = getBlogImageVersionConfig({ ...options, section })
    if (versionConfig.overlayMode === 'headline-only') {
      return deriveBlogHeadline(section.keyPhrase || '', section.heading || '')
        || deriveBlogTitleKeywordHeadline(options.title || '')
    }

    return sharedOverlayHeadline
  }

  const results = []
  for (let i = 0; i < targetSections.length; i += 1) {
    const section = targetSections[i]
    try {
      const generatedImageUrl = await generateImage(buildBlogImagePrompt(section, options, i), 2, options.signal)
      const imageUrl = isKnowledgeInsightCategory(options)
        ? await removeWhiteBackgroundFromDataUrl(generatedImageUrl)
        : generatedImageUrl
      results.push({
        heading: section.heading,
        imageUrl,
        keyPhrase: section.keyPhrase || section.heading,
        overlayHeadline: resolveOverlayHeadline(section) || undefined,
        style: 'overlay',
        variant: getBlogImageVersionConfig({ ...options, section }).variant,
        overlayMode: getBlogImageVersionConfig({ ...options, section }).overlayMode,
        overlayFont: getBlogImageVersionConfig({ ...options, section }).overlayFont,
        imageVersion: getBlogImageVersionConfig({ ...options, section }).version,
        subjectTheme: getBlogImageVersionConfig({ ...options, section }).subjectTheme,
      })
    } catch {
      results.push({
        heading: section.heading,
        imageUrl: null,
        keyPhrase: section.keyPhrase || section.heading,
        overlayHeadline: resolveOverlayHeadline(section) || undefined,
        style: 'overlay',
        variant: getBlogImageVersionConfig({ ...options, section }).variant,
        overlayMode: getBlogImageVersionConfig({ ...options, section }).overlayMode,
        overlayFont: getBlogImageVersionConfig({ ...options, section }).overlayFont,
        imageVersion: getBlogImageVersionConfig({ ...options, section }).version,
        subjectTheme: getBlogImageVersionConfig({ ...options, section }).subjectTheme,
      })
    }
  }

  if (reuseSingleBackground) {
    const sharedImage = results[0]?.imageUrl || null
    return allSections.map(section => ({
      heading: section.heading,
      imageUrl: sharedImage,
      keyPhrase: section.keyPhrase || section.heading,
      overlayHeadline: resolveOverlayHeadline(section) || undefined,
      style: 'overlay',
      variant: results[0]?.variant || getBlogImageVersionConfig(options).variant,
      overlayMode: results[0]?.overlayMode || getBlogImageVersionConfig(options).overlayMode,
      overlayFont: results[0]?.overlayFont || getBlogImageVersionConfig(options).overlayFont,
      imageVersion: results[0]?.imageVersion || getBlogImageVersionConfig(options).version,
      subjectTheme: results[0]?.subjectTheme || getBlogImageVersionConfig({ ...options, section }).subjectTheme,
    }))
  }

  return results
}
