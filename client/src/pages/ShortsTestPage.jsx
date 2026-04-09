import { useState, useEffect, useRef } from 'react'
import { Loader2, CheckCircle, Film, Play, Pause, RefreshCw, Download, AlertTriangle, XCircle } from 'lucide-react'

const HEYGEN_KEY = import.meta.env.VITE_HEYGEN_API_KEY

const mockScript = {
  title: '2024 AI 시장 핵심 분석',
  duration: '30',
  scenes: [
    { sceneNumber: 1, type: 'avatar', narration: '안녕하세요! 오늘은 2024년 글로벌 AI 시장의 핵심 트렌드를 분석해보겠습니다.', keyword: '' },
    { sceneNumber: 2, type: 'avatar_keyword', narration: '올해 글로벌 AI 시장은 184조 원을 돌파하며 역대 최대 규모를 기록했습니다.', keyword: '글로벌 AI 시장 184조 원 돌파' },
    { sceneNumber: 3, type: 'infographic', narration: '특히 생성형 AI가 67퍼센트 성장하면서 전체 시장을 이끌고 있습니다.', keyword: '분야별 성장률', bullets: ['생성형 AI: +67.2%', '자연어처리: +41.8%', '컴퓨터 비전: +29.3%'] },
    { sceneNumber: 4, type: 'avatar_keyword', narration: '아시아태평양 지역이 31.5퍼센트로 빠르게 추격하고 있습니다.', keyword: '아시아태평양 지역 31.5% 추격' },
    { sceneNumber: 5, type: 'avatar', narration: '2030년까지 826조 원에 달할 전망입니다. 더 자세한 분석은 프로필 링크에서 확인하세요!', keyword: '' },
  ],
}

