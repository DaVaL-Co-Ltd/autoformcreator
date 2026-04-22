import { PLATFORM_LIMITS, truncate, stripExtraHashtags } from './platformValidator'

/**
 * 내부 instagramContent를 Instagram API 요청 바디 형태로 변환
 * @param {{ title?: string, body?: string, caption?: string, hashtags?: string[], cardTopics?: string[] }} instagramContent
 * @param {string[]} imageUrls
 * @returns {{ type: string, caption: string, hashtags: string[], imageUrls: string[] }}
 */
export function formatInstagramRequest(instagramContent = {}, imageUrls = []) {
  const limits = PLATFORM_LIMITS.instagram
  const normalizedImageUrls = imageUrls.filter(Boolean).slice(0, 1)

  // caption 필드 우선, 없으면 body 사용
  const rawCaption = instagramContent.caption || instagramContent.body || instagramContent.title || ''
  const rawHashtags = instagramContent.hashtags || []

  const caption = truncate(rawCaption, limits.captionMax)
  const hashtags = stripExtraHashtags(rawHashtags, limits.hashtagMax)

  console.log('[platformFormatter] formatInstagramRequest', {
    type: 'image',
    captionLength: caption.length,
    hashtagCount: hashtags.length,
    imageCount: normalizedImageUrls.length,
  })

  // caption + hashtags 합쳐서 최종 caption 생성 (인스타는 별도 태그 필드 없음)
  const tagText = hashtags
    .map(t => (String(t).startsWith('#') ? t : `#${t}`))
    .join(' ')
  const fullCaption = tagText ? `${caption}\n\n${tagText}` : caption

  return {
    type: 'image',
    caption: fullCaption,
    hashtags,
    imageUrls: normalizedImageUrls,
  }
}

/**
 * 내부 shortsScript + videoUrl을 YouTube API 요청 바디 형태로 변환
 * @param {{ title?: string, hook?: string, scenes?: Array<{narration?: string}>, cta?: string, hashtags?: string[] }} shortsScript
 * @param {string} videoUrl
 * @returns {{ snippet: { title: string, description: string, tags: string[], categoryId: string }, status: object, videoUrl: string }}
 */
export function formatYouTubeRequest(shortsScript = {}, videoUrl = '') {
  const limits = PLATFORM_LIMITS.shorts

  // 제목: uploadTitle 우선, 없으면 script title
  const rawTitle = shortsScript.uploadTitle || shortsScript.title || '유튜브 숏츠'
  const shortsTag = ' #Shorts'
  const titleBase = truncate(rawTitle, limits.titleMax - shortsTag.length)
  const title = titleBase.includes('#Shorts') ? titleBase : titleBase + shortsTag

  // 설명: uploadDescription 우선, 없으면 hook+scenes+cta 조합
  let rawDescription
  if (shortsScript.uploadDescription) {
    rawDescription = shortsScript.uploadDescription
  } else {
    const descParts = []
    if (shortsScript.hook) descParts.push(shortsScript.hook)
    if (Array.isArray(shortsScript.scenes)) {
      shortsScript.scenes.forEach((scene, i) => {
        if (scene.narration) descParts.push(`${i + 1}. ${scene.narration}`)
      })
    }
    if (shortsScript.cta) descParts.push(`\n${shortsScript.cta}`)
    rawDescription = descParts.join('\n')
  }
  const description = truncate(rawDescription, limits.descriptionMax)

  // 태그: hashtags에서 # 제거 후 사용, Shorts 태그 추가
  const rawTags = (shortsScript.hashtags || []).map(t => t.replace(/^#/, ''))
  if (!rawTags.includes('Shorts')) rawTags.unshift('Shorts')

  // 태그 총 길이 제한
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
      categoryId: '22', // People & Blogs
    },
    status: {
      privacyStatus: 'public',
      selfDeclaredMadeForKids: false,
    },
    videoUrl,
  }
}
