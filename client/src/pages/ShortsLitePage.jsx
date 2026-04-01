import { useState, useRef } from 'react'
import {
  Upload, FileText, CheckCircle, Loader2, Sparkles, Brain, PenTool,
  Film, Mic, AlertCircle, ChevronRight, Eye, ArrowRight, Clapperboard,
  XCircle, AlertTriangle, RefreshCw, ToggleLeft, ToggleRight,
  Download, ChevronDown, ChevronUp, Settings2, Zap
} from 'lucide-react'
import { parsePDF } from '../services/llamaparse'
import { verifyParsedContent, summarizeContent } from '../services/gemini'
import {
  generatePipelineScript, generatePipelineVoice, assembleCreatomateOnly,
  pipelineLog, getPipelineLogs, clearPipelineLogs,
} from '../services/shorts-pipeline'

const steps = [
  { id: 1, label: '문서 업로드', icon: Upload, desc: '문서 파일 업로드' },
  { id: 2, label: '문서 분석', icon: Brain, desc: '텍스트 추출 & 검증' },
  { id: 3, label: '핵심 요약', icon: FileText, desc: '데이터 요약' },
  { id: 4, label: '대본 생성', icon: PenTool, desc: '숏폼 스크립트' },
  { id: 5, label: '영상 제작', icon: Clapperboard, desc: '나레이션 + 이미지 + 조립' },
]

const MOCK_DELAY = 800
const delay = (ms) => new Promise(r => setTimeout(r, ms))

const mockParsedText = `[데모] 2025학년도 서울대학교 수시모집 안내\n1. 모집인원: 1,906명 (전체의 75.3%)\n2. 전형별: 학생부종합 1,572명, 학생부교과 334명`
const mockVerification = { isValid: true, confidence: 0.93, issues: [], correctedText: null }
const mockSummary = {
  title: '2025 서울대 수시모집 핵심 요약',
  summary: '서울대 수시모집 1,906명, 학생부종합 82.5% 차지.',
  keyData: [
    { label: '모집인원', value: '1,906명', context: '전체 75.3%' },
    { label: '학생부종합', value: '1,572명', context: '82.5%' },
  ],
  insights: ['학생부종합이 압도적 비중'],
  keywords: ['서울대', '수시'],
}
const mockScript = {
  title: '서울대 수시, 1,906명 뽑는다고?!', totalDuration: 10,
  scenes: [
    { sceneNumber: 1, duration: 5, narration: '서울대가 수시로만 1,906명을 뽑습니다!', imagePrompt: 'Students walking through prestigious Korean university campus with cherry blossoms and modern buildings, warm afternoon sunlight, cinematic 9:16 portrait', textOverlay: '1,906', useVideo: true },
    { sceneNumber: 2, duration: 5, narration: '학생부종합이 82%! 활동이 중요합니다.', imagePrompt: 'Students actively studying and discussing in a bright modern university library, books and laptops on desks, dynamic scene with movement, 9:16 portrait', textOverlay: '82%', useVideo: true },
  ],
  bgmStyle: 'upbeat',
}

function ErrorAlert({ message, onClose }) {
  if (!message) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface rounded-xl border border-danger/30 shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        <div className="flex items-center gap-3 p-4 bg-danger/10 border-b border-danger/20"><AlertCircle size={20} className="text-danger shrink-0" /><h3 className="font-semibold text-danger text-sm">오류 발생</h3></div>
        <div className="p-5"><p className="text-sm text-text leading-relaxed whitespace-pre-line">{message}</p></div>
        <div className="flex justify-end p-4 border-t border-border"><button onClick={onClose} className="px-4 py-2 bg-danger/10 text-danger text-sm font-medium rounded-lg hover:bg-danger/20 transition-all">확인</button></div>
      </div>
    </div>
  )
}

