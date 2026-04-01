import { useState, useRef } from 'react'
import {
  Upload, Mic, Film, Loader2, CheckCircle, XCircle, Play, Download,
  FileText, RefreshCw, Trash2
} from 'lucide-react'
import { pipelineLog, getPipelineLogs, clearPipelineLogs } from '../services/shorts-pipeline'

const ELEVENLABS_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY
const CREATOMATE_KEY = import.meta.env.VITE_CREATOMATE_API_KEY
const PUBLIC_SERVER_URL = import.meta.env.VITE_PUBLIC_SERVER_URL || ''
const VOICE_ID = 'iyvXhCAqzDxKnq3FDjZl'

export default function NarrationPage() {
  const fileInputRef = useRef(null)
  const [videoFile, setVideoFile] = useState(null)
  const [videoUrl, setVideoUrl] = useState(null)
  const [subtitleText, setSubtitleText] = useState('')
  const [narrationUrl, setNarrationUrl] = useState(null)
  const [finalVideoUrl, setFinalVideoUrl] = useState(null)
  const [loading, setLoading] = useState({})
  const [error, setError] = useState(null)
  const [logs, setLogs] = useState([])
  const [progressMsg, setProgressMsg] = useState('')

  const refreshLogs = () => setLogs(getPipelineLogs())

  // 영상 업로드
  const handleVideoFile = (f) => {
    if (!f) return
    const ext = f.name.toLowerCase().match(/\.[^.]+$/)?.[0]
    if (!['.mp4', '.mov', '.webm', '.avi'].includes(ext)) {
      setError('MP4, MOV, WEBM, AVI 파일만 지원합니다.')
      return
    }
    setVideoFile(f)
    setVideoUrl(URL.createObjectURL(f))
    setFinalVideoUrl(null)
    setError(null)
  }

  // 서버에 파일 업로드 → public URL
  const uploadFileToServer = async (file, filename) => {
    const reader = new FileReader()
    const base64 = await new Promise((resolve) => {
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(file)
    })
    if (!base64) return null

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120000)
    const res = await fetch('/api/output/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, data: base64, encoding: 'base64' }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const { url } = await res.json()
    const base = PUBLIC_SERVER_URL || `${window.location.protocol}//${window.location.host}`
    return `${base}${url}`
  }

  // blob URL → 서버 업로드
  const uploadBlobToServer = async (blobUrl, filename) => {
    const res = await fetch(blobUrl)
    const blob = await res.blob()
    const reader = new FileReader()
    const base64 = await new Promise((resolve) => {
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
    if (!base64) return null

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000)
    const uploadRes = await fetch('/api/output/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, data: base64, encoding: 'base64' }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!uploadRes.ok) return null
    const { url } = await uploadRes.json()
    const base = PUBLIC_SERVER_URL || `${window.location.protocol}//${window.location.host}`
    return `${base}${url}`
  }

  // Step 1: TTS 나레이션 생성
  const generateNarration = async () => {
    if (!subtitleText.trim()) { setError('자막 텍스트를 입력해주세요.'); return }
    setLoading(p => ({ ...p, narration: true }))
    setError(null)
    setProgressMsg('나레이션 생성 중...')
    clearPipelineLogs()
    pipelineLog('nar', '나레이션 생성 시작', { textLength: subtitleText.length })

    try {
      const ctrl = new AbortController()
      const tm = setTimeout(() => ctrl.abort(), 60000)
      const res = await fetch(`/api/elevenlabs/tts-timestamps/${VOICE_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ELEVENLABS_KEY },
        body: JSON.stringify({
          text: subtitleText.trim(),
          model_id: 'eleven_turbo_v2_5',
          language_code: 'ko',
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
        }),
        signal: ctrl.signal,
      })
      clearTimeout(tm)
      if (!res.ok) throw new Error(`ElevenLabs 오류: ${res.status}`)

      const data = await res.json()
      const audioBytes = Uint8Array.from(atob(data.audio_base64), c => c.charCodeAt(0))
      const audioBlob = new Blob([audioBytes], { type: 'audio/mpeg' })
      const url = URL.createObjectURL(audioBlob)
      setNarrationUrl(url)

      const charEnds = data.alignment?.character_end_times_seconds || []
      const duration = charEnds.length > 0 ? charEnds[charEnds.length - 1] : 0
      pipelineLog('nar', `나레이션 생성 완료 (${duration.toFixed(1)}s)`)
    } catch (err) {
      setError(`나레이션 생성 실패: ${err.message}`)
      pipelineLog('nar', '나레이션 생성 실패', err.message)
    }
    setLoading(p => ({ ...p, narration: false }))
    setProgressMsg('')
    refreshLogs()
  }

  // Step 2: 영상 + 나레이션 합성 (Creatomate)
  const mergeVideoNarration = async () => {
    if (!videoFile || !narrationUrl) { setError('영상과 나레이션이 모두 필요합니다.'); return }
    setLoading(p => ({ ...p, merge: true }))
    setError(null)
    setProgressMsg('영상 업로드 중...')
    pipelineLog('merge', '영상+나레이션 합성 시작')

    try {
      // 1) 영상/나레이션 서버 업로드
      const videoPublicUrl = await uploadFileToServer(videoFile, `narration_input_${Date.now()}.mp4`)
      if (!videoPublicUrl) throw new Error('영상 업로드 실패')
      pipelineLog('merge', '영상 업로드 완료', videoPublicUrl)

      setProgressMsg('나레이션 업로드 중...')
      const narrationPublicUrl = await uploadBlobToServer(narrationUrl, `narration_audio_${Date.now()}.mp3`)
      if (!narrationPublicUrl) throw new Error('나레이션 업로드 실패')
      pipelineLog('merge', '나레이션 업로드 완료', narrationPublicUrl)

      // 2) 영상 길이 감지
      const videoDur = await new Promise((resolve) => {
        const v = document.createElement('video')
        v.preload = 'metadata'
        const fallback = setTimeout(() => resolve(30)  , 5000)
        v.onloadedmetadata = () => { clearTimeout(fallback); resolve(v.duration) }
        v.onerror = () => { clearTimeout(fallback); resolve(30) }
        v.src = videoUrl
      })
      pipelineLog('merge', `영상 길이: ${videoDur.toFixed(1)}s`)

      // 3) Creatomate 렌더: 원본 영상 + 나레이션 오디오 합성
      setProgressMsg('Creatomate 렌더 중...')
      const renderBody = {
        output_format: 'mp4',
        frame_rate: '30 fps',
        width: 1080,
        height: 1920,
        duration: videoDur,
        elements: [
          { type: 'video', track: 1, time: 0, duration: videoDur, source: videoPublicUrl, fit: 'cover' },
          { type: 'audio', track: 2, time: 0, duration: videoDur, source: narrationPublicUrl },
        ],
      }

      const submitRes = await fetch('/api/creatomate/renders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': CREATOMATE_KEY },
        body: JSON.stringify(renderBody),
      })
      if (!submitRes.ok) throw new Error(`Creatomate 오류: ${submitRes.status}`)

      const renders = await submitRes.json()
      const render = Array.isArray(renders) ? renders[0] : renders
      if (!render?.id) throw new Error('Creatomate 렌더 ID 없음')

      if (render.status === 'succeeded') {
        setFinalVideoUrl(render.url)
        pipelineLog('merge', '렌더 완료', render.url)
      } else {
        // 폴링
        setProgressMsg('렌더링 중... (최대 5분)')
        for (let i = 0; i < 100; i++) {
          await new Promise(r => setTimeout(r, 3000))
          const pollRes = await fetch(`/api/creatomate/renders/${render.id}`, { headers: { 'x-api-key': CREATOMATE_KEY } })
          if (!pollRes.ok) continue
          const d = await pollRes.json()
          if (d.status === 'succeeded') {
            setFinalVideoUrl(d.url)
            pipelineLog('merge', '렌더 완료', d.url)
            break
          }
          if (d.status === 'failed') throw new Error(`렌더 실패: ${d.error_message}`)
        }
      }
    } catch (err) {
      setError(`합성 실패: ${err.message}`)
      pipelineLog('merge', '합성 실패', err.message)
    }
    setLoading(p => ({ ...p, merge: false }))
    setProgressMsg('')
    refreshLogs()
  }

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400"><Mic size={22} /></div>
        <div>
          <h2 className="text-lg font-bold text-text">나레이션 추가</h2>
          <p className="text-xs text-text-muted">영상의 자막을 나레이션으로 변환하여 합성</p>
        </div>
      </div>

      {/* Progress */}
      {progressMsg && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3 flex items-center gap-3 animate-pulse">
          <Loader2 size={16} className="text-emerald-400 animate-spin shrink-0" />
          <p className="text-sm text-emerald-400 font-medium">{progressMsg}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-danger/5 border border-danger/20 rounded-xl px-4 py-3 flex items-center gap-3">
          <XCircle size={16} className="text-danger shrink-0" />
          <p className="text-sm text-danger">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-xs text-danger hover:underline">닫기</button>
        </div>
      )}

      {/* Step 1: 영상 업로드 */}
      <div className="bg-surface rounded-xl border border-border">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${videoFile ? 'bg-success/10 text-success' : 'bg-emerald-500/10 text-emerald-400'}`}><Upload size={16} /></div>
            <h3 className="font-semibold text-text text-sm">1. 영상 업로드</h3>
          </div>
          {videoFile && <span className="text-xs text-success flex items-center gap-1"><CheckCircle size={12} /> {videoFile.name}</span>}
        </div>
        <div className="p-4">
          {!videoFile ? (
            <div className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all border-border hover:border-emerald-500/40"
              onClick={() => fileInputRef.current?.click()}>
              <input ref={fileInputRef} type="file" className="hidden" accept=".mp4,.mov,.webm,.avi" onChange={e => e.target.files[0] && handleVideoFile(e.target.files[0])} />
              <Film size={24} className="mx-auto mb-2 text-text-muted" />
              <p className="text-sm text-text">영상 파일을 <span className="text-emerald-400 font-medium">클릭</span>하여 업로드</p>
              <p className="text-xs text-text-muted mt-1">MP4, MOV, WEBM, AVI</p>
            </div>
          ) : (
            <div className="space-y-3">
              <video src={videoUrl} controls className="w-full max-h-64 rounded-lg border border-border" />
              <button onClick={() => { setVideoFile(null); setVideoUrl(null); setFinalVideoUrl(null) }}
                className="text-xs text-text-muted hover:text-danger flex items-center gap-1"><Trash2 size={12} /> 변경</button>
            </div>
          )}
        </div>
      </div>

      {/* Step 2: 자막 텍스트 입력 */}
      <div className={`bg-surface rounded-xl border border-border ${!videoFile ? 'opacity-40' : ''}`}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${subtitleText.trim() ? 'bg-success/10 text-success' : 'bg-emerald-500/10 text-emerald-400'}`}><FileText size={16} /></div>
            <h3 className="font-semibold text-text text-sm">2. 자막 텍스트</h3>
          </div>
          {subtitleText.trim() && <span className="text-xs text-text-muted">{subtitleText.length}자</span>}
        </div>
        <div className="p-4">
          <textarea
            value={subtitleText}
            onChange={e => setSubtitleText(e.target.value)}
            disabled={!videoFile}
            placeholder="영상에 있는 자막 텍스트를 붙여넣으세요..."
            className="w-full h-32 px-3 py-2 bg-surface-light border border-border rounded-lg text-sm text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 resize-none disabled:opacity-50"
          />
        </div>
      </div>

      {/* Step 3: 나레이션 생성 */}
      <div className={`bg-surface rounded-xl border border-border ${!subtitleText.trim() ? 'opacity-40' : ''}`}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${narrationUrl ? 'bg-success/10 text-success' : 'bg-emerald-500/10 text-emerald-400'}`}><Mic size={16} /></div>
            <h3 className="font-semibold text-text text-sm">3. 나레이션 생성</h3>
          </div>
          <div className="flex items-center gap-2">
            {narrationUrl && <span className="text-xs text-success flex items-center gap-1"><CheckCircle size={12} /> 완료</span>}
            {subtitleText.trim() && (
              <button onClick={generateNarration} disabled={loading.narration}
                className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1.5">
                {loading.narration ? <><Loader2 size={12} className="animate-spin" /> 생성중</> : narrationUrl ? <><RefreshCw size={12} /> 재생성</> : <><Mic size={12} /> 생성</>}
              </button>
            )}
          </div>
        </div>
        {narrationUrl && (
          <div className="p-4">
            <audio src={narrationUrl} controls className="w-full h-10" />
          </div>
        )}
      </div>

      {/* Step 4: 합성 */}
      <div className={`bg-surface rounded-xl border border-border ${!narrationUrl || !videoFile ? 'opacity-40' : ''}`}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${finalVideoUrl ? 'bg-success/10 text-success' : 'bg-emerald-500/10 text-emerald-400'}`}><Film size={16} /></div>
            <h3 className="font-semibold text-text text-sm">4. 영상 + 나레이션 합성</h3>
          </div>
          <div className="flex items-center gap-2">
            {finalVideoUrl && <span className="text-xs text-success flex items-center gap-1"><CheckCircle size={12} /> 완료</span>}
            {narrationUrl && videoFile && (
              <button onClick={mergeVideoNarration} disabled={loading.merge}
                className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1.5">
                {loading.merge ? <><Loader2 size={12} className="animate-spin" /> 합성중</> : finalVideoUrl ? <><RefreshCw size={12} /> 재합성</> : <><Play size={12} /> 합성</>}
              </button>
            )}
          </div>
        </div>
        {finalVideoUrl && (
          <div className="p-4">
            <div className="flex flex-col items-center gap-3">
              <div className="w-full max-w-xs rounded-xl overflow-hidden border-2 border-emerald-500/30 shadow-lg" style={{ aspectRatio: '9/16' }}>
                <video src={finalVideoUrl} controls className="w-full h-full object-cover" />
              </div>
              <a href={finalVideoUrl} download="narration_video.mp4" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-white text-sm font-semibold rounded-xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20">
                <Download size={16} /> MP4 다운로드
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Logs */}
      <div className="bg-surface rounded-xl border border-border">
        <button onClick={refreshLogs} className="w-full flex items-center justify-between p-4 text-left">
          <span className="text-xs font-semibold text-text-muted">로그 ({logs.length}건)</span>
        </button>
        {logs.length > 0 && (
          <div className="px-4 pb-4">
            <div className="bg-[#0d1117] rounded-lg p-3 max-h-36 overflow-y-auto font-mono text-[11px] leading-relaxed">
              {logs.map((log, i) => (
                <div key={i} className="text-gray-300">
                  <span className="text-gray-500">[{log.ts}]</span> <span className="text-emerald-400">[{log.step}]</span> {log.msg}
                  {log.data != null && <span className="text-yellow-400"> {typeof log.data === 'string' ? log.data : JSON.stringify(log.data)}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
