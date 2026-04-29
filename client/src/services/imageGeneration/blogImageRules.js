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

function getBlogPalette(section, options = {}) {
  return options.mainColor && options.mainColor !== 'auto' && COLOR_PROMPTS[options.mainColor]
    ? COLOR_PROMPTS[options.mainColor]
    : pickPalette(`${section.heading}|${section.keyPhrase || ''}|${options.imageStyle || ''}|blog`, BLOG_AUTO_COLOR_PALETTES)
}

function buildBlogImagePrompt(section, options = {}, index = 0) {
  const styleHint = getStylePrompt(options.imageStyle)
  const isPhotoStyle = options.imageStyle === 'photo'
  const variation = BLOG_VISUAL_VARIATIONS[index % BLOG_VISUAL_VARIATIONS.length]
  const paletteDesc = getBlogPalette(section, options)
  const extraHint = options.extra ? ` ${options.extra}.` : ''
  const mediumHint = isPhotoStyle
    ? 'Generate a 1:1 square realistic photo for a Korean education blog image'
    : 'Generate a 1:1 square illustration for a Korean education blog image'
  const sceneHint = isPhotoStyle
    ? `Show one authentic full-bleed real-world education photo related to "${section.heading}", such as students studying, a teacher guiding a class, a real classroom, a real school hallway, a library, a campus building, notebooks on a real desk, or hands-on learning materials. The image must look like it was captured with a camera in a real school or study environment, with one continuous photographic scene filling the entire square frame. Do not use tiled backgrounds, poster layouts, split zones, abstract patterns, or graphic panels.`
    : `Include visual elements such as ${variation.icons} across the whole composition.`
  const styleConstraint = isPhotoStyle
    ? 'Prefer realistic human presence, real interiors, natural classroom lighting, believable school furniture, real books and stationery, and genuine documentary-style composition. The whole image should read as a single real photograph rather than a designed card.'
    : 'No realistic photos, no people. Cute Korean educational style with a clean full-bleed composition.'

  return `${mediumHint} about "${section.heading}". ${styleHint} Color palette: ${paletteDesc}. ${sceneHint} Fill the full canvas with a cohesive composition. DO NOT leave an empty center for text. DO NOT add any placeholder panel, blurred box, translucent square, floating frame, empty badge, or reserved text area. ${DOM_TEXT_OVERLAY_PROMPT} ${NO_LETTER_PROMPT} ${styleConstraint} If the selected style suggests a solid color or subtle pattern background, keep it visually simple and readable under DOM text overlays.${extraHint}`
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

  if (reuseSingleBackground) {
    const sharedImage = results[0]?.imageUrl || null
    return allSections.map(section => ({
      heading: section.heading,
      imageUrl: sharedImage,
      keyPhrase: section.keyPhrase || section.heading,
      style: 'overlay',
    }))
  }

  return results
}
