import {
  COLOR_PROMPTS,
  DOM_TEXT_OVERLAY_PROMPT,
  NO_LETTER_PROMPT,
  generateImage,
  getStylePrompt,
  pickPalette,
} from './commonImageRules'

const BLOG_AUTO_COLOR_PALETTES = [
  'Color palette: muted slate blue, dusty navy, cool gray accents, soft mist highlights.',
  'Color palette: sage green, eucalyptus, soft cream, deep forest accents.',
  'Color palette: dusty mauve, muted plum, rose beige, warm ivory accents.',
  'Color palette: teal blue, desaturated cyan, deep petrol, pale stone highlights.',
  'Color palette: soft lavender gray, smoky violet, cool white, charcoal accents.',
  'Color palette: muted blush, rose taupe, sand beige, cocoa accents.',
]

const BLOG_VISUAL_VARIATIONS = [
  { icons: 'books, pencils, paper scrolls, reading glasses, study notes' },
  { icons: 'calculator, ruler, compass, geometric shapes, graph paper' },
  { icons: 'microscope, test tubes, magnifying glass, lightbulb, seedling' },
  { icons: 'notebook, graduation cap, star, clock, abacus' },
  { icons: 'trophy, target, checklist, heart, pencil case' },
]

const CONCEPT_DIGEST_CIRCLE_RATIO = 'about 68% of the canvas width and height'

