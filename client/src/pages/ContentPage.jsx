import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText, Image, Mail, Film, Trash2, Sparkles, FolderOpen, AlertTriangle, X,
  CheckCircle, Clock, Upload, Calendar, ArrowRight, ExternalLink, Eye, Search,
  ChevronDown, ChevronUp
} from 'lucide-react'
import { getExtractions, deleteExtractionChannel, updateUploadStatus } from '../services/storage'

const channelConfig = {
  all: { label: '전체', icon: FileText, color: 'text-text', bg: 'bg-surface-light' },
  blog: { label: '블로그', icon: FileText, color: 'text-primary-light', bg: 'bg-primary/10' },
  instagram: { label: '인스타그램', icon: Image, color: 'text-pink-400', bg: 'bg-pink-400/10' },
  newsletter: { label: '뉴스레터', icon: Mail, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  shorts: { label: '숏폼', icon: Film, color: 'text-amber-400', bg: 'bg-amber-400/10' },
}

const uploadStatusConfig = {
  all: { label: '전체', icon: null, color: 'text-text' },
  not_uploaded: { label: '미업로드', icon: Upload, color: 'text-text-muted', badge: 'bg-surface-light text-text-muted border-border' },
  scheduled: { label: '예약됨', icon: Calendar, color: 'text-info', badge: 'bg-info/10 text-info border-info/30' },
  uploaded: { label: '업로드 완료', icon: CheckCircle, color: 'text-success', badge: 'bg-success/10 text-success border-success/30' },
}

function ScheduleModal({ item, onClose, onSave }) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')

  const handleSave = () => {
    if (!date) return
    onSave(item.extractionId, item.channel, {
      status: 'scheduled',
      scheduledAt: `${date}T${time}:00`,
    })
    onClose()
  }

  // 오늘 이후만 선택 가능
  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface rounded-2xl border border-border shadow-2xl w-full max-w-sm p-6">
        <button onClick={onClose} className="absolute top-4 right-4 p-1 rounded-lg hover:bg-surface-light text-text-muted hover:text-text transition-colors">
          <X size={16} />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 rounded-xl bg-info/10">
            <Calendar size={20} className="text-info" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text">업로드 예약</h3>
            <p className="text-xs text-text-muted">{channelConfig[item.channel]?.label} · {item.title?.slice(0, 30)}</p>
          </div>
        </div>

        <div className="space-y-3 mb-6">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">날짜</label>
            <input
              type="date"
              min={today}
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface-light text-sm text-text focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">시간</label>
            <input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface-light text-sm text-text focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-text-muted hover:bg-surface-light transition-colors">
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!date}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${date ? 'bg-info text-white hover:bg-info/90' : 'bg-surface-light text-text-muted cursor-not-allowed'}`}
          >
            예약 설정
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ContentPage() {
  const navigate = useNavigate()
  const [activeChannel, setActiveChannel] = useState('all')
  const [activeStatus, setActiveStatus] = useState('all')
  const [activeSource, setActiveSource] = useState('all')
  const [extractions, setExtractions] = useState([])
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [scheduleTarget, setScheduleTarget] = useState(null)
  const [uploadingId, setUploadingId] = useState(null) // extractionId-channel
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    setExtractions(getExtractions())
  }, [])

  // 원본 파일 목록 추출
  const sourceFiles = [...new Set(extractions.map(e => e.fileName))]

  // 추출 데이터를 채널별 콘텐츠 목록으로 변환
  const allContents = extractions.flatMap(ext =>
    ext.channels.map(ch => {
      const uploadInfo = ext.uploadStatus?.[ch.channel] || { status: 'not_uploaded' }
      return {
        extractionId: ext.id,
        channel: ch.channel,
        title: ch.title,
        source: ext.fileName,
        date: new Date(ext.createdAt).toLocaleDateString('ko-KR'),
        time: new Date(ext.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
        cards: ch.channel === 'instagram' ? ext.data?.instagramContent?.cards?.length : null,
        duration: ch.channel === 'shorts' ? ext.data?.shortsScript?.duration : null,
        data: ext.data,
        uploadStatus: uploadInfo.status,
        scheduledAt: uploadInfo.scheduledAt || null,
        uploadedAt: uploadInfo.uploadedAt || null,
      }
    })
  )

  // 필터 적용
  const filtered = allContents.filter(c => {
    if (activeChannel !== 'all' && c.channel !== activeChannel) return false
    if (activeSource !== 'all' && c.source !== activeSource) return false
    if (activeStatus !== 'all' && c.uploadStatus !== activeStatus) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!c.title?.toLowerCase().includes(q) && !c.source?.toLowerCase().includes(q)) return false
    }
    return true
  })

  // 상태별 개수
  const statusCounts = {
    all: allContents.length,
    not_uploaded: allContents.filter(c => c.uploadStatus === 'not_uploaded').length,
    scheduled: allContents.filter(c => c.uploadStatus === 'scheduled').length,
    uploaded: allContents.filter(c => c.uploadStatus === 'uploaded').length,
  }

  const handleView = (item) => {
    navigate('/extraction/result', { state: { ...item.data, activeChannel: item.channel } })
  }

  const handleUpload = async (item) => {
    const key = `${item.extractionId}-${item.channel}`
    setUploadingId(key)

    // 업로드 시뮬레이션 (실제 API 연동 시 교체)
    await new Promise(r => setTimeout(r, 1500))

    updateUploadStatus(item.extractionId, item.channel, {
      status: 'uploaded',
      uploadedAt: new Date().toISOString(),
    })
    setExtractions(getExtractions())
    setUploadingId(null)
  }

  const handleScheduleSave = (extractionId, channel, info) => {
    updateUploadStatus(extractionId, channel, info)
    setExtractions(getExtractions())
  }

  const handleCancelSchedule = (item) => {
    updateUploadStatus(item.extractionId, item.channel, { status: 'not_uploaded' })
    setExtractions(getExtractions())
  }

  const confirmDelete = () => {
    if (!deleteTarget) return
    deleteExtractionChannel(deleteTarget.extractionId, deleteTarget.channel)
    setExtractions(getExtractions())
    setDeleteTarget(null)
  }

  const formatScheduledDate = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text flex items-center gap-2">
          <FolderOpen size={22} className="text-primary-light" />
          콘텐츠 관리
        </h1>
        <button
          onClick={() => navigate('/extraction')}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary-dark transition-colors"
        >
          <Sparkles size={14} />
          새 콘텐츠 생성
        </button>
      </div>

      {/* 상태 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: 'all', icon: FileText, color: 'text-primary-light', bg: 'bg-primary/10', label: '전체', onClick: () => { setActiveStatus('all'); setActiveChannel('all'); setActiveSource('all'); setSearchQuery('') } },
          { key: 'not_uploaded', icon: Upload, color: 'text-text-muted', bg: 'bg-surface-light', label: '미업로드' },
          { key: 'scheduled', icon: Calendar, color: 'text-info', bg: 'bg-info/10', label: '예약됨' },
          { key: 'uploaded', icon: CheckCircle, color: 'text-success', bg: 'bg-success/10', label: '업로드 완료' },
        ].map(({ key, icon: Icon, color, bg, label, onClick }) => (
          <button
            key={key}
            onClick={onClick || (() => setActiveStatus(activeStatus === key ? 'all' : key))}
            className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
              activeStatus === key || (key === 'all' && activeStatus === 'all' && activeChannel === 'all')
                ? 'border-primary/40 bg-primary/5'
                : 'border-border bg-surface hover:border-primary/20'
            }`}
          >
            <div className={`p-2 rounded-lg ${bg}`}>
              <Icon size={16} className={color} />
            </div>
            <div className="text-left">
              <p className="text-lg font-bold text-text">{statusCounts[key]}</p>
              <p className="text-[11px] text-text-muted">{label}</p>
            </div>
          </button>
        ))}
      </div>

      {/* 채널 탭 + 검색 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex items-center gap-1 bg-surface rounded-xl border border-border p-1.5 flex-1 overflow-x-auto">
          {Object.entries(channelConfig).map(([key, { label, icon: Icon, color }]) => (
            <button
              key={key}
              onClick={() => setActiveChannel(key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap
                ${activeChannel === key
                  ? 'bg-primary/15 text-primary-light'
                  : 'text-text-muted hover:text-text hover:bg-surface-light'
                }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
        <div className="relative shrink-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="검색..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full sm:w-48 pl-8 pr-3 py-2.5 rounded-xl border border-border bg-surface text-xs text-text placeholder:text-text-muted/50 focus:outline-none focus:border-primary/40 transition-colors"
          />
        </div>
      </div>

      {/* 원본 자료 필터 */}
      {sourceFiles.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-text-muted mr-1">
            <FolderOpen size={14} />
            <span className="text-xs font-medium">원본</span>
          </div>
          <button
            onClick={() => setActiveSource('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border
              ${activeSource === 'all'
                ? 'bg-primary/15 border-primary/40 text-primary-light'
                : 'border-border text-text-muted hover:border-primary/30'
              }`}
          >
            전체
          </button>
          {sourceFiles.map(src => (
            <button
              key={src}
              onClick={() => setActiveSource(src)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border max-w-48 truncate
                ${activeSource === src
                  ? 'bg-primary/15 border-primary/40 text-primary-light'
                  : 'border-border text-text-muted hover:border-primary/30'
                }`}
            >
              {src}
            </button>
          ))}
        </div>
      )}

      {/* 콘텐츠 목록 */}
      {filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((item, idx) => {
            const channel = channelConfig[item.channel] || channelConfig.all
            const ChannelIcon = channel.icon
            const statusCfg = uploadStatusConfig[item.uploadStatus] || uploadStatusConfig.not_uploaded
            const StatusIcon = statusCfg.icon
            const isUploading = uploadingId === `${item.extractionId}-${item.channel}`
            const isExpanded = expandedId === `${item.extractionId}-${item.channel}`

            return (
              <div
                key={`${item.extractionId}-${item.channel}-${idx}`}
                className="bg-surface rounded-xl border border-border hover:border-primary/20 transition-all"
              >
                {/* 메인 행 */}
                <div className="flex items-center gap-3 p-3">
                  {/* 채널 아이콘 */}
                  <div className={`w-12 h-12 shrink-0 rounded-lg ${channel.bg} flex items-center justify-center`}>
                    <ChannelIcon size={20} className={channel.color} />
                  </div>

                  {/* 정보 */}
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleView(item)}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[11px] font-semibold ${channel.color}`}>{channel.label}</span>
                      {item.cards && <span className="text-[11px] text-text-muted">{item.cards}장</span>}
                      {item.duration && <span className="text-[11px] text-text-muted">{item.duration}</span>}
                    </div>
                    <h4 className="text-sm font-medium text-text truncate hover:text-primary-light transition-colors">{item.title}</h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-text-muted truncate">{item.source}</span>
                      <span className="text-[11px] text-text-muted shrink-0">{item.date} {item.time}</span>
                    </div>
                  </div>

                  {/* 업로드 상태 뱃지 */}
                  <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium shrink-0 ${statusCfg.badge}`}>
                    {StatusIcon && <StatusIcon size={12} />}
                    {statusCfg.label}
                    {item.uploadStatus === 'scheduled' && item.scheduledAt && (
                      <span className="text-[10px] opacity-70 ml-0.5">{formatScheduledDate(item.scheduledAt)}</span>
                    )}
                  </div>

                  {/* 액션 버튼 토글 */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : `${item.extractionId}-${item.channel}`)}
                    className="p-2 rounded-lg hover:bg-surface-light text-text-muted transition-colors shrink-0"
                  >
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>

                {/* 확장 액션 영역 */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-0">
                    <div className="flex items-center gap-2 p-3 bg-surface-light rounded-lg border border-border/50">
                      {/* 모바일 상태 표시 */}
                      <div className={`sm:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium ${statusCfg.badge}`}>
                        {StatusIcon && <StatusIcon size={12} />}
                        {statusCfg.label}
                      </div>

                      <div className="flex-1" />

                      {/* 결과 보기 */}
                      <button
                        onClick={() => handleView(item)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-text-muted hover:text-text hover:bg-surface transition-colors border border-border"
                      >
                        <Eye size={13} />
                        결과 보기
                      </button>

                      {/* 업로드 예약 (미업로드일 때만) */}
                      {item.uploadStatus === 'not_uploaded' && (
                        <button
                          onClick={() => setScheduleTarget(item)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-info hover:bg-info/10 transition-colors border border-info/30"
                        >
                          <Calendar size={13} />
                          예약
                        </button>
                      )}

                      {/* 예약 취소 (예약됨일 때) */}
                      {item.uploadStatus === 'scheduled' && (
                        <button
                          onClick={() => handleCancelSchedule(item)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-text-muted hover:bg-surface transition-colors border border-border"
                        >
                          <X size={13} />
                          예약 취소
                        </button>
                      )}

                      {/* 바로 업로드 (업로드 완료가 아닐 때) */}
                      {item.uploadStatus !== 'uploaded' && (
                        <button
                          onClick={() => handleUpload(item)}
                          disabled={isUploading}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                            isUploading
                              ? 'bg-primary/50 text-white cursor-wait'
                              : 'bg-primary text-white hover:bg-primary-dark'
                          }`}
                        >
                          {isUploading ? (
                            <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 업로드 중...</>
                          ) : (
                            <><Upload size={13} /> 업로드</>
                          )}
                        </button>
                      )}

                      {/* 업로드 완료 상태 */}
                      {item.uploadStatus === 'uploaded' && (
                        <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-success bg-success/5 border border-success/20">
                          <CheckCircle size={13} />
                          업로드 완료
                          {item.uploadedAt && <span className="text-[10px] opacity-60 ml-1">{formatScheduledDate(item.uploadedAt)}</span>}
                        </div>
                      )}

                      {/* 삭제 */}
                      <button
                        onClick={() => setDeleteTarget({ extractionId: item.extractionId, channel: item.channel, title: item.title })}
                        className="p-2 rounded-lg hover:bg-danger/10 text-text-muted hover:text-danger transition-colors"
                        title="삭제"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-80 text-center bg-surface rounded-xl border border-border">
          <Sparkles size={40} className="text-text-muted/30 mb-4" />
          <p className="text-text-muted mb-2">
            {searchQuery || activeChannel !== 'all' || activeStatus !== 'all'
              ? '조건에 맞는 콘텐츠가 없습니다.'
              : '아직 생성된 콘텐츠가 없습니다.'}
          </p>
          <p className="text-xs text-text-muted mb-4">콘텐츠 추출에서 PDF를 분석하면 자동으로 저장됩니다.</p>
          <button
            onClick={() => navigate('/extraction')}
            className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
          >
            콘텐츠 추출하기
          </button>
        </div>
      )}

      {/* 예약 모달 */}
      {scheduleTarget && (
        <ScheduleModal
          item={scheduleTarget}
          onClose={() => setScheduleTarget(null)}
          onSave={handleScheduleSave}
        />
      )}

      {/* 삭제 확인 모달 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-surface rounded-2xl border border-border shadow-2xl w-full max-w-sm p-6">
            <button onClick={() => setDeleteTarget(null)} className="absolute top-4 right-4 p-1 rounded-lg hover:bg-surface-light text-text-muted hover:text-text transition-colors">
              <X size={16} />
            </button>
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mb-4">
                <AlertTriangle size={24} className="text-danger" />
              </div>
              <h3 className="text-base font-semibold text-text mb-1">콘텐츠 삭제</h3>
              <p className="text-sm text-text-muted mb-1">이 콘텐츠를 삭제하시겠습니까?</p>
              <p className="text-xs text-text-muted mb-2 line-clamp-2 max-w-64">"{deleteTarget.title}"</p>
              <p className="text-[11px] text-warning mb-6">이미 업로드된 콘텐츠는 해당 플랫폼에서 삭제되지 않습니다.</p>
              <div className="flex items-center gap-3 w-full">
                <button onClick={() => setDeleteTarget(null)} className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-text-muted hover:bg-surface-light transition-colors">
                  취소
                </button>
                <button onClick={confirmDelete} className="flex-1 px-4 py-2.5 rounded-lg bg-danger text-white text-sm font-medium hover:bg-danger/90 transition-colors">
                  삭제
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
