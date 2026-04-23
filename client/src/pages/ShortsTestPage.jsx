import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle,
  Download,
  Film,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  XCircle,
} from 'lucide-react'

const API_BASE = import.meta.env.VITE_SERVER_URL || ''
const API_SECRET = import.meta.env.VITE_API_SECRET || ''

const API_HEADERS = API_SECRET ? { 'x-app-secret': API_SECRET } : {}
const JSON_HEADERS = {
  'Content-Type': 'application/json',
  ...API_HEADERS,
}

const mockScript = {
  title: '2024 AI 시장 핵심 분석',
  duration: '30',
  scenes: [
    { sceneNumber: 1, type: 'avatar', narration: '안녕하세요. 오늘은 2024년 글로벌 AI 시장의 핵심 트렌드를 빠르게 정리해보겠습니다.', keyword: '' },
    { sceneNumber: 2, type: 'avatar_keyword', narration: '올해 글로벌 AI 시장은 184조 원을 돌파하며 역대 최대 규모를 기록했습니다.', keyword: '글로벌 AI 시장 184조 원 돌파' },
    { sceneNumber: 3, type: 'infographic', narration: '특히 생성형 AI가 큰 폭으로 성장하면서 전체 시장 확대를 주도하고 있습니다.', keyword: '분야별 성장률', bullets: ['생성형 AI: +67.2%', '자연어처리: +41.8%', '컴퓨터 비전: +29.3%'] },
    { sceneNumber: 4, type: 'avatar_keyword', narration: '아시아태평양 지역도 31.5퍼센트 수준으로 빠르게 추격하고 있습니다.', keyword: '아시아태평양 지역 31.5% 추격' },
    { sceneNumber: 5, type: 'avatar', narration: '2030년까지 더 큰 성장세가 예상됩니다. 자세한 내용은 본문 링크에서 확인하세요.', keyword: '' },
  ],
}

function fetchJson(path, options = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? JSON_HEADERS : API_HEADERS),
      ...(options.headers || {}),
    },
  })
}

