// 10초 테스트 영상 생성 페이지.
// 목적: 클라이언트 측 saveExtraction → uploadShortsVideoIfLocal → isLocalOutputUrl
// 흐름이 Render /output/ URL 을 Supabase 로 옮기는지 실제 운영 환경에서 검증한다.
// 일회용 디버그 페이지 — 검증 끝나면 라우트와 함께 제거해도 된다.
//
// 흐름:
//   1) 하드코딩된 10초 대본 (hook + scene1 + scene2) 으로 HeyGen 렌더
//   2) /api/subtitle/burn 자막 번인 (caption 우선 적용 여부도 같이 확인)
//   3) saveExtraction({ shortsScript, shortsVideo }) — 클라이언트 fix 가 작동하면
//      shortsVideo.url 이 Supabase URL 로 변환돼 DB 에 저장된다
//   4) 저장된 row 를 다시 GET 해서 실제 DB 에 들어간 url 을 화면에 표시
import { useState } from 'react'
import { Loader2, Play, CheckCircle2, XCircle, Copy, ExternalLink, RefreshCw } from 'lucide-react'
import { readApiResponse, getApiErrorMessage } from '../utils/apiResponse.js'
import { mapShortsSubtitleStyleToBurnStyle } from '../utils/shortsVideoAgent.js'
import { saveExtraction, getExtractionById } from '../services/storage.js'

const API_BASE = import.meta.env.VITE_SERVER_URL || ''
const AVATAR_ID = '59fbce86969e49d5bb33cd0a443b8cff'
const VOICE_ID = '86956bc34b7248d7be34eb3a6f69d03b'

// 10초 분량 하드코딩 대본 — caption 에는 숫자 원본, narration 은 TTS 용 한글 풀이.
const SCRIPT = {
  title: '[테스트] 10초 영상',
  duration: '10',
  hook: '공부 시간 1/2만 줄여도?',
  scenes: [
    {
      sceneNumber: 1,
      duration: '4',
      caption: '공부 시간 1/2만 줄여도?',
      narration: '공부 시간 이분의 일만 줄여도?',
    },
    {
      sceneNumber: 2,
      duration: '6',
      caption: '성적이 평균 12.3% 상승해요!',
      narration: '성적이 평균 십이 점 삼 퍼센트 상승해요!',
    },
  ],
  cta: '오늘부터 30분만 시도해 보세요',
  uploadTitle: '[테스트] 10초 영상',
  uploadDescription: '디버그용 — saveExtraction 이 Render /output URL 을 Supabase 로 옮기는지 검증',
  hashtags: ['#테스트'],
}

function apiFetch(path, options = {}) {
  return fetch(`${API_BASE}${path}`, { ...options, headers: { ...(options.headers || {}) } })
}

// ExtractionPage.jsx 의 resolveMediaUrl 과 같은 로직 — 상대 /output/ URL 을 API_BASE 로 절대화한다.
function resolveMediaUrl(url) {
  if (!url) return url
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('/output/') && API_BASE) return `${API_BASE}${url}`
  return url
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

const STEPS = [
  { key: 'heygen-start', label: '1. HeyGen 영상 생성 요청' },
  { key: 'heygen-poll', label: '2. HeyGen 렌더 완료 대기' },
  { key: 'burn-start', label: '3. 자막 번인 요청' },
  { key: 'burn-poll', label: '4. 자막 번인 완료 대기' },
  { key: 'save', label: '5. saveExtraction 호출 (Supabase 업로드 포함)' },
  { key: 'verify', label: '6. DB 조회 — 실제 저장된 영상 URL 확인' },
]

