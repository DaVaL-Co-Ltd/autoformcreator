import { uploadDataImageUrlToStorage } from '../services/storage'
import { cleanCardText as sharedCleanCardText } from './contentImageOverlay'
import { buildInstagramUploadImageUrls } from './uploadImageComposite'

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

const INSTAGRAM_CAPTION_MAX_LENGTH = 2200

function getCardSource(source = {}) {
  const instagramContent = source?.instagramContent || source?.content || source || {}
  const cards = ensureArray(instagramContent?.cards || instagramContent?.cardTopics)
  const rawImages = ensureArray(source?.instagramImages || source?.imageUrls)
  const renderedUrls = [
    ...ensureArray(source?.instaPngUrls || source?.renderedImageUrls),
    ...rawImages.map((image) => image?.renderedImageUrl || image?.pngUrl),
  ].filter(Boolean)

  return { instagramContent, cards, renderedUrls, rawImages }
}

function extractImageUrl(image) {
  if (typeof image === 'string') return image
  return image?.imageUrl || image?.url || image?.renderedImageUrl || image?.pngUrl || null
}

function trimCaption(text = '') {
  return String(text || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function normalizeScheduledImageUrls(imageUrls = []) {
  const urls = ensureArray(imageUrls).filter(Boolean)
  const normalized = []

  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index]
    if (typeof url === 'string' && url.startsWith('data:image/')) {
      try {
        normalized.push(await uploadDataImageUrlToStorage(url, `instagram-scheduled-${index + 1}`))
      } catch (error) {
        console.warn('[scheduledPayloads] 예약 이미지 Storage 업로드 실패, 서버 정규화로 대체:', error)
        normalized.push(url)
      }
      continue
    }
    normalized.push(url)
  }

  return normalized
}

export function buildInstagramCaption(instagramContent = {}) {
  const baseCaption = trimCaption(
    instagramContent?.caption || instagramContent?.body || instagramContent?.title || '',
  )
  return baseCaption.slice(0, INSTAGRAM_CAPTION_MAX_LENGTH).trim()
}

export function buildInstagramScheduledContent(source = {}) {
  const { instagramContent, renderedUrls, rawImages } = getCardSource(source)
  const fallbackUrls = rawImages.map(extractImageUrl).filter(Boolean)
  const imageUrls = renderedUrls.length > 0 ? renderedUrls : fallbackUrls

  const baseCaption = buildInstagramCaption(instagramContent)
  const hashtagText = ensureArray(instagramContent?.hashtags)
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
    .join(' ')
  const caption = hashtagText ? `${baseCaption}\n\n${hashtagText}`.trim() : baseCaption

  const title = sharedCleanCardText(
    instagramContent?.title || instagramContent?.headline || instagramContent?.summary || '',
  )

  return {
    title,
    caption,
    imageUrls,
  }
}

export async function buildInstagramScheduledUploadContent(source = {}) {
  const baseContent = buildInstagramScheduledContent(source)
  const { instagramContent, cards, rawImages } = getCardSource(source)

  if (cards.length === 0 || rawImages.length === 0 || typeof document === 'undefined') {
    return baseContent
  }

  const imageUrls = await buildInstagramUploadImageUrls({
    instagramContent,
    instagramImages: rawImages,
  })
  const normalizedImageUrls = await normalizeScheduledImageUrls(
    imageUrls.length > 0 ? imageUrls : baseContent.imageUrls,
  )

  return {
    ...baseContent,
    imageUrls: normalizedImageUrls,
  }
}
