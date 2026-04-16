// YouTube Data API v3 서비스 (현재 mock - 실제 API 키 받으면 교체)
// 모든 함수는 현재 mock 응답을 반환합니다.

import { get as getPlatformConnection } from '../utils/platformConnections'
import { PLATFORM_LIMITS, truncate, stripExtraHashtags } from '../utils/platformValidator'

/**
 * 유튜브 계정 연결 여부 확인
 * @returns {boolean}
 */
export function isConnected() {
  const conn = getPlatformConnection('shorts')
  return conn?.connected === true
}

/**
 * Mock: 유튜브 숏츠 영상 업로드
 * @param {{ videoFile: File|null, title: string, description?: string, tags?: string[], thumbnail?: string|null }} params
 * @returns {Promise<{ success: boolean, videoId: string, url: string }>}
 */
export async function uploadShorts({ videoFile, title, description = '', tags = [], thumbnail = null }) {
  if (!isConnected()) {
    throw new Error('유튜브 계정이 연결되지 않았습니다')
  }

  const snippet = formatContent({ title, description, tags })
  console.log('[YouTube] uploadShorts 요청:', {
    fileName: videoFile?.name || '(no file)',
    snippet,
    hasThumbnail: !!thumbnail,
  })

  // TODO: 실제 YouTube Data API v3 videos.insert 호출 (resumable upload)
  // 1) POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable
  // 2) PUT {resumable upload URI} with video binary
  await new Promise(r => setTimeout(r, 5000))

  const mockId = `mock_${Date.now()}`
  const result = {
    success: true,
    mock: true,
    videoId: mockId,
    url: `https://youtu.be/${mockId}`,
    snippet,
  }
  console.log('[YouTube] uploadShorts 응답 (mock):', result)
  return result
}

/**
 * Mock: 영상 처리 상태 조회
 * @param {string} videoId
 * @returns {Promise<{ videoId: string, status: string, processingProgress?: object }>}
 */
export async function getVideoStatus(videoId) {
  console.log('[YouTube] getVideoStatus 요청:', { videoId })

  // TODO: GET https://www.googleapis.com/youtube/v3/videos?part=status,processingDetails&id={videoId}
  await new Promise(r => setTimeout(r, 500))

  const result = {
    success: true,
    mock: true,
    videoId,
    status: 'uploaded',
    uploadStatus: 'processed',
    privacyStatus: 'public',
    processingProgress: {
      partsProcessed: 1,
      partsTotal: 1,
    },
  }
  console.log('[YouTube] getVideoStatus 응답 (mock):', result)
  return result
}

/**
 * 제목, 설명, 태그를 YouTube snippet 객체 형식으로 변환
 * @param {{ title?: string, description?: string, tags?: string[] }} params
 * @returns {{ title: string, description: string, tags: string[], categoryId: string }}
 */
export function formatContent({ title = '', description = '', tags = [] }) {
  const limits = PLATFORM_LIMITS.shorts

  const trimmedTitle = truncate(title.trim(), limits.titleMax)
  const trimmedDescription = truncate(description.trim(), limits.descriptionMax)

  // 태그 총 길이 제한
  const normalizedTags = tags.map(t => t.replace(/^#/, ''))
  const limitedTags = []
  let totalLen = 0
  for (const tag of normalizedTags) {
    if (totalLen + tag.length + 1 > limits.tagsTotalMax) break
    limitedTags.push(tag)
    totalLen += tag.length + 1
  }

  return {
    title: trimmedTitle,
    description: trimmedDescription,
    tags: limitedTags,
    categoryId: '22', // People & Blogs
  }
}
