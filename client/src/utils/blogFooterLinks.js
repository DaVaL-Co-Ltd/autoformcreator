const DEFAULT_BLOG_FOOTER_HEADING = '더 많은 콘텐츠는 여기에서 만나보세요.'

const LEGACY_FOOTER_META = {
  blog: { fallbackLabel: '블로그 바로가기' },
  newsletter: { fallbackLabel: '뉴스레터 바로가기' },
  instagram: { fallbackLabel: '인스타그램 바로가기' },
  shorts: { fallbackLabel: '쇼츠/릴스 바로가기' },
}

const ensureArray = (value) => (Array.isArray(value) ? value : [])

export function createEmptyBlogFooterLink() {
  return {
    id: `blog-footer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: '',
    url: '',
  }
}

export function normalizeBlogFooterLinks(links = []) {
  return ensureArray(links)
    .map((link, index) => ({
      id: String(link?.id || `blog-footer-${index}`),
      label: String(link?.label || '').trim(),
      url: String(link?.url || '').trim(),
    }))
}

function buildLegacyFooterLinks(platformConnections = {}) {
  return Object.entries(platformConnections || {})
    .map(([key, item]) => ({
      id: key,
      label: String(item?.displayName || LEGACY_FOOTER_META[key]?.fallbackLabel || key).trim(),
      url: String(item?.url || '').trim(),
    }))
    .filter((link) => link.url && link.url !== '#')
}

export function getBlogFooterConfig(platformConnections = {}) {
  const blogConnection = platformConnections?.blog || {}
  const heading = String(blogConnection.footerHeading || DEFAULT_BLOG_FOOTER_HEADING).trim() || DEFAULT_BLOG_FOOTER_HEADING
  const hasCustomLinks = Array.isArray(blogConnection.footerLinks)
  const links = hasCustomLinks
    ? normalizeBlogFooterLinks(blogConnection.footerLinks).filter((link) => link.label && link.url)
    : buildLegacyFooterLinks(platformConnections)

  return {
    heading,
    links,
    hasCustomLinks,
  }
}

export function buildBlogFooterDraft(platformConnections = {}) {
  const config = getBlogFooterConfig(platformConnections)

  return {
    heading: config.heading,
    links: config.links.length > 0
      ? config.links.map((link, index) => ({
        id: String(link.id || `blog-footer-${index}`),
        label: String(link.label || ''),
        url: String(link.url || ''),
      }))
      : [createEmptyBlogFooterLink()],
  }
}

export function appendBlogFooterText(content = '', footerConfig = {}) {
  const trimmedContent = String(content || '').trim()
  const heading = String(footerConfig?.heading || DEFAULT_BLOG_FOOTER_HEADING).trim() || DEFAULT_BLOG_FOOTER_HEADING
  const links = normalizeBlogFooterLinks(footerConfig?.links).filter((link) => link.label && link.url)

  if (links.length === 0) return trimmedContent

  // 데스크톱 RPA 의 parseBlogBlocks 는 "보이는 빈 줄 = 소스 줄바꿈 수 - 2" 로 동작한다.
  // heading→링크·링크→링크 사이 빈 줄 1개 → \n\n\n, 태그→heading 사이 빈 줄 2개 → \n\n\n\n.
  const footerText = `${heading}\n\n\n${links.map((link) => `${link.label}: ${link.url}`).join('\n\n\n')}`.trim()
  if (!footerText) return trimmedContent
  if (!trimmedContent) return footerText
  if (trimmedContent.includes(footerText)) return trimmedContent

  return `${trimmedContent}\n\n\n\n${footerText}`
}
