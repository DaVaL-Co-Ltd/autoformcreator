import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, FileText, CheckCircle, Loader2, Sparkles, Brain, PenTool,
  Film, Mic, AlertCircle, ChevronRight, Eye, ArrowRight, Clapperboard,
  XCircle, AlertTriangle, RefreshCw, ToggleLeft, ToggleRight, ImageIcon,
  Download, ChevronDown, ChevronUp, Settings2, Zap
} from 'lucide-react'
import { parsePDF } from '../services/llamaparse'
import { verifyParsedContent, summarizeContent } from '../services/gemini'
import {
  generatePipelineScript, generatePipelineVoice, generateVideoSource,
  assembleShorts, upscaleVideo,
  pipelineLog, getPipelineLogs, clearPipelineLogs,
} from '../services/shorts-pipeline'

const steps = [
  { id: 1, label: '문서 업로드', icon: Upload, desc: '분석할 문서 파일을 업로드하세요' },
  { id: 2, label: '문서 분석', icon: Brain, desc: 'PDF 텍스트 추출 및 데이터 검증' },
  { id: 3, label: '핵심 요약', icon: FileText, desc: '핵심 데이터 요약 및 인사이트 도출' },
  { id: 4, label: '콘텐츠 생성', icon: PenTool, desc: '숏폼 스크립트 생성' },
  { id: 5, label: '미디어 생성', icon: Film, desc: '대본/나레이션/영상/조립' },
]

const MOCK_DELAY = 800
const delay = (ms) => new Promise(r => setTimeout(r, ms))

const mockParsedText = `[데모] 2025학년도 서울대학교 수시모집 안내
1. 모집인원: 1,906명 (전체의 75.3%)
2. 전형별: 학생부종합 1,572명, 학생부교과 334명
3. 수능최저: 학생부교과 전형 적용 (3개 영역 합 7 이내)
4. 주요일정: 원서접수 9/9~13, 면접 11/23~12/1, 합격발표 12/13`

const mockVerification = { isValid: true, confidence: 0.93, issues: [], correctedText: null }
const mockSummary = {
  title: '2025 서울대 수시모집 핵심 요약',
  summary: '서울대 수시모집 1,906명, 학생부종합 82.5% 차지.',
  keyData: [
    { label: '모집인원', value: '1,906명', context: '전체 75.3%' },
    { label: '학생부종합', value: '1,572명', context: '82.5%' },
    { label: '수능최저', value: '3개 합 7', context: '학생부교과만' },
  ],
  insights: ['학생부종합이 압도적 비중', '수능최저 완화 추세'],
  keywords: ['서울대', '수시', '학생부종합'],
}
const mockScript = {
  title: '서울대 수시, 1,906명 뽑는다고?!',
  totalDuration: 15,
  scenes: [
    { sceneNumber: 1, sceneType: 'cat_intro', duration: 5, narration: '안녕하세요! 오늘은 제가 서울대 수시 핵심 정보를 알려드릴게요!', videoPrompt: 'A cute kawaii cat teacher wearing round glasses and a school gown, sitting at a teacher desk, looking directly at camera with friendly expression, pastel-colored classroom with chalkboard and bookshelves behind. Warm studio lighting.', imagePrompt: 'Cute kawaii cat teacher with glasses at teacher desk, pastel classroom setting.', textOverlay: '', useVideo: true },
    { sceneNumber: 2, sceneType: 'data', duration: 5, narration: '서울대가 수시로만 1,906명을 뽑고, 학생부종합이 82%나 됩니다!', videoPrompt: 'Animated green chalkboard with white chalk writing appearing: large number 1906 with an arrow pointing up, pie chart showing 82 percent, classroom setting with wooden frame. Warm lighting.', imagePrompt: 'Chalkboard with statistics 1906 and 82 percent, classroom setting.', textOverlay: '1,906', useVideo: true },
    { sceneNumber: 3, sceneType: 'cat_outro', duration: 5, narration: '더 자세한 건 프로필 링크를 확인하세요! 다음에 또 만나요!', videoPrompt: 'A cute kawaii cat teacher wearing glasses waving paw at camera, happy expression, pastel classroom background with sparkles, farewell gesture, warm lighting.', imagePrompt: 'Cute kawaii cat teacher waving paw, happy, pastel classroom setting.', textOverlay: '', useVideo: true },
  ],
  bgmStyle: 'upbeat',
}

function ErrorAlert({ message, onClose }) {
  if (!message) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface rounded-xl border border-danger/30 shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        <div className="flex items-center gap-3 p-4 bg-danger/10 border-b border-danger/20">
          <AlertCircle size={20} className="text-danger shrink-0" />
          <h3 className="font-semibold text-danger text-sm">오류 발생</h3>
        </div>
        <div className="p-5"><p className="text-sm text-text leading-relaxed whitespace-pre-line">{message}</p></div>
        <div className="flex justify-end p-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 bg-danger/10 text-danger text-sm font-medium rounded-lg hover:bg-danger/20 transition-all">확인</button>
        </div>
      </div>
    </div>
  )
}