export default function TestShortsPage() {
  const [running, setRunning] = useState(false)
  const [stepStatus, setStepStatus] = useState({}) // { [stepKey]: 'pending' | 'running' | 'done' | 'fail' }
  const [stepDetail, setStepDetail] = useState({})
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState('')

  const setStep = (key, status, detail = '') => {
    setStepStatus((p) => ({ ...p, [key]: status }))
    if (detail) setStepDetail((p) => ({ ...p, [key]: detail }))
  }

  const reset = () => {
    setStepStatus({})
    setStepDetail({})
    setResult(null)
    setError(null)
  }

  const onCopy = (label, value) => {
    if (!value) return
    navigator.clipboard.writeText(value).then(() => {
      setCopied(label)
      setTimeout(() => setCopied(''), 1500)
    })
  }

  const run = async () => {
    if (running) return
    reset()
    setRunning(true)

    try {
      // 1) HeyGen 영상 생성 요청
      setStep('heygen-start', 'running')
      const video_inputs = SCRIPT.scenes.map((scene) => ({
        character: { type: 'talking_photo', talking_photo_id: AVATAR_ID },
        voice: { type: 'text', input_text: scene.narration, voice_id: VOICE_ID },
      }))
      const genRes = await apiFetch('/api/heygen/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_inputs, dimension: { width: 720, height: 1280 } }),
      })
      const genData = await readApiResponse(genRes)
      if (!genRes.ok) throw new Error(getApiErrorMessage(genData, `HeyGen 요청 실패 (${genRes.status})`))
      const videoId = genData.data?.video_id || genData.data?.id || genData.video_id || genData.id
      if (!videoId) throw new Error('HeyGen video_id 를 받지 못했습니다.')
      setStep('heygen-start', 'done', `video_id: ${videoId}`)

      // 2) 폴링
      setStep('heygen-poll', 'running', '20초 간격으로 status 폴링 중...')
      let rawUrl = null
      const started = Date.now()
      let pollCount = 0
      while (!rawUrl) {
        await delay(15000)
        pollCount += 1
        const pollRes = await apiFetch(`/api/heygen/video/status/${videoId}`)
        const pollData = await readApiResponse(pollRes)
        if (!pollRes.ok) continue
        const status = pollData.data?.status
        setStep('heygen-poll', 'running', `폴링 ${pollCount}회 — status: ${status}`)
        if (status === 'completed') {
          rawUrl = resolveMediaUrl(pollData.data?.video_url)
          break
        }
        if (status === 'failed') {
          throw new Error(`HeyGen 렌더 실패: ${JSON.stringify(pollData.data?.error || {})}`)
        }
        if (Date.now() - started > 10 * 60 * 1000) throw new Error('HeyGen 렌더 타임아웃 (10분)')
      }
      setStep('heygen-poll', 'done', `렌더 완료 (폴링 ${pollCount}회)`)

      // 3) 자막 번인 요청
      setStep('burn-start', 'running')
      const burnRes = await apiFetch('/api/subtitle/burn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: rawUrl,
          scenes: SCRIPT.scenes,
          subtitleStyle: mapShortsSubtitleStyleToBurnStyle('style1'),
          subtitleFont: 'default',
        }),
      })
      const burnStartData = await readApiResponse(burnRes)
      if (!burnRes.ok || !burnStartData?.jobId) {
        throw new Error(getApiErrorMessage(burnStartData, `자막 번인 요청 실패 (${burnRes.status})`))
      }
      setStep('burn-start', 'done', `jobId: ${burnStartData.jobId}`)

      // 4) 번인 폴링
      setStep('burn-poll', 'running')
      let burnData = null
      let burnPolls = 0
      for (let bi = 0; bi < 60; bi++) {
        await delay(5000)
        burnPolls += 1
        const stRes = await apiFetch(`/api/subtitle/burn/status/${burnStartData.jobId}`)
        const stData = await readApiResponse(stRes)
        setStep('burn-poll', 'running', `폴링 ${burnPolls}회 — status: ${stData?.status || '?'}`)
        if (!stRes.ok) continue
        if (stData?.status === 'done') { burnData = stData; break }
        if (stData?.status === 'failed') throw new Error(stData?.error || '자막 번인 실패')
      }
      if (!burnData?.url) throw new Error('자막 번인 결과 URL 없음 또는 타임아웃')
      const finalUrl = resolveMediaUrl(burnData.url)
      setStep('burn-poll', 'done', `완료 — ${finalUrl}`)

      // 5) saveExtraction — 여기서 isLocalOutputUrl 분기가 작동해야 한다
      setStep('save', 'running', `shortsVideo.url 보낼 값: ${finalUrl}`)
      const shortsVideo = {
        url: finalUrl,
        rawUrl,
        srtUrl: resolveMediaUrl(burnData.srtUrl || null),
        duration: SCRIPT.duration,
        videoId,
        mode: 'test',
        subtitleStatus: 'done',
      }
      const savedId = await saveExtraction({
        fileName: `__test__${Date.now()}.txt`,
        summary: '[디버그] 10초 테스트 영상 — Supabase 저장 검증용',
        shortsScript: SCRIPT,
        shortsVideo,
      })
      if (!savedId) throw new Error('saveExtraction 이 id 를 반환하지 않음')
      setStep('save', 'done', `extractionId: ${savedId}`)

      // 6) DB 재조회로 실제 저장된 URL 확인
      setStep('verify', 'running')
      const saved = await getExtractionById(savedId)
      const storedUrl = saved?.data?.shortsVideo?.url
      const isSupabase = /supabase\.co/i.test(String(storedUrl || ''))
      const isRender = /onrender\.com/i.test(String(storedUrl || '')) || String(storedUrl || '').startsWith('/output/')
      let verdict = 'unknown'
      if (isSupabase) verdict = 'pass'
      else if (isRender) verdict = 'fail'
      setStep('verify', verdict === 'pass' ? 'done' : 'fail', `DB 저장 URL: ${storedUrl || '(null)'}`)

      setResult({
        extractionId: savedId,
        sentUrl: finalUrl,
        storedUrl,
        verdict,
        shortsVideoFull: saved?.data?.shortsVideo,
      })
    } catch (err) {
      console.error('[TestShortsPage] 실패:', err)
      setError(err.message || String(err))
      // 현재 running 인 step 을 fail 로 표기
      setStepStatus((p) => {
        const out = { ...p }
        for (const s of STEPS) if (out[s.key] === 'running') out[s.key] = 'fail'
        return out
      })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h1 className="text-lg font-semibold text-text mb-1">10초 테스트 영상 생성 — DB 저장 검증</h1>
        <p className="text-sm text-text-muted">
          하드코딩 대본으로 HeyGen → 자막 번인 → saveExtraction 까지 돌려서, 영상 URL 이 Supabase
          로 옮겨져 DB 에 저장되는지 확인합니다. (Render <code>/output/</code> URL 이 그대로 박히면 실패)
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-text mb-3">하드코딩된 대본 (10초)</h2>
        <div className="space-y-3 text-sm">
          <div className="rounded-lg bg-surface-light p-3">
            <div className="text-xs font-bold text-warning bg-warning/10 px-1.5 py-0.5 rounded inline-block mb-1">후킹</div>
            <div className="text-text">{SCRIPT.hook}</div>
          </div>
          {SCRIPT.scenes.map((scene) => (
            <div key={scene.sceneNumber} className="rounded-lg bg-surface-light p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">씬 {scene.sceneNumber}</span>
                <span className="text-xs text-text-muted">{scene.duration}초</span>
              </div>
              <div className="text-text"><span className="text-xs text-text-muted">caption:</span> {scene.caption}</div>
              <div className="text-text-muted"><span className="text-xs">narration:</span> {scene.narration}</div>
            </div>
          ))}
          <div className="rounded-lg bg-surface-light p-3">
            <div className="text-xs font-bold text-success bg-success/10 px-1.5 py-0.5 rounded inline-block mb-1">CTA</div>
            <div className="text-text">{SCRIPT.cta}</div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary-dark transition-all disabled:opacity-50 flex items-center gap-2"
        >
          {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          {running ? '진행 중...' : '10초 테스트 영상 생성 + DB 저장'}
        </button>
        {!running && (stepStatus['save'] || error) && (
          <button
            type="button"
            onClick={reset}
            className="px-3 py-2 rounded-xl text-sm font-medium border border-border text-text-muted hover:bg-white transition-all flex items-center gap-2"
          >
            <RefreshCw size={14} /> 초기화
          </button>
        )}
      </div>

      {Object.keys(stepStatus).length > 0 && (
        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm space-y-2">
          <h2 className="text-sm font-semibold text-text">진행 상태</h2>
          {STEPS.map((step) => {
            const s = stepStatus[step.key]
            if (!s) return null
            return (
              <div key={step.key} className="flex items-start gap-2 text-sm">
                {s === 'running' && <Loader2 size={14} className="text-primary animate-spin mt-0.5 shrink-0" />}
                {s === 'done' && <CheckCircle2 size={14} className="text-success mt-0.5 shrink-0" />}
                {s === 'fail' && <XCircle size={14} className="text-error mt-0.5 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-text">{step.label}</div>
                  {stepDetail[step.key] && (
                    <div className="text-xs text-text-muted break-all">{stepDetail[step.key]}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-error/30 bg-error/10 p-4 text-sm text-error">
          <div className="font-semibold mb-1">실패</div>
          <div className="break-all">{error}</div>
        </div>
      )}

      {result && (
        <div className={`rounded-2xl border p-5 shadow-sm space-y-3 ${result.verdict === 'pass' ? 'border-success/30 bg-success/5' : 'border-error/30 bg-error/5'}`}>
          <div className="flex items-center gap-2">
            {result.verdict === 'pass' ? <CheckCircle2 size={18} className="text-success" /> : <XCircle size={18} className="text-error" />}
            <h2 className="text-base font-semibold text-text">
              {result.verdict === 'pass' ? '✅ DB 저장 검증 통과 (Supabase URL)' : '❌ DB 저장 검증 실패 (Render URL 그대로 박힘)'}
            </h2>
          </div>
          <div className="space-y-2 text-sm">
            <div>
              <div className="text-xs text-text-muted">extractionId</div>
              <div className="font-mono text-text break-all">{result.extractionId}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted">saveExtraction 에 보낸 URL (HeyGen 출력 → API_BASE 절대화):</div>
              <div className="font-mono text-text break-all flex items-start gap-2">
                <span className="flex-1">{result.sentUrl}</span>
                <button onClick={() => onCopy('sent', result.sentUrl)} className="text-text-muted hover:text-primary shrink-0">
                  <Copy size={14} />
                </button>
              </div>
            </div>
            <div>
              <div className="text-xs text-text-muted">DB 에 실제로 저장된 URL:</div>
              <div className="font-mono text-text break-all flex items-start gap-2">
                <span className={`flex-1 ${result.verdict === 'pass' ? 'text-success' : 'text-error'}`}>{result.storedUrl || '(null)'}</span>
                {result.storedUrl && (
                  <>
                    <button onClick={() => onCopy('stored', result.storedUrl)} className="text-text-muted hover:text-primary shrink-0">
                      <Copy size={14} />
                    </button>
                    <a href={result.storedUrl} target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-primary shrink-0">
                      <ExternalLink size={14} />
                    </a>
                  </>
                )}
              </div>
            </div>
            {copied && <div className="text-xs text-text-muted">{copied === 'sent' ? '보낸 URL' : 'DB URL'} 복사됨</div>}
            <details className="text-xs">
              <summary className="cursor-pointer text-text-muted">전체 shortsVideo (펼치기)</summary>
              <pre className="mt-2 p-2 bg-surface-light rounded overflow-x-auto">{JSON.stringify(result.shortsVideoFull, null, 2)}</pre>
            </details>
          </div>
        </div>
      )}
    </div>
  )
}
