export const BLOG_HEADING_STYLE = {
  HEADING: 'heading',
  LINE_QUOTE: 'line-quote',
  POSTIT: 'postit',
}

export const AUTO_BLOG_QUOTE_CATEGORY_ID = 'admissions_strategy_style_1'

const QUOTE_STYLE_LONG_HEADING_THRESHOLD = 20

function normalizeHeadingText(value = '') {
  return String(value || '').trim()
}

function measureHeadingLength(value = '') {
  return normalizeHeadingText(value).length
}

function getSectionHeadingLengths(sections = []) {
  return (Array.isArray(sections) ? sections : [])
    .map((section) => measureHeadingLength(section?.heading))
    .filter((length) => length > 0)
}

export function isAutomaticBlogQuoteCategory(categoryPath = '') {
  return String(categoryPath || '').trim() === AUTO_BLOG_QUOTE_CATEGORY_ID
}

export function selectAutomaticBlogQuoteStyle(sections = []) {
  const headingLengths = getSectionHeadingLengths(sections)
  if (!headingLengths.length) {
    return BLOG_HEADING_STYLE.POSTIT
  }

  const hasLongHeading = headingLengths.some((length) => length >= QUOTE_STYLE_LONG_HEADING_THRESHOLD)

  return hasLongHeading ? BLOG_HEADING_STYLE.LINE_QUOTE : BLOG_HEADING_STYLE.POSTIT
}

export function resolveBlogHeadingStyle(categoryPath = '', sections = []) {
  if (!isAutomaticBlogQuoteCategory(categoryPath)) {
    return BLOG_HEADING_STYLE.HEADING
  }

  return selectAutomaticBlogQuoteStyle(sections)
}

export function getBlogHeadingStyleLabel(style = BLOG_HEADING_STYLE.HEADING) {
  if (style === BLOG_HEADING_STYLE.LINE_QUOTE) return '라인 & 따옴표'
  if (style === BLOG_HEADING_STYLE.POSTIT) return '포스트잇'
  return '기본 제목'
}

export function buildBlogHeadingPrefix(headingText = '', style = BLOG_HEADING_STYLE.HEADING) {
  const trimmed = normalizeHeadingText(headingText)
  if (!trimmed) return ''

  if (style === BLOG_HEADING_STYLE.LINE_QUOTE || style === BLOG_HEADING_STYLE.POSTIT) {
    return `> ${trimmed}\n`
  }

  return `## **${trimmed}**\n`
}