function ErrorPanel({ errors, onRetry, retrying }) {
  if (!errors || errors.length === 0) return null
  return (
    <div className="mx-5 mb-4 space-y-2">
      {errors.map((err, i) => {
        const isRetrying = retrying === `${err.service}-${err.channel}`
        return (
          <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${isRetrying ? 'bg-primary/5 border-primary/20' : 'bg-danger/10 border-danger/20'}`}>
            {isRetrying ? <Loader2 size={16} className="text-primary shrink-0 mt-0.5 animate-spin" /> : <XCircle size={16} className="text-danger shrink-0 mt-0.5" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-bold text-text-muted">{err.channel}</span>
              </div>
              <p className="text-xs text-text-muted break-words">{isRetrying ? '재시도 중...' : err.message}</p>
            </div>
            {onRetry && !err.noRetry && !isRetrying && (
              <button onClick={() => onRetry(err)} className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary-light text-xs font-medium transition-all shrink-0">
                <RefreshCw size={11} /> 재시도
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function ShortsTestPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState({})
  const [stepErrors, setStepErrors] = useState({})
  const [errorAlert, setErrorAlert] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [demoMode, setDemoMode] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)
  const [logs, setLogs] = useState([])
  const [retrying, setRetrying] = useState(null)
  const [progressMsg, setProgressMsg] = useState('')

  // Options
  const [targetDuration, setTargetDuration] = useState(10)
  const [hybridMode, setHybridMode] = useState(false)
  const [enableUpscale, setEnableUpscale] = useState(false)

  // Step 1-3 data
  const [file, setFile] = useState(null)
  const [emphasisText, setEmphasisText] = useState('')
  const [emphasisConfirmed, setEmphasisConfirmed] = useState(false)
  const [editingText, setEditingText] = useState(false)
  const [editedText, setEditedText] = useState('')
  const [fixingIssues, setFixingIssues] = useState(false)
  const [parsedText, setParsedText] = useState('')
  const [verification, setVerification] = useState(null)
  const [summary, setSummary] = useState(null)

  // Step 4: script
  const [shortsScript, setShortsScript] = useState(null)

  // Step 5: media sub-items
  const [narrations, setNarrations] = useState(null)
  const [videoClips, setVideoClips] = useState(null)
  const [finalVideo, setFinalVideo] = useState(null)
  const [mediaGenerationDone, setMediaGenerationDone] = useState(false)
  const [mediaItemLoading, setMediaItemLoading] = useState({})
  const abortedRef = useRef(false)

  const setStepLoading = (s, v) => setLoading(p => ({ ...p, [s]: v }))
  const addStepErrors = (step, errs) => setStepErrors(p => ({ ...p, [step]: [...(p[step] || []), ...errs] }))
  const clearStepErrors = (step) => setStepErrors(p => ({ ...p, [step]: null }))
  const removeStepError = (step, service, channel) => {
    setStepErrors(p => ({ ...p, [step]: (p[step] || []).filter(e => !(e.service === service && e.channel === channel)) }))
  }
  const showErrorAlert = (svc, detail) => setErrorAlert(`${svc} 서비스에서 오류가 발생했습니다.\n\n${detail}`)
  const refreshLogs = () => setLogs(getPipelineLogs())

  const stopGeneration = () => {
    abortedRef.current = true
    setMediaGenerationDone(true)
    setLoading(p => ({ ...p, media: false }))
    setMediaItemLoading({})
  }

  // ===== Step 1: File =====
  const handleFile = (f) => {
    const exts = ['.pdf', '.hwp', '.hwpx', '.docx', '.doc', '.pptx', '.ppt']
    const ext = f?.name?.toLowerCase().match(/\.[^.]+$/)?.[0]
    if (f && ext && exts.includes(ext)) { setFile(f); setCurrentStep(2); clearStepErrors('upload') }
    else addStepErrors('upload', [{ service: 'upload', message: 'PDF, HWP, DOCX, PPTX만 지원' }])
  }
  const handleDrop = (e) => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files[0]) }

  // ===== Step 2: Analysis =====
  const runAnalysis = async () => {
    setStepLoading('analysis', true); clearStepErrors('analysis'); setProgressMsg('PDF 텍스트 추출 중...')
    if (demoMode) { await delay(MOCK_DELAY); setParsedText(mockParsedText); setProgressMsg('데이터 검증 중...'); await delay(MOCK_DELAY); setVerification(mockVerification); setCurrentStep(3); setStepLoading('analysis', false); setProgressMsg(''); return }
    const errors = []
    try {
      const text = await parsePDF(file); setParsedText(text)
      setProgressMsg('텍스트 추출 완료, 데이터 검증 중...')
      try { const v = await verifyParsedContent(text); setVerification(v); setParsedText(v.correctedText || text) }
      catch (err) { errors.push({ service: 'gemini', message: `검증 실패 - ${err.message}` }); setVerification({ isValid: false, issues: ['검증 건너뜀'], confidence: 0 }) }
      setCurrentStep(3)
    } catch (err) { errors.push({ service: 'gemini', message: `분석 실패 - ${err.message}` }); showErrorAlert('분석', err.message) }
    if (errors.length > 0) addStepErrors('analysis', errors)
    setStepLoading('analysis', false); setProgressMsg('')
  }

  // ===== Step 3: Summary =====
  const runSummary = async () => {
    setStepLoading('summary', true); clearStepErrors('summary'); setProgressMsg('Gemini로 핵심 요약 생성 중...')
    if (demoMode) { await delay(MOCK_DELAY); setSummary(mockSummary); setCurrentStep(4); setStepLoading('summary', false); setProgressMsg(''); return }
    try {
      const r = await summarizeContent(parsedText)
      if (r.title === '요약 생성 실패') { addStepErrors('summary', [{ service: 'gemini', message: 'JSON 파싱 실패, 재시도하세요.' }]) }
      else { setSummary(r); setCurrentStep(4) }
    } catch (err) { addStepErrors('summary', [{ service: 'gemini', message: err.message }]); showErrorAlert('요약', err.message) }
    setStepLoading('summary', false); setProgressMsg('')
  }

  // ===== Step 4: Shorts Script =====
  const runScriptGeneration = async () => {
    setStepLoading('content', true); clearStepErrors('content'); clearPipelineLogs()
    setProgressMsg('Gemini로 숏폼 대본 생성 중... (5~15초)')
    if (demoMode) { await delay(MOCK_DELAY); setShortsScript(mockScript); refreshLogs(); setCurrentStep(5); setStepLoading('content', false); setProgressMsg(''); return }
    try {
      const s = await generatePipelineScript(summary, parsedText, emphasisText, { targetDuration, hybridMode })
      setShortsScript(s); setCurrentStep(5); refreshLogs()
    } catch (err) { addStepErrors('content', [{ service: 'gemini', channel: '숏폼 대본', message: err.message }]); showErrorAlert('대본 생성', err.message); refreshLogs() }
    setStepLoading('content', false); setProgressMsg('')
  }

  // ===== Step 5: Media Generation (4 sub-items) =====

  // 5-1: 대본 생성 (재생성)
  const runMediaScript = async () => {
    setMediaItemLoading(p => ({ ...p, '대본 생성': true })); setProgressMsg('대본 재생성 중...')
    removeStepError('media', 'gemini', '대본 생성')
    if (demoMode) { await delay(MOCK_DELAY); setShortsScript(mockScript); setMediaItemLoading(p => ({ ...p, '대본 생성': false })); setProgressMsg(''); refreshLogs(); return }
    try {
      const s = await generatePipelineScript(summary, parsedText, emphasisText, { targetDuration, hybridMode })
      setShortsScript(s); refreshLogs()
    } catch (err) { addStepErrors('media', [{ service: 'gemini', channel: '대본 생성', message: err.message }]); refreshLogs() }
    setMediaItemLoading(p => ({ ...p, '대본 생성': false })); setProgressMsg('')
  }

  // 5-2: 숏폼 나레이션
  const runMediaNarration = async () => {
    const scenes = shortsScript?.scenes
    if (!scenes?.length) return
    setMediaItemLoading(p => ({ ...p, '숏폼 나레이션': true })); setProgressMsg('ElevenLabs TTS 나레이션 생성 중...')
    removeStepError('media', 'elevenlabs', '숏폼 나레이션')
    if (demoMode) {
      await delay(MOCK_DELAY)
      setNarrations(scenes.map(s => ({ sceneNumber: s.sceneNumber, audioUrl: null, duration: s.duration, text: s.narration })))
      setMediaItemLoading(p => ({ ...p, '숏폼 나레이션': false })); setProgressMsg(''); refreshLogs(); return
    }
    try {
      const n = await generatePipelineVoice(scenes); setNarrations(n); refreshLogs()
    } catch (err) { addStepErrors('media', [{ service: 'elevenlabs', channel: '숏폼 나레이션', message: err.message }]); refreshLogs() }
    setMediaItemLoading(p => ({ ...p, '숏폼 나레이션': false })); setProgressMsg('')
  }

  // 5-3: 숏폼 영상 소스 제작 (Veo)
  const runMediaVideoSource = async () => {
    const scenes = shortsScript?.scenes
    if (!scenes?.length) return
    setMediaItemLoading(p => ({ ...p, '숏폼 영상 소스': true })); setProgressMsg(`Veo로 인물 영상 클립 생성 중... (${scenes.length}씬, 씬당 1~3분)`)
    removeStepError('media', 'gemini', '숏폼 영상 소스')
    if (demoMode) {
      await delay(MOCK_DELAY)
      setVideoClips(scenes.map(s => ({ sceneNumber: s.sceneNumber, type: s.useVideo !== false ? 'video' : 'image', url: null })))
      setMediaItemLoading(p => ({ ...p, '숏폼 영상 소스': false })); setProgressMsg(''); refreshLogs(); return
    }
    try {
      pipelineLog(3, '영상 소스 생성 시작...')
      const clips = await generateVideoSource(scenes, narrations, { hybridMode, existingClips: videoClips || [] })
      setVideoClips(clips)
      refreshLogs()
    } catch (err) { addStepErrors('media', [{ service: 'gemini', channel: '숏폼 영상 소스', message: err.message }]); refreshLogs() }
    setMediaItemLoading(p => ({ ...p, '숏폼 영상 소스': false })); setProgressMsg('')
  }

  // 5-4: 최종 영상 제작 (Creatomate)
  const runMediaAssembly = async () => {
    if (!videoClips?.length) return
    setMediaItemLoading(p => ({ ...p, '최종 영상': true })); setProgressMsg('Creatomate로 자막/BGM 조립 중... (1~3분)')
    removeStepError('media', 'creatomate', '최종 영상')
    if (demoMode) {
      await delay(MOCK_DELAY); setFinalVideo({ url: null, duration: targetDuration })
      setMediaItemLoading(p => ({ ...p, '최종 영상': false })); setMediaGenerationDone(true); setProgressMsg(''); refreshLogs(); return
    }
    try {
      const result = await assembleShorts(shortsScript.scenes, videoClips, narrations || [], {})
      setFinalVideo(result)

      if (enableUpscale && result.url) {
        pipelineLog('upscale', '업스케일 시작...')
        try { const u = await upscaleVideo(result.url); setFinalVideo(p => ({ ...p, url: u, upscaled: true })) }
        catch (err) { pipelineLog('upscale', `업스케일 실패: ${err.message}`) }
      }
      setMediaGenerationDone(true); refreshLogs()
    } catch (err) { addStepErrors('media', [{ service: 'creatomate', channel: '최종 영상', message: err.message }]); refreshLogs() }
    setMediaItemLoading(p => ({ ...p, '최종 영상': false })); setProgressMsg('')
  }

  // 전체 실행 (순차)
  const runAllMedia = async () => {
    setStepLoading('media', true); clearStepErrors('media'); setProgressMsg('파이프라인 시작...')
    abortedRef.current = false

    const currentScript = shortsScript
    if (!currentScript) { setStepLoading('media', false); setProgressMsg(''); return }

    // 1) 나레이션
    setProgressMsg('[1/3] ElevenLabs 나레이션 생성 중...')
    setMediaItemLoading(p => ({ ...p, '숏폼 나레이션': true }))
    let currentNarrations = narrations
    if (demoMode) {
      await delay(MOCK_DELAY)
      currentNarrations = currentScript.scenes.map(s => ({ sceneNumber: s.sceneNumber, audioUrl: null, duration: s.duration, text: s.narration }))
      setNarrations(currentNarrations)
    } else {
      try { currentNarrations = await generatePipelineVoice(currentScript.scenes); setNarrations(currentNarrations) }
      catch (err) { addStepErrors('media', [{ service: 'elevenlabs', channel: '숏폼 나레이션', message: err.message }]) }
    }
    setMediaItemLoading(p => ({ ...p, '숏폼 나레이션': false })); refreshLogs()
    if (abortedRef.current) { setStepLoading('media', false); setMediaItemLoading({}); return }

    // 2) 영상 소스
    setProgressMsg('[2/3] Veo 영상 소스 생성 중... (씬당 1~3분)')
    setMediaItemLoading(p => ({ ...p, '숏폼 영상 소스': true }))
    let currentClips = videoClips
    if (demoMode) {
      await delay(MOCK_DELAY)
      currentClips = currentScript.scenes.map(s => ({ sceneNumber: s.sceneNumber, type: s.useVideo !== false ? 'video' : 'image', url: null }))
      setVideoClips(currentClips)
    } else {
      try {
        const clips = await generateVideoSource(currentScript.scenes, currentNarrations, { hybridMode, existingClips: videoClips || [] })
        currentClips = clips; setVideoClips(clips)
      } catch (err) { addStepErrors('media', [{ service: 'gemini', channel: '숏폼 영상 소스', message: err.message }]) }
    }
    setMediaItemLoading(p => ({ ...p, '숏폼 영상 소스': false })); refreshLogs()
    if (abortedRef.current) { setStepLoading('media', false); setMediaItemLoading({}); return }

    // 모든 씬이 성공했는지 확인 — 하나라도 실패하면 최종 조립 중단
    const failedClips = (currentClips || []).filter(c => c.type === 'error')
    if (failedClips.length > 0) {
      addStepErrors('media', [{ service: 'gemini', channel: '숏폼 영상 소스', message: `${failedClips.length}개 씬 생성 실패. 모든 씬이 완료되어야 최종 조립이 가능합니다.` }])
      setMediaGenerationDone(true); setStepLoading('media', false); setProgressMsg('')
      return
    }

    // 3) 최종 조립
    if (currentClips?.length) {
      setProgressMsg('[3/3] Creatomate 최종 조립 중... (1~3분)')
      setMediaItemLoading(p => ({ ...p, '최종 영상': true }))
      if (demoMode) { await delay(MOCK_DELAY); setFinalVideo({ url: null, duration: targetDuration }) }
      else {
        try {
          const result = await assembleShorts(currentScript.scenes, currentClips, currentNarrations || [], {})
          setFinalVideo(result)
          if (enableUpscale && result.url) {
            try { const u = await upscaleVideo(result.url); setFinalVideo(p => ({ ...p, url: u, upscaled: true })) } catch {}
          }
        } catch (err) { addStepErrors('media', [{ service: 'creatomate', channel: '최종 영상', message: err.message }]) }
      }
      setMediaItemLoading(p => ({ ...p, '최종 영상': false })); refreshLogs()
    }

    setMediaGenerationDone(true)
    setStepLoading('media', false)
    setProgressMsg('')
  }

  // Step 5 개별 재시도
  const retryMediaItem = async (err) => {
    const fnMap = {
      '대본 생성': runMediaScript,
      '숏폼 나레이션': runMediaNarration,
      '숏폼 영상 소스': runMediaVideoSource,
      '최종 영상': runMediaAssembly,
    }
    const fn = fnMap[err.channel]
    if (fn) await fn()
  }

  // Helpers
  const retryAnalysis = async () => { clearStepErrors('analysis'); await runAnalysis() }
  const retrySummary = async () => { clearStepErrors('summary'); await runSummary() }
  const fixIssuesWithAI = async () => {
    if (!verification?.issues?.length || !parsedText) return
    setFixingIssues(true)
    try {
      const { callGeminiWithFallback } = await import('../services/gemini-core')
      const fixed = await callGeminiWithFallback(`아래 텍스트에서 발견된 이슈를 수정해주세요.\n\n## 발견된 이슈\n${verification.issues.map(i => `- ${i}`).join('\n')}\n\n## 원본 텍스트\n${parsedText}\n\n수정된 전체 텍스트만 출력하세요.`, { temperature: 0.1, maxOutputTokens: 65536 })
      setParsedText(fixed); setVerification(prev => ({ ...prev, issues: [], isValid: true })); clearStepErrors('analysis')
    } catch (err) { showErrorAlert('AI 수정', err.message) }
    setFixingIssues(false)
  }
  const saveEditedText = () => { setParsedText(editedText); setEditingText(false); setVerification(prev => prev ? { ...prev, issues: [], isValid: true } : prev) }

  const hasAnyContent = !!shortsScript

  return (
    <div className="space-y-6 max-w-5xl">
      <ErrorAlert message={errorAlert} onClose={() => setErrorAlert(null)} />

      {/* Header + Options */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-warning/10 text-warning"><Film size={22} /></div>
          <div>
            <h2 className="text-lg font-bold text-text">숏폼 파이프라인 테스트</h2>
            <p className="text-xs text-text-muted">대본 → 음성 → 영상 → 조립</p>
          </div>
        </div>
        <button onClick={() => setDemoMode(p => !p)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${demoMode ? 'bg-warning/10 text-warning border-warning/30' : 'bg-surface-light text-text-muted border-border hover:border-text-muted'}`}>
          {demoMode ? <ToggleRight size={16} /> : <ToggleLeft size={16} />} 데모 모드
        </button>
      </div>

      {/* Options */}
      <div className="bg-surface rounded-xl border border-border p-4">
        <div className="flex items-center gap-2 mb-3"><Settings2 size={14} className="text-text-muted" /><span className="text-xs font-semibold text-text">파이프라인 옵션</span></div>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted">목표 길이:</label>
            <select value={targetDuration} onChange={e => setTargetDuration(Number(e.target.value))} disabled={currentStep > 4}
              className="bg-surface-light border border-border rounded-lg px-2 py-1 text-xs text-text focus:outline-none focus:ring-1 focus:ring-primary/30">
              <option value={10}>10초 (테스트)</option><option value={30}>30초</option><option value={60}>60초</option>
            </select>
          </div>
          <button onClick={() => setHybridMode(p => !p)} disabled={currentStep > 4}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${hybridMode ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' : 'bg-surface-light text-text-muted border-border'}`}>
            {hybridMode ? <ToggleRight size={14} /> : <ToggleLeft size={14} />} 하이브리드
          </button>
          <button onClick={() => setEnableUpscale(p => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${enableUpscale ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' : 'bg-surface-light text-text-muted border-border'}`}>
            {enableUpscale ? <ToggleRight size={14} /> : <ToggleLeft size={14} />} 업스케일
          </button>
        </div>
        {hybridMode && <p className="text-[10px] text-cyan-400/70 mt-2">핵심 씬만 영상, 나머지 이미지 전환 (단가 절감)</p>}
      </div>

      {/* Step Progress */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-text">숏폼 생성 파이프라인</h3>
          <span className="text-xs text-text-muted">Step {currentStep} / 5</span>
        </div>
        <div className="flex items-center gap-1 mt-4">
          {steps.map((step, i) => {
            const Icon = step.icon
            const isActive = step.id === currentStep
            const isDone = step.id < currentStep
            const stepKey = ['', 'upload', 'analysis', 'summary', 'content', 'media'][step.id]
            const hasError = stepErrors[stepKey]?.length > 0
            return (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all
                    ${isDone && !hasError ? 'bg-success/20 text-success' : isDone && hasError ? 'bg-warning/20 text-warning' :
                      isActive ? 'bg-primary/20 text-primary ring-2 ring-primary/30' : 'bg-surface-light text-text-muted'}`}>
                    {isDone && !hasError ? <CheckCircle size={18} /> : isDone && hasError ? <AlertTriangle size={18} /> : <Icon size={18} />}
                  </div>
                  <span className={`text-xs mt-2 font-medium text-center ${isActive ? 'text-primary-light' : isDone ? (hasError ? 'text-warning' : 'text-success') : 'text-text-muted'}`}>{step.label}</span>
                  <span className="text-[10px] text-text-muted mt-0.5 text-center hidden sm:block">{step.desc}</span>
                </div>
                {i < steps.length - 1 && <ChevronRight size={14} className={`mx-1 shrink-0 ${isDone ? 'text-success' : 'text-border'}`} />}
              </div>
            )
          })}
        </div>
      </div>

      {/* Progress Message */}
      {progressMsg && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex items-center gap-3 animate-pulse">
          <Loader2 size={16} className="text-primary animate-spin shrink-0" />
          <p className="text-sm text-primary-light font-medium">{progressMsg}</p>
        </div>
      )}

      {/* Step 1: Upload */}
      <div className={`bg-surface rounded-xl border transition-all ${currentStep === 1 ? 'border-primary/40' : 'border-border'}`}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${file ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}><Upload size={18} /></div>
            <div><h3 className="font-semibold text-text text-sm">Step 1. 문서 업로드</h3><p className="text-xs text-text-muted">분석할 문서 파일을 업로드하세요</p></div>
          </div>
          {file && <span className="text-xs text-success font-medium flex items-center gap-1"><CheckCircle size={14} /> 업로드 완료</span>}
        </div>
        <div className="p-5">
          {!file ? (
            demoMode ? (
              <div className="flex flex-col items-center gap-3 p-10">
                <p className="text-sm text-text-muted">데모 모드에서는 파일 업로드 없이 진행합니다.</p>
                <button onClick={() => { setFile({ name: 'demo_입시정보.pdf', size: 2048000, type: 'application/pdf' }); setCurrentStep(2) }}
                  className="px-4 py-2 bg-warning/10 text-warning text-sm font-medium rounded-lg hover:bg-warning/20 transition-all">데모 파일로 시작</button>
              </div>
            ) : (
              <div className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
                onDragOver={e => { e.preventDefault(); setIsDragging(true) }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}>
                <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.hwp,.hwpx,.docx,.doc,.pptx,.ppt" onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
                <Upload size={28} className="mx-auto mb-3 text-text-muted" />
                <p className="text-sm text-text">파일을 드래그하거나 <span className="text-primary font-medium">클릭</span>하여 업로드</p>
                <p className="text-xs text-text-muted mt-1">PDF, HWP, DOCX, PPTX 지원</p>
              </div>
            )
          ) : (
            <div className="flex items-center gap-4 p-4 bg-success/5 rounded-lg border border-success/20">
              <FileText size={24} className="text-success" />
              <div className="flex-1"><p className="text-sm font-medium text-text">{file.name}</p><p className="text-xs text-text-muted">{(file.size / 1024 / 1024).toFixed(2)} MB</p></div>
              <button onClick={() => { setFile(null); setCurrentStep(1) }} className="text-xs text-text-muted hover:text-danger transition-colors">변경</button>
            </div>
          )}
          {file && (
            <div className="mt-4">
              <label className="block text-xs font-medium text-text-muted mb-1.5">강조하고 싶은 내용 <span className="text-text-muted/50">(선택사항)</span></label>
              <div className="flex gap-2">
                <input type="text" value={emphasisText} onChange={e => { setEmphasisText(e.target.value); setEmphasisConfirmed(false) }}
                  placeholder="예: 입시 일정을 강조해줘" disabled={emphasisConfirmed}
                  className="flex-1 px-3 py-2.5 bg-surface-light border border-border rounded-lg text-sm text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60" />
                {!emphasisConfirmed
                  ? <button onClick={() => setEmphasisConfirmed(true)} className="px-4 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-all shrink-0">확인</button>
                  : <button onClick={() => setEmphasisConfirmed(false)} className="px-4 py-2.5 bg-success/10 text-success text-sm font-medium rounded-lg hover:bg-success/20 transition-all shrink-0 flex items-center gap-1.5"><CheckCircle size={14} />{emphasisText.trim() ? '설정됨' : '자동'}</button>
                }
              </div>
            </div>
          )}
        </div>
        <ErrorPanel errors={stepErrors.upload} />
      </div>

      {/* Step 2: Analysis */}
      <div className={`bg-surface rounded-xl border transition-all ${currentStep === 2 ? 'border-primary/40' : 'border-border'} ${currentStep < 2 ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${verification ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}><Brain size={18} /></div>
            <div><h3 className="font-semibold text-text text-sm">Step 2. 문서 분석</h3><p className="text-xs text-text-muted">PDF 텍스트 추출 및 데이터 검증</p></div>
          </div>
          <div className="flex items-center gap-2">
            {verification && <span className={`text-xs font-medium flex items-center gap-1 ${verification.confidence > 0 ? 'text-success' : 'text-warning'}`}>{verification.confidence > 0 ? <CheckCircle size={14} /> : <AlertTriangle size={14} />} 신뢰도 {Math.round((verification.confidence || 0) * 100)}%</span>}
            {currentStep === 2 && !verification && (
              <button onClick={runAnalysis} disabled={loading.analysis} className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark disabled:opacity-50 transition-all flex items-center gap-2">
                {loading.analysis ? <><Loader2 size={14} className="animate-spin" /> 분석중...</> : <><Sparkles size={14} /> 실행</>}
              </button>
            )}
          </div>
        </div>
        {(parsedText || verification) && (
          <div className="p-5 space-y-3">
            {verification?.issues?.length > 0 && (
              <div className="bg-warning/5 border border-warning/20 rounded-lg p-3">
                <p className="text-xs font-medium text-warning mb-1">발견된 이슈:</p>
                <ul className="text-xs text-text-muted space-y-1">{verification.issues.map((issue, i) => <li key={i}>- {issue}</li>)}</ul>
                <div className="flex gap-2 mt-3">
                  <button onClick={fixIssuesWithAI} disabled={fixingIssues} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary-light text-xs font-medium rounded-lg hover:bg-primary/20 disabled:opacity-50 transition-all">
                    {fixingIssues ? <><Loader2 size={11} className="animate-spin" /> AI 수정중...</> : <><Sparkles size={11} /> AI 자동 수정</>}
                  </button>
                  <button onClick={() => { setEditedText(parsedText); setEditingText(true) }} className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-light text-text-muted text-xs font-medium rounded-lg hover:bg-border transition-all border border-border"><PenTool size={11} /> 직접 수정</button>
                </div>
              </div>
            )}
            {editingText ? (
              <div className="space-y-2">
                <textarea value={editedText} onChange={e => setEditedText(e.target.value)} className="w-full bg-surface-light rounded-lg p-3 max-h-96 min-h-48 text-xs text-text whitespace-pre-wrap border border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y" />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditingText(false)} className="px-3 py-1.5 text-xs text-text-muted hover:bg-surface-light rounded-lg transition-all">취소</button>
                  <button onClick={saveEditedText} className="px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary-dark transition-all">저장</button>
                </div>
              </div>
            ) : (
              <div className="bg-surface-light rounded-lg p-3 max-h-96 overflow-y-auto"><p className="text-xs text-text-muted whitespace-pre-wrap">{parsedText}</p></div>
            )}
          </div>
        )}
        <ErrorPanel errors={stepErrors.analysis} onRetry={retryAnalysis} retrying={retrying} />
      </div>

      {/* Step 3: Summary */}
      <div className={`bg-surface rounded-xl border transition-all ${currentStep === 3 ? 'border-primary/40' : 'border-border'} ${currentStep < 3 ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${summary ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}><FileText size={18} /></div>
            <div><h3 className="font-semibold text-text text-sm">Step 3. 핵심 요약</h3><p className="text-xs text-text-muted">핵심 데이터 요약 및 인사이트 도출</p></div>
          </div>
          <div className="flex items-center gap-2">
            {summary && !stepErrors.summary?.length && <span className="text-xs text-success font-medium flex items-center gap-1"><CheckCircle size={14} /> 요약 완료</span>}
            {currentStep === 3 && !summary && !stepErrors.summary?.length && (
              <button onClick={runSummary} disabled={loading.summary} className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark disabled:opacity-50 transition-all flex items-center gap-2">
                {loading.summary ? <><Loader2 size={14} className="animate-spin" /> 요약중...</> : <><Sparkles size={14} /> 실행</>}
              </button>
            )}
            {stepErrors.summary?.length > 0 && (
              <button onClick={retrySummary} disabled={loading.summary} className="px-3 py-1.5 bg-danger/10 text-danger text-xs font-medium rounded-lg hover:bg-danger/20 disabled:opacity-50 transition-all flex items-center gap-1.5"><RefreshCw size={12} /> 재시도</button>
            )}
          </div>
        </div>
        {summary && (
          <div className="p-5 space-y-4">
            <h4 className="text-sm font-semibold text-text">{summary.title}</h4>
            <p className="text-xs text-text-muted">{summary.summary}</p>
            {summary.keyData?.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {summary.keyData.map((d, i) => (
                  <div key={i} className="bg-primary/5 border border-primary/10 rounded-lg p-3">
                    <p className="text-xs text-text-muted">{d.label}</p><p className="text-sm font-semibold text-primary-light">{d.value}</p>
                    {d.context && <p className="text-xs text-text-muted mt-0.5">{d.context}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <ErrorPanel errors={stepErrors.summary} onRetry={retrySummary} retrying={retrying} />
      </div>

      {/* Step 4: Script */}
      <div className={`bg-surface rounded-xl border transition-all ${currentStep === 4 ? 'border-primary/40' : 'border-border'} ${currentStep < 4 ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${shortsScript ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}><PenTool size={18} /></div>
            <div><h3 className="font-semibold text-text text-sm">Step 4. 콘텐츠 생성</h3><p className="text-xs text-text-muted">숏폼 스크립트 생성</p></div>
          </div>
          <div className="flex items-center gap-2">
            {shortsScript && <span className="text-xs text-success font-medium flex items-center gap-1"><CheckCircle size={14} /> {shortsScript.scenes?.length}씬 · {shortsScript.totalDuration || 0}초</span>}
            {currentStep === 4 && (
              <button onClick={runScriptGeneration} disabled={loading.content} className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark disabled:opacity-50 transition-all flex items-center gap-2">
                {loading.content ? <><Loader2 size={14} className="animate-spin" /> 생성중...</> : <><Sparkles size={14} /> 실행</>}
              </button>
            )}
          </div>
        </div>
        {loading.content && !shortsScript && (
          <div className="p-5">
            <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <Loader2 size={16} className="text-primary animate-spin shrink-0" />
              <div>
                <p className="text-sm text-primary-light font-medium">Gemini 2.5 Flash로 대본 생성 중...</p>
                <p className="text-xs text-text-muted mt-0.5">씬별 나레이션 + 인물 영상 프롬프트를 작성하고 있습니다 (5~15초)</p>
              </div>
            </div>
          </div>
        )}
        {shortsScript && (
          <div className="p-5">
            <div className="bg-warning/5 border border-warning/20 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-text mb-2">{shortsScript.title}</h4>
              <div className="space-y-2">
                {shortsScript.scenes?.map(scene => (
                  <div key={scene.sceneNumber} className="flex items-start gap-2 bg-surface/50 rounded-lg p-2.5">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${scene.useVideo ? 'bg-cyan-500/20 text-cyan-400' : 'bg-surface-light text-text-muted'}`}>{scene.sceneNumber}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-text">{scene.narration}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-text-muted">{scene.duration}초</span>
                        {scene.textOverlay && <span className="text-[10px] text-warning">📌 {scene.textOverlay}</span>}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${scene.useVideo ? 'bg-cyan-500/10 text-cyan-400' : 'bg-surface-light text-text-muted'}`}>{scene.useVideo ? '영상' : '이미지'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        <ErrorPanel errors={stepErrors.content} onRetry={() => runScriptGeneration()} retrying={retrying} />
      </div>

      {/* Step 5: Media Generation — 4 sub-items */}
      <div className={`bg-surface rounded-xl border transition-all ${currentStep === 5 ? 'border-primary/40' : 'border-border'} ${currentStep < 5 ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${finalVideo ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}><Film size={18} /></div>
            <div><h3 className="font-semibold text-text text-sm">Step 5. 숏폼 미디어 생성</h3><p className="text-xs text-text-muted">대본/나레이션/영상 소스/최종 영상</p></div>
          </div>
          <div className="flex items-center gap-2">
            {currentStep === 5 && !loading.media && (
              <button onClick={runAllMedia} className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-all flex items-center gap-2">
                <Sparkles size={14} /> 전체 실행
              </button>
            )}
            {loading.media && (
              <button onClick={stopGeneration} className="px-4 py-2 bg-danger/10 text-danger text-sm font-medium rounded-lg hover:bg-danger/20 transition-all flex items-center gap-2 border border-danger/20">
                <XCircle size={14} /> 중단
              </button>
            )}
          </div>
        </div>
        {currentStep >= 5 && (
          <div className="p-5 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: '숏폼 나레이션', key: 'narration', icon: Mic, iconColor: 'text-emerald-400',
                  status: narrations ? `${narrations.filter(n => n.audioUrl).length}/${narrations.length}개` : null,
                  ok: Array.isArray(narrations) && narrations.length > 0 && narrations.some(n => n.audioUrl),
                  canRun: !!shortsScript?.scenes?.length,
                },
                {
                  label: '숏폼 영상 소스', key: 'videoSource', icon: Film, iconColor: 'text-cyan-400',
                  status: videoClips ? `${videoClips.filter(c => c.type !== 'error').length}/${videoClips.length}개${videoClips.some(c => c.completed) ? ' (영상)' : ''}` : null,
                  ok: Array.isArray(videoClips) && videoClips.length > 0 && videoClips.every(c => c.type !== 'error'),
                  canRun: !!shortsScript?.scenes?.length,
                },
                {
                  label: '최종 영상', key: 'assembly', icon: Clapperboard, iconColor: 'text-purple-400',
                  status: finalVideo ? `${finalVideo.duration?.toFixed?.(1) || finalVideo.duration}초${finalVideo.upscaled ? ' (업스케일)' : ''}` : null,
                  ok: !!finalVideo,
                  canRun: Array.isArray(videoClips) && videoClips.length > 0,
                },
              ].map((item, i) => {
                const Icon = item.icon
                const channelMap = { script: '대본 생성', narration: '숏폼 나레이션', videoSource: '숏폼 영상 소스', assembly: '최종 영상' }
                const failed = stepErrors.media?.some(e => e.channel === channelMap[item.key])
                const isLoading = mediaItemLoading[channelMap[item.key]]
                const runFnMap = { script: runMediaScript, narration: runMediaNarration, videoSource: runMediaVideoSource, assembly: runMediaAssembly }
                return (
                  <div key={i} className={`rounded-lg p-3 border ${
                    isLoading ? 'bg-primary/5 border-primary/20' :
                    failed ? 'bg-danger/5 border-danger/20' :
                    item.ok ? 'bg-success/5 border-success/20' :
                    'bg-surface-light border-border'
                  }`}>
                    <div className="flex items-center gap-1 mb-1">
                      <Icon size={12} className={item.iconColor} />
                      <p className="text-xs font-medium text-text">{item.label}</p>
                    </div>
                    {isLoading ? (
                      <div className="flex items-center gap-1"><Loader2 size={10} className="text-primary animate-spin" /><span className="text-xs text-primary">생성중...</span></div>
                    ) : item.ok ? (
                      <div className="flex items-center gap-1"><CheckCircle size={10} className="text-success" /><p className="text-xs text-success">{item.status}</p></div>
                    ) : failed ? (
                      <div className="flex items-center gap-1"><XCircle size={10} className="text-danger" /><span className="text-xs text-danger">실패</span></div>
                    ) : (
                      <span className="text-xs text-text-muted">대기</span>
                    )}
                    {!isLoading && !item.ok && item.canRun && !loading.media && (
                      <button onClick={runFnMap[item.key]} className="mt-2 w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary-light text-xs font-medium transition-all border border-primary/20">
                        <Sparkles size={10} /> 실행
                      </button>
                    )}
                    {!isLoading && item.ok && item.canRun && !loading.media && (
                      <button onClick={runFnMap[item.key]} className="mt-2 w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-surface-light hover:bg-surface text-text-muted text-xs font-medium transition-all border border-border">
                        <RefreshCw size={10} /> 재생성
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 나레이션 미리듣기 */}
            {narrations && Array.isArray(narrations) && narrations.some(n => n.audioUrl) && (
              <div className="bg-surface-light rounded-lg border border-border p-3 space-y-2">
                <p className="text-xs font-medium text-text-muted">나레이션 미리듣기</p>
                {narrations.map((n, i) => n.audioUrl && (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[10px] text-text-muted w-12">씬 {n.sceneNumber}</span>
                    <audio src={n.audioUrl} controls className="h-7 flex-1" style={{ minWidth: 0 }} />
                  </div>
                ))}
              </div>
            )}

            {/* 영상 소스 미리보기 */}
            {videoClips && Array.isArray(videoClips) && videoClips.some(c => c.url) && (
              <div className="bg-surface-light rounded-lg border border-border p-3">
                <p className="text-xs font-medium text-text-muted mb-2">영상 소스 미리보기</p>
                <div className="grid grid-cols-2 gap-2">
                  {videoClips.map((clip, i) => clip.url && (
                    <div key={i} className="rounded-lg overflow-hidden border border-border">
                      <div className="flex items-center gap-1 px-2 py-1 bg-surface">
                        <span className="text-[10px] font-medium text-text">씬 {clip.sceneNumber}</span>
                        <span className={`text-[10px] px-1 py-0.5 rounded ${clip.completed ? 'bg-cyan-500/10 text-cyan-400' : 'bg-surface-light text-text-muted'}`}>{clip.completed ? '영상' : clip.type}</span>
                      </div>
                      {clip.type === 'video' ? (
                        <video src={clip.url} controls className="w-full" style={{ maxHeight: 150 }} />
                      ) : (
                        <img src={clip.url} alt="" className="w-full object-cover" style={{ maxHeight: 150 }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 최종 영상 */}
            {finalVideo && (
              <div className="bg-gradient-to-b from-surface-light to-surface rounded-xl border border-primary/20 p-4">
                <p className="text-sm font-semibold text-text mb-3 flex items-center gap-2"><Clapperboard size={14} className="text-primary" /> 최종 영상 {finalVideo.upscaled && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400">업스케일</span>}</p>
                <div className="flex flex-col items-center gap-3">
                  {finalVideo.url ? (
                    <>
                      <div className="w-full max-w-xs rounded-xl overflow-hidden border-2 border-primary/30 shadow-lg shadow-primary/10" style={{ aspectRatio: '9/16' }}>
                        <video src={finalVideo.url} controls className="w-full h-full object-cover" />
                      </div>
                      <div className="flex items-center gap-2">
                        <a href={finalVideo.url} download="shorts_final.mp4" target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary-dark transition-all shadow-lg shadow-primary/20">
                          <Download size={16} /> 최종 MP4 다운로드
                        </a>
                        <span className="text-xs text-text-muted">{finalVideo.duration?.toFixed?.(1) || finalVideo.duration}초</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-4">
                      <CheckCircle size={28} className="mx-auto text-success mb-2" />
                      <p className="text-sm text-text font-medium">파이프라인 완료</p>
                      <p className="text-xs text-text-muted mt-1">{demoMode ? '데모 모드 — 실제 영상 없음' : '렌더 완료 확인 필요'}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        <ErrorPanel errors={stepErrors.media} onRetry={retryMediaItem} retrying={retrying} />
      </div>

      {/* Pipeline Logs */}
      <div className="bg-surface rounded-xl border border-border">
        <button onClick={() => { refreshLogs(); setLogsOpen(p => !p) }} className="w-full flex items-center justify-between p-4 text-left">
          <span className="text-xs font-semibold text-text-muted flex items-center gap-2"><Zap size={12} /> 파이프라인 로그 ({logs.length}건)</span>
          {logsOpen ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
        </button>
        {logsOpen && (
          <div className="px-4 pb-4">
            <div className="bg-[#0d1117] rounded-lg p-3 max-h-64 overflow-y-auto font-mono text-[11px] leading-relaxed">
              {logs.length === 0 ? <p className="text-gray-500">파이프라인 실행 시 로그가 여기에 표시됩니다.</p> : (
                logs.map((log, i) => (
                  <div key={i} className="text-gray-300">
                    <span className="text-gray-500">[{log.ts}]</span>{' '}
                    <span className="text-cyan-400">[Step {log.step}]</span>{' '}
                    <span>{log.msg}</span>
                    {log.data != null && <span className="text-yellow-400"> {typeof log.data === 'string' ? log.data : JSON.stringify(log.data)}</span>}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* View Results Button */}
      <div className="flex justify-end">
        <button disabled={!hasAnyContent || loading.content || loading.media}
          onClick={() => navigate('/extraction/result', { state: {
            shortsScript,
            shortsVideo: finalVideo ? {
              combinedVideoUrl: finalVideo.url,
              sceneTimings: shortsScript?.scenes?.map((s, i) => {
                const nar = narrations?.find(n => n.sceneNumber === s.sceneNumber)
                const dur = nar?.duration || s.duration || 5
                const startTime = shortsScript.scenes.slice(0, i).reduce((sum, prev) => {
                  const pNar = narrations?.find(n => n.sceneNumber === prev.sceneNumber)
                  return sum + (pNar?.duration || prev.duration || 5)
                }, 0)
                return { sceneNumber: s.sceneNumber, startTime, duration: dur, narrationDuration: dur }
              }) || [],
            } : null,
            shortsNarration: narrations,
            parsedText, verification, summary,
            fileName: file?.name || (demoMode ? 'demo_입시정보.pdf' : undefined),
            savedFromExtraction: true, activeChannel: 'shorts',
          } })}
          className={`px-6 py-3 font-medium rounded-xl transition-all flex items-center gap-2 ${hasAnyContent && !loading.content && !loading.media ? 'bg-primary text-white hover:bg-primary-dark shadow-lg shadow-primary/20' : 'bg-surface-light text-text-muted border border-border cursor-not-allowed'}`}>
          {loading.content || loading.media ? <><Loader2 size={18} className="animate-spin" /> 작업 중...</> : <><Eye size={18} /> 결과 확인 <ArrowRight size={16} /></>}
        </button>
      </div>
    </div>
  )
}
