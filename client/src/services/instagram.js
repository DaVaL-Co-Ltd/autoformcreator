// Instagram Graph API 서비스 (현재 mock - 실제 API 키 받으면 교체)
// 모든 함수는 현재 mock 응답을 반환합니다.

import { get as getPlatformConnection } from '../utils/platformConnections'
import { PLATFORM_LIMITS, truncate, stripExtraHashtags } from '../utils/platformValidator'

/**
 * 인스타그램 계정 연결 여부 확인
 * @returns {boolean}
 */
export function isConnected() {
  const conn = getPlatformConnection('instagram')
  return conn?.connected === true
}

/**
 * Mock: 단일 이미지 게시물 발행
 * @param {{ imageUrl: string, caption: string, hashtags?: string[] }} params
 * @returns {Promise<{ success: boolean, mediaId: string, permalink: string }>}
 */
export async function publishImage({ imageUrl, caption, hashtags = [] }) {
  if (!isConnected()) {
    throw new Error('인스타그램 계정이 연결되지 않았습니다')
  }

  const finalCaption = formatContent({ caption, hashtags })
  console.log('[Instagram] publishImage 요청:', { imageUrl, caption: finalCaption })

  // TODO: 실제 Meta Graph API 호출
  // POST {ig-user-id}/media (container 생성)
  // POST {ig-user-id}/media_publish (container 발행)
  await new Promise(r => setTimeout(r, 2000))

  const mockId = `mock_${Date.now()}`
  const result = {
    success: true,
    mock: true,
    mediaId: mockId,
    permalink: `https://instagram.com/p/${mockId}/`,
  }
  console.log('[Instagram] publishImage 응답 (mock):', result)
  return result
}

/**
 * Mock: 캐러셀 (다중 이미지) 게시물 발행
 * @param {{ images: string[], caption: string, hashtags?: string[] }} params
 * @returns {Promise<{ success: boolean, mediaId: string, permalink: string }>}
 */
export async function publishCarousel({ images = [], caption, hashtags = [] }) {
  if (!isConnected()) {
    throw new Error('인스타그램 계정이 연결되지 않았습니다')
  }

  const finalCaption = formatContent({ caption, hashtags })
  console.log('[Instagram] publishCarousel 요청:', { imageCount: images.length, caption: finalCaption })

  // TODO: 실제 Meta Graph API 호출
  // 각 이미지마다 POST {ig-user-id}/media (is_carousel_item=true)
  // POST {ig-user-id}/media (media_type=CAROUSEL)
  // POST {ig-user-id}/media_publish
  await new Promise(r => setTimeout(r, 2000))

  const mockId = `mock_${Date.now()}`
  const result = {
    success: true,
    mock: true,
    mediaId: mockId,
    permalink: `https://instagram.com/p/${mockId}/`,
  }
  console.log('[Instagram] publishCarousel 응답 (mock):', result)
  return result
}

/**
 * Mock: 릴스(동영상) 게시물 발행
 * @param {{ videoUrl: string, caption: string, hashtags?: string[], coverImageUrl?: string }} params
 * @returns {Promise<{ success: boolean, mediaId: string, permalink: string }>}
 */
export async function publishReel({ videoUrl, caption, hashtags = [], coverImageUrl = null }) {
  if (!isConnected()) {
    throw new Error('인스타그램 계정이 연결되지 않았습니다')
  }

  const finalCaption = formatContent({ caption, hashtags })
  console.log('[Instagram] publishReel 요청:', { videoUrl, caption: finalCaption, coverImageUrl })

  // TODO: 실제 Meta Graph API 호출
  // POST {ig-user-id}/media (media_type=REELS)
  // POST {ig-user-id}/media_publish
  await new Promise(r => setTimeout(r, 2000))

  const mockId = `mock_${Date.now()}`
  const result = {
    success: true,
    mock: true,
    mediaId: mockId,
    permalink: `https://instagram.com/p/${mockId}/`,
  }
  console.log('[Instagram] publishReel 응답 (mock):', result)
  return result
}

/**
 * Mock: 미디어 인사이트 조회
 * @param {string} mediaId
 * @returns {Promise<{ impressions: number, reach: number, likes: number, comments: number, saved: number }>}
 */
export async function getMediaInsights(mediaId) {
  console.log('[Instagram] getMediaInsights 요청:', { mediaId })

  // TODO: GET {media-id}/insights?metric=impressions,reach,likes,comments,saved
  await new Promise(r => setTimeout(r, 500))

  const result = {
    success: true,
    mock: true,
    mediaId,
    impressions: Math.floor(Math.random() * 1000) + 100,
    reach: Math.floor(Math.random() * 800) + 80,
    likes: Math.floor(Math.random() * 200) + 10,
    comments: Math.floor(Math.random() * 30),
    saved: Math.floor(Math.random() * 50),
  }
  console.log('[Instagram] getMediaInsights 응답 (mock):', result)
  return result
}

/**
 * 캡션과 해시태그를 인스타그램 형식의 텍스트로 조합
 * @param {{ caption?: string, hashtags?: string[] }} params
 * @returns {string}
 */
export function formatContent({ caption = '', hashtags = [] }) {
  const limits = PLATFORM_LIMITS.instagram

  const trimmedCaption = truncate(caption.trim(), limits.captionMax)
  const trimmedHashtags = stripExtraHashtags(hashtags, limits.hashtagMax)

  // 해시태그 형식 정규화 (# 없으면 추가)
  const formattedTags = trimmedHashtags
    .map(t => (t.startsWith('#') ? t : `#${t}`))
    .join(' ')

  if (!formattedTags) return trimmedCaption

  const combined = `${trimmedCaption}\n\n${formattedTags}`
  return truncate(combined, limits.captionMax)
}
