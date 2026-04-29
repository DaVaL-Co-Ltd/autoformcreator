import { PLATFORM_LIMITS, truncate, stripExtraHashtags } from './platformValidator'
import { buildInstagramCaption } from './scheduledPayloads'

export function stripMarkdownEmphasis(text = '') {
  return String(text || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .trim()
}

/**
 * Convert generated Instagram content into the Instagram upload payload.
 * @param {{ title?: string, body?: string, caption?: string, hashtags?: string[], cardTopics?: string[] }} instagramContent
 * @param {string[]} imageUrls
 * @returns {{ type: string, caption: string, hashtags: string[], imageUrls: string[] }}
 */
export function formatInstagramRequest(instagramContent = {}, imageUrls = []) {
  const limits = PLATFORM_LIMITS.instagram
  const normalizedImageUrls = imageUrls.filter(Boolean).slice(0, 10)

  const rawCaption = stripMarkdownEmphasis(buildInstagramCaption(instagramContent))
  const rawHashtags = instagramContent.hashtags || []

  const caption = truncate(rawCaption, limits.captionMax)
  const hashtags = stripExtraHashtags(rawHashtags, limits.hashtagMax)

  console.log('[platformFormatter] formatInstagramRequest', {
    type: normalizedImageUrls.length > 1 ? 'carousel' : 'image',
    captionLength: caption.length,
    hashtagCount: hashtags.length,
    imageCount: normalizedImageUrls.length,
  })

  const tagText = hashtags
    .map((tag) => (String(tag).startsWith('#') ? tag : `#${tag}`))
    .join(' ')
  const fullCaption = tagText ? `${caption}\n\n${tagText}` : caption

  return {
    type: normalizedImageUrls.length > 1 ? 'carousel' : 'image',
    caption: fullCaption,
    hashtags,
    imageUrls: normalizedImageUrls,
  }
}

/**
 * Convert generated shorts content into the YouTube upload payload.
 * @param {{ title?: string, uploadTitle?: string, uploadDescription?: string, hook?: string, scenes?: Array<{ narration?: string }>, cta?: string, hashtags?: string[] }} shortsScript
 * @param {string} videoUrl
 * @param {string | null} scheduledAt
 * @returns {{ snippet: { title: string, description: string, tags: string[], categoryId: string }, status: object, videoUrl: string }}
 */
export function formatYouTubeRequest(shortsScript = {}, videoUrl = '', scheduledAt = null) {
  const limits = PLATFORM_LIMITS.shorts

  const rawTitle = stripMarkdownEmphasis(shortsScript.uploadTitle || shortsScript.title || '유튜브 숏츠')
  const shortsTag = ' #Shorts'
  const titleBase = truncate(rawTitle, limits.titleMax - shortsTag.length)
  const title = titleBase.includes('#Shorts') ? titleBase : `${titleBase}${shortsTag}`

  let rawDescription
  if (shortsScript.uploadDescription) {
    rawDescription = stripMarkdownEmphasis(shortsScript.uploadDescription)
  } else {
    const descParts = []
    if (shortsScript.hook) descParts.push(stripMarkdownEmphasis(shortsScript.hook))
    if (Array.isArray(shortsScript.scenes)) {
      shortsScript.scenes.forEach((scene, index) => {
        if (scene.narration) {
          descParts.push(`${index + 1}. ${stripMarkdownEmphasis(scene.narration)}`)
        }
      })
    }
    if (shortsScript.cta) descParts.push(`\n${stripMarkdownEmphasis(shortsScript.cta)}`)
    rawDescription = descParts.join('\n')
  }
  const description = truncate(rawDescription, limits.descriptionMax)

  const rawTags = (shortsScript.hashtags || []).map((tag) => String(tag).replace(/^#/, ''))
  if (!rawTags.includes('Shorts')) rawTags.unshift('Shorts')

  const tags = []
  let totalLen = 0
  for (const tag of rawTags) {
    if (totalLen + tag.length + 1 > limits.tagsTotalMax) break
    tags.push(tag)
    totalLen += tag.length + 1
  }

  console.log('[platformFormatter] formatYouTubeRequest', {
    title,
    descriptionLength: description.length,
    tagCount: tags.length,
    videoUrl,
  })

  return {
    snippet: {
      title,
      description,
      tags,
      categoryId: '22',
    },
    status: scheduledAt
      ? {
          privacyStatus: 'private',
          publishAt: scheduledAt,
          selfDeclaredMadeForKids: false,
        }
      : {
          privacyStatus: 'public',
          selfDeclaredMadeForKids: false,
        },
    videoUrl,
  }
}