export default function ShortsTestPage() {
  const [presetAvatars, setPresetAvatars] = useState([])
  const [presetLoading, setPresetLoading] = useState(false)
  const [selectedAvatar, setSelectedAvatar] = useState(null)
  const [voices, setVoices] = useState([])
  const [voicesLoading, setVoicesLoading] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState(null)
  const [playingVoice, setPlayingVoice] = useState(null)
  const previewAudioRef = useRef(null)
  const [subtitleStyle, setSubtitleStyle] = useState('classic')
  const [generating, setGenerating] = useState(false)
  const abortRef = useRef(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState(null)
  const [video, setVideo] = useState(null)

  const narrationText = mockScript.scenes.map(s => s.narration).join(' ')

  // 프리셋 아바타 로드
  useEffect(() => {
    if (!HEYGEN_KEY) return
    setPresetLoading(true)
    fetch('/api/heygen/preset-avatars', { headers: { 'x-api-key': HEYGEN_KEY } })
      .then(r => r.json())
      .then(data => setPresetAvatars(data.presets || []))
      .catch(() => {})
      .finally(() => setPresetLoading(false))
  }, [])

  // 음성 로드
  useEffect(() => {
    if (!HEYGEN_KEY) return
    setVoicesLoading(true)
    fetch('/api/heygen/voices', { headers: { 'x-api-key': HEYGEN_KEY } })
      .then(r => r.json())
      .then(data => {
        const all = data?.data?.voices || []
        const filtered = all.filter(v => (v.language || '').includes('Korean') || v.support_locale)
        setVoices(filtered)
      })
      .catch(() => {})
      .finally(() => setVoicesLoading(false))
  }, [])

  const playPreview = (voiceId, url) => {
    if (playingVoice === voiceId) {
      previewAudioRef.current?.pause()
      setPlayingVoice(null)
      return
    }
    if (previewAudioRef.current) previewAudioRef.current.pause()
    const audio = new Audio(url)
    previewAudioRef.current = audio
    audio.play()
    audio.onended = () => setPlayingVoice(null)
    setPlayingVoice(voiceId)
  }

  const generateVideo = async () => {
    if (!selectedAvatar || !selectedVoice) return
    abortRef.current = false
    setGenerating(true)
    setError(null)
    setVideo(null)
    setStatus('배경 소스 생성 중...')
    try {
      // 1) 인포그래픽 씬 배경 이미지 생성 + HeyGen 업로드
      const infographicScenes = mockScript.scenes.filter(s => s.type === 'infographic')
      const infographicUrls = {}

      if (infographicScenes.length > 0) {
        setStatus('인포그래픽 배경 생성 중...')
        const genRes = await fetch('/api/infographic/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenes: infographicScenes }),
        })
        const genData = await genRes.json()
        console.log('[인포그래픽 생성]', genData)

        for (const img of (genData.images || [])) {
          if (img.error || !img.path) continue
          setStatus(`인포그래픽 씬 ${img.sceneNumber} 업로드 중...`)
          const uploadRes = await fetch('/api/infographic/upload-to-heygen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': HEYGEN_KEY },
            body: JSON.stringify({ localPath: img.path }),
          })
          const uploadData = await uploadRes.json()
          console.log(`[HeyGen 업로드 씬${img.sceneNumber}]`, uploadData)
          const imgUrl = uploadData.data?.url
          if (imgUrl) infographicUrls[img.sceneNumber] = imgUrl
        }
      }

      // 2) 멀티씬 video_inputs 구성
      setStatus('영상 생성 요청 중...')
      const avatarBg = { type: 'color', value: '#1a1a2e' }

      const videoInputs = mockScript.scenes.map(scene => {
        if (scene.type === 'infographic' && infographicUrls[scene.sceneNumber]) {
          return {
            character: { type: 'talking_photo', talking_photo_id: selectedAvatar, scale: 0.001, offset: { x: 1.0, y: 1.0 } },
            voice: { type: 'text', input_text: scene.narration, voice_id: selectedVoice },
            background: { type: 'image', url: infographicUrls[scene.sceneNumber], fit: 'cover' },
          }
        } else {
          return {
            character: { type: 'talking_photo', talking_photo_id: selectedAvatar, scale: 3.0, offset: { x: 0.0, y: 0.0 } },
            voice: { type: 'text', input_text: scene.narration, voice_id: selectedVoice },
            background: avatarBg,
          }
        }
      })

      console.log('[HeyGen 요청] video_inputs:', JSON.stringify(videoInputs, null, 2))
      const res = await fetch('/api/heygen/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': HEYGEN_KEY },
        body: JSON.stringify({
          video_inputs: videoInputs,
          dimension: { width: 1080, height: 1920 },
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error?.message || `HeyGen 오류: ${res.status}`)
      }
      const data = await res.json()
      const videoId = data.data?.video_id
      if (!videoId) throw new Error('video_id를 받지 못했습니다.')

      // 폴링 (최대 20분)
      setStatus('영상 렌더링 중...')
      for (let i = 0; i < 240; i++) {
        await new Promise(r => setTimeout(r, 5000))
        if (abortRef.current) { setStatus('중단됨'); setGenerating(false); return }
        const pollRes = await fetch(`/api/heygen/video/status/${videoId}`, {
          headers: { 'x-api-key': HEYGEN_KEY },
        })
        if (!pollRes.ok) continue
        const pollData = await pollRes.json()
        const st = pollData.data?.status
        const elapsed = (i + 1) * 5
        const min = Math.floor(elapsed / 60)
        const sec = elapsed % 60
        setStatus(`렌더링 중... (${min > 0 ? `${min}분 ` : ''}${sec}초 경과) [${st || 'processing'}]`)
        if (st === 'completed') {
          const rawUrl = pollData.data?.video_url
          console.log('[HeyGen] 영상 완료, URL:', rawUrl)
          setStatus('자막 번인 중...')
          try {
            const burnRes = await fetch('/api/subtitle/burn', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ videoUrl: rawUrl, scenes: mockScript.scenes, subtitleStyle }),
            })
            const burnData = await burnRes.json()
            console.log('[자막 번인]', burnRes.ok ? '성공' : '실패', burnData)
            if (burnRes.ok && burnData.url) {
              setVideo({ url: burnData.url, urlRaw: rawUrl, duration: pollData.data?.duration, srtUrl: burnData.srtUrl })
              setStatus('완료!')
              setGenerating(false)
              return
            }
          } catch (burnErr) {
            console.error('[자막 번인 에러]', burnErr)
          }
          // 자막 번인 실패 시 원본 영상 사용
          console.log('[Fallback] 원본 영상 사용:', rawUrl)
          setVideo({ url: rawUrl, duration: pollData.data?.duration })
          setStatus('완료! (자막 번인 실패, 원본 영상)')
          setGenerating(false)
          return
        }
        if (st === 'failed') {
          const errDetail = pollData.data?.error
          const errMsg = typeof errDetail === 'object' ? (errDetail.message || errDetail.detail || JSON.stringify(errDetail)) : (errDetail || '알 수 없는 오류')
          throw new Error(errMsg)
        }
      }
      throw new Error('렌더링 시간 초과 (20분) — HeyGen 서버가 혼잡할 수 있습니다. 잠시 후 다시 시도해주세요.')
    } catch (err) {
      setError(err.message)
      setStatus('')
    }
    setGenerating(false)
  }

  if (!HEYGEN_KEY) {
    return <div className="p-8 text-center text-text-muted">VITE_HEYGEN_API_KEY를 .env.local에 추가해주세요.</div>
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold text-text">숏폼 테스트</h1>

      {/* 대본 미리보기 */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="text-base font-semibold text-text mb-3">대본 (30초)</h2>
        <div className="space-y-2">
          {mockScript.scenes.map((s, i) => {
            const typeLabel = { avatar: '아바타', avatar_keyword: '키워드', infographic: '인포그래픽' }[s.type] || s.type
            const typeColor = { avatar: 'text-primary bg-primary/10', avatar_keyword: 'text-warning bg-warning/10', infographic: 'text-success bg-success/10' }[s.type] || 'text-text-muted bg-surface-light'
            return (
              <div key={i} className="flex gap-2 text-sm items-start">
                <div className="flex gap-1 shrink-0">
                  <span className="text-xs font-bold text-text-muted bg-surface-light px-1.5 py-0.5 rounded">씬{s.sceneNumber}</span>
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${typeColor}`}>{typeLabel}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-text-muted">{s.narration}</p>
                  {s.keyword && <p className="text-xs text-primary font-medium mt-0.5">키워드: {s.keyword}</p>}
                  {s.bullets && <p className="text-xs text-success mt-0.5">항목: {s.bullets.join(', ')}</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 아바타 선택 */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="text-base font-semibold text-text mb-3 flex items-center gap-2">
          아바타 선택 {selectedAvatar && <CheckCircle size={16} className="text-success" />}
        </h2>
        {presetLoading ? (
          <div className="flex items-center gap-2 py-4">
            <Loader2 size={16} className="text-primary animate-spin" />
            <span className="text-sm text-text-muted">아바타 목록 로딩 중...</span>
          </div>
        ) : (
          <div className="grid grid-cols-5 sm:grid-cols-8 gap-2 max-h-72 overflow-y-auto">
            {presetAvatars.slice(0, 40).map(av => (
              <div
                key={av.id}
                onClick={() => setSelectedAvatar(av.id)}
                className={`cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${selectedAvatar === av.id ? 'border-primary shadow-lg shadow-primary/20 scale-105' : 'border-transparent hover:border-border'}`}
              >
                <img src={av.preview} alt={av.name} className="w-full aspect-square object-cover" loading="lazy" />
                <p className="text-[9px] text-center text-text-muted truncate px-0.5 py-0.5">{av.name}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 나레이션 목소리 선택 */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="text-base font-semibold text-text mb-3 flex items-center gap-2">
          나레이션 목소리 {selectedVoice && <CheckCircle size={16} className="text-success" />}
        </h2>
        {voicesLoading ? (
          <div className="flex items-center gap-2 py-4">
            <Loader2 size={16} className="text-primary animate-spin" />
            <span className="text-sm text-text-muted">음성 목록 로딩 중...</span>
          </div>
        ) : (
          <>
            {selectedVoice && (() => {
              const sv = voices.find(v => v.voice_id === selectedVoice)
              if (!sv) return null
              return (
                <div className="flex items-center gap-3 px-3 py-2.5 bg-primary/5 border border-primary/20 rounded-lg mb-3">
                  <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">
                    {(sv.gender || '').toLowerCase().startsWith('f') ? 'F' : 'M'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary truncate">{sv.name}</p>
                    <p className="text-xs text-text-muted">{[sv.language, sv.gender].filter(Boolean).join(' · ')}</p>
                  </div>
                  <CheckCircle size={14} className="text-primary shrink-0" />
                </div>
              )
            })()}
            <div className="max-h-56 overflow-y-auto space-y-1 border border-border rounded-lg p-1.5">
              {voices.slice(0, 50).map(v => {
                const isSelected = selectedVoice === v.voice_id
                return (
                  <button
                    key={v.voice_id}
                    onClick={() => setSelectedVoice(v.voice_id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-all ${isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-surface-light border border-transparent'}`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${isSelected ? 'bg-primary text-white' : 'bg-surface-light text-text-muted border border-border'}`}>
                      {(v.gender || '').toLowerCase().startsWith('f') ? 'F' : (v.gender || '').toLowerCase().startsWith('m') ? 'M' : '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : 'text-text'}`}>
                        {v.name}
                        {v.language === 'Korean' && <span className="ml-1 text-[9px] text-success bg-success/10 px-1 rounded">KO</span>}
                      </p>
                      <p className="text-xs text-text-muted truncate">{[v.language, v.gender].filter(Boolean).join(' · ')}</p>
                    </div>
                    {v.preview_audio && (
                      <div role="button" onClick={e => { e.stopPropagation(); playPreview(v.voice_id, v.preview_audio) }}
                        className={`p-1 rounded-md transition-all shrink-0 cursor-pointer ${playingVoice === v.voice_id ? 'bg-primary/20 text-primary' : 'bg-surface-light text-text-muted hover:text-primary'}`}>
                        {playingVoice === v.voice_id ? <Pause size={12} /> : <Play size={12} />}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* 자막 스타일 */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="text-base font-semibold text-text mb-3">자막 스타일</h2>
        <div className="flex gap-3">
          {[
            { value: 'classic', label: 'Classic', desc: '흰 글자 + 검정 반투명 박스' },
            { value: 'classic2', label: 'Classic 2', desc: '흰 글자 + 외곽선 (배경 없음)' },
          ].map(s => (
            <button
              key={s.value}
              onClick={() => setSubtitleStyle(s.value)}
              className={`flex-1 p-3 rounded-xl text-left transition-all border ${subtitleStyle === s.value ? 'bg-primary/10 border-primary/30' : 'bg-surface-light border-border hover:border-primary/20'}`}
            >
              <p className={`text-sm font-semibold ${subtitleStyle === s.value ? 'text-primary' : 'text-text'}`}>{s.label}</p>
              <p className="text-xs text-text-muted mt-0.5">{s.desc}</p>
            </button>
          ))}
        </div>
        {/* 자막 미리보기 (맑은 고딕 기준) */}
        <div className="bg-slate-900 rounded-xl flex items-end justify-center mt-4 pb-6 px-6" style={{ height: 140, fontFamily: '"Pretendard", "Malgun Gothic", sans-serif' }}>
          {subtitleStyle === 'classic' && (
            <div className="bg-black/70 px-4 py-2 rounded">
              <p className="text-white text-sm text-center" style={{ fontFamily: '"Pretendard", "Malgun Gothic", sans-serif' }}>안녕하세요. AI 시장을 분석합니다.</p>
            </div>
          )}
          {subtitleStyle === 'classic2' && (
            <div className="px-4 py-2">
              <p className="text-white text-sm text-center" style={{ fontFamily: '"Pretendard", "Malgun Gothic", sans-serif', textShadow: '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000' }}>안녕하세요. AI 시장을 분석합니다.</p>
            </div>
          )}
        </div>
      </div>

      {/* 영상 생성 */}
      <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
        <h2 className="text-base font-semibold text-text flex items-center gap-2">
          영상 생성 {video && <CheckCircle size={16} className="text-success" />}
        </h2>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <XCircle size={14} className="text-red-400 shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {status && !video && generating && (
          <div className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex items-center gap-2">
              <Loader2 size={14} className="text-primary animate-spin" />
              <p className="text-sm text-primary">{status}</p>
            </div>
            <button onClick={() => { abortRef.current = true }}
              className="px-3 py-1.5 bg-red-500/10 text-red-400 text-sm font-medium rounded-lg hover:bg-red-500/20 border border-red-500/20 transition-all flex items-center gap-1">
              <XCircle size={12} /> 중단
            </button>
          </div>
        )}

        {video ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-success/5 rounded-lg border border-success/20">
              <CheckCircle size={16} className="text-success" />
              <div className="flex-1">
                <p className="text-sm font-medium text-text">영상 생성 완료</p>
                <p className="text-xs text-text-muted">{video.duration}초</p>
              </div>
              <button onClick={() => { setVideo(null); setError(null); setStatus('') }} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-surface-light hover:bg-surface text-text-muted border border-border transition-all flex items-center gap-1">
                <RefreshCw size={10} /> 재생성
              </button>
            </div>
            {video.url && (
              <div className="flex flex-col items-center gap-3">
                <div className="w-full max-w-[280px] rounded-xl overflow-hidden border-2 border-primary/30 shadow-lg bg-black" style={{ aspectRatio: '9/16' }}>
                  <video src={video.url.startsWith('/') ? video.url : video.url} controls playsInline crossOrigin="anonymous" className="w-full h-full object-contain" />
                </div>
                <div className="flex items-center gap-2">
                  <a href={video.url} download="shorts_final.mp4" target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-all">
                    <Download size={14} /> {video.srtUrl ? '자막 포함' : '원본'} 다운로드
                  </a>
                  {video.urlRaw && (
                    <a href={video.urlRaw} download="shorts_raw.mp4" target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 bg-surface-light text-text-muted text-sm font-medium rounded-lg hover:bg-surface border border-border transition-all">
                      <Download size={14} /> 원본
                    </a>
                  )}
                </div>
                {video.srtUrl && <p className="text-xs text-success">자막이 영상에 포함되었습니다</p>}
                {!video.srtUrl && <p className="text-xs text-warning">자막 번인 실패 — 원본 영상입니다</p>}
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={generateVideo}
            disabled={!selectedAvatar || !selectedVoice || generating}
            className="w-full px-4 py-3 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {generating ? <><Loader2 size={16} className="animate-spin" /> 생성 중...</> : <><Film size={16} /> 숏폼 영상 생성</>}
          </button>
        )}

        {!selectedAvatar && <p className="text-xs text-text-muted">아바타를 선택해주세요</p>}
        {selectedAvatar && !selectedVoice && <p className="text-xs text-text-muted">목소리를 선택해주세요</p>}
      </div>
    </div>
  )
}
