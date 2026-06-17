// 숏폼(유튜브 쇼츠 / 인스타그램 릴스) 업로드 상태 유틸
//
// upload_status.shorts 는 두 플랫폼을 "따로" 추적한다.
//   {
//     status: 'not_uploaded' | 'scheduled' | 'uploaded',   // 목록 필터/집계용 집계값
//     platforms: {
//       instagram: { status, uploadedAt, uploadedUrl, scheduledAt, scheduledId, accounts, accountNames, accountIds },
//       youtube:   { status, uploadedAt, uploadedUrl, scheduledAt, scheduledId, accounts, accountNames, accountIds },
//     },
//     uploadedUrls: { instagram, youtube },
//     uploadedUrl, uploadedAt,
//   }
//
// 한 플랫폼에만 업로드해도 나머지 플랫폼은 계속 업로드/예약할 수 있어야 한다.

export const SHORTS_PLATFORM_KEYS = ['instagram', 'youtube']

export const SHORTS_PLATFORMS = [
  { key: 'instagram', label: '인스타그램 릴스', shortLabel: '인스타그램', schedulePlatform: 'shorts_instagram' },
  { key: 'youtube', label: '유튜브 쇼츠', shortLabel: '유튜브', schedulePlatform: 'shorts_youtube' },
]

const VALID_STATUSES = ['not_uploaded', 'scheduled', 'uploaded']

// scheduled_uploads.platform('shorts_instagram') → 'instagram'
export function shortsPlatformFromSchedule(schedulePlatform) {
  if (schedulePlatform === 'shorts_instagram') return 'instagram'
  if (schedulePlatform === 'shorts_youtube') return 'youtube'
  return null
}

// 'instagram' → 'shorts_instagram' (scheduled_uploads.platform 값)
export function shortsSchedulePlatform(platformKey) {
  return platformKey === 'youtube' ? 'shorts_youtube' : 'shorts_instagram'
}

export function normalizeShortsPlatformMeta(meta) {
  const source = meta && typeof meta === 'object' ? meta : {}
  const status = VALID_STATUSES.includes(source.status) ? source.status : 'not_uploaded'
  const accounts = Array.isArray(source.accounts)
    ? source.accounts
        .map((account) => ({
          id: account?.id ? String(account.id) : '',
          name: String(account?.name || account?.displayName || account?.username || '').trim(),
        }))
        .filter((account) => account.id || account.name)
    : []
  const accountNames = Array.isArray(source.accountNames)
    ? source.accountNames.map((name) => String(name || '').trim()).filter(Boolean)
    : accounts.map((account) => account.name).filter(Boolean)
  const accountIds = Array.isArray(source.accountIds)
    ? source.accountIds.map((id) => String(id || '').trim()).filter(Boolean)
    : accounts.map((account) => account.id).filter(Boolean)
  return {
    status,
    uploadedAt: source.uploadedAt || null,
    uploadedUrl: source.uploadedUrl || null,
    scheduledAt: source.scheduledAt || null,
    scheduledId: source.scheduledId || null,
    accountResults: source.accountResults || null,
    failures: Array.isArray(source.failures) ? source.failures : [],
    accounts,
    accountNames,
    accountIds,
  }
}

// upload_status.shorts → { instagram: {...}, youtube: {...} }
// platforms 필드가 없던 레거시 데이터(단일 status)도 분해해서 호환한다.
export function deriveShortsPlatforms(shortsMeta) {
  const meta = shortsMeta && typeof shortsMeta === 'object' ? shortsMeta : {}

  if (meta.platforms && typeof meta.platforms === 'object') {
    return {
      instagram: normalizeShortsPlatformMeta(meta.platforms.instagram),
      youtube: normalizeShortsPlatformMeta(meta.platforms.youtube),
    }
  }

  // 레거시: platforms 가 없던 시절의 단일 status 데이터를 플랫폼별로 분해한다.
  const uploadedUrls = meta.uploadedUrls && typeof meta.uploadedUrls === 'object' ? meta.uploadedUrls : {}
  const targets = meta.uploadTargets && typeof meta.uploadTargets === 'object' ? meta.uploadTargets : null
  const result = {}
  for (const key of SHORTS_PLATFORM_KEYS) {
    if (uploadedUrls[key]) {
      result[key] = normalizeShortsPlatformMeta({
        status: 'uploaded',
        uploadedUrl: uploadedUrls[key],
        uploadedAt: meta.uploadedAt || null,
      })
    } else if (meta.status === 'uploaded' && (!targets || targets[key])) {
      result[key] = normalizeShortsPlatformMeta({ status: 'uploaded', uploadedAt: meta.uploadedAt || null })
    } else if (meta.status === 'scheduled' && (!targets || targets[key])) {
      result[key] = normalizeShortsPlatformMeta({ status: 'scheduled', scheduledAt: meta.scheduledAt || null })
    } else {
      result[key] = normalizeShortsPlatformMeta({ status: 'not_uploaded' })
    }
  }
  return result
}

// 두 플랫폼 상태를 목록 필터/집계용 단일 status 로 환산한다.
// - 둘 다 업로드됨 → uploaded
// - 하나라도 미업로드 → not_uploaded (아직 할 일이 남음)
// - 그 외(업로드+예약 조합) → scheduled
export function aggregateShortsStatus(platforms) {
  const list = SHORTS_PLATFORM_KEYS.map((key) => platforms?.[key]?.status || 'not_uploaded')
  if (list.every((status) => status === 'uploaded')) return 'uploaded'
  if (list.some((status) => status === 'not_uploaded')) return 'not_uploaded'
  return 'scheduled'
}

// 기존 shorts 메타에 플랫폼별 patch 를 병합한 "완전한" upload_status.shorts 객체를 만든다.
// 서버 updateUploadStatus 가 채널 객체를 통째로 교체하므로 항상 완전한 객체를 만들어 보낸다.
// patches 예: { instagram: { status: 'uploaded', uploadedUrl, uploadedAt } }
export function buildShortsUploadStatus(prevShortsMeta, patches = {}) {
  const platforms = deriveShortsPlatforms(prevShortsMeta)
  for (const key of SHORTS_PLATFORM_KEYS) {
    if (patches[key]) {
      platforms[key] = normalizeShortsPlatformMeta({ ...platforms[key], ...patches[key] })
    }
  }
  const uploadedUrls = {
    instagram: platforms.instagram.uploadedUrl || null,
    youtube: platforms.youtube.uploadedUrl || null,
  }
  const uploadedAts = SHORTS_PLATFORM_KEYS
    .map((key) => platforms[key].uploadedAt)
    .filter(Boolean)
    .sort()
  return {
    status: aggregateShortsStatus(platforms),
    platforms,
    uploadedUrls,
    uploadedUrl: uploadedUrls.instagram || uploadedUrls.youtube || null,
    uploadedAt: uploadedAts.length ? uploadedAts[uploadedAts.length - 1] : null,
  }
}
