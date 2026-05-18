// 플랫폼별 제한값 상수
export const PLATFORM_LIMITS = {
  instagram: {
    captionMax: 2200,
    hashtagMax: 30,
    aspectRatios: ['1:1', '4:5', '1.91:1'],
    videoMaxSeconds: { feed: 60, reels: 90 },
    imageMin: { width: 320, height: 320 },
    imageMax: { width: 1080, height: 1350 },
  },
  shorts: {
    titleMax: 100,
    descriptionMax: 5000,
    tagsTotalMax: 500,
    videoMaxSeconds: 60,
    aspectRatio: '9:16',
    minResolution: { width: 720, height: 1280 },
  },
}

/**
 * 인스타그램 콘텐츠 유효성 검사
 * @param {{ caption?: string, hashtags?: string[], imageUrls?: string[], videoSeconds?: number }} content
 * @returns {{ valid: boolean, errors: Array<{field: string, message: string}>, warnings: Array<{field: string, message: string}> }}
 */
export function validateInstagram(content = {}) {
  const errors = []
  const warnings = []
  const limits = PLATFORM_LIMITS.instagram

  const caption = content.caption || ''
  const hashtags = content.hashtags || []
  const imageUrls = content.imageUrls || []

  // 캡션 길이 검사
  if (caption.length > limits.captionMax) {
    errors.push({
      field: 'caption',
      message: `캡션이 너무 깁니다. 최대 ${limits.captionMax}자까지 허용됩니다. (현재: ${caption.length}자)`,
    })
  } else if (caption.length > limits.captionMax * 0.9) {
    warnings.push({
      field: 'caption',
      message: `캡션 길이가 한도(${limits.captionMax}자)에 근접하고 있습니다. (현재: ${caption.length}자)`,
    })
  }

  // 해시태그 수 검사
  if (hashtags.length > limits.hashtagMax) {
    errors.push({
      field: 'hashtags',
      message: `해시태그가 너무 많습니다. 최대 ${limits.hashtagMax}개까지 허용됩니다. (현재: ${hashtags.length}개)`,
    })
  } else if (hashtags.length > limits.hashtagMax * 0.9) {
    warnings.push({
      field: 'hashtags',
      message: `해시태그 수가 한도(${limits.hashtagMax}개)에 근접합니다. (현재: ${hashtags.length}개)`,
    })
  }

  // 이미지 없음 경고
  if (imageUrls.length === 0) {
    warnings.push({
      field: 'imageUrls',
      message: '이미지가 없습니다. 인스타그램 게시물에는 이미지를 첨부하는 것이 좋습니다.',
    })
  }

  // 캐러셀 최대 10장
  if (imageUrls.length > 10) {
    errors.push({
      field: 'imageUrls',
      message: `이미지는 최대 10장까지 업로드할 수 있습니다. (현재: ${imageUrls.length}장)`,
    })
  }

  // 동영상 길이 검사
  if (content.videoSeconds !== undefined) {
    if (content.isReel && content.videoSeconds > limits.videoMaxSeconds.reels) {
      errors.push({
        field: 'videoSeconds',
        message: `릴스 영상 길이가 초과되었습니다. 최대 ${limits.videoMaxSeconds.reels}초까지 허용됩니다. (현재: ${content.videoSeconds}초)`,
      })
    } else if (!content.isReel && content.videoSeconds > limits.videoMaxSeconds.feed) {
      errors.push({
        field: 'videoSeconds',
        message: `피드 영상 길이가 초과되었습니다. 최대 ${limits.videoMaxSeconds.feed}초까지 허용됩니다. (현재: ${content.videoSeconds}초)`,
      })
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * 유튜브 쇼츠/릴스 콘텐츠 유효성 검사
 * @param {{ title?: string, description?: string, tags?: string[], videoSeconds?: number }} content
 * @returns {{ valid: boolean, errors: Array<{field: string, message: string}>, warnings: Array<{field: string, message: string}> }}
 */
export function validateYouTubeShorts(content = {}) {
  const errors = []
  const warnings = []
  const limits = PLATFORM_LIMITS.shorts

  const title = content.title || ''
  const description = content.description || ''
  const tags = content.tags || []

  // 제목 검사
  if (!title.trim()) {
    errors.push({
      field: 'title',
      message: '제목을 입력해주세요.',
    })
  } else if (title.length > limits.titleMax) {
    errors.push({
      field: 'title',
      message: `제목이 너무 깁니다. 최대 ${limits.titleMax}자까지 허용됩니다. (현재: ${title.length}자)`,
    })
  }

  // 설명 길이 검사
  if (description.length > limits.descriptionMax) {
    errors.push({
      field: 'description',
      message: `설명이 너무 깁니다. 최대 ${limits.descriptionMax}자까지 허용됩니다. (현재: ${description.length}자)`,
    })
  }

  // 태그 총 길이 검사
  const tagsTotal = tags.join(',').length
  if (tagsTotal > limits.tagsTotalMax) {
    errors.push({
      field: 'tags',
      message: `태그 전체 길이가 초과되었습니다. 최대 ${limits.tagsTotalMax}자까지 허용됩니다. (현재: ${tagsTotal}자)`,
    })
  }

  // 영상 길이 검사
  if (content.videoSeconds !== undefined) {
    if (content.videoSeconds > limits.videoMaxSeconds) {
      errors.push({
        field: 'videoSeconds',
        message: `유튜브 쇼츠/릴스는 최대 ${limits.videoMaxSeconds}초까지 허용됩니다. (현재: ${content.videoSeconds}초)`,
      })
    }
  } else {
    warnings.push({
      field: 'videoSeconds',
      message: '영상 길이를 확인할 수 없습니다. 유튜브 쇼츠/릴스는 최대 60초입니다.',
    })
  }

  // #Shorts 태그 권장
  const hasShorts = tags.some(t => t.toLowerCase() === 'shorts') ||
    title.includes('#Shorts') || description.includes('#Shorts')
  if (!hasShorts) {
    warnings.push({
      field: 'tags',
      message: '숏츠 노출을 위해 #Shorts 태그를 추가하는 것을 권장합니다.',
    })
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * 이미지 비율이 목표 비율과 일치하는지 검사 (허용 오차 2%)
 * @param {number} width
 * @param {number} height
 * @param {string} target - '1:1', '4:5', '9:16' 등
 * @returns {boolean}
 */
export function validateAspectRatio(width, height, target) {
  if (!width || !height || !target) return false
  const [tw, th] = target.split(':').map(Number)
  if (!tw || !th) return false
  const actual = width / height
  const expected = tw / th
  const tolerance = 0.02
  return Math.abs(actual - expected) / expected <= tolerance
}

/**
 * 텍스트를 최대 길이로 자름
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
export function truncate(text, max) {
  if (!text) return ''
  if (text.length <= max) return text
  return text.slice(0, max)
}

/**
 * 해시태그 배열에서 최대 개수만큼만 반환
 * @param {string[]} hashtags
 * @param {number} max
 * @returns {string[]}
 */
export function stripExtraHashtags(hashtags, max) {
  if (!Array.isArray(hashtags)) return []
  return hashtags.slice(0, max)
}

/**
 * 유효성 검사 결과를 한국어 요약 문자열로 반환
 * @param {{ valid: boolean, errors: Array<{field: string, message: string}>, warnings: Array<{field: string, message: string}> }} result
 * @returns {string}
 */
export function summarizeValidation(result) {
  if (!result) return '유효성 검사 결과가 없습니다.'

  if (result.valid && result.warnings.length === 0) {
    return '모든 항목이 유효합니다.'
  }

  const parts = []

  if (!result.valid) {
    parts.push(`오류 ${result.errors.length}개: ${result.errors.map(e => e.message).join(' / ')}`)
  }

  if (result.warnings.length > 0) {
    parts.push(`경고 ${result.warnings.length}개: ${result.warnings.map(w => w.message).join(' / ')}`)
  }

  return parts.join(' | ')
}