export default function ShortsLitePage() {
  const fileInputRef = useRef(null)
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState({})
  const [stepErrors, setStepErrors] = useState({})
  const [errorAlert, setErrorAlert] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [demoMode, setDemoMode] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)
  const [logs, setLogs] = useState([])
  const [progressMsg, setProgressMsg] = useState('')
  const [targetDuration, setTargetDuration] = useState(10)

  const [file, setFile] = useState(null)
  const [emphasisText, setEmphasisText] = useState('')
  const [emphasisConfirmed, setEmphasisConfirmed] = useState(false)
  const [parsedText, setParsedText] = useState('')
  const [verification, setVerification] = useState(null)
  const [summary, setSummary] = useState(null)
  const [shortsScript, setShortsScript] = useState(null)
  const [narrations, setNarrations] = useState(null)
  const [finalVideo, setFinalVideo] = useState(null)
  const [mediaItemLoading, setMediaItemLoading] = useState({})
  const abortedRef = useRef(false)

  const setStepLoading = (s, v) => setLoading(p => ({ ...p, [s]: v }))
  const addStepErrors = (step, errs) => setStepErrors(p => ({ ...p, [step]: [...(p[step] || []), ...errs] }))
  const clearStepErrors = (step) => setStepErrors(p => ({ ...p, [step]: null }))
  const showErrorAlert = (svc, detail) => setErrorAlert(`${svc}: ${detail}`)
  const refreshLogs = () => setLogs(getPipelineLogs())

  // Step 1
  const handleFile = (f) => {
    const exts = ['.pdf', '.hwp', '.hwpx', '.docx', '.doc', '.pptx', '.ppt']
    const ext = f?.name?.toLowerCase().match(/\.[^.]+$/)?.[0]
    if (f && ext && exts.includes(ext)) { setFile(f); setCurrentStep(2) }
    else addStepErrors('upload', [{ service: 'upload', message: 'PDF, HWP, DOCX, PPTX만 지원' }])
  }

  // Step 2
  const runAnalysis = async () => {
    setStepLoading('analysis', true); clearStepErrors('analysis'); setProgressMsg('PDF 텍스트 추출 중...')
    if (demoMode) { await delay(MOCK_DELAY); setParsedText(mockParsedText); setProgressMsg('데이터 검증 중...'); await delay(MOCK_DELAY); setVerification(mockVerification); setCurrentStep(3); setStepLoading('analysis', false); setProgressMsg(''); return }
    try {
      const text = await parsePDF(file); setParsedText(text); setProgressMsg('텍스트 추출 완료, 데이터 검증 중...')
      try { const v = await verifyParsedContent(text); setVerification(v); setParsedText(v.correctedText || text) }
      catch { setVerification({ isValid: false, issues: ['검증 건너뜀'], confidence: 0 }) }
      setCurrentStep(3)
    } catch (err) { addStepErrors('analysis', [{ service: 'gemini', message: err.message }]); showErrorAlert('분석', err.message) }
    setStepLoading('analysis', false); setProgressMsg('')
  }

  // Step 3
  const runSummary = async () => {
    setStepLoading('summary', true); clearStepErrors('summary'); setProgressMsg('핵심 요약 생성 중...')
    if (demoMode) { await delay(MOCK_DELAY); setSummary(mockSummary); setCurrentStep(4); setStepLoading('summary', false); setProgressMsg(''); return }
    try {
      const r = await summarizeContent(parsedText)
      if (r.title === '요약 생성 실패') { addStepErrors('summary', [{ service: 'gemini', message: 'JSON 파싱 실패' }]) }
      else { setSummary(r); setCurrentStep(4) }
    } catch (err) { addStepErrors('summary', [{ service: 'gemini', message: err.message }]) }
    setStepLoading('summary', false); setProgressMsg('')
  }

  // Step 4
  const runScript = async () => {
    setStepLoading('content', true); clearStepErrors('content'); clearPipelineLogs()
    setProgressMsg('대본 생성 중... (5~15초)')
    if (demoMode) { await delay(MOCK_DELAY); setShortsScript(mockScript); refreshLogs(); setCurrentStep(5); setStepLoading('content', false); setProgressMsg(''); return }
    try {
      const s = await generatePipelineScript(summary, parsedText, emphasisText, { targetDuration, hybridMode: false })
      setShortsScript(s); setCurrentStep(5); refreshLogs()
    } catch (err) { addStepErrors('content', [{ service: 'gemini', channel: '대본', message: err.message }]); refreshLogs() }
    setStepLoading('content', false); setProgressMsg('')
  }

  // Step 5-1: 나레이션 (실패한 씬만 재시도)
  const runNarration = async () => {
    if (!shortsScript?.scenes?.length) return
    setMediaItemLoading(p => ({ ...p, '나레이션': true })); setProgressMsg('ElevenLabs 나레이션 생성 중...')
    if (demoMode) {
      await delay(MOCK_DELAY)
      setNarrations(shortsScript.scenes.map(s => ({ sceneNumber: s.sceneNumber, audioUrl: null, duration: s.duration, text: s.narration })))
      setMediaItemLoading(p => ({ ...p, '나레이션': false })); setProgressMsg(''); refreshLogs(); return
    }
    try {
      // 이미 완료된 씬 필터링
      const doneScenes = (narrations || []).filter(n => n.audioUrl)
      const doneNumbers = new Set(doneScenes.map(n => n.sceneNumber))
      const pendingScenes = shortsScript.scenes.filter(s => !doneNumbers.has(s.sceneNumber))

      if (pendingScenes.length === 0) {
        setMediaItemLoading(p => ({ ...p, '나레이션': false })); setProgressMsg(''); return
      }

      setProgressMsg(`ElevenLabs 나레이션 생성 중... (${pendingScenes.length}개 씬 남음)`)
      const newResults = await generatePipelineVoice(pendingScenes)

      // 기존 완료분 + 새로 생성분 합치기
      const merged = [...doneScenes, ...newResults].sort((a, b) => a.sceneNumber - b.sceneNumber)
      setNarrations(merged); refreshLogs()
    } catch (err) { addStepErrors('media', [{ service: 'elevenlabs', channel: '나레이션', message: err.message }]); refreshLogs() }
    setMediaItemLoading(p => ({ ...p, '나레이션': false })); setProgressMsg('')
  }

  // Step 5-2: 최종 영상 (Imagen + Creatomate)
  const runFinal = async () => {
    if (!shortsScript?.scenes?.length || !narrations?.length) return
    setMediaItemLoading(p => ({ ...p, '최종 영상': true })); setProgressMsg('이미지 생성 + Creatomate 조립 중... (1~3분)')
    if (demoMode) {
      await delay(MOCK_DELAY); setFinalVideo({ url: null, duration: targetDuration })
      setMediaItemLoading(p => ({ ...p, '최종 영상': false })); setProgressMsg(''); refreshLogs(); return
    }
    try {
      const result = await assembleCreatomateOnly(shortsScript.scenes, narrations, {})
      setFinalVideo(result); refreshLogs()
    } catch (err) { addStepErrors('media', [{ service: 'creatomate', channel: '최종 영상', message: err.message }]); refreshLogs() }
    setMediaItemLoading(p => ({ ...p, '최종 영상': false })); setProgressMsg('')
  }

  // 전체 실행
  const runAllMedia = async () => {
    setStepLoading('media', true); clearStepErrors('media'); abortedRef.current = false

    const currentScript = shortsScript
    if (!currentScript) { setStepLoading('media', false); return }

    // 1) 나레이션
    setProgressMsg('[1/2] 나레이션 생성 중...')
    setMediaItemLoading(p => ({ ...p, '나레이션': true }))
    let currentNarrations = narrations
    if (demoMode) {
      await delay(MOCK_DELAY)
      currentNarrations = currentScript.scenes.map(s => ({ sceneNumber: s.sceneNumber, audioUrl: null, duration: s.duration, text: s.narration }))
      setNarrations(currentNarrations)
    } else {
      try { currentNarrations = await generatePipelineVoice(currentScript.scenes); setNarrations(currentNarrations) }
      catch (err) { addStepErrors('media', [{ service: 'elevenlabs', channel: '나레이션', message: err.message }]) }
    }
    setMediaItemLoading(p => ({ ...p, '나레이션': false })); refreshLogs()
    if (abortedRef.current) { setStepLoading('media', false); setProgressMsg(''); return }

    // 나레이션 실패해도 영상은 계속 생성
    const hasNarration = Array.isArray(currentNarrations) && currentNarrations.some(n => n.audioUrl)
    if (!hasNarration && !demoMode) {
      addStepErrors('media', [{ service: 'elevenlabs', channel: '나레이션', message: '나레이션 생성 실패. 나레이션 없이 영상을 생성합니다.' }])
      // 나레이션 없이 기본 duration으로 대체
      currentNarrations = currentScript.scenes.map(s => ({ sceneNumber: s.sceneNumber, audioUrl: null, duration: parseInt(s.duration) || 5, text: s.narration }))
      setNarrations(currentNarrations)
    }

    // 2) 최종 영상
    setProgressMsg('[2/2] 이미지 + Creatomate 조립 중... (1~3분)')
    setMediaItemLoading(p => ({ ...p, '최종 영상': true }))
    if (demoMode) {
      await delay(MOCK_DELAY); setFinalVideo({ url: null, duration: targetDuration })
    } else {
      try {
        const result = await assembleCreatomateOnly(currentScript.scenes, currentNarrations, {})
        setFinalVideo(result)
      } catch (err) { addStepErrors('media', [{ service: 'creatomate', channel: '최종 영상', message: err.message }]) }
    }
    setMediaItemLoading(p => ({ ...p, '최종 영상': false })); refreshLogs()
    setStepLoading('media', false); setProgressMsg('')
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <ErrorAlert message={errorAlert} onClose={() => setErrorAlert(null)} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400"><Clapperboard size={22} /></div>
          <div>
            <h2 className="text-lg font-bold text-text">숏폼 Lite <span className="text-xs font-normal text-purple-400 ml-1">Creatomate Only</span></h2>
            <p className="text-xs text-text-muted">Veo 없이 이미지 + 모션으로 빠르고 저렴하게</p>
          </div>
        </div>
        <button onClick={() => setDemoMode(p => !p)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${demoMode ? 'bg-warning/10 text-warning border-warning/30' : 'bg-surface-light text-text-muted border-border'}`}>
          {demoMode ? <ToggleRight size={16} /> : <ToggleLeft size={16} />} 데모
        </button>
      </div>

      {/* Options */}
      <div className="bg-surface rounded-xl border border-border p-4">
        <div className="flex items-center gap-4">
          <Settings2 size={14} className="text-text-muted" />
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted">목표 길이:</label>
            <select value={targetDuration} onChange={e => setTargetDuration(Number(e.target.value))} disabled={currentStep > 4}
              className="bg-surface-light border border-border rounded-lg px-2 py-1 text-xs text-text focus:outline-none">
              <option value={10}>10초</option><option value={30}>30초</option><option value={60}>60초</option>
            </select>
          </div>
          <div className="text-xs text-text-muted">예상 비용: <span className="text-purple-400 font-medium">~{targetDuration <= 10 ? '350' : targetDuration <= 30 ? '700' : '1,200'}원</span></div>
        </div>
      </div>

      {/* Progress */}
      {progressMsg && (
        <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl px-4 py-3 flex items-center gap-3 animate-pulse">
          <Loader2 size={16} className="text-purple-400 animate-spin shrink-0" />
          <p className="text-sm text-purple-400 font-medium">{progressMsg}</p>
        </div>
      )}

      {/* Step Progress Bar */}
      <div className="bg-surface rounded-xl border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-text">진행 상황</span>
          <span className="text-xs text-text-muted">Step {currentStep} / 5</span>
        </div>
        <div className="flex items-center gap-1">
          {steps.map((step, i) => {
            const Icon = step.icon
            const isActive = step.id === currentStep
            const isDone = step.id < currentStep
            return (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all
                    ${isDone ? 'bg-success/20 text-success' : isActive ? 'bg-purple-500/20 text-purple-400 ring-2 ring-purple-500/30' : 'bg-surface-light text-text-muted'}`}>
                    {isDone ? <CheckCircle size={16} /> : <Icon size={16} />}
                  </div>
                  <span className={`text-[10px] mt-1 font-medium ${isActive ? 'text-purple-400' : isDone ? 'text-success' : 'text-text-muted'}`}>{step.label}</span>
                </div>
                {i < steps.length - 1 && <ChevronRight size={12} className={`mx-0.5 shrink-0 ${isDone ? 'text-success' : 'text-border'}`} />}
              </div>
            )
          })}
        </div>
      </div>

      {/* Step 1: Upload */}
      <div className={`bg-surface rounded-xl border transition-all ${currentStep === 1 ? 'border-purple-500/40' : 'border-border'}`}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${file ? 'bg-success/10 text-success' : 'bg-purple-500/10 text-purple-400'}`}><Upload size={16} /></div>
            <h3 className="font-semibold text-text text-sm">Step 1. 문서 업로드</h3>
          </div>
          {file && <span className="text-xs text-success flex items-center gap-1"><CheckCircle size={12} /> 완료</span>}
        </div>
        <div className="p-4">
          {!file ? (
            demoMode ? (
              <div className="text-center py-6">
                <button onClick={() => { setFile({ name: 'demo.pdf', size: 1024000 }); setCurrentStep(2) }}
                  className="px-4 py-2 bg-warning/10 text-warning text-sm font-medium rounded-lg hover:bg-warning/20">데모 파일로 시작</button>
              </div>
            ) : (
              <div className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${isDragging ? 'border-purple-500 bg-purple-500/5' : 'border-border hover:border-purple-500/40'}`}
                onDragOver={e => { e.preventDefault(); setIsDragging(true) }} onDragLeave={() => setIsDragging(false)}
                onDrop={e => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files[0]) }}
                onClick={() => fileInputRef.current?.click()}>
                <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.hwp,.hwpx,.docx,.doc,.pptx,.ppt" onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
                <Upload size={24} className="mx-auto mb-2 text-text-muted" />
                <p className="text-sm text-text">파일을 드래그하거나 <span className="text-purple-400 font-medium">클릭</span></p>
              </div>
            )
          ) : (
            <div className="flex items-center gap-3 p-3 bg-success/5 rounded-lg border border-success/20">
              <FileText size={18} className="text-success" />
              <div className="flex-1"><p className="text-sm font-medium text-text">{file.name}</p></div>
              <button onClick={() => { setFile(null); setCurrentStep(1) }} className="text-xs text-text-muted hover:text-danger">변경</button>
            </div>
          )}
          {file && (
            <div className="mt-3 flex gap-2">
              <input type="text" value={emphasisText} onChange={e => { setEmphasisText(e.target.value); setEmphasisConfirmed(false) }}
                placeholder="강조할 내용 (선택)" disabled={emphasisConfirmed}
                className="flex-1 px-3 py-2 bg-surface-light border border-border rounded-lg text-xs text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-purple-500/30 disabled:opacity-60" />
              <button onClick={() => setEmphasisConfirmed(p => !p)}
                className={`px-3 py-2 text-xs font-medium rounded-lg shrink-0 ${emphasisConfirmed ? 'bg-success/10 text-success' : 'bg-purple-500 text-white hover:bg-purple-600'}`}>
                {emphasisConfirmed ? 'OK' : '확인'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Step 2: Analysis */}
      <div className={`bg-surface rounded-xl border transition-all ${currentStep === 2 ? 'border-purple-500/40' : 'border-border'} ${currentStep < 2 ? 'opacity-40' : ''}`}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${verification ? 'bg-success/10 text-success' : 'bg-purple-500/10 text-purple-400'}`}><Brain size={16} /></div>
            <h3 className="font-semibold text-text text-sm">Step 2. 문서 분석</h3>
          </div>
          <div className="flex items-center gap-2">
            {verification && (
              <span className={`text-xs flex items-center gap-1 ${verification.confidence >= 1 ? 'text-success' : 'text-warning'}`}>
                {verification.confidence >= 1 ? <CheckCircle size={12} /> : <AlertTriangle size={12} />} 신뢰도 {Math.round((verification.confidence || 0) * 100)}%
              </span>
            )}
            {verification && verification.confidence < 1 && (
              <button onClick={runAnalysis} disabled={loading.analysis} className="px-3 py-1.5 bg-warning/10 text-warning text-xs font-medium rounded-lg hover:bg-warning/20 disabled:opacity-50 flex items-center gap-1.5">
                {loading.analysis ? <><Loader2 size={12} className="animate-spin" /> 재분석중...</> : <><RefreshCw size={12} /> 재분석</>}
              </button>
            )}
            {currentStep === 2 && !verification && (
              <button onClick={runAnalysis} disabled={loading.analysis} className="px-3 py-1.5 bg-purple-500 text-white text-xs font-medium rounded-lg hover:bg-purple-600 disabled:opacity-50 flex items-center gap-1.5">
                {loading.analysis ? <><Loader2 size={12} className="animate-spin" /> 분석중</> : <><Sparkles size={12} /> 실행</>}
              </button>
            )}
          </div>
        </div>
        {parsedText && (
          <div className="p-4"><div className="bg-surface-light rounded-lg p-3 max-h-96 overflow-y-auto"><p className="text-xs text-text-muted whitespace-pre-wrap">{parsedText}</p></div></div>
        )}
      </div>

      {/* Step 3: Summary */}
      <div className={`bg-surface rounded-xl border transition-all ${currentStep === 3 ? 'border-purple-500/40' : 'border-border'} ${currentStep < 3 ? 'opacity-40' : ''}`}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${summary ? 'bg-success/10 text-success' : 'bg-purple-500/10 text-purple-400'}`}><FileText size={16} /></div>
            <h3 className="font-semibold text-text text-sm">Step 3. 핵심 요약</h3>
          </div>
          <div className="flex items-center gap-2">
            {summary && <span className="text-xs text-success flex items-center gap-1"><CheckCircle size={12} /> 완료</span>}
            {currentStep === 3 && !summary && (
              <button onClick={runSummary} disabled={loading.summary} className="px-3 py-1.5 bg-purple-500 text-white text-xs font-medium rounded-lg hover:bg-purple-600 disabled:opacity-50 flex items-center gap-1.5">
                {loading.summary ? <><Loader2 size={12} className="animate-spin" /> 요약중</> : <><Sparkles size={12} /> 실행</>}
              </button>
            )}
          </div>
        </div>
        {summary && (
          <div className="p-4 space-y-2">
            <p className="text-sm font-semibold text-text">{summary.title}</p>
            <p className="text-xs text-text-muted">{summary.summary}</p>
            {summary.keyData?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {summary.keyData.map((d, i) => (
                  <div key={i} className="bg-purple-500/5 border border-purple-500/10 rounded-lg px-3 py-1.5">
                    <span className="text-[10px] text-text-muted">{d.label}</span> <span className="text-xs font-semibold text-purple-400">{d.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Step 4: Script */}
      <div className={`bg-surface rounded-xl border transition-all ${currentStep === 4 ? 'border-purple-500/40' : 'border-border'} ${currentStep < 4 ? 'opacity-40' : ''}`}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${shortsScript ? 'bg-success/10 text-success' : 'bg-purple-500/10 text-purple-400'}`}><PenTool size={16} /></div>
            <h3 className="font-semibold text-text text-sm">Step 4. 대본 생성</h3>
          </div>
          <div className="flex items-center gap-2">
            {shortsScript && <span className="text-xs text-success flex items-center gap-1"><CheckCircle size={12} /> {shortsScript.scenes?.length}씬</span>}
            {currentStep === 4 && (
              <button onClick={runScript} disabled={loading.content} className="px-3 py-1.5 bg-purple-500 text-white text-xs font-medium rounded-lg hover:bg-purple-600 disabled:opacity-50 flex items-center gap-1.5">
                {loading.content ? <><Loader2 size={12} className="animate-spin" /> 생성중</> : <><Sparkles size={12} /> 실행</>}
              </button>
            )}
          </div>
        </div>
        {loading.content && !shortsScript && (
          <div className="p-4">
            <div className="flex items-center gap-3 p-3 bg-purple-500/5 border border-purple-500/20 rounded-lg">
              <Loader2 size={14} className="text-purple-400 animate-spin" />
              <p className="text-xs text-purple-400">Gemini로 대본 생성 중... (5~15초)</p>
            </div>
          </div>
        )}
        {shortsScript && (
          <div className="p-4">
            <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-3 space-y-2">
              <p className="text-sm font-semibold text-text">{shortsScript.title}</p>
              {shortsScript.scenes?.map(scene => (
                <div key={scene.sceneNumber} className="flex items-start gap-2 bg-surface/50 rounded-lg p-2">
                  <div className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-[10px] font-bold shrink-0">{scene.sceneNumber}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text">{scene.narration}</p>
                    {scene.textOverlay && <span className="text-[10px] text-purple-400">📌 {scene.textOverlay}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Step 5: Media (나레이션 + 최종 영상) */}
      <div className={`bg-surface rounded-xl border transition-all ${currentStep === 5 ? 'border-purple-500/40' : 'border-border'} ${currentStep < 5 ? 'opacity-40' : ''}`}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${finalVideo ? 'bg-success/10 text-success' : 'bg-purple-500/10 text-purple-400'}`}><Clapperboard size={16} /></div>
            <h3 className="font-semibold text-text text-sm">Step 5. 영상 제작</h3>
          </div>
          <div className="flex items-center gap-2">
            {currentStep === 5 && !loading.media && (
              <button onClick={runAllMedia} className="px-3 py-1.5 bg-purple-500 text-white text-xs font-medium rounded-lg hover:bg-purple-600 flex items-center gap-1.5">
                <Sparkles size={12} /> 전체 실행
              </button>
            )}
            {loading.media && (
              <button onClick={() => { abortedRef.current = true; setStepLoading('media', false); setMediaItemLoading({}); setProgressMsg('') }}
                className="px-3 py-1.5 bg-danger/10 text-danger text-xs font-medium rounded-lg hover:bg-danger/20 flex items-center gap-1.5 border border-danger/20">
                <XCircle size={12} /> 중단
              </button>
            )}
          </div>
        </div>
        {currentStep >= 5 && (
          <div className="p-4 space-y-3">
            {/* 2 cards */}
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  label: '나레이션', key: 'narration', icon: Mic, iconColor: 'text-emerald-400',
                  status: narrations ? `${narrations.filter(n => n.audioUrl).length}/${narrations.length}개` : null,
                  ok: Array.isArray(narrations) && narrations.some(n => n.audioUrl),
                  canRun: !!shortsScript?.scenes?.length,
                  fn: runNarration,
                },
                {
                  label: '최종 영상', key: 'final', icon: Clapperboard, iconColor: 'text-purple-400',
                  status: finalVideo ? `${finalVideo.duration?.toFixed?.(1) || finalVideo.duration}초` : null,
                  ok: !!finalVideo,
                  canRun: Array.isArray(narrations) && narrations.some(n => n.audioUrl),
                  fn: runFinal,
                },
              ].map((item, i) => {
                const Icon = item.icon
                const isLoading = mediaItemLoading[item.label]
                const failed = stepErrors.media?.some(e => e.channel === item.label)
                return (
                  <div key={i} className={`rounded-lg p-4 border ${isLoading ? 'bg-purple-500/5 border-purple-500/20' : failed ? 'bg-danger/5 border-danger/20' : item.ok ? 'bg-success/5 border-success/20' : 'bg-surface-light border-border'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Icon size={14} className={item.iconColor} />
                      <p className="text-sm font-medium text-text">{item.label}</p>
                    </div>
                    {isLoading ? (
                      <div className="flex items-center gap-1"><Loader2 size={12} className="text-purple-400 animate-spin" /><span className="text-xs text-purple-400">생성중...</span></div>
                    ) : item.ok ? (
                      <div className="flex items-center gap-1"><CheckCircle size={12} className="text-success" /><span className="text-xs text-success">{item.status}</span></div>
                    ) : failed ? (
                      <div className="flex items-center gap-1"><XCircle size={12} className="text-danger" /><span className="text-xs text-danger">실패</span></div>
                    ) : (
                      <span className="text-xs text-text-muted">대기</span>
                    )}
                    {!isLoading && !item.ok && item.canRun && !loading.media && (
                      <button onClick={item.fn} className="mt-2 w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-xs font-medium transition-all border border-purple-500/20">
                        <Sparkles size={10} /> 실행
                      </button>
                    )}
                    {!isLoading && item.ok && !loading.media && (
                      <button onClick={item.fn} className="mt-2 w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-surface-light hover:bg-surface text-text-muted text-xs font-medium transition-all border border-border">
                        <RefreshCw size={10} /> 재생성
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 나레이션 미리듣기 */}
            {narrations?.some(n => n.audioUrl) && (
              <div className="bg-surface-light rounded-lg border border-border p-3 space-y-2">
                <p className="text-xs font-medium text-text-muted">나레이션 미리듣기</p>
                {narrations.map((n, i) => n.audioUrl && (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[10px] text-text-muted w-10">씬 {n.sceneNumber}</span>
                    <audio src={n.audioUrl} controls className="h-7 flex-1" style={{ minWidth: 0 }} />
                  </div>
                ))}
              </div>
            )}

            {/* 최종 영상 */}
            {finalVideo && (
              <div className="bg-gradient-to-b from-surface-light to-surface rounded-xl border border-purple-500/20 p-4">
                <p className="text-sm font-semibold text-text mb-3 flex items-center gap-2"><Clapperboard size={14} className="text-purple-400" /> 최종 영상</p>
                <div className="flex flex-col items-center gap-3">
                  {finalVideo.url ? (
                    <>
                      <div className="w-full max-w-xs rounded-xl overflow-hidden border-2 border-purple-500/30 shadow-lg" style={{ aspectRatio: '9/16' }}>
                        <video src={finalVideo.url} controls className="w-full h-full object-cover" />
                      </div>
                      <a href={finalVideo.url} download="shorts_lite.mp4" target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 px-5 py-2.5 bg-purple-500 text-white text-sm font-semibold rounded-xl hover:bg-purple-600 transition-all shadow-lg shadow-purple-500/20">
                        <Download size={16} /> MP4 다운로드
                      </a>
                    </>
                  ) : (
                    <div className="text-center py-4">
                      <CheckCircle size={28} className="mx-auto text-success mb-2" />
                      <p className="text-sm text-text font-medium">완료</p>
                      <p className="text-xs text-text-muted">{demoMode ? '데모 모드' : '렌더 확인 필요'}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Logs */}
      <div className="bg-surface rounded-xl border border-border">
        <button onClick={() => { refreshLogs(); setLogsOpen(p => !p) }} className="w-full flex items-center justify-between p-4 text-left">
          <span className="text-xs font-semibold text-text-muted flex items-center gap-2"><Zap size={12} /> 로그 ({logs.length}건)</span>
          {logsOpen ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
        </button>
        {logsOpen && (
          <div className="px-4 pb-4">
            <div className="bg-[#0d1117] rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-[11px] leading-relaxed">
              {logs.length === 0 ? <p className="text-gray-500">실행 시 로그가 표시됩니다.</p> : logs.map((log, i) => (
                <div key={i} className="text-gray-300">
                  <span className="text-gray-500">[{log.ts}]</span> <span className="text-purple-400">[{log.step}]</span> {log.msg}
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
