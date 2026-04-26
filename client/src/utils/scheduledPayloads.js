function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

export function buildInstagramScheduledContent(source = {}) {
  const instagramContent = source?.instagramContent || source?.content || source || {}
  const rawImages = ensureArray(source?.instagramImages || source?.imageUrls)

  const imageUrls = rawImages
    .map((image) => {
      if (typeof image === 'string') return image
      return image?.imageUrl || image?.url || null
    })
    .filter(Boolean)

  const caption = instagramContent?.caption || ''
  const title = instagramContent?.title || instagramContent?.headline || instagramContent?.summary || ''

  return {
    title,
    caption,
    imageUrls,
  }
}
