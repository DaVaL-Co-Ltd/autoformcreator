// 일회용: 남-여-남 3씬 크로스페이드 전환 데모 영상을 만든다.
// generate-concept-videos-batch.mjs 의 함수를 재사용한다.
// 사용: node scripts/_demo-crossfade.mjs
import fs from 'node:fs/promises'
import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import {
  heygenGenerateOne, heygenPoll, trimClip, crossfadeClips,
  burnSubtitles, uploadToStorage, OUT_DIR, XFADE_DUR,
} from './generate-concept-videos-batch.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 남자 제자 / 여자 제자 아바타·voice (presetShortsAvatars.js 기준)
const MALE = { avatarId: '885c95d7fced49bba5cb230ca5a3e332', voiceId: '3097f9a8fd3b4340b6bbe913177b378f' }
const FEMALE = { avatarId: '62b02a920a78424e94f63f2ddb85dc99', voiceId: '86956bc34b7248d7be34eb3a6f69d03b' }

// 남-여-남 3씬 (영상 통화 공부 스타일, 각 약 3초)
const SCENES = [
  { who: MALE, narration: '야, 영상 통화 됐다! 너 시험 공부 어떻게 해?' },
  { who: FEMALE, narration: '난 삼십 분 집중하고 오 분 쉬는 게 잘 맞더라.' },
  { who: MALE, narration: '오 좋다, 나도 그렇게 해볼래!' },
]

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
  const ts = Date.now()
  console.log('남-여-남 3씬 크로스페이드 데모 생성\n')

  // 1) HeyGen 씬별 렌더
  const videoIds = []
  for (let i = 0; i < SCENES.length; i++) {
    const s = SCENES[i]
    const input = {
      character: { type: 'talking_photo', talking_photo_id: s.who.avatarId },
      voice: { type: 'text', input_text: s.narration, voice_id: s.who.voiceId },
      background: { type: 'color', value: '#FFFFFF' },
    }
    const id = await heygenGenerateOne([input])
    console.log(`  씬 ${i + 1} video_id: ${id}`)
    videoIds.push(id)
  }

  // 2) 폴링
  console.log('\n폴링 (20초 간격)...')
  const urls = new Array(videoIds.length).fill(null)
  const started = Date.now()
  while (urls.some((u) => !u)) {
    await sleep(20000)
    for (let i = 0; i < videoIds.length; i++) {
      if (urls[i]) continue
      const st = await heygenPoll(videoIds[i])
      if (st.status === 'completed') { urls[i] = st.video_url; console.log(`  씬 ${i + 1} 렌더 완료`) }
      else if (st.status === 'failed') throw new Error(`씬 ${i + 1} 렌더 실패: ${JSON.stringify(st.error)}`)
    }
    if (Date.now() - started > 20 * 60 * 1000) throw new Error('렌더 타임아웃')
  }

  // 3) 다운로드 → 트림
  console.log('\n후처리...')
  const tmpFiles = []
  const processed = []
  const clipLens = []
  for (let i = 0; i < urls.length; i++) {
    const dl = await fetch(urls[i])
    if (!dl.ok) throw new Error(`클립 ${i + 1} 다운로드 ${dl.status}`)
    const raw = path.join(OUT_DIR, `_demo_${ts}_${i}.mp4`)
    writeFileSync(raw, Buffer.from(await dl.arrayBuffer()))
    tmpFiles.push(raw)
    const out = path.join(OUT_DIR, `_demo_${ts}_${i}_p.mp4`)
    const { finalDur, fullDuration, trimAt } = await trimClip(raw, out, 4, false)
    tmpFiles.push(out)
    processed.push(out)
    clipLens.push(finalDur)
    console.log(`  씬 ${i + 1}: 원본 ${fullDuration.toFixed(2)}s → 트림 -${(fullDuration - trimAt).toFixed(2)}s → ${finalDur.toFixed(2)}s`)
  }

  // 4) 크로스페이드
  const xfadePath = path.join(OUT_DIR, `_demo_${ts}_xfade.mp4`)
  const total = await crossfadeClips(processed, clipLens, xfadePath)
  tmpFiles.push(xfadePath)
  console.log(`  크로스페이드 완료 — 전환 ${XFADE_DUR}s ×${processed.length - 1}, 최종 ${total.toFixed(2)}s`)

  // 5) 자막 번인
  const finalPath = path.join(OUT_DIR, `demo_crossfade_${ts}.mp4`)
  const { srtPath } = await burnSubtitles(xfadePath, SCENES, finalPath, ts, clipLens, XFADE_DUR)
  if (srtPath) tmpFiles.push(srtPath)
  console.log('  자막 번인 완료')

  // 6) Supabase Storage 업로드
  const buf = await fs.readFile(finalPath)
  const url = await uploadToStorage(buf, `demo_crossfade_${ts}.mp4`)

  console.log(`\n✅ 데모 영상 URL: ${url}`)
  console.log(`   로컬: ${finalPath} (${(buf.length / 1024 / 1024).toFixed(1)}MB)`)

  // 임시 파일 정리 (최종본은 output/ 에 남김)
  for (const f of tmpFiles) { try { await fs.unlink(f) } catch {} }
}

main().catch((err) => { console.error('\n실패:', err.message); process.exit(1) })
