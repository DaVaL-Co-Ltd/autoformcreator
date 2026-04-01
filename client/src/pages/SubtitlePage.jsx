import { useState, useRef } from 'react'
import {
  Film, Type, Loader2, Sparkles, CheckCircle, XCircle, Download,
  Plus, Trash2, ChevronDown, ChevronUp, Upload, Mic, GripVertical, ToggleLeft, ToggleRight
} from 'lucide-react'
import { pipelineLog, getPipelineLogs, clearPipelineLogs } from '../services/shorts-pipeline'

const CREATOMATE_KEY = import.meta.env.VITE_CREATOMATE_API_KEY
const PUBLIC_SERVER_URL = import.meta.env.VITE_PUBLIC_SERVER_URL || ''

export default function SubtitlePage() {
  const fileInputRef = useRef(null)
  const clipInputRef = useRef(null)
  const narrationInputRef = useRef(null)

  // 모드: 'single' = 단일 영상 + 자막, 'multi' = 여러 클립 조합
  const [mode, setMode] = useState('single')

  // Single mode
  const [videoSource, setVideoSource] = useState('')
  const [videoFile, setVideoFile] = useState(null)
  const [videoDuration, setVideoDuration] = useState(0)

  // Multi mode - clips
  const [clips, setClips] = useState([])

  // 나레이션 (공통)
  const [narrationFile, setNarrationFile] = useState(null)
  const [narrationUrl, setNarrationUrl] = useState('')

  // 자막
  const [subtitles, setSubtitles] = useState([
    { id: 1, startTime: 0, endTime: 3, text: '' },
  ])
  const [style, setStyle] = useState({
    fontSize: '4', fontWeight: '700', color: '#ffffff',
    bgColor: 'rgba(0,0,0,0.6)', position: '82',
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [logsOpen, setLogsOpen] = useState(false)
  const [logs, setLogs] = useState([])
  const abortRef = useRef(false)

  const refreshLogs = () => setLogs(getPipelineLogs())

  // ===== 서버 업로드 =====
  const uploadFileToServer = async (blobUrl, filename) => {
    const res = await fetch(blobUrl)
    const blob = await res.blob()
    const base64 = await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.readAsDataURL(blob)
    })
    const uploadRes = await fetch('/api/output/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, data: base64, encoding: 'base64' }),
    })
    if (!uploadRes.ok) throw new Error('파일 업로드 실패')
    const { url } = await uploadRes.json()
    return `${PUBLIC_SERVER_URL}${url}`
  }

  // ===== Single mode: 영상 업로드 =====
  const handleSingleUpload = (file) => {
    setVideoFile(file)
    const url = URL.createObjectURL(file)
    setVideoSource(url)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      setVideoDuration(Math.ceil(video.duration))
      setSubtitles([{ id: 1, startTime: 0, endTime: Math.min(Math.ceil(video.duration), 5), text: '' }])
    }
    video.src = url
  }

  // ===== Multi mode: 클립 추가 =====
  const handleClipAdd = (files) => {
    const newClips = Array.from(files).map((file, i) => {
      const url = URL.createObjectURL(file)
      return { id: Date.now() + i, file, url, name: file.name, duration: 0 }
    })
    // 각 클립 길이 측정
    newClips.forEach(clip => {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.onloadedmetadata = () => {
        setClips(prev => prev.map(c => c.id === clip.id ? { ...c, duration: Math.ceil(v.duration) } : c))
      }
      v.src = clip.url
    })
    setClips(prev => [...prev, ...newClips])
  }

  const removeClip = (id) => setClips(clips.filter(c => c.id !== id))
  const moveClip = (idx, dir) => {
    const arr = [...clips]
    const target = idx + dir
    if (target < 0 || target >= arr.length) return
    ;[arr[idx], arr[target]] = [arr[target], arr[idx]]
    setClips(arr)
  }

  // ===== 나레이션 업로드 =====
  const handleNarrationUpload = (file) => {
    setNarrationFile(file)
    setNarrationUrl(URL.createObjectURL(file))
  }

  // ===== 자막 =====
  const addSubtitle = () => {
    const last = subtitles[subtitles.length - 1]
    const newStart = last ? last.endTime : 0
    const maxDur = mode === 'multi' ? clips.reduce((s, c) => s + c.duration, 0) : (videoDuration || 999)
    setSubtitles([...subtitles, { id: Date.now(), startTime: newStart, endTime: Math.min(newStart + 3, maxDur), text: '' }])
  }
  const removeSubtitle = (id) => { if (subtitles.length > 1) setSubtitles(subtitles.filter(s => s.id !== id)) }
  const updateSubtitle = (id, field, value) => {
    setSubtitles(subtitles.map(s => s.id === id ? { ...s, [field]: field === 'text' ? value : Number(value) } : s))
  }

  // ===== 렌더 =====
  const cancelRender = () => {
    abortRef.current = true; setLoading(false)
    setError('렌더링이 중단되었습니다.')
    pipelineLog('sub', '사용자가 중단함'); refreshLogs()
  }

  const render = async () => {
    setLoading(true); setError(null); setResult(null); clearPipelineLogs(); abortRef.current = false

    try {
      const elements = []
      let totalDuration = 0

      if (mode === 'single') {
        // 단일 영상 업로드
        pipelineLog('sub', '영상 업로드 중...')
        let publicUrl = videoSource
        if (videoSource.startsWith('blob:') || videoSource.startsWith('data:')) {
          publicUrl = await uploadFileToServer(videoSource, `sub_single_${Date.now()}.mp4`)
        }
        totalDuration = videoDuration || Math.max(...subtitles.map(s => s.endTime), 10)
        elements.push({ type: 'video', track: 1, time: 0, duration: totalDuration, source: publicUrl, fit: 'cover' })
        pipelineLog('sub', '영상 업로드 완료')

      } else {
        // 멀티 클립 순서대로 업로드 + 이어붙이기
        pipelineLog('sub', `${clips.length}개 클립 업로드 중...`)
        let currentTime = 0
        for (let i = 0; i < clips.length; i++) {
          const clip = clips[i]
          pipelineLog('sub', `클립 ${i + 1}/${clips.length} 업로드: ${clip.name}`)
          const publicUrl = await uploadFileToServer(clip.url, `sub_clip${i + 1}_${Date.now()}.mp4`)
          const dur = clip.duration || 5
          elements.push({
            type: 'video', track: 1, time: currentTime, duration: dur,
            source: publicUrl, fit: 'cover',
            ...(i > 0 ? { animations: [{ type: 'fade', time: 0, duration: 0.3, from: '0%', to: '100%' }] } : {}),
          })
          currentTime += dur
        }
        totalDuration = currentTime
        pipelineLog('sub', `클립 업로드 완료 (총 ${totalDuration}초)`)
      }

      // 나레이션
      if (narrationUrl) {
        pipelineLog('sub', '나레이션 업로드 중...')
        let publicNarUrl = narrationUrl
        if (narrationUrl.startsWith('blob:')) {
          publicNarUrl = await uploadFileToServer(narrationUrl, `sub_narration_${Date.now()}.mp3`)
        }
        elements.push({ type: 'audio', track: 2, time: 0, duration: totalDuration, source: publicNarUrl })
        pipelineLog('sub', '나레이션 업로드 완료')
      }

      // 자막
      for (const sub of subtitles) {
        if (!sub.text.trim()) continue
        elements.push({
          type: 'text', track: 3,
          time: sub.startTime, duration: sub.endTime - sub.startTime,
          text: sub.text,
          font_family: 'Noto Sans KR',
          font_size: `${style.fontSize} vmin`, font_weight: style.fontWeight,
          fill_color: style.color, stroke_color: '#000000', stroke_width: '0.3 vmin',
          y: `${style.position}%`, width: '90%', x_alignment: '50%',
          background_color: style.bgColor,
          background_x_padding: '3%', background_y_padding: '1.5%', background_border_radius: '2%',
          animations: [{ type: 'text-appear', time: 0, duration: 0.3, easing: 'ease-out' }],
        })
      }

      const renderBody = {
        output_format: 'mp4', frame_rate: '30 fps',
        width: 1080, height: 1920,
        duration: totalDuration, elements,
      }

      pipelineLog('sub', 'Creatomate 렌더 요청', { duration: totalDuration, elements: elements.length })

      const submitRes = await fetch('/api/creatomate/renders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': CREATOMATE_KEY },
        body: JSON.stringify(renderBody),
      })
      if (!submitRes.ok) {
        const errText = await submitRes.text()
        throw new Error(`Creatomate 오류 (${submitRes.status}): ${errText.slice(0, 200)}`)
      }

      const renders = await submitRes.json()
      const rd = Array.isArray(renders) ? renders[0] : renders
      if (!rd?.id) throw new Error('렌더 ID 없음')
      if (rd.status === 'succeeded') { setResult({ url: rd.url }); refreshLogs(); setLoading(false); return }

      pipelineLog('sub', '렌더 진행 중...')
      for (let i = 0; i < 100; i++) {
        if (abortRef.current) throw new Error('사용자가 중단함')
        await new Promise(r => setTimeout(r, 3000))
        if (abortRef.current) throw new Error('사용자가 중단함')
        const pollRes = await fetch(`/api/creatomate/renders/${rd.id}`, { headers: { 'x-api-key': CREATOMATE_KEY } })
        if (!pollRes.ok) continue
        const d = await pollRes.json()
        if (d.status === 'succeeded') {
          pipelineLog('sub', '렌더 완료', d.url)
          setResult({ url: d.url }); refreshLogs(); setLoading(false); return
        }
        if (d.status === 'failed') throw new Error(`렌더 실패: ${d.error_message}`)
      }
      throw new Error('렌더 시간 초과')

    } catch (err) {
      setError(err.message); pipelineLog('sub', '오류', err.message); refreshLogs()
    }
    setLoading(false)
  }

  const hasVideo = mode === 'single' ? !!videoSource : clips.length > 0
  const hasSubtitles = subtitles.some(s => s.text.trim())
  const totalClipDuration = clips.reduce((s, c) => s + c.duration, 0)

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400"><Type size={22} /></div>
          <div>
            <h2 className="text-lg font-bold text-text">자막 & 영상 조합</h2>
            <p className="text-xs text-text-muted">영상에 자막/나레이션을 입히거나, 여러 클립을 조합합니다</p>
          </div>
        </div>
        {/* 모드 전환 */}
        <button onClick={() => setMode(p => p === 'single' ? 'multi' : 'single')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${mode === 'multi' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-surface-light text-text-muted border-border'}`}>
          {mode === 'multi' ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
          {mode === 'single' ? '단일 영상' : '멀티 클립'}
        </button>
      </div>

      {/* 1. 영상 입력 */}
      <div className="bg-surface rounded-xl border border-border">
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <div className={`p-2 rounded-lg ${hasVideo ? 'bg-success/10 text-success' : 'bg-emerald-500/10 text-emerald-400'}`}><Film size={16} /></div>
          <h3 className="font-semibold text-text text-sm">1. {mode === 'single' ? '영상 선택' : '클립 추가'}</h3>
          {mode === 'single' && hasVideo && <span className="text-xs text-success flex items-center gap-1 ml-auto"><CheckCircle size={12} /> {videoDuration}초</span>}
          {mode === 'multi' && clips.length > 0 && <span className="text-xs text-success flex items-center gap-1 ml-auto"><CheckCircle size={12} /> {clips.length}개 · {totalClipDuration}초</span>}
        </div>
        <div className="p-4 space-y-3">
          {mode === 'single' ? (
            <>
              <div>
                <label className="text-xs text-text-muted mb-1 block">영상 URL</label>
                <input type="text" value={videoSource.startsWith('blob:') ? '' : videoSource}
                  onChange={e => { setVideoSource(e.target.value); setVideoFile(null) }}
                  placeholder="https://example.com/video.mp4"
                  className="w-full px-3 py-2 bg-surface-light border border-border rounded-lg text-sm text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30" />
              </div>
              <div className="text-xs text-text-muted text-center">또는</div>
              <div className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${videoFile ? 'border-success/40 bg-success/5' : 'border-border hover:border-emerald-500/40'}`}
                onClick={() => fileInputRef.current?.click()}>
                <input ref={fileInputRef} type="file" className="hidden" accept="video/*"
                  onChange={e => e.target.files[0] && handleSingleUpload(e.target.files[0])} />
                {videoFile ? (
                  <p className="text-sm text-success flex items-center justify-center gap-2"><CheckCircle size={14} /> {videoFile.name}</p>
                ) : (
                  <><Upload size={20} className="mx-auto mb-1 text-text-muted" /><p className="text-xs text-text-muted">영상 파일 업로드</p></>
                )}
              </div>
              {hasVideo && (
                <div className="flex justify-center">
                  <div className="w-48 rounded-xl overflow-hidden border border-border" style={{ aspectRatio: '9/16' }}>
                    <video src={videoSource} controls className="w-full h-full object-cover" />
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all border-border hover:border-emerald-500/40`}
                onClick={() => clipInputRef.current?.click()}>
                <input ref={clipInputRef} type="file" className="hidden" accept="video/*" multiple
                  onChange={e => e.target.files.length && handleClipAdd(e.target.files)} />
                <Upload size={20} className="mx-auto mb-1 text-text-muted" />
                <p className="text-xs text-text-muted">클립 파일 추가 (여러 개 선택 가능)</p>
              </div>
              {clips.length > 0 && (
                <div className="space-y-2">
                  {clips.map((clip, i) => (
                    <div key={clip.id} className="flex items-center gap-2 bg-surface-light rounded-lg p-2.5 border border-border">
                      <div className="flex flex-col gap-0.5">
                        <button onClick={() => moveClip(i, -1)} disabled={i === 0} className="text-text-muted hover:text-text disabled:opacity-20 transition-colors"><ChevronUp size={12} /></button>
                        <button onClick={() => moveClip(i, 1)} disabled={i === clips.length - 1} className="text-text-muted hover:text-text disabled:opacity-20 transition-colors"><ChevronDown size={12} /></button>
                      </div>
                      <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                      <video src={clip.url} className="w-16 h-10 rounded object-cover border border-border shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-text truncate">{clip.name}</p>
                        <p className="text-[10px] text-text-muted">{clip.duration}초</p>
                      </div>
                      <button onClick={() => removeClip(clip.id)} className="p-1 text-text-muted hover:text-danger transition-colors shrink-0"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 2. 나레이션 (선택) */}
      <div className="bg-surface rounded-xl border border-border">
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <div className={`p-2 rounded-lg ${narrationUrl ? 'bg-success/10 text-success' : 'bg-emerald-500/10 text-emerald-400'}`}><Mic size={16} /></div>
          <h3 className="font-semibold text-text text-sm">2. 나레이션 <span className="text-text-muted font-normal">(선택)</span></h3>
          {narrationUrl && <span className="text-xs text-success flex items-center gap-1 ml-auto"><CheckCircle size={12} /> 업로드됨</span>}
        </div>
        <div className="p-4 space-y-3">
          <div className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${narrationFile ? 'border-success/40 bg-success/5' : 'border-border hover:border-emerald-500/40'}`}
            onClick={() => narrationInputRef.current?.click()}>
            <input ref={narrationInputRef} type="file" className="hidden" accept="audio/*"
              onChange={e => e.target.files[0] && handleNarrationUpload(e.target.files[0])} />
            {narrationFile ? (
              <div className="flex items-center justify-center gap-2">
                <CheckCircle size={14} className="text-success" />
                <span className="text-sm text-success">{narrationFile.name}</span>
                <button onClick={(e) => { e.stopPropagation(); setNarrationFile(null); setNarrationUrl('') }}
                  className="text-text-muted hover:text-danger ml-2"><Trash2 size={12} /></button>
              </div>
            ) : (
              <><Mic size={18} className="mx-auto mb-1 text-text-muted" /><p className="text-xs text-text-muted">나레이션 오디오 업로드 (MP3, WAV)</p></>
            )}
          </div>
          {narrationUrl && (
            <audio src={narrationUrl} controls className="w-full h-8" />
          )}
        </div>
      </div>

      {/* 3. 자막 편집 */}
      <div className="bg-surface rounded-xl border border-border">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${hasSubtitles ? 'bg-success/10 text-success' : 'bg-emerald-500/10 text-emerald-400'}`}><Type size={16} /></div>
            <h3 className="font-semibold text-text text-sm">3. 자막 편집</h3>
          </div>
          <button onClick={addSubtitle} className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 text-xs font-medium rounded-lg hover:bg-emerald-500/20 flex items-center gap-1">
            <Plus size={12} /> 자막 추가
          </button>
        </div>
        <div className="p-4 space-y-3">
          {subtitles.map((sub, i) => (
            <div key={sub.id} className="flex items-start gap-3 bg-surface-light rounded-lg p-3 border border-border">
              <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-1">{i + 1}</span>
              <div className="flex-1 space-y-2">
                <textarea value={sub.text} onChange={e => updateSubtitle(sub.id, 'text', e.target.value)}
                  placeholder="자막 텍스트 입력..."
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 resize-none"
                  rows={2} />
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <label className="text-[10px] text-text-muted">시작</label>
                    <input type="number" min={0} step={0.5} value={sub.startTime} onChange={e => updateSubtitle(sub.id, 'startTime', e.target.value)}
                      className="w-16 px-2 py-1 bg-surface border border-border rounded text-xs text-text focus:outline-none" />
                    <span className="text-[10px] text-text-muted">초</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-[10px] text-text-muted">종료</label>
                    <input type="number" min={0} step={0.5} value={sub.endTime} onChange={e => updateSubtitle(sub.id, 'endTime', e.target.value)}
                      className="w-16 px-2 py-1 bg-surface border border-border rounded text-xs text-text focus:outline-none" />
                    <span className="text-[10px] text-text-muted">초</span>
                  </div>
                </div>
              </div>
              {subtitles.length > 1 && (
                <button onClick={() => removeSubtitle(sub.id)} className="p-1.5 text-text-muted hover:text-danger transition-colors shrink-0 mt-1"><Trash2 size={14} /></button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 4. 스타일 */}
      <div className="bg-surface rounded-xl border border-border">
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400"><Sparkles size={16} /></div>
          <h3 className="font-semibold text-text text-sm">4. 자막 스타일</h3>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] text-text-muted block mb-1">글꼴 크기</label>
              <select value={style.fontSize} onChange={e => setStyle(p => ({ ...p, fontSize: e.target.value }))}
                className="w-full px-2 py-1.5 bg-surface-light border border-border rounded-lg text-xs text-text">
                <option value="3">작게</option><option value="4">보통</option><option value="5">크게</option><option value="6">매우 크게</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-text-muted block mb-1">글꼴 두께</label>
              <select value={style.fontWeight} onChange={e => setStyle(p => ({ ...p, fontWeight: e.target.value }))}
                className="w-full px-2 py-1.5 bg-surface-light border border-border rounded-lg text-xs text-text">
                <option value="400">보통</option><option value="700">굵게</option><option value="900">매우 굵게</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-text-muted block mb-1">글자 색상</label>
              <input type="color" value={style.color} onChange={e => setStyle(p => ({ ...p, color: e.target.value }))}
                className="w-full h-8 rounded-lg border border-border cursor-pointer" />
            </div>
            <div>
              <label className="text-[10px] text-text-muted block mb-1">위치 (0~100)</label>
              <input type="number" min={0} max={100} value={style.position} onChange={e => setStyle(p => ({ ...p, position: e.target.value }))}
                className="w-full px-2 py-1.5 bg-surface-light border border-border rounded-lg text-xs text-text focus:outline-none" />
            </div>
          </div>
        </div>
      </div>

      {/* 렌더 버튼 */}
      <div className="flex justify-end gap-3">
        {loading && (
          <button onClick={cancelRender}
            className="px-6 py-3 font-medium rounded-xl transition-all flex items-center gap-2 bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20">
            <XCircle size={18} /> 중단
          </button>
        )}
        <button onClick={render} disabled={!hasVideo || !hasSubtitles || loading}
          className={`px-6 py-3 font-medium rounded-xl transition-all flex items-center gap-2 ${
            hasVideo && hasSubtitles && !loading
              ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20'
              : 'bg-surface-light text-text-muted border border-border cursor-not-allowed'
          }`}>
          {loading ? <><Loader2 size={18} className="animate-spin" /> 렌더링 중...</> : <><Sparkles size={18} /> {mode === 'single' ? '자막 입히기' : '클립 조합 + 자막'}</>}
        </button>
      </div>

      {/* 에러 */}
      {error && (
        <div className="bg-danger/5 border border-danger/20 rounded-xl p-4 flex items-start gap-3">
          <XCircle size={16} className="text-danger shrink-0 mt-0.5" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {/* 결과 */}
      {result && (
        <div className="bg-gradient-to-b from-surface-light to-surface rounded-xl border border-emerald-500/20 p-4">
          <p className="text-sm font-semibold text-text mb-3 flex items-center gap-2"><CheckCircle size={14} className="text-emerald-400" /> {mode === 'single' ? '자막 입히기' : '영상 조합'} 완료</p>
          <div className="flex flex-col items-center gap-3">
            {result.url && (
              <>
                <div className="w-full max-w-xs rounded-xl overflow-hidden border-2 border-emerald-500/30 shadow-lg" style={{ aspectRatio: '9/16' }}>
                  <video src={result.url} controls className="w-full h-full object-cover" />
                </div>
                <a href={result.url} download="output_video.mp4" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-white text-sm font-semibold rounded-xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20">
                  <Download size={16} /> MP4 다운로드
                </a>
              </>
            )}
          </div>
        </div>
      )}

      {/* Logs */}
      <div className="bg-surface rounded-xl border border-border">
        <button onClick={() => { refreshLogs(); setLogsOpen(p => !p) }} className="w-full flex items-center justify-between p-4 text-left">
          <span className="text-xs font-semibold text-text-muted flex items-center gap-2"><Film size={12} /> 로그 ({logs.length}건)</span>
          {logsOpen ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
        </button>
        {logsOpen && (
          <div className="px-4 pb-4">
            <div className="bg-[#0d1117] rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-[11px] leading-relaxed">
              {logs.length === 0 ? <p className="text-gray-500">렌더 실행 시 로그가 표시됩니다.</p> : logs.map((log, i) => (
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
