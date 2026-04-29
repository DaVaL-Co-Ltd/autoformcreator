import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Play, Pause, Download, ArrowLeft, Volume2, VolumeX } from 'lucide-react'

export default function ShortsViewerPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const audioRefs = useRef([])
  const playingSceneRef = useRef(-1)

  const {
    combinedVideoUrl,
    sceneTimings = [],
    scenes = [],
    narrations = [],
    title = '숏폼 영상',
  } = location.state || {}

  const [playing, setPlaying] = useState(false)
  const [currentScene, setCurrentScene] = useState(-1)
  const [muted, setMuted] = useState(false)

  // 데이터 없으면 돌아가기
  useEffect(() => {
    if (!combinedVideoUrl && !scenes.length) {
      navigate('/extraction', { replace: true })
    }
  }, [combinedVideoUrl, scenes, navigate])

  const getSceneAtTime = (t) => {
    for (let i = 0; i < sceneTimings.length; i++) {
      const s = sceneTimings[i]
      if (t >= s.startTime && t < s.startTime + s.duration) return i
    }
    return -1
  }

  const handleTimeUpdate = () => {
    const video = videoRef.current
    if (!video || !sceneTimings.length) return
    const sceneIdx = getSceneAtTime(video.currentTime)
    if (sceneIdx !== currentScene) setCurrentScene(sceneIdx)

    if (sceneIdx !== playingSceneRef.current) {
      audioRefs.current.forEach(a => { if (a) { a.pause(); a.currentTime = 0 } })
      if (sceneIdx >= 0 && !video.paused && !muted) {
        const audio = audioRefs.current[sceneIdx]
        if (audio) { audio.currentTime = 0; audio.play().catch(() => {}) }
      }
      playingSceneRef.current = sceneIdx
    }
  }

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play()
      setPlaying(true)
      playingSceneRef.current = -1
    } else {
      video.pause()
      setPlaying(false)
      audioRefs.current.forEach(a => { if (a) { a.pause(); a.currentTime = 0 } })
    }
  }

  const toggleMute = () => {
    setMuted(m => {
      if (!m) audioRefs.current.forEach(a => { if (a) { a.pause(); a.currentTime = 0 } })
      return !m
    })
  }

  const handleEnded = () => {
    setPlaying(false)
    setCurrentScene(-1)
    audioRefs.current.forEach(a => { if (a) { a.pause(); a.currentTime = 0 } })
    playingSceneRef.current = -1
  }

  const currentNarration = currentScene >= 0 ? scenes[currentScene]?.narration : null

  return (
    <div className="min-h-screen bg-[#0a0a14] flex flex-col items-center justify-center p-4">
      {/* 헤더 */}
      <div className="w-full max-w-lg flex items-center justify-between mb-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-white/60 hover:text-white text-sm transition-colors">
          <ArrowLeft size={16} /> 돌아가기
        </button>
        <h1 className="text-white font-semibold text-sm truncate max-w-[200px]">{title}</h1>
        <div className="w-20" />
      </div>

      {/* 영상 + 오버레이 */}
      <div className="relative w-full max-w-[360px] aspect-[9/16] bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/10">
        {combinedVideoUrl ? (
          <video
            ref={videoRef}
            src={combinedVideoUrl}
            className="w-full h-full object-cover"
            playsInline
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
            onClick={togglePlay}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/30 text-sm">
            영상 없음
          </div>
        )}

        {/* 자막 오버레이 */}
        {currentNarration && (
          <div className="absolute bottom-20 left-4 right-4 text-center pointer-events-none">
            <span className="inline-block bg-black/70 text-white text-sm font-medium px-4 py-2.5 rounded-xl leading-relaxed backdrop-blur-sm">
              {currentNarration}
            </span>
          </div>
        )}

        {/* 재생/일시정지 오버레이 */}
        {!playing && combinedVideoUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer" onClick={togglePlay}>
            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
              <Play size={28} className="text-white ml-1" />
            </div>
          </div>
        )}

        {/* 프로그레스 바 */}
        {sceneTimings.length > 0 && (
          <div className="absolute top-0 left-0 right-0 flex gap-1 p-2">
            {sceneTimings.map((_, i) => (
              <div key={i} className="flex-1 h-1 rounded-full overflow-hidden bg-white/20">
                <div className={`h-full rounded-full transition-all duration-300 ${
                  i < currentScene ? 'bg-white w-full' :
                  i === currentScene ? 'bg-white w-1/2' :
                  'w-0'
                }`} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 컨트롤 */}
      <div className="flex items-center gap-3 mt-4">
        <button onClick={togglePlay}
          className="px-5 py-2.5 bg-white/10 text-white text-sm font-medium rounded-xl hover:bg-white/20 transition-all flex items-center gap-2 border border-white/10">
          {playing ? <><Pause size={16} /> 일시정지</> : <><Play size={16} /> 재생</>}
        </button>
        <button onClick={toggleMute}
          className="p-2.5 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-all border border-white/10">
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        {combinedVideoUrl && (
          <a href={combinedVideoUrl} download="숏폼_영상.webm"
            className="px-5 py-2.5 bg-white/10 text-white text-sm font-medium rounded-xl hover:bg-white/20 transition-all flex items-center gap-2 border border-white/10">
            <Download size={16} /> 다운로드
          </a>
        )}
      </div>

      {/* 대본 */}
      {scenes.length > 0 && (
        <div className="w-full max-w-[360px] mt-6 space-y-2">
          {scenes.map((scene, i) => (
            <div key={i} className={`p-3 rounded-xl border transition-all ${
              i === currentScene ? 'bg-white/10 border-white/20' : 'bg-white/5 border-white/5'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] text-white/40 font-bold">씬 {scene.sceneNumber}</span>
                {i === currentScene && <span className="text-[10px] text-primary font-medium animate-pulse">재생중</span>}
              </div>
              <p className="text-xs text-white/70">{scene.narration}</p>
            </div>
          ))}
        </div>
      )}

      {/* 나레이션 오디오 (숨김) */}
      {narrations.map((n, i) => (
        n.audioUrl && <audio key={i} ref={el => audioRefs.current[i] = el} src={n.audioUrl} preload="auto" />
      ))}
    </div>
  )
}
