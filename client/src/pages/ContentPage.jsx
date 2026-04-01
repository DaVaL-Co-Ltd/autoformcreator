import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Image, Mail, Film, Trash2, Sparkles, FolderOpen, AlertTriangle, X } from 'lucide-react'
import { getExtractions, deleteExtractionChannel } from '../services/storage'

const channelConfig = {
  all: { label: '전체', icon: FileText, color: 'text-text' },
  blog: { label: '블로그', icon: FileText, color: 'text-primary-light' },
  instagram: { label: '인스타그램', icon: Image, color: 'text-pink-400' },
  newsletter: { label: '뉴스레터', icon: Mail, color: 'text-success' },
  shorts: { label: '숏폼', icon: Film, color: 'text-warning' },
}

export default function ContentPage() {
  const navigate = useNavigate()
  const [activeChannel, setActiveChannel] = useState('all')
  const [activeSource, setActiveSource] = useState('all')
  const [extractions, setExtractions] = useState([])
  const [deleteTarget, setDeleteTarget] = useState(null) // { extractionId, channel, title }

  useEffect(() => {
    setExtractions(getExtractions())
  }, [])

  // 원본 파일 목록 추출
  const sourceFiles = [...new Set(extractions.map(e => e.fileName))]

  // 추출 데이터를 채널별 콘텐츠 목록으로 변환
  const allContents = extractions.flatMap(ext =>
    ext.channels.map(ch => ({
      extractionId: ext.id,
      channel: ch.channel,
      title: ch.title,
      source: ext.fileName,
      date: new Date(ext.createdAt).toLocaleDateString('ko-KR'),
      time: new Date(ext.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      cards: ch.channel === 'instagram' ? ext.data?.instagramContent?.cards?.length : null,
      duration: ch.channel === 'shorts' ? ext.data?.shortsScript?.duration : null,
      data: ext.data,
    }))
  )

  // 필터 적용
  const filtered = allContents.filter(c => {
    if (activeChannel !== 'all' && c.channel !== activeChannel) return false
    if (activeSource !== 'all' && c.source !== activeSource) return false
    return true
  })

  const handleView = (item) => {
    navigate('/extraction/result', { state: { ...item.data, activeChannel: item.channel } })
  }

  const confirmDelete = () => {
    if (!deleteTarget) return
    deleteExtractionChannel(deleteTarget.extractionId, deleteTarget.channel)
    setExtractions(getExtractions())
    setDeleteTarget(null)
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Channel Tabs */}
      <div className="flex items-center gap-2 bg-surface rounded-xl border border-border p-2">
        {Object.entries(channelConfig).map(([key, { label, icon: Icon, color }]) => (
          <button
            key={key}
            onClick={() => setActiveChannel(key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
              ${activeChannel === key
                ? 'bg-primary/15 text-primary-light'
                : 'text-text-muted hover:text-text hover:bg-surface-light'
              }`}
          >
            <Icon size={16} />
            {label}
            <span className="text-xs opacity-60">
              {key === 'all'
                ? allContents.filter(c => activeSource === 'all' || c.source === activeSource).length
                : allContents.filter(c => c.channel === key && (activeSource === 'all' || c.source === activeSource)).length}
            </span>
          </button>
        ))}
      </div>

      {/* 원본 자료 필터 */}
      {sourceFiles.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-text-muted mr-1">
            <FolderOpen size={14} />
            <span className="text-xs font-medium">원본 자료</span>
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

      {/* Content List */}
      {filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((item, idx) => {
            const channel = channelConfig[item.channel] || channelConfig.all
            const ChannelIcon = channel.icon

            return (
              <div
                key={`${item.extractionId}-${item.channel}-${idx}`}
                onClick={() => handleView(item)}
                className="flex items-center gap-4 bg-surface rounded-xl border border-border hover:border-primary/30 transition-all cursor-pointer p-3"
              >
                {/* 왼쪽: 정사각형 썸네일 */}
                <div className="w-16 h-16 shrink-0 rounded-lg bg-surface-light flex items-center justify-center border border-border">
                  <ChannelIcon size={24} className={`${channel.color} opacity-50`} />
                </div>

                {/* 오른쪽: 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-xs font-semibold ${channel.color}`}>{channel.label}</span>
                    {item.cards && <span className="text-xs text-text-muted">{item.cards}장</span>}
                    {item.duration && <span className="text-xs text-text-muted">{item.duration}</span>}
                  </div>
                  <h4 className="text-sm font-medium text-text truncate">{item.title}</h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-text-muted truncate">{item.source}</span>
                    <span className="text-xs text-text-muted shrink-0">{item.date} {item.time}</span>
                  </div>
                </div>

                {/* 삭제 버튼 */}
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget({ extractionId: item.extractionId, channel: item.channel, title: item.title }) }}
                  className="p-2 rounded-lg hover:bg-surface-light text-text-muted hover:text-danger transition-colors shrink-0"
                  title="삭제"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-80 text-center">
          <Sparkles size={40} className="text-text-muted/30 mb-4" />
          <p className="text-text-muted mb-2">아직 생성된 콘텐츠가 없습니다.</p>
          <p className="text-xs text-text-muted mb-4">콘텐츠 추출에서 PDF를 분석하면 자동으로 저장됩니다.</p>
          <button
            onClick={() => navigate('/extraction')}
            className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
          >
            콘텐츠 추출하기
          </button>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-surface rounded-2xl border border-border shadow-2xl w-full max-w-sm p-6 animate-in">
            <button
              onClick={() => setDeleteTarget(null)}
              className="absolute top-4 right-4 p-1 rounded-lg hover:bg-surface-light text-text-muted hover:text-text transition-colors"
            >
              <X size={16} />
            </button>

            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mb-4">
                <AlertTriangle size={24} className="text-danger" />
              </div>
              <h3 className="text-base font-semibold text-text mb-1">콘텐츠 삭제</h3>
              <p className="text-sm text-text-muted mb-1">이 콘텐츠를 삭제하시겠습니까?</p>
              <p className="text-xs text-text-muted mb-6 line-clamp-2 max-w-64">"{deleteTarget.title}"</p>

              <div className="flex items-center gap-3 w-full">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-text-muted hover:bg-surface-light transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-danger text-white text-sm font-medium hover:bg-danger/90 transition-colors"
                >
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
