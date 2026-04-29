import { useState } from 'react'
import {
  Instagram, Upload, Loader2, CheckCircle, XCircle, X, Plus,
  Image as ImageIcon, AlertTriangle, Calendar, Clock, ArrowRight,
} from 'lucide-react'
import { get } from '../utils/platformConnections'

const API_BASE = '' // Vite 프록시를 통해 localhost:3001로 전달 (/api → proxy)

export default function InstagramScheduleTestPage() {
  // ── 모드 ──
  const [mode, setMode] = useState('schedule') // 'immediate' | 'schedule'

  // ── 콘텐츠 ──
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState([])
  const [hashtagInput, setHashtagInput] = useState('')
  const [imageUrl, setImageUrl] = useState('')

  // ── 예약 시간 ──
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('09:00')

  // ── 상태 ──
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [logs, setLogs] = useState([])
  const [connection] = useState(() => get('instagram'))

  const today = new Date().toISOString().split('T')[0]
  const addLog = (msg) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])

  // 해시태그
  const addHashtag = () => {
    const t = hashtagInput.trim().replace(/^#/, '')
    if (t && !hashtags.includes(t)) setHashtags(prev => [...prev, t])
    setHashtagInput('')
  }
  const removeHashtag = (t) => setHashtags(prev => prev.filter(x => x !== t))

  // 최종 캡션
  const fullCaption = [caption, hashtags.map(t => `#${t}`).join(' ')].filter(Boolean).join('\n\n')

  // Unix timestamp
  const getScheduledTimestamp = () => {
    if (!scheduleDate || !scheduleTime) return null
    return Math.floor(new Date(`${scheduleDate}T${scheduleTime}:00`).getTime() / 1000)
  }

  // 예시 데이터
  const loadExample = () => {
    setCaption('오늘의 추천 콘텐츠를 소개합니다! ✨\n\n여러분이 정말 사랑할 만한 특별한 이야기를 담았어요.')
    setHashtags(['일상', '추천', '콘텐츠', '트렌드'])
    setImageUrl('https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/1080px-Camponotus_flavomarginatus_ant.jpg')
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setScheduleDate(tomorrow.toISOString().split('T')[0])
    setScheduleTime('09:00')
  }

  // ── 서버 API 호출 ──
  const runTest = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    if (!imageUrl) {
      setError('이미지 URL을 입력해주세요.')
      setLoading(false)
      return
    }

    const body = {
      imageUrl,
      caption: fullCaption,
    }

    if (mode === 'schedule') {
      const ts = getScheduledTimestamp()
      if (!ts) {
        setError('예약 날짜와 시간을 입력해주세요.')
        setLoading(false)
        return
      }
      const nowTs = Math.floor(Date.now() / 1000)
      if (ts - nowTs < 900) {
        setError('예약 시간은 현재로부터 최소 15분 이후여야 합니다.')
        setLoading(false)
        return
      }
      body.scheduledPublishTime = ts
      addLog(`예약 시간: ${new Date(ts * 1000).toLocaleString()} (timestamp: ${ts})`)
    }

    addLog(`모드: ${mode === 'schedule' ? '예약 게시' : '즉시 게시'}`)
    addLog(`POST ${API_BASE}/api/instagram/schedule-test`)
    addLog(`요청: ${JSON.stringify(body, null, 2)}`)

    try {
      const res = await fetch(`${API_BASE}/api/instagram/schedule-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      addLog(`응답: ${JSON.stringify(data, null, 2)}`)

      if (data.success) {
        setResult(data)
        addLog(`✅ ${mode === 'schedule' ? '예약 게시' : '즉시 게시'} 성공!`)
        if (data.scheduled) {
          addLog(`📅 scheduled_publish_time 파라미터가 정상 동작함을 확인!`)
        }
      } else {
        setError(data.error || '알 수 없는 오류')
        addLog(`❌ 실패: ${data.error}`)

        // scheduled_publish_time 관련 에러인지 분석
        if (data.error?.includes('scheduled_publish_time') || data.error?.includes('whitelist') || data.error?.includes('Invalid parameter')) {
          addLog(`⚠️ scheduled_publish_time 파라미터가 지원되지 않는 것으로 보입니다.`)
          addLog(`→ 대안: 자체 스케줄러(크론잡)로 예약 시간에 즉시 게시 API 호출`)
        }
      }
    } catch (err) {
      setError(`서버 연결 실패: ${err.message}`)
      addLog(`❌ 네트워크 오류: ${err.message}`)
    }
    setLoading(false)
  }

  const reset = () => {
    setResult(null)
    setError(null)
    setLogs([])
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-5">
      {/* 헤더 */}
      <div className="flex items-center gap-3 flex-wrap">
        <Instagram size={24} className="text-pink-500" />
        <h1 className="text-xl font-bold text-text">인스타그램 예약 업로드 테스트</h1>
        {connection.connected && (
          <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            {connection.account || '연결됨'}
          </span>
        )}
      </div>

      {/* 안내 */}
      <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 p-4 space-y-1">
        <p className="text-xs font-semibold text-pink-500 flex items-center gap-1.5">
          <AlertTriangle size={14} /> 테스트 목적
        </p>
        <p className="text-xs text-text-muted">
          서버의 <code className="bg-surface-light px-1 py-0.5 rounded text-pink-500 font-mono">INSTAGRAM_ACCESS_TOKEN</code>,
          <code className="bg-surface-light px-1 py-0.5 rounded text-pink-500 font-mono">INSTAGRAM_BUSINESS_ID</code> 환경변수를 사용합니다.
          <code className="bg-surface-light px-1 py-0.5 rounded text-pink-500 font-mono">scheduled_publish_time</code> 파라미터의 실제 동작 여부를 검증합니다.
        </p>
      </div>

      {/* 예시 불러오기 */}
      <div className="bg-pink-500/5 rounded-xl border border-pink-500/20 p-3 flex items-center justify-between gap-3">
        <p className="text-xs text-text-muted">샘플 데이터로 빠르게 테스트</p>
        <button onClick={loadExample} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-pink-500 text-white hover:bg-pink-600 transition-colors shrink-0">
          예시 불러오기
        </button>
      </div>

      {/* 모드 선택 */}
      <div className="bg-surface rounded-xl border border-border p-4 space-y-3">
        <label className="text-sm font-semibold text-text">게시 모드</label>
        <div className="flex gap-3">
          {[
            { value: 'immediate', label: '즉시 게시', icon: <Upload size={14} />, desc: '표준 2단계 즉시 게시' },
            { value: 'schedule', label: '예약 게시', icon: <Calendar size={14} />, desc: 'scheduled_publish_time 테스트' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setMode(opt.value)}
              className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-lg border transition-all text-left
                ${mode === opt.value
                  ? 'border-pink-500/50 bg-pink-500/10'
                  : 'border-border bg-surface-light hover:border-pink-500/30'}`}
            >
              <div className={`p-2 rounded-lg ${mode === opt.value ? 'bg-pink-500/20 text-pink-500' : 'bg-surface text-text-muted'}`}>
                {opt.icon}
              </div>
              <div>
                <p className={`text-sm font-medium ${mode === opt.value ? 'text-pink-500' : 'text-text'}`}>{opt.label}</p>
                <p className="text-[11px] text-text-muted">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 이미지 URL */}
      <div className="bg-surface rounded-xl border border-border p-4 space-y-2">
        <label className="text-sm font-semibold text-text">이미지 URL (공개 접근 가능)</label>
        <input
          type="url"
          value={imageUrl}
          onChange={e => setImageUrl(e.target.value)}
          placeholder="https://example.com/image.jpg"
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface-light text-sm text-text placeholder:text-text-muted/50 focus:outline-none focus:border-pink-500/40 transition-colors"
        />
        {imageUrl && (
          <div className="w-24 h-24 rounded-lg overflow-hidden border border-border bg-surface-light">
            <img src={imageUrl} alt="미리보기" className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none' }} />
          </div>
        )}
      </div>

      {/* 캡션 + 해시태그 */}
      <div className="bg-surface rounded-xl border border-border p-4 space-y-3">
        <label className="text-sm font-semibold text-text">캡션</label>
        <textarea
          value={caption}
          onChange={e => setCaption(e.target.value)}
          placeholder="게시물 캡션"
          rows={3}
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface-light text-sm text-text placeholder:text-text-muted/50 focus:outline-none focus:border-pink-500/40 transition-colors resize-y"
        />

        <div className="flex gap-2">
          <input
            type="text"
            value={hashtagInput}
            onChange={e => setHashtagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addHashtag() } }}
            placeholder="#태그 입력 후 Enter"
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-surface-light text-sm text-text placeholder:text-text-muted/50 focus:outline-none focus:border-pink-500/40 transition-colors"
          />
          <button onClick={addHashtag} disabled={!hashtagInput.trim()} className="px-3 py-2 bg-pink-500/10 text-pink-500 text-xs font-medium rounded-lg hover:bg-pink-500/20 border border-pink-500/30 disabled:opacity-50 transition-all">
            <Plus size={14} />
          </button>
        </div>
        {hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {hashtags.map(t => (
              <span key={t} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-500/10 text-pink-500 text-xs font-medium border border-pink-500/30">
                #{t} <button onClick={() => removeHashtag(t)}><X size={10} /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 예약 시간 */}
      {mode === 'schedule' && (
        <div className="bg-surface rounded-xl border border-pink-500/30 p-4 space-y-3">
          <label className="text-sm font-semibold text-text flex items-center gap-2">
            <Calendar size={16} className="text-pink-500" /> 예약 시간
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-muted mb-1 block">날짜</label>
              <input type="date" min={today} value={scheduleDate} onChange={e => setScheduleDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface-light text-sm text-text focus:outline-none focus:border-pink-500/40 transition-colors" />
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">시간</label>
              <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface-light text-sm text-text focus:outline-none focus:border-pink-500/40 transition-colors" />
            </div>
          </div>
          {scheduleDate && scheduleTime && (
            <p className="text-xs text-text-muted flex items-center gap-1.5">
              <Clock size={12} />
              {new Date(`${scheduleDate}T${scheduleTime}`).toLocaleString('ko-KR')}
              <span className="opacity-50">(Unix: {getScheduledTimestamp()})</span>
            </p>
          )}
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <XCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400 whitespace-pre-wrap flex-1">{error}</p>
          <button onClick={() => setError(null)}><X size={14} className="text-red-400" /></button>
        </div>
      )}

      {/* 성공 */}
      {result && (
        <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl space-y-2">
          <p className="text-sm font-medium text-emerald-500 flex items-center gap-1.5">
            <CheckCircle size={16} />
            {result.scheduled ? '예약 게시 성공!' : '즉시 게시 성공!'}
          </p>
          <div className="text-xs text-text-muted space-y-1">
            <p>Container ID: <span className="font-mono text-text">{result.containerId}</span></p>
            <p>Media ID: <span className="font-mono text-text">{result.mediaId}</span></p>
            {result.scheduledTime && <p>예약 시간: <span className="text-text">{new Date(result.scheduledTime).toLocaleString('ko-KR')}</span></p>}
          </div>
          {result.scheduled && (
            <div className="mt-2 p-3 bg-info/5 border border-info/20 rounded-lg">
              <p className="text-xs text-info font-semibold">📅 scheduled_publish_time 파라미터가 정상 동작합니다!</p>
              <p className="text-[11px] text-text-muted mt-1">→ 프로덕션에 예약 게시 기능을 적용할 수 있습니다.</p>
            </div>
          )}
        </div>
      )}

      {/* 실행 버튼 */}
      <button
        onClick={runTest}
        disabled={loading || !imageUrl}
        className="w-full px-4 py-3.5 bg-gradient-to-r from-pink-600 to-pink-500 text-white text-sm font-semibold rounded-xl hover:from-pink-700 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-pink-500/20"
      >
        {loading ? (
          <><Loader2 size={16} className="animate-spin" /> 요청 중...</>
        ) : mode === 'schedule' ? (
          <><Calendar size={16} /> 예약 게시 테스트 실행</>
        ) : (
          <><Upload size={16} /> 즉시 게시 테스트 실행</>
        )}
      </button>

      {/* 로그 */}
      {logs.length > 0 && (
        <div className="bg-surface rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-text">API 로그</label>
            <div className="flex gap-2">
              <button onClick={reset} className="text-xs text-text-muted hover:text-text transition-colors">초기화</button>
              <button onClick={() => setLogs([])} className="text-xs text-text-muted hover:text-text transition-colors">로그 지우기</button>
            </div>
          </div>
          <div className="bg-[#0a0a14] rounded-lg p-4 max-h-72 overflow-y-auto font-mono text-xs space-y-0.5">
            {logs.map((log, i) => (
              <div key={i} className={log.includes('✅') || log.includes('📅') ? 'text-emerald-400' : log.includes('❌') || log.includes('⚠️') ? 'text-red-400' : 'text-gray-300'}>
                {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 참고 정보 */}
      <div className="bg-surface-light rounded-xl border border-border p-4 text-xs text-text-muted space-y-2">
        <p className="font-semibold text-text text-sm">테스트 결과 해석</p>
        <div className="space-y-1.5">
          <p><span className="text-emerald-500 font-medium">성공 (예약 모드)</span>: scheduled_publish_time 파라미터가 동작 → 프로덕션에 예약 게시 직접 적용</p>
          <p><span className="text-red-400 font-medium">실패 (예약 모드)</span>: 파라미터 미지원 → 자체 스케줄러(크론잡)로 예약 시간에 즉시 게시 API 호출</p>
          <p><span className="text-emerald-500 font-medium">성공 (즉시 모드)</span>: 기본 API 연동 정상 동작 확인</p>
        </div>
      </div>
    </div>
  )
}
