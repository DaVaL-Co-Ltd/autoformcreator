// Supabase Storage 고아 파일 정리 스크립트.
// extractions 테이블에서 참조되지 않는 extraction-images / extraction-videos
// 버킷 객체를 찾아 삭제한다. 기본은 dry-run; --live (또는 --execute) 플래그가
// 있어야 실제 삭제한다. 업로드 중인 새 파일을 실수로 지우지 않도록
// MIN_AGE_MS 보다 최근에 만들어진 객체는 보류한다.

const IMAGE_BUCKET = 'extraction-images'
const VIDEO_BUCKET = 'extraction-videos'
const LIST_PAGE_SIZE = 1000
const ROW_PAGE_SIZE = 1000
const MIN_AGE_MS = 60 * 60 * 1000 // 1시간

const args = new Set(process.argv.slice(2))
const isLive = args.has('--live') || args.has('--execute')
const mode = isLive ? 'LIVE' : 'DRY-RUN'

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL 와 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.')
  process.exit(1)
}

function authHeaders(extra = {}) {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    ...extra,
  }
}

function encodeObjectPath(objectPath) {
  return String(objectPath)
    .split('/')
    .map(seg => encodeURIComponent(seg))
    .join('/')
}

function extractStoragePath(url, bucket) {
  if (!url || typeof url !== 'string') return null
  const marker = `/storage/v1/object/public/${bucket}/`
  const i = url.indexOf(marker)
  if (i === -1) return null
  return decodeURIComponent(url.slice(i + marker.length).split('?')[0])
}

function collectImagePaths(images) {
  if (!Array.isArray(images)) return []
  return images
    .flatMap(img => [img?.imageUrl, img?.url, img?.renderedImageUrl, img?.pngUrl])
    .map(u => extractStoragePath(u, IMAGE_BUCKET))
    .filter(Boolean)
}

function collectVideoPaths(video) {
  if (!video || typeof video !== 'object') return []
  return [video.url, video.videoUrl, video.combinedVideoUrl, video.rawUrl]
    .map(u => extractStoragePath(u, VIDEO_BUCKET))
    .filter(Boolean)
}

async function listBucketObjects(bucket) {
  // 이 프로젝트는 모든 객체를 버킷 루트에 평면으로 저장하므로 단일 prefix 로 충분.
  const all = []
  let offset = 0
  for (;;) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        prefix: '',
        limit: LIST_PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Storage list (${bucket}) 실패 ${res.status}: ${text}`)
    }
    const items = await res.json()
    if (!Array.isArray(items) || items.length === 0) break
    all.push(...items)
    if (items.length < LIST_PAGE_SIZE) break
    offset += items.length
  }
  return all
}

async function listAllExtractionRefs() {
  const refs = { images: new Set(), videos: new Set() }
  let offset = 0
  for (;;) {
    const params = new URLSearchParams()
    params.set('select', 'id,blog_images,instagram_images,shorts_video')
    params.set('order', 'created_at.desc')
    const res = await fetch(`${SUPABASE_URL}/rest/v1/extractions?${params.toString()}`, {
      headers: authHeaders({
        Range: `${offset}-${offset + ROW_PAGE_SIZE - 1}`,
        'Range-Unit': 'items',
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Extractions 조회 실패 ${res.status}: ${text}`)
    }
    const rows = await res.json()
    if (!Array.isArray(rows) || rows.length === 0) break
    for (const row of rows) {
      for (const p of collectImagePaths(row.blog_images)) refs.images.add(p)
      for (const p of collectImagePaths(row.instagram_images)) refs.images.add(p)
      for (const p of collectVideoPaths(row.shorts_video)) refs.videos.add(p)
    }
    if (rows.length < ROW_PAGE_SIZE) break
    offset += rows.length
  }
  return refs
}

async function deleteObject(bucket, objectPath) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeObjectPath(objectPath)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Delete (${bucket}/${objectPath}) 실패 ${res.status}: ${text}`)
  }
}

function isTooNew(obj) {
  const createdAt = obj?.created_at ? Date.parse(obj.created_at) : null
  if (!createdAt) return false
  return Date.now() - createdAt < MIN_AGE_MS
}

async function cleanupBucket(bucket, referenced) {
  const objects = await listBucketObjects(bucket)
  const orphans = []
  let skippedNew = 0
  for (const obj of objects) {
    const name = obj?.name
    if (!name) continue
    if (referenced.has(name)) continue
    if (isTooNew(obj)) {
      skippedNew += 1
      continue
    }
    orphans.push(name)
  }
  console.log(`[${bucket}] 전체 ${objects.length}개 / 참조 ${referenced.size}개 / 고아 ${orphans.length}개 / 최근(<1h)이라 보류 ${skippedNew}개`)

  let deleted = 0
  let failed = 0
  for (const name of orphans) {
    if (!isLive) {
      console.log(`  [DRY] would delete: ${name}`)
      continue
    }
    try {
      await deleteObject(bucket, name)
      deleted += 1
      console.log(`  deleted: ${name}`)
    } catch (err) {
      failed += 1
      console.warn(`  failed: ${name} — ${err.message}`)
    }
  }
  return { total: objects.length, referenced: referenced.size, orphans: orphans.length, deleted, failed, skippedNew }
}

async function main() {
  console.log(`[cleanup-orphan-storage] 시작 (mode=${mode})`)
  const refs = await listAllExtractionRefs()
  console.log(`참조 수집 완료: 이미지 ${refs.images.size}개 / 영상 ${refs.videos.size}개`)
  const imageReport = await cleanupBucket(IMAGE_BUCKET, refs.images)
  const videoReport = await cleanupBucket(VIDEO_BUCKET, refs.videos)
  console.log('\n=== 요약 ===')
  console.log('이미지:', JSON.stringify(imageReport))
  console.log('영상:', JSON.stringify(videoReport))
  if ((imageReport.failed + videoReport.failed) > 0) process.exit(2)
}

main().catch(err => {
  console.error('치명적 오류:', err)
  process.exit(1)
})