export default function ShortsTestPage() {
  const [presetAvatars, setPresetAvatars] = useState([])
  const [presetLoading, setPresetLoading] = useState(false)
  const [selectedAvatar, setSelectedAvatar] = useState(null)
  const [voices, setVoices] = useState([])
  const [voicesLoading, setVoicesLoading] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState(null)
  const [playingVoice, setPlayingVoice] = useState(null)
  const [subtitleStyle, setSubtitleStyle] = useState('classic')
  const [generating, setGenerating] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState(null)
  const [video, setVideo] = useState(null)

  const previewAudioRef = useRef(null)
  const abortRef = useRef(false)

  const narrationText = useMemo(
    () => mockScript.scenes.map((scene) => scene.narration).join(' '),
    []
  )

  useEffect(() => {
    setPresetLoading(true)
    fetchJson('/api/heygen/preset-avatars')
      .then((response) => response.json())
      .then((data) => {
        const presets = data.presets || []
        setPresetAvatars(presets)
        if (!selectedAvatar && presets[0]?.id) {
          setSelectedAvatar(presets[0].id)
        }
      })
      .catch((err) => {
        setError(`아바타 목록 로드 실패: ${err.message}`)
      })
      .finally(() => setPresetLoading(false))
  }, [selectedAvatar])

  useEffect(() => {
    setVoicesLoading(true)
    fetchJson('/api/heygen/voices')
      .then((response) => response.json())
      .then((data) => {
        const all = data?.data?.voices || []
        const filtered = all.filter((voice) => (voice.language || '').includes('Korean') || voice.support_locale)
        setVoices(filtered)
        if (!selectedVoice && filtered[0]?.voice_id) {
          setSelectedVoice(filtered[0].voice_id)
        }
      })
      .catch((err) => {
        setError(`음성 목록 로드 실패: ${err.message}`)
      })
      .finally(() => setVoicesLoading(false))
  }, [selectedVoice])

  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause()
    }
  }, [])

  const playPreview = (voiceId, url) => {
    if (!url) return

    if (playingVoice === voiceId) {
      previewAudioRef.current?.pause()
      setPlayingVoice(null)
      return
    }

    previewAudioRef.current?.pause()
    const audio = new Audio(url)
    previewAudioRef.current = audio
    audio.play().catch(() => setPlayingVoice(null))
    audio.onended = () => setPlayingVoice(null)
    setPlayingVoice(voiceId)
  }

  const resetResult = () => {
    setVideo(null)
    setError(null)
    setStatus('')
  }

  const generateVideo = async () => {
    if (!selectedAvatar || !selectedVoice) return

    abortRef.current = false
    setGenerating(true)
    setError(null)
    setVideo(null)
    setStatus('인포그래픽 배경 생성 중...')

    try {
      const infographicScenes = mockScript.scenes.filter((scene) => scene.type === 'infographic')
      const infographicUrls = {}

      if (infographicScenes.length > 0) {
        const generateResponse = await fetchJson('/api/infographic/generate', {
          method: 'POST',
          body: JSON.stringify({ scenes: infographicScenes }),
        })
        const generateData = await generateResponse.json()
        if (!generateResponse.ok) {
          throw new Error(generateData.error || `인포그래픽 생성 실패 (${generateResponse.status})`)
        }

        for (const image of (generateData.images || [])) {
          if (image.error || !image.path) continue

          setStatus(`인포그래픽 씬 ${image.sceneNumber} 업로드 중...`)
          const uploadResponse = await fetchJson('/api/infographic/upload-to-heygen', {
            method: 'POST',
            body: JSON.stringify({ localPath: image.path }),
          })
          const uploadData = await uploadResponse.json()
          if (!uploadResponse.ok) {
            throw new Error(uploadData.error || `인포그래픽 업로드 실패 (${uploadResponse.status})`)
          }

          const imageUrl = uploadData.data?.url
          if (imageUrl) {
            infographicUrls[image.sceneNumber] = imageUrl
          }
        }
      }

      setStatus('HeyGen 영상 생성 요청 중...')
      const avatarBackground = { type: 'color', value: '#1a1a2e' }
      const videoInputs = mockScript.scenes.map((scene) => {
        if (scene.type === 'infographic' && infographicUrls[scene.sceneNumber]) {
          return {
            character: {
              type: 'talking_photo',
              talking_photo_id: selectedAvatar,
              scale: 0.001,
              offset: { x: 1.0, y: 1.0 },
            },
            voice: { type: 'text', input_text: scene.narration, voice_id: selectedVoice },
            background: { type: 'image', url: infographicUrls[scene.sceneNumber], fit: 'cover' },
          }
        }

        return {
          character: {
            type: 'talking_photo',
            talking_photo_id: selectedAvatar,
            scale: 3.0,
            offset: { x: 0.0, y: 0.0 },
          },
          voice: { type: 'text', input_text: scene.narration, voice_id: selectedVoice },
          background: avatarBackground,
        }
      })

      const generateResponse = await fetchJson('/api/heygen/video/generate', {
        method: 'POST',
        body: JSON.stringify({
          video_inputs: videoInputs,
          dimension: { width: 1080, height: 1920 },
        }),
      })
      const generateData = await generateResponse.json()
      if (!generateResponse.ok) {
        throw new Error(generateData.error?.message || generateData.error || `HeyGen 오류 (${generateResponse.status})`)
      }

      const videoId = generateData.data?.video_id
      if (!videoId) {
        throw new Error('video_id를 받지 못했습니다.')
      }

      setStatus('HeyGen 렌더링 대기 중...')
      for (let attempt = 0; attempt < 240; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5000))
        if (abortRef.current) {
          setStatus('중단됨')
          setGenerating(false)
          return
        }

        const statusResponse = await fetchJson(`/api/heygen/video/status/${videoId}`)
        if (!statusResponse.ok) continue

        const statusData = await statusResponse.json()
        const state = statusData.data?.status
        const elapsed = (attempt + 1) * 5
        const min = Math.floor(elapsed / 60)
        const sec = elapsed % 60
        setStatus(`렌더링 중... (${min > 0 ? `${min}분 ` : ''}${sec}초 경과) [${state || 'processing'}]`)

        if (state === 'completed') {
          const rawUrl = statusData.data?.video_url
          setStatus('자막 번인 중...')

          try {
            const burnResponse = await fetchJson('/api/subtitle/burn', {
              method: 'POST',
              body: JSON.stringify({
                videoUrl: rawUrl,
                scenes: mockScript.scenes,
                subtitleStyle,
              }),
            })
            const burnData = await burnResponse.json()

            if (burnResponse.ok && burnData.url) {
              setVideo({
                url: burnData.url,
                urlRaw: rawUrl,
                duration: statusData.data?.duration,
                srtUrl: burnData.srtUrl,
              })
              setStatus('완료')
              setGenerating(false)
              return
            }
          } catch {
            // fallback to raw video
          }

          setVideo({
            url: rawUrl,
            duration: statusData.data?.duration,
          })
          setStatus('완료 (원본 영상)')
          setGenerating(false)
          return
        }

        if (state === 'failed') {
          const detail = statusData.data?.error
          const message =
            typeof detail === 'object'
              ? (detail.message || detail.detail || JSON.stringify(detail))
              : (detail || '알 수 없는 오류')
          throw new Error(message)
        }
      }

      throw new Error('렌더링 시간 초과 (20분)')
    } catch (err) {
      setError(err.message)
      setStatus('')
    }

    setGenerating(false)
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-text">숏츠 테스트</h1>
        <span className="text-xs font-bold px-2 py-1 rounded-full bg-primary/10 text-primary">HeyGen 기본 아바타</span>
      </div>

      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="text-base font-semibold text-text mb-3">대본 (30초)</h2>
        <div className="space-y-2">
          {mockScript.scenes.map((scene) => {
            const typeLabel = { avatar: '아바타', avatar_keyword: '키워드', infographic: '인포그래픽' }[scene.type] || scene.type
            return (
              <div key={scene.sceneNumber} className="flex gap-2 text-sm items-start">
                <div className="flex gap-1 shrink-0">
                  <span className="text-xs font-bold text-text-muted bg-surface-light px-1.5 py-0.5 rounded">
                    씬 {scene.sceneNumber}
                  </span>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded text-primary bg-primary/10">
                    {typeLabel}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-text-muted">{scene.narration}</p>
                  {scene.keyword ? (
                    <p className="text-xs text-primary font-medium mt-0.5">키워드: {scene.keyword}</p>
                  ) : null}
                  {scene.bullets ? (
                    <p className="text-xs text-success mt-0.5">항목: {scene.bullets.join(', ')}</p>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-text-muted mt-4">총 나레이션 길이 참고: {narrationText.length}자</p>
      </div>

      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="text-base font-semibold text-text mb-3 flex items-center gap-2">
          기본 아바타 선택 {selectedAvatar ? <CheckCircle size={16} className="text-success" /> : null}
        </h2>
        {presetLoading ? (
          <div className="flex items-center gap-2 py-4">
            <Loader2 size={16} className="text-primary animate-spin" />
            <span className="text-sm text-text-muted">아바타 목록 로딩 중...</span>
          </div>
        ) : (
          <div className="grid grid-cols-5 sm:grid-cols-8 gap-2 max-h-72 overflow-y-auto">
            {presetAvatars.slice(0, 40).map((avatar) => (
              <div
                key={avatar.id}
                onClick={() => setSelectedAvatar(avatar.id)}
                className={`cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                  selectedAvatar === avatar.id
                    ? 'border-primary shadow-lg shadow-primary/20 scale-105'
                    : 'border-transparent hover:border-border'
                }`}
              >
                <img src={avatar.preview} alt={avatar.name} className="w-full aspect-square object-cover" loading="lazy" />
                <p className="text-[9px] text-center text-text-muted truncate px-0.5 py-0.5">{avatar.name}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="text-base font-semibold text-text mb-3 flex items-center gap-2">
          나레이션 음성 선택 {selectedVoice ? <CheckCircle size={16} className="text-success" /> : null}
        </h2>
        {voicesLoading ? (
          <div className="flex items-center gap-2 py-4">
            <Loader2 size={16} className="text-primary animate-spin" />
            <span className="text-sm text-text-muted">음성 목록 로딩 중...</span>
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto space-y-1 border border-border rounded-lg p-1.5">
            {voices.slice(0, 50).map((voice) => {
              const isSelected = selectedVoice === voice.voice_id
              return (
                <button
                  key={voice.voice_id}
                  onClick={() => setSelectedVoice(voice.voice_id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-all ${
                    isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-surface-light border border-transparent'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                      isSelected ? 'bg-primary text-white' : 'bg-surface-light text-text-muted border border-border'
                    }`}
                  >
                    {(voice.gender || '').toLowerCase().startsWith('f')
                      ? 'F'
                      : (voice.gender || '').toLowerCase().startsWith('m')
                        ? 'M'
                        : '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : 'text-text'}`}>
                      {voice.name}
                    </p>
                    <p className="text-xs text-text-muted truncate">
                      {[voice.language, voice.gender].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {voice.preview_audio ? (
                    <div
                      role="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        playPreview(voice.voice_id, voice.preview_audio)
                      }}
                      className={`p-1 rounded-md transition-all shrink-0 cursor-pointer ${
                        playingVoice === voice.voice_id
                          ? 'bg-primary/20 text-primary'
                          : 'bg-surface-light text-text-muted hover:text-primary'
                      }`}
                    >
                      {playingVoice === voice.voice_id ? <Pause size={12} /> : <Play size={12} />}
                    </div>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="text-base font-semibold text-text mb-3">자막 스타일</h2>
        <div className="flex gap-3">
          {[
            { value: 'classic', label: 'Classic', desc: '흰 글자 + 검정 반투명 박스' },
            { value: 'classic2', label: 'Classic 2', desc: '흰 글자 + 외곽선' },
          ].map((item) => (
            <button
              key={item.value}
              onClick={() => setSubtitleStyle(item.value)}
              className={`flex-1 p-3 rounded-xl text-left transition-all border ${
                subtitleStyle === item.value
                  ? 'bg-primary/10 border-primary/30'
                  : 'bg-surface-light border-border hover:border-primary/20'
              }`}
            >
              <p className={`text-sm font-semibold ${subtitleStyle === item.value ? 'text-primary' : 'text-text'}`}>
                {item.label}
              </p>
              <p className="text-xs text-text-muted mt-0.5">{item.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
        <h2 className="text-base font-semibold text-text flex items-center gap-2">
          영상 생성 {video ? <CheckCircle size={16} className="text-success" /> : null}
        </h2>

        {error ? (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <XCircle size={14} className="text-red-400 shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        ) : null}

        {status && generating && !video ? (
          <div className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex items-center gap-2">
              <Loader2 size={14} className="text-primary animate-spin" />
              <p className="text-sm text-primary">{status}</p>
            </div>
            <button
              onClick={() => {
                abortRef.current = true
              }}
              className="px-3 py-1.5 bg-red-500/10 text-red-400 text-sm font-medium rounded-lg hover:bg-red-500/20 border border-red-500/20 transition-all flex items-center gap-1"
            >
              <XCircle size={12} /> 중단
            </button>
          </div>
        ) : null}

        {!API_SECRET ? (
          <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning/20 rounded-lg">
            <AlertTriangle size={14} className="text-warning shrink-0" />
            <p className="text-sm text-warning">배포 환경에서는 `VITE_API_SECRET`가 없으면 테스트 페이지 호출이 실패할 수 있습니다.</p>
          </div>
        ) : null}

        {video ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-success/5 rounded-lg border border-success/20">
              <CheckCircle size={16} className="text-success" />
              <div className="flex-1">
                <p className="text-sm font-medium text-text">영상 생성 완료</p>
                <p className="text-xs text-text-muted">{video.duration}초</p>
              </div>
              <button
                onClick={resetResult}
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-surface-light hover:bg-surface text-text-muted border border-border transition-all flex items-center gap-1"
              >
                <RefreshCw size={10} /> 재생성
              </button>
            </div>
            {video.url ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-full max-w-[280px] rounded-xl overflow-hidden border-2 border-primary/30 shadow-lg bg-black" style={{ aspectRatio: '9/16' }}>
                  <video src={video.url} controls playsInline crossOrigin="anonymous" className="w-full h-full object-contain" />
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={video.url}
                    download="shorts_test.mp4"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-all"
                  >
                    <Download size={14} /> {video.srtUrl ? '자막 포함' : '원본'} 다운로드
                  </a>
                  {video.urlRaw ? (
                    <a
                      href={video.urlRaw}
                      download="shorts_test_raw.mp4"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 bg-surface-light text-text-muted text-sm font-medium rounded-lg hover:bg-surface border border-border transition-all"
                    >
                      <Download size={14} /> 원본
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <button
            onClick={generateVideo}
            disabled={!selectedAvatar || !selectedVoice || generating}
            className="w-full px-4 py-3 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {generating ? (
              <>
                <Loader2 size={16} className="animate-spin" /> 생성 중...
              </>
            ) : (
              <>
                <Film size={16} /> 숏츠 테스트 영상 생성
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
