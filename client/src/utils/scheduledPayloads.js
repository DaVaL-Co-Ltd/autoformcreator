function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

export function buildInstagramScheduledContent(source = {}) {
  const instagramContent = source?.instagramContent || source?.content || source || {}
  const renderedUrls = ensureArray(source?.instaPngUrls).filter(Boolean)
  const rawImages = ensureArray(source?.instagramImages || source?.imageUrls)

  const fallbackUrls = rawImages
    .map((image) => {
      if (typeof image === 'string') return image
      return image?.imageUrl || image?.url || null
    })
    .filter(Boolean)

  // 카드 PNG(텍스트 오버레이 포함)이 있으면 우선 사용하고, 없으면 AI 배경 이미지로 폴백한다.
  const imageUrls = renderedUrls.length > 0 ? renderedUrls : fallbackUrls

  const baseCaption = String(instagramContent?.caption || '').trim()
  const hashtagText = ensureArray(instagramContent?.hashtags)
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
    .join(' ')
  const caption = hashtagText ? `${baseCaption}\n\n${hashtagText}`.trim() : baseCaption

  const title = instagramContent?.title || instagramContent?.headline || instagramContent?.summary || ''

  return {
    title,
    caption,
    imageUrls,
  }
}
