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

// 해시태그 배열을 "#a #b #c" 한 줄 문자열로 변환. 영상 설명 맨 뒤에 붙인다.
export function buildYoutubeHashtagLine(hashtags = []) {
  const tags = (Array.isArray(hashtags) ? hashtags : [])
    .map((tag) => String(tag || '').trim().replace(/^#+/, '').trim())
    .filter(Boolean)
  if (tags.length === 0) return ''
  return tags.map((tag) => `#${tag}`).join(' ')
}

// 영상 설명 뒤에 한 줄 공백을 두고 해시태그 줄을 덧붙인다. descriptionMax 한도를 넘지 않도록 본문을 먼저 자른다.
export function appendYoutubeHashtags(description = '', hashtags = [], descriptionMax = 5000) {
  const hashtagLine = buildYoutubeHashtagLine(hashtags)
  const base = String(description || '')
  if (!hashtagLine) return base.slice(0, descriptionMax)
  const budget = Math.max(0, descriptionMax - hashtagLine.length - 2)
  return `${base.slice(0, budget).trimEnd()}\n\n${hashtagLine}`
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
 * Convert generated shorts content into the Instagram Reels upload payload.
 * @param {{ title?: string, uploadTitle?: string, uploadDescription?: string, hook?: string, scenes?: Array<{ narration?: string }>, cta?: string, hashtags?: string[] }} shortsScript
 * @param {string} videoUrl
 * @returns {{ videoUrl: string, caption: string, hashtags: string[] }}
 */
export function formatInstagramReelsRequest(shortsScript = {}, videoUrl = '') {
  const limits = PLATFORM_LIMITS.instagram

  let rawCaption
  if (shortsScript.uploadDescription) {
    rawCaption = stripMarkdownEmphasis(shortsScript.uploadDescription)
  } else {
    const captionParts = []
    if (shortsScript.uploadTitle || shortsScript.title) {
      captionParts.push(stripMarkdownEmphasis(shortsScript.uploadTitle || shortsScript.title))
    }
    if (shortsScript.hook) captionParts.push(stripMarkdownEmphasis(shortsScript.hook))
    if (Array.isArray(shortsScript.scenes)) {
      shortsScript.scenes.forEach((scene, index) => {
        const text = scene?.caption || scene?.narration
        if (text) {
          captionParts.push(`${index + 1}. ${stripMarkdownEmphasis(text)}`)
        }
      })
    }
    if (shortsScript.cta) captionParts.push(stripMarkdownEmphasis(shortsScript.cta))
    rawCaption = captionParts.join('\n')
  }

  const caption = truncate(rawCaption, limits.captionMax)
  const hashtags = stripExtraHashtags(shortsScript.hashtags || [], limits.hashtagMax)
  const tagText = hashtags
    .map((tag) => (String(tag).startsWith('#') ? tag : `#${tag}`))
    .join(' ')
  const fullCaption = tagText ? `${caption}\n\n${tagText}` : caption

  console.log('[platformFormatter] formatInstagramReelsRequest', {
    captionLength: fullCaption.length,
    hashtagCount: hashtags.length,
    videoUrl,
  })

  return {
    videoUrl,
    caption: fullCaption,
    hashtags,
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

  const rawTitle = stripMarkdownEmphasis(shortsScript.uploadTitle || shortsScript.title || '유튜브 쇼츠/릴스')
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
        const text = scene.caption || scene.narration
        if (text) {
          descParts.push(`${index + 1}. ${stripMarkdownEmphasis(text)}`)
        }
      })
    }
    if (shortsScript.cta) descParts.push(`\n${stripMarkdownEmphasis(shortsScript.cta)}`)
    rawDescription = descParts.join('\n')
  }
  const description = appendYoutubeHashtags(
    truncate(rawDescription, limits.descriptionMax),
    shortsScript.hashtags,
    limits.descriptionMax,
  )

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
