import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText, Image, Mail, Film, Trash2, Sparkles, FolderOpen, AlertTriangle, X,
  CheckCircle, Clock, Upload, Calendar, ArrowRight, ExternalLink, Eye, Search, Loader2,
} from 'lucide-react'
import { getExtractions, deleteExtractionChannel, updateUploadStatus } from '../services/storage'
import ScheduleDialog from '../components/ScheduleDialog'
import { create as createScheduledUpload } from '../utils/scheduledUploads'

const channelConfig = {
  all:        { label: '전체',        icon: FileText, color: 'text-text',        bg: 'bg-surface-light' },
  blog:       { label: '네이버 블로그', icon: FileText, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  newsletter: { label: '뉴스레터',     icon: Mail,     color: 'text-blue-500',    bg: 'bg-blue-500/10' },
  instagram:  { label: '인스타그램',   icon: Image,    color: 'text-pink-400',    bg: 'bg-pink-400/10' },
  shorts:     { label: '유튜브 숏츠',  icon: Film,     color: 'text-red-500',     bg: 'bg-red-500/10' },
}

const uploadStatusConfig = {
  all: { label: '전체', icon: null, color: 'text-text' },
  not_uploaded: { label: '미업로드', icon: Upload, color: 'text-text-muted', badge: 'bg-surface-light text-text-muted border-border' },
  scheduled: { label: '예약 완료', icon: Calendar, color: 'text-info', badge: 'bg-info/10 text-info border-info/30' },
  uploaded: { label: '업로드 완료', icon: CheckCircle, color: 'text-success', badge: 'bg-success/10 text-success border-success/30' },
}

export default function ContentPage() {
  const navigate = useNavigate()
  const [activeChannel, setActiveChannel] = useState('all')
  const [activeStatus, setActiveStatus] = useState('all')
  const [activeSource, setActiveSource] = useState('all')
  const [extractions, setExtractions] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [scheduleTarget, setScheduleTarget] = useState(null)
  const [editScheduleTarget, setEditScheduleTarget] = useState(null)
  const [uploadingId, setUploadingId] = useState(null) // extractionId-channel
  const [searchQuery, setSearchQuery] = useState('')

  const refreshExtractions = async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    try {
      const items = await getExtractions()
      setExtractions(items)
    } finally {
      if (showSpinner) setLoading(false)
    }
  }

  useEffect(() => {
    refreshExtractions(true)
    const onFocus = () => refreshExtractions(false)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
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
  // 뉴스레터는 업로드 대상이 아니므로 상태 카운트에서 제외
  const uploadableContents = allContents.filter(c => c.channel !== 'newsletter')
  const statusCounts = {
    all: allContents.length,
    not_uploaded: uploadableContents.filter(c => c.uploadStatus === 'not_uploaded').length,
    scheduled: uploadableContents.filter(c => c.uploadStatus === 'scheduled').length,
    uploaded: uploadableContents.filter(c => c.uploadStatus === 'uploaded').length,
  }

  const handleView = (item) => {
    const ext = extractions.find(e => e.id === item.extractionId)
    navigate('/extraction/result', {
      state: {
        ...item.data,
        activeChannel: item.channel,
        extractionId: item.extractionId,
        uploadStatus: ext?.uploadStatus || {},
      }
    })
  }

  const handleUpload = async (item) => {
    const key = `${item.extractionId}-${item.channel}`
    setUploadingId(key)
    try {
      const { uploadToPlatform } = await import('../services/platformUploaders')
      const result = await uploadToPlatform(item.channel, item.extractionId)
      await updateUploadStatus(item.extractionId, item.channel, {
        status: 'uploaded',
        uploadedAt: new Date().toISOString(),
        uploadedUrl: result?.url || null,
      })
      await refreshExtractions()
    } catch (err) {
      alert(`업로드 실패: ${err.message}`)
    }
    setUploadingId(null)
  }

  const handleScheduleSave = async (extractionId, channel, info) => {
    await updateUploadStatus(extractionId, channel, info)
    await refreshExtractions()
    // scheduledUploads에도 저장 (예약 목록 페이지와 동기화)
    if (info.status === 'scheduled' && info.scheduledAt) {
      const target = scheduleTarget
      createScheduledUpload({
        platform: channel,
        content: { title: target?.title || '' },
        scheduledAt: new Date(info.scheduledAt).toISOString(),
        extractionId,
      })
    }
  }

  const handleCancelSchedule = async (item) => {
    await updateUploadStatus(item.extractionId, item.channel, { status: 'not_uploaded' })
    await refreshExtractions()
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    await deleteExtractionChannel(deleteTarget.extractionId, deleteTarget.channel)
    await refreshExtractions()
    setDeleteTarget(null)
  }

  const formatScheduledDate = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 size={32} className="text-primary animate-spin" />
        <p className="text-sm text-text-muted">콘텐츠 목록을 불러오는 중...</p>
      </div>
    )
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
        <div className="flex items-center gap-1 bg-surface rounded-xl border border-border p-1.5 overflow-x-auto shrink-0">
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
        <div className="relative flex-1 min-w-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="검색..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-border bg-surface text-xs text-text placeholder:text-text-muted/50 focus:outline-none focus:border-primary/40 transition-colors"
          />
        </div>
      </div>


      {/* 콘텐츠 목록 */}
      {filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((item, idx) => {
            const channel = channelConfig[item.channel] || channelConfig.all
            const ChannelIcon = channel.icon
            const statusCfg = uploadStatusConfig[item.uploadStatus] || uploadStatusConfig.not_uploaded
            const StatusIcon = statusCfg.icon
            const isUploading = uploadingId === `${item.extractionId}-${item.channel}`

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

                  {/* 인라인 액션 버튼들 */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* 뉴스레터는 업로드 대상이 아님 - 안내 뱃지만 표시 */}
                    {item.channel === 'newsletter' && (
                      <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-text-muted bg-surface-light border border-border">
                        <Mail size={13} />
                        콘텐츠만 생성
                      </div>
                    )}

                    {/* 미업로드: 예약 + 업로드 (뉴스레터 제외) */}
                    {item.channel !== 'newsletter' && item.uploadStatus === 'not_uploaded' && (
                      <>
                        <button
                          onClick={() => setScheduleTarget(item)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-info hover:bg-info/10 transition-colors border border-info/30"
                        >
                          <Calendar size={13} />
                          예약
                        </button>
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
                      </>
                    )}

                    {/* 예약 완료 - 클릭하면 상세 다이얼로그 (뉴스레터 제외) */}
                    {item.channel !== 'newsletter' && item.uploadStatus === 'scheduled' && (
                      <button
                        onClick={() => setEditScheduleTarget(item)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-info bg-info/5 border border-info/20 hover:bg-info/10 transition-colors"
                      >
                        <Calendar size={13} />
                        예약 완료
                        {item.scheduledAt && <span className="text-[10px] opacity-60 ml-1">{formatScheduledDate(item.scheduledAt)}</span>}
                      </button>
                    )}

                    {/* 업로드 완료 (뉴스레터 제외) */}
                    {item.channel !== 'newsletter' && item.uploadStatus === 'uploaded' && (
                      <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-success bg-success/5 border border-success/20">
                        <CheckCircle size={13} />
                        업로드 완료
                        {item.uploadedAt && <span className="text-[10px] opacity-60 ml-1">{formatScheduledDate(item.uploadedAt)}</span>}
                      </div>
                    )}

                    {/* 삭제 */}
                    <button
                      onClick={() => setDeleteTarget({ extractionId: item.extractionId, channel: item.channel, title: item.title })}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-text-muted hover:text-danger hover:bg-danger/10 transition-colors border border-border hover:border-danger/30"
                    >
                      <Trash2 size={13} />
                      삭제
                    </button>
                  </div>
                </div>
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

      {/* 예약 모달 (신규) */}
      <ScheduleDialog
        open={!!scheduleTarget}
        onClose={() => setScheduleTarget(null)}
        defaultPlatform={scheduleTarget?.channel}
        lockPlatform={true}
        content={{ title: scheduleTarget?.title }}
        onSave={({ scheduledAt }) => {
          if (!scheduleTarget) return
          handleScheduleSave(scheduleTarget.extractionId, scheduleTarget.channel, {
            status: 'scheduled',
            scheduledAt,
          })
        }}
      />

      {/* 예약 상세/수정 모달 */}
      <ScheduleDialog
        open={!!editScheduleTarget}
        mode="edit"
        onClose={() => setEditScheduleTarget(null)}
        defaultPlatform={editScheduleTarget?.channel}
        lockPlatform={true}
        content={{ title: editScheduleTarget?.title }}
        initialDatetime={editScheduleTarget?.scheduledAt}
        onSave={({ scheduledAt }) => {
          if (!editScheduleTarget) return
          handleScheduleSave(editScheduleTarget.extractionId, editScheduleTarget.channel, {
            status: 'scheduled',
            scheduledAt,
          })
        }}
        onDelete={() => {
          if (!editScheduleTarget) return
          handleCancelSchedule(editScheduleTarget)
        }}
      />


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