const CONCEPT_DIGEST_THEME_PROMPTS = {
  math: `Create a simple math-study poster with a centered white circle title area on a square canvas. Put topic-related math motifs near the outer corners and keep them farther from the circle than before. If a motif would overlap the circle, allow the motif to sit on top of the circle instead of being hidden. Use simple motifs such as a compass, ruler, graph line, geometric sketch, or formula symbol. Use a smooth solid-color background that matches the motifs. Do not create separate circle badges, square badges, frames, or panels around the motifs. Keep the center clean enough for a large white circle title area. Do not render any Korean letters or Korean words anywhere in the image. English letters and numbers are acceptable only if they are part of the motif.`,
  science: `Create a simple science-study poster with a centered white circle title area on a square canvas. Put topic-related science motifs near the outer corners and keep them farther from the circle than before. If a motif would overlap the circle, allow the motif to sit on top of the circle instead of being hidden. Use simple motifs such as a beaker, microscope, atom icon, leaf-energy diagram, or experiment symbol. Use a smooth solid-color background that matches the motifs. Do not create separate circle badges, square badges, frames, or panels around the motifs. Keep the center clean enough for a large white circle title area. Do not render any Korean letters or Korean words anywhere in the image. English letters and numbers are acceptable only if they are part of the motif.`,
  korean: `Create a simple Korean language study poster with a centered white circle title area on a square canvas. Put topic-related reading and language motifs near the outer corners and keep them farther from the circle than before. If a motif would overlap the circle, allow the motif to sit on top of the circle instead of being hidden. Use simple motifs such as an open book, fountain pen, reading symbol, or text-flow visual cue. Use a smooth solid-color background that matches the motifs. Do not create separate circle badges, square badges, frames, or panels around the motifs. Keep the center clean enough for a large white circle title area. Do not render any Korean letters or Korean words anywhere in the image. English letters and numbers are acceptable only if they are part of the motif.`,
  social: `Create a simple social-studies poster with a centered white circle title area on a square canvas. Put topic-related social motifs near the outer corners and keep them farther from the circle than before. If a motif would overlap the circle, allow the motif to sit on top of the circle instead of being hidden. Use simple motifs such as a map, globe, chart, civic symbol, or economy icon. Use a smooth solid-color background that matches the motifs. Do not create separate circle badges, square badges, frames, or panels around the motifs. Keep the center clean enough for a large white circle title area. Do not render any Korean letters or Korean words anywhere in the image. English letters and numbers are acceptable only if they are part of the motif.`,
  english: `Create a simple English-study poster with a centered white circle title area on a square canvas. Put topic-related English-learning motifs near the outer corners and keep them farther from the circle than before. If a motif would overlap the circle, allow the motif to sit on top of the circle instead of being hidden. Use simple motifs such as a dictionary, reading symbol, speech bubble icon, or flash-card motif. Use a smooth solid-color background that matches the motifs. Avoid any readable letters. Do not create separate circle badges, square badges, frames, or panels around the motifs. Keep the center clean enough for a large white circle title area. Do not render any Korean letters or Korean words anywhere in the image. English letters and numbers are acceptable only if they are part of the motif.`,
  history: `Create a simple history-study poster with a centered white circle title area on a square canvas. Put topic-related history motifs near the outer corners and keep them farther from the circle than before. If a motif would overlap the circle, allow the motif to sit on top of the circle instead of being hidden. Use simple motifs such as an old map silhouette, artifact, document icon, or timeline cue. Use a smooth solid-color background that matches the motifs. Do not create separate circle badges, square badges, frames, or panels around the motifs. Keep the center clean enough for a large white circle title area. Do not render any Korean letters or Korean words anywhere in the image. English letters and numbers are acceptable only if they are part of the motif.`,
  computing: `Create a simple computing-study poster with a centered white circle title area on a square canvas. Put topic-related computing motifs near the outer corners and keep them farther from the circle than before. If a motif would overlap the circle, allow the motif to sit on top of the circle instead of being hidden. Use simple motifs such as a circuit line, logic block, laptop silhouette, or algorithm flow icon. Use a smooth solid-color background that matches the motifs. Do not create separate circle badges, square badges, frames, or panels around the motifs. Keep the center clean enough for a large white circle title area. Do not render any Korean letters or Korean words anywhere in the image. English letters and numbers are acceptable only if they are part of the motif.`,
  generic: `Create a simple textbook-study poster with a centered white circle title area on a square canvas. Put topic-related study motifs near the outer corners and keep them farther from the circle than before. If a motif would overlap the circle, allow the motif to sit on top of the circle instead of being hidden. Use simple motifs such as a pencil, ruler, notebook symbol, or learning object. Use a smooth solid-color background that matches the motifs. Do not create separate circle badges, square badges, frames, or panels around the motifs. Keep the center clean enough for a large white circle title area. Do not render any Korean letters or Korean words anywhere in the image. English letters and numbers are acceptable only if they are part of the motif.`,
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
    return 'Use one single study-related motif that directly represents the lesson topic.'
  }

  return `Choose simple visual motifs that are directly and specifically related to the lesson topic "${topic}". Put the four motifs in the four corners of the square canvas, farther from the white circle than before. For each corner, imagine a diagonal line from that corner to the center, locate the point where that diagonal touches the white circle edge, and place the motif in the band between the corner and that touch point, but biased toward the outer edge so it stays more separate from the circle. If a motif overlaps the circle, let the motif sit on top of the circle rather than hiding it. Do not add a separate background plate, badge, frame, circle, or square behind any motif. Do not pin the motif tightly to the corner if that would make it too small or too hidden. Do not fall back to generic subject icons unless the topic is too abstract. If the topic is about Fibonacci sequence, prefer a spiral, number growth pattern, shell-like mathematical spiral, or geometric sequence visual. If the topic is about photosynthesis, prefer a leaf, sunlight, chloroplast-like cell diagram, plant growth, or light-to-energy science visual. Keep the motifs literal, educational, and easy to recognize at a glance. Do not render any Korean letters or Korean words anywhere in the image. English letters and numbers are acceptable only if they are part of the motif.`
}

function inferConceptDigestTheme(section = {}, options = {}) {
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
      layoutPrompt: `Create a square educational cover with one smooth solid-color background and one perfectly centered white circle title area. Keep this white circle size fixed across outputs. Put the four illustrations in the four corners of the square canvas, but position them farther from the circle than before and closer to the outer edges. For each corner, imagine a diagonal from that corner to the center, find the point where the diagonal meets the circle edge, and place the illustration in the band between the corner and that point while biasing it toward the outside edge. If an illustration overlaps the circle, let it sit on top of the circle rather than being hidden. Do not create separate circle badges, square badges, framed labels, or sticker-like panels around each illustration. Do not place important objects inside the circle. Avoid chalkboard texture, notebook texture, graph paper, lined paper, check patterns, repeated doodles, many small props, decorative borders, collage layouts, stickers, confetti, wallpaper-like textures, or busy classroom clutter. The result should feel like a clean school poster cover with a stable circular center and simple corner motifs. Do not render any Korean letters or Korean words anywhere in the image. English letters and numbers are acceptable only if they are part of the motif.`,
      subjectTheme,
      subjectPrompt: CONCEPT_DIGEST_THEME_PROMPTS[subjectTheme] || CONCEPT_DIGEST_THEME_PROMPTS.generic,
    }
  }

  return {
    version: 'version1',
    variant: 'circle',
    overlayMode: 'headline-description',
    overlayFont: options.overlayFont || 'pretendard',
    subjectTheme: 'generic',
    layoutPrompt: 'Fill the full canvas with a cohesive composition. DO NOT leave an empty center for text. DO NOT add any placeholder panel, blurred box, translucent square, floating frame, empty badge, or reserved text area.',
    subjectPrompt: '',
  }
}

