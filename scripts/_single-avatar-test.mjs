// 일회용: 단일 사진 아바타로 15초 분량 테스트 영상을 만든다.
// godsaeng_routine 대본을 15초로 줄인 나레이션 + 여자 제자 voice.
// generate-concept-videos-batch.mjs 의 함수를 재사용한다.
// 사용: node scripts/_single-avatar-test.mjs
import fs from 'node:fs/promises'
import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import {
  buildHeygenTextVoice, heygenGenerateOne, heygenPoll, burnSubtitles, uploadToStorage, OUT_DIR,
} from './generate-concept-videos-batch.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const AVATAR_ID = '59fbce86969e49d5bb33cd0a443b8cff'
const VOICE_ID = '86956bc34b7248d7be34eb3a6f69d03b' // 여자 제자 voice

// godsaeng_routine(미녀 제자 갓생 루틴)을 15초 분량으로 줄인 대본. 자막 씬 구분용.
const SCENES = [
  { narration: '상위 영 점 일 퍼센트 갓생 루틴, 공개할게요.' },
  { narration: 'AI 플래너로 목표 세 개 정하고, 오십 분 몰입 십 분 휴식으로 공부해요.' },
  { narration: '루틴이 나를 만들어요.' },
]

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
  const ts = Date.now()
  console.log('단일 사진 아바타 15초 영상 생성')
  console.log(`  avatar: ${AVATAR_ID}`)
  console.log(`  voice : ${VOICE_ID} (여자 제자)`)

  // 1) HeyGen 렌더 — 단일 연속 테이크 (나레이션 전체를 video_input 1개로)
  const mergedText = SCENES.map((s) => s.narration).join(' ')
  const videoId = await heygenGenerateOne([{
    character: { type: 'talking_photo', talking_photo_id: AVATAR_ID },
    voice: buildHeygenTextVoice(mergedText, VOICE_ID),
  }])
  console.log(`  video_id: ${videoId}`)

  // 2) 폴링
  console.log('\n폴링 (20초 간격)...')
  let url = null
  const started = Date.now()
  while (!url) {
    await sleep(20000)
    const st = await heygenPoll(videoId)
    if (st.status === 'completed') { url = st.video_url; console.log('  렌더 완료') }
    else if (st.status === 'failed') throw new Error(`렌더 실패: ${JSON.stringify(st.error)}`)
    else if (Date.now() - started > 15 * 60 * 1000) throw new Error('렌더 타임아웃')
  }

  // 3) 다운로드
  const dl = await fetch(url)
  if (!dl.ok) throw new Error(`다운로드 ${dl.status}`)
  const rawPath = path.join(OUT_DIR, `_single_${ts}.mp4`)
  writeFileSync(rawPath, Buffer.from(await dl.arrayBuffer()))

  // 4) 자막 번인 (글자 수 비율로 3개 자막 분배)
  const finalPath = path.join(OUT_DIR, `single_avatar_${ts}.mp4`)
  const { srtPath, duration } = await burnSubtitles(rawPath, SCENES, finalPath, ts)
  console.log(`  자막 번인 완료 (${duration.toFixed(1)}s)`)

  // 5) Supabase Storage 업로드
  const buf = await fs.readFile(finalPath)
  const publicUrl = await uploadToStorage(buf, `single_avatar_${ts}.mp4`)
  console.log(`\n✅ 영상 URL: ${publicUrl}`)
  console.log(`   로컬: ${finalPath} (${(buf.length / 1024 / 1024).toFixed(1)}MB, ${duration.toFixed(1)}s)`)

  // 임시 파일 정리 (최종본은 output/ 에 남김)
  try { await fs.unlink(rawPath) } catch {}
  try { if (srtPath) await fs.unlink(srtPath) } catch {}
}

main().catch((err) => { console.error('\n실패:', err.message); process.exit(1) })
