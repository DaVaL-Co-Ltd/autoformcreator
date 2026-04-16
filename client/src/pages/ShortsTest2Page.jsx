import { useState, useEffect, useRef, useMemo } from 'react'
import { Player } from '@remotion/player'
import { Loader2, CheckCircle, Film, Play, Pause, RefreshCw, Download, XCircle, Eye } from 'lucide-react'
import { InfographicScene } from '../remotion/InfographicScene'
import { TitleScene } from '../remotion/TitleScene'

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

const FPS = 30
const SCENE_DURATION_FRAMES = 240 // 8 seconds per animated scene

export default function ShortsTest2Page() {
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
  const [previewScene, setPreviewScene] = useState(null)
  const [titleRendering, setTitleRendering] = useState(false)
  const [titleRenders, setTitleRenders] = useState([]) // [{ sceneNumber, url }]

  // Animated scenes for preview
  const animatedScenes = useMemo(() =>
    mockScript.scenes.filter(s => s.type === 'infographic' || s.type === 'avatar_keyword'),
    []
  )

  // Load preset avatars
  useEffect(() => {
    if (!HEYGEN_KEY) return
    setPresetLoading(true)
    fetch('/api/heygen/preset-avatars', { headers: { 'x-api-key': HEYGEN_KEY } })
      .then(r => r.json())
      .then(data => setPresetAvatars(data.presets || []))
      .catch(() => {})
      .finally(() => setPresetLoading(false))
  }, [])

  // Load voices
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

  const titleDesigns = ['gradient-box', 'underline', 'accent-bar', 'split-bar', 'ribbon', 'double-line', 'highlight-marker']
  const randomDesign = () => titleDesigns[Math.floor(Math.random() * titleDesigns.length)]
  const titlePalettes = [
    { bar: '#3B82F6', barEnd: '#8B5CF6', underline: '#FBBF24' },
    { bar: '#10B981', barEnd: '#06B6D4', underline: '#F97316' },
    { bar: '#F59E0B', barEnd: '#EF4444', underline: '#3B82F6' },
    { bar: '#8B5CF6', barEnd: '#EC4899', underline: '#34D399' },
    { bar: '#EC4899', barEnd: '#F43F5E', underline: '#22D3EE' },
    { bar: '#14B8A6', barEnd: '#0EA5E9', underline: '#FACC15' },
    { bar: '#F97316', barEnd: '#F59E0B', underline: '#A855F7' },
    { bar: '#6366F1', barEnd: '#0EA5E9', underline: '#FBBF24' },
    { bar: '#DC2626', barEnd: '#EA580C', underline: '#3B82F6' },
    { bar: '#9333EA', barEnd: '#C026D3', underline: '#34D399' },
  ]
  const randomPalette = () => titlePalettes[Math.floor(Math.random() * titlePalettes.length)]
  // 미리보기용 팔레트/디자인: previewScene 변경 시에만 재생성
  const previewPalette = useMemo(() => randomPalette(), [previewScene])
  const previewDesign = useMemo(() => randomDesign(), [previewScene])
  const sampleKeyword = '글로벌 AI 시장 184조 돌파'
  const [galleryRendering, setGalleryRendering] = useState(false)
  const [galleryRenders, setGalleryRenders] = useState([]) // [{ design, url }]

  const renderDesignGallery = async () => {
    setGalleryRendering(true)
    setGalleryRenders([])
    try {
      const results = []
      for (let i = 0; i < titleDesigns.length; i++) {
        const design = titleDesigns[i]
        const palette = randomPalette()
        const res = await fetch('/api/remotion/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            compositionId: 'Title',
            props: { keyword: sampleKeyword, design, palette },
            durationInFrames: SCENE_DURATION_FRAMES,
            fps: FPS,
            transparent: true,
          }),
        })
        const data = await res.json()
        if (res.ok && data.url) {
          results.push({ design, palette, url: data.url })
          setGalleryRenders([...results])
        }
      }
    } catch (err) {
      console.error('[갤러리 렌더 에러]', err)
    }
    setGalleryRendering(false)
  }

  const renderTitlePreviews = async () => {
    setTitleRendering(true)
    setTitleRenders([])
    try {
      const titleScenes = mockScript.scenes.filter(s => s.type === 'avatar_keyword' && s.keyword)
      const results = []
      for (const scene of titleScenes) {
        const design = randomDesign()
        const palette = randomPalette()
        const res = await fetch('/api/remotion/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            compositionId: 'Title',
            props: { keyword: scene.keyword, design, palette },
            durationInFrames: SCENE_DURATION_FRAMES,
            fps: FPS,
            transparent: true,
          }),
        })
        const data = await res.json()
        if (res.ok && data.url) {
          results.push({ sceneNumber: scene.sceneNumber, keyword: scene.keyword, url: data.url, design })
          setTitleRenders([...results])
        }
      }
    } catch (err) {
      console.error('[타이틀 미리보기 렌더 에러]', err)
    }
    setTitleRendering(false)
  }

  const generateVideo = async () => {
    if (!selectedAvatar || !selectedVoice) return
    abortRef.current = false
    setGenerating(true)
    setError(null)
    setVideo(null)
    setStatus('애니메이션 렌더링 준비 중...')

    try {
      // 1) Remotion으로 애니메이션 씬 렌더링
      //    - 인포그래픽: 불투명 MP4 → HeyGen 배경
      //    - 타이틀(avatar_keyword): 투명 WebM → 자막 번인 단계에서 오버레이
      const infographicHeygenUrls = {}
      const animatedTitles = [] // [{ sceneNumber, localPath }]

      for (const scene of mockScript.scenes) {
        if (abortRef.current) { setStatus('중단됨'); setGenerating(false); return }

        if (scene.type === 'infographic') {
          setStatus(`씬 ${scene.sceneNumber} 인포그래픽 애니메이션 렌더링 중...`)
          const renderRes = await fetch('/api/remotion/render', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              compositionId: 'Infographic',
              props: { keyword: scene.keyword, bullets: scene.bullets },
              durationInFrames: SCENE_DURATION_FRAMES,
              fps: FPS,
            }),
          })
          const renderData = await renderRes.json()
          if (!renderRes.ok || !renderData.filePath) throw new Error(renderData.error || `씬 ${scene.sceneNumber} 렌더링 실패`)

          setStatus(`씬 ${scene.sceneNumber} HeyGen 업로드 중...`)
          const uploadRes = await fetch('/api/remotion/upload-to-heygen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': HEYGEN_KEY },
            body: JSON.stringify({ localPath: renderData.filePath }),
          })
          const uploadData = await uploadRes.json()
          if (uploadData.data?.url) infographicHeygenUrls[scene.sceneNumber] = uploadData.data.url
        } else if (scene.type === 'avatar_keyword' && scene.keyword) {
          setStatus(`씬 ${scene.sceneNumber} 타이틀 애니메이션 렌더링 중...`)
          const design = randomDesign()
          const palette = randomPalette()
          const renderRes = await fetch('/api/remotion/render', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              compositionId: 'Title',
              props: { keyword: scene.keyword, design, palette },
              durationInFrames: SCENE_DURATION_FRAMES,
              fps: FPS,
              transparent: true,
            }),
          })
          const renderData = await renderRes.json()
          if (!renderRes.ok || !renderData.filePath) throw new Error(renderData.error || `씬 ${scene.sceneNumber} 타이틀 렌더링 실패`)
          animatedTitles.push({ sceneNumber: scene.sceneNumber, localPath: renderData.filePath })
        }
      }

      // 2) 멀티씬 video_inputs 구성
      //    - 인포그래픽: Remotion 배경 영상, 아바타 숨김
      //    - avatar_keyword: 일반 아바타 (타이틀은 번인 단계에서 오버레이)
      //    - avatar: 일반 아바타
      setStatus('영상 생성 요청 중...')
      const avatarBg = { type: 'color', value: '#1a1a2e' }

      const videoInputs = mockScript.scenes.map(scene => {
        if (scene.type === 'infographic' && infographicHeygenUrls[scene.sceneNumber]) {
          return {
            character: { type: 'talking_photo', talking_photo_id: selectedAvatar, scale: 0.001, offset: { x: 1.0, y: 1.0 } },
            voice: { type: 'text', input_text: scene.narration, voice_id: selectedVoice },
            background: { type: 'video', url: infographicHeygenUrls[scene.sceneNumber], play_style: 'freeze' },
          }
        }
        return {
          character: { type: 'talking_photo', talking_photo_id: selectedAvatar, scale: 3.0, offset: { x: 0.0, y: 0.0 } },
          voice: { type: 'text', input_text: scene.narration, voice_id: selectedVoice },
          background: avatarBg,
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

      // 4) 폴링 (최대 20분)
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
              body: JSON.stringify({ videoUrl: rawUrl, scenes: mockScript.scenes, subtitleStyle, animatedTitles }),
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
      throw new Error('렌더링 시간 초과 (20분)')
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
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-text">숏폼 테스트 2</h1>
        <span className="text-xs font-bold px-2 py-1 rounded-full bg-purple-500/10 text-purple-400">Remotion</span>
      </div>

      {/* 대본 미리보기 */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="text-base font-semibold text-text mb-3">대본 (30초)</h2>
        <div className="space-y-2">
          {mockScript.scenes.map((s, i) => {
            const typeLabel = { avatar: '아바타', avatar_keyword: '타이틀', infographic: '인포그래픽' }[s.type] || s.type
            const typeColor = { avatar: 'text-primary bg-primary/10', avatar_keyword: 'text-warning bg-warning/10', infographic: 'text-success bg-success/10' }[s.type] || 'text-text-muted bg-surface-light'
            const isAnimated = s.type === 'infographic' || s.type === 'avatar_keyword'
            return (
              <div key={i} className="flex gap-2 text-sm items-start">
                <div className="flex gap-1 shrink-0">
                  <span className="text-xs font-bold text-text-muted bg-surface-light px-1.5 py-0.5 rounded">씬{s.sceneNumber}</span>
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${typeColor}`}>{typeLabel}</span>
                  {isAnimated && <span className="text-xs font-bold px-1.5 py-0.5 rounded text-purple-400 bg-purple-500/10">애니</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-text-muted">{s.narration}</p>
                  {s.keyword && <p className="text-xs text-primary font-medium mt-0.5">키워드: {s.keyword}</p>}
                  {s.bullets && <p className="text-xs text-success mt-0.5">항목: {s.bullets.join(', ')}</p>}
                </div>
                {isAnimated && (
                  <button
                    onClick={() => setPreviewScene(previewScene === s.sceneNumber ? null : s.sceneNumber)}
                    className={`shrink-0 p-1.5 rounded-lg transition-all ${previewScene === s.sceneNumber ? 'bg-purple-500/20 text-purple-400' : 'bg-surface-light text-text-muted hover:text-purple-400'}`}
                  >
                    <Eye size={14} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Remotion 미리보기 */}
      {previewScene && (() => {
        const scene = mockScript.scenes.find(s => s.sceneNumber === previewScene)
        if (!scene) return null
        const isInfog = scene.type === 'infographic'
        const Component = isInfog ? InfographicScene : TitleScene
        const props = isInfog
          ? { keyword: scene.keyword, bullets: scene.bullets }
          : { keyword: scene.keyword, design: previewDesign, palette: previewPalette }
        return (
          <div className="bg-surface rounded-xl border border-purple-500/30 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-text flex items-center gap-2">
                <Eye size={16} className="text-purple-400" />
                씬 {previewScene} 애니메이션 미리보기
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400">
                  {isInfog ? '인포그래픽' : '타이틀'}
                </span>
              </h2>
              <button onClick={() => setPreviewScene(null)} className="text-xs text-text-muted hover:text-text px-2 py-1 rounded bg-surface-light">
                닫기
              </button>
            </div>
            <div className="flex justify-center">
              <div className="rounded-xl overflow-hidden border-2 border-purple-500/20 shadow-lg shadow-purple-500/10 relative" style={{ width: 270, height: 480, background: isInfog ? 'transparent' : 'linear-gradient(180deg, #1a1a2e 0%, #2a2a4e 100%)' }}>
                <Player
                  component={Component}
                  inputProps={props}
                  durationInFrames={SCENE_DURATION_FRAMES}
                  fps={FPS}
                  compositionWidth={1080}
                  compositionHeight={1920}
                  style={{ width: 270, height: 480 }}
                  controls
                  autoPlay
                  loop
                />
              </div>
            </div>
            {!isInfog && (
              <p className="text-xs text-text-muted text-center mt-2">
                ※ 미리보기 배경은 샘플입니다. 실제 영상에서는 아바타가 말하는 화면 위에 오버레이됩니다.
              </p>
            )}
          </div>
        )
      })()}

      {/* 씬 2/4 타이틀 렌더 미리보기 */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-text flex items-center gap-2">
            <Film size={16} className="text-purple-400" />
            씬 2 · 씬 4 타이틀 애니메이션 렌더 미리보기
          </h2>
          <button
            onClick={renderTitlePreviews}
            disabled={titleRendering}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            {titleRendering ? <><Loader2 size={12} className="animate-spin" /> 렌더 중...</> : <><RefreshCw size={12} /> 렌더</>}
          </button>
        </div>
        <p className="text-xs text-text-muted mb-3">
          실제 영상에서는 아래 투명 타이틀이 아바타가 말하는 화면 위에 합성됩니다.
        </p>
        {titleRenders.length === 0 && !titleRendering && (
          <div className="text-center py-6 text-sm text-text-muted">
            렌더 버튼을 눌러 씬 2/4 타이틀 WebM 렌더 결과를 확인하세요
          </div>
        )}
        {titleRenders.length > 0 && (
          <div className="grid grid-cols-2 gap-4">
            {titleRenders.map(t => (
              <div key={t.sceneNumber} className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-xs font-bold text-text-muted bg-surface-light px-1.5 py-0.5 rounded">씬 {t.sceneNumber}</span>
                  <span className="text-xs font-bold text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">{t.design}</span>
                </div>
                <p className="text-xs text-text-muted truncate">{t.keyword}</p>
                <div
                  className="rounded-xl overflow-hidden border-2 border-purple-500/20 mx-auto"
                  style={{
                    aspectRatio: '9/16',
                    maxWidth: 260,
                    background: 'linear-gradient(180deg, #1a1a2e 0%, #2a2a4e 100%)',
                  }}
                >
                  <video src={t.url} autoPlay loop muted playsInline className="w-full h-full object-contain" />
                </div>
                <a
                  href={t.url}
                  download={`title_scene${t.sceneNumber}.webm`}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-light text-text-muted hover:bg-surface border border-border transition-all"
                >
                  <Download size={11} /> WebM 다운로드
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 타이틀 디자인 갤러리 */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-text flex items-center gap-2">
            <Film size={16} className="text-purple-400" />
            타이틀 디자인 갤러리 ({titleDesigns.length}종)
          </h2>
          <button
            onClick={renderDesignGallery}
            disabled={galleryRendering}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            {galleryRendering ? <><Loader2 size={12} className="animate-spin" /> 렌더 중... ({galleryRenders.length}/{titleDesigns.length})</> : <><RefreshCw size={12} /> 전체 디자인 렌더</>}
          </button>
        </div>
        <p className="text-xs text-text-muted mb-3">
          동일한 텍스트 "{sampleKeyword}"를 모든 디자인 변형으로 렌더링합니다.
        </p>
        {galleryRenders.length === 0 && !galleryRendering && (
          <div className="text-center py-6 text-sm text-text-muted">
            렌더 버튼을 눌러 {titleDesigns.length}가지 디자인 변형을 확인하세요
          </div>
        )}
        {galleryRenders.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {galleryRenders.map((g, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">{g.design}</span>
                </div>
                <div
                  className="rounded-xl overflow-hidden border-2 border-purple-500/20"
                  style={{
                    aspectRatio: '9/16',
                    background: 'linear-gradient(180deg, #1a1a2e 0%, #2a2a4e 100%)',
                  }}
                >
                  <video src={g.url} autoPlay loop muted playsInline className="w-full h-full object-contain" />
                </div>
              </div>
            ))}
          </div>
        )}
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
                  <video src={video.url} controls playsInline crossOrigin="anonymous" className="w-full h-full object-contain" />
                </div>
                <div className="flex items-center gap-2">
                  <a href={video.url} download="shorts_remotion.mp4" target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-all">
                    <Download size={14} /> {video.srtUrl ? '자막 포함' : '원본'} 다운로드
                  </a>
                  {video.urlRaw && (
                    <a href={video.urlRaw} download="shorts_remotion_raw.mp4" target="_blank" rel="noopener noreferrer"
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
            className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-primary text-white text-sm font-semibold rounded-lg hover:from-purple-700 hover:to-primary-dark disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {generating ? <><Loader2 size={16} className="animate-spin" /> 생성 중...</> : <><Film size={16} /> Remotion 숏폼 생성</>}
          </button>
        )}

        {!selectedAvatar && <p className="text-xs text-text-muted">아바타를 선택해주세요</p>}
        {selectedAvatar && !selectedVoice && <p className="text-xs text-text-muted">목소리를 선택해주세요</p>}
      </div>
    </div>
  )
}