function getBlogPalette(section, options = {}) {
  return options.mainColor && options.mainColor !== 'auto' && COLOR_PROMPTS[options.mainColor]
    ? COLOR_PROMPTS[options.mainColor]
    : pickPalette(`${section.heading}|${section.keyPhrase || ''}|${options.imageStyle || ''}|blog`, BLOG_AUTO_COLOR_PALETTES)
}

function buildBlogImagePrompt(section, options = {}, index = 0) {
  const mergedOptions = { ...options, section }
  const versionConfig = getBlogImageVersionConfig(mergedOptions)
  const styleHint = versionConfig.version === 'image_keyword'
    ? getStylePrompt(options.imageStyle, 'Simple poster background style with a flat solid-color field, minimal shading, one clean educational motif, and a very uncluttered composition.')
    : getStylePrompt(options.imageStyle)
  const isPhotoStyle = options.imageStyle === 'photo'
  const variation = BLOG_VISUAL_VARIATIONS[index % BLOG_VISUAL_VARIATIONS.length]
  const paletteDesc = getBlogPalette(section, options)
  const extraHint = options.extra ? ` Highest-priority user override: ${options.extra}.` : ''
  const topicPrompt = versionConfig.version === 'image_keyword'
    ? describeConceptDigestTopic(section)
    : ''
  const mediumHint = isPhotoStyle
    ? 'Generate a 1:1 square realistic photo for a Korean education blog image'
    : 'Generate a 1:1 square illustration for a Korean education blog image'
  const sceneHint = isPhotoStyle
    ? `Show one authentic full-bleed real-world education photo related to "${section.heading}", such as students studying, a teacher guiding a class, a real classroom, a real school hallway, a library, a campus building, notebooks on a real desk, or hands-on learning materials. The image must look like it was captured with a camera in a real school or study environment, with one continuous photographic scene filling the entire square frame. Do not use tiled backgrounds, poster layouts, split zones, abstract patterns, or graphic panels.`
    : `${versionConfig.subjectPrompt || `Use only one or two simple study motifs such as ${variation.icons}, and keep them small and sparse rather than spread across the whole composition.`} ${topicPrompt}`
  const styleConstraint = isPhotoStyle
    ? 'Prefer realistic human presence, real interiors, natural classroom lighting, believable school furniture, real books and stationery, and genuine documentary-style composition. The whole image should read as a single real photograph rather than a designed card.'
    : versionConfig.version === 'image_keyword'
      ? 'No realistic photos, no people. Keep the illustration flat, simple, and poster-like. Prefer one clear object, broad empty space, and a smooth solid-color background that supports the main object. Do not use notebook lines, paper textures, check patterns, chalkboard grain, or many mini icons.'
      : 'No realistic photos, no people. Cute Korean educational style with a clean full-bleed composition.'

  return `${mediumHint} about "${section.heading}". ${styleHint} Color palette: ${paletteDesc}. ${sceneHint} ${versionConfig.layoutPrompt} ${DOM_TEXT_OVERLAY_PROMPT} ${NO_LETTER_PROMPT} ${styleConstraint} If the selected style suggests a solid color or subtle pattern background, keep it visually simple and readable under DOM text overlays.${extraHint}`
}

export async function generateBlogImages(sections, options = {}) {
  const reuseSingleBackground = options.textOverlay !== 'without-text'
  const allSections = sections.filter(Boolean)
  const targetSections = reuseSingleBackground ? allSections.slice(0, 1) : allSections

  const results = []
  for (let i = 0; i < targetSections.length; i += 1) {
    const section = targetSections[i]
    try {
      const imageUrl = await generateImage(buildBlogImagePrompt(section, options, i))
      results.push({
        heading: section.heading,
        imageUrl,
        keyPhrase: section.keyPhrase || section.heading,
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
