import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Image, Mail, Film, FolderOpen, Layers, Sparkles,
  ExternalLink, ArrowRight, Upload, CheckCircle, Calendar, TrendingUp
} from 'lucide-react'
import { getExtractions } from '../services/storage'

const platforms = [
  {
    key: 'blog',
    label: '네이버 블로그',
    icon: FileText,
    emoji: '📝',
    color: 'text-primary-light',
    bg: 'bg-primary/10',
    border: 'border-primary/30',
    account: 'edu_expert',
    url: 'https://blog.naver.com/edu_expert',
  },
  {
    key: 'instagram',
    label: '인스타그램',
    icon: Image,
    emoji: '📷',
    color: 'text-pink-400',
    bg: 'bg-pink-400/10',
    border: 'border-pink-400/30',
    account: '@edu_data',
    url: 'https://www.instagram.com/edu_data',
  },
  {
    key: 'newsletter',
    label: '뉴스레터',
    icon: Mail,
    emoji: '📧',
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/30',
    account: 'newsletter@edu.com',
    url: 'https://resend.com',
  },
  {
    key: 'shorts',
    label: '유튜브 숏폼',
    icon: Film,
    emoji: '▶️',
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/30',
    account: '입시데이터랩',
    url: 'https://www.youtube.com/@입시데이터랩',
  },
]

export default function DashboardPage() {
  const navigate = useNavigate()
  const [extractions, setExtractions] = useState([])

  useEffect(() => {
    setExtractions(getExtractions())
  }, [])

  // 통계 계산
  const sourceFiles = [...new Set(extractions.map(e => e.fileName))]
  const allContents = extractions.flatMap(ext => ext.channels)
  const channelCounts = allContents.reduce((acc, ch) => {
    acc[ch.channel] = (acc[ch.channel] || 0) + 1
    return acc
  }, {})

  // 업로드 상태별 통계
  const uploadStats = extractions.reduce((acc, ext) => {
    ext.channels.forEach(ch => {
      const status = ext.uploadStatus?.[ch.channel]?.status || 'not_uploaded'
      acc[status] = (acc[status] || 0) + 1
    })
    return acc
  }, {})

  // 최근 콘텐츠 (최신 5개)
  const recentContents = extractions.flatMap(ext =>
    ext.channels.map(ch => ({
      extractionId: ext.id,
      title: ch.title,
      channel: ch.channel,
      date: new Date(ext.createdAt).toLocaleDateString('ko-KR'),
      time: new Date(ext.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      uploadStatus: ext.uploadStatus?.[ch.channel]?.status || 'not_uploaded',
      data: ext.data,
    }))
  ).slice(0, 5)

  const overviewStats = [
    { label: '원본 자료', value: sourceFiles.length, icon: FolderOpen, color: 'text-primary-light', bg: 'bg-primary/10' },
    { label: '총 콘텐츠', value: allContents.length, icon: Layers, color: 'text-info', bg: 'bg-info/10' },
    { label: '업로드 완료', value: uploadStats.uploaded || 0, icon: CheckCircle, color: 'text-success', bg: 'bg-success/10' },
    { label: '미업로드', value: uploadStats.not_uploaded || 0, icon: Upload, color: 'text-text-muted', bg: 'bg-surface-light' },
  ]

  const channelLabel = { blog: '블로그', instagram: '인스타그램', newsletter: '뉴스레터', shorts: '숏폼' }
  const statusBadge = {
    not_uploaded: { label: '미업로드', className: 'bg-surface-light text-text-muted' },
    scheduled: { label: '예약됨', className: 'bg-info/10 text-info' },
    uploaded: { label: '완료', className: 'bg-success/10 text-success' },
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text flex items-center gap-2">
          <LayoutDashboard size={22} className="text-primary-light" />
          대시보드
        </h1>
        <button
          onClick={() => navigate('/extraction')}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary-dark transition-colors"
        >
          <Sparkles size={14} />
          새 콘텐츠 생성
        </button>
      </div>

      {/* 개요 통계 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {overviewStats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-surface rounded-xl border border-border p-4 hover:border-primary/20 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-text-muted">{label}</span>
              <div className={`p-1.5 rounded-lg ${bg}`}>
                <Icon size={14} className={color} />
              </div>
            </div>
            <p className="text-2xl font-bold text-text">{value}</p>
          </div>
        ))}
      </div>

      {/* 플랫폼별 현황 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {platforms.map(p => {
          const Icon = p.icon
          const count = channelCounts[p.key] || 0
          const uploaded = extractions.reduce((acc, ext) => {
            if (ext.uploadStatus?.[p.key]?.status === 'uploaded') acc++
            return acc
          }, 0)

          return (
            <div key={p.key} className={`bg-surface rounded-xl border ${p.border} hover:shadow-md transition-all`}>
              <div className="p-4">
                {/* 상단: 플랫폼 정보 */}
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl ${p.bg} flex items-center justify-center`}>
                    <Icon size={20} className={p.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-text">{p.label}</h3>
                    <p className="text-xs text-text-muted truncate">{p.account}</p>
                  </div>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium ${p.bg} ${p.color} hover:opacity-80 transition-opacity`}
                  >
                    바로가기 <ExternalLink size={11} />
                  </a>
                </div>

                {/* 콘텐츠 수 */}
                <div className="flex items-center gap-4">
                  <div className="flex-1 bg-surface-light rounded-lg p-3">
                    <p className="text-[11px] text-text-muted mb-0.5">생성됨</p>
                    <p className="text-lg font-bold text-text">{count}<span className="text-xs font-normal text-text-muted ml-0.5">개</span></p>
                  </div>
                  <div className="flex-1 bg-surface-light rounded-lg p-3">
                    <p className="text-[11px] text-text-muted mb-0.5">업로드</p>
                    <p className="text-lg font-bold text-success">{uploaded}<span className="text-xs font-normal text-text-muted ml-0.5">개</span></p>
                  </div>
                  <div className="flex-1 bg-surface-light rounded-lg p-3">
                    <p className="text-[11px] text-text-muted mb-0.5">대기</p>
                    <p className="text-lg font-bold text-text-muted">{count - uploaded}<span className="text-xs font-normal text-text-muted ml-0.5">개</span></p>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 하단 2열: 최근 콘텐츠 + 빠른 액션 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 최근 콘텐츠 */}
        <div className="lg:col-span-2 bg-surface rounded-xl border border-border">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h3 className="text-sm font-semibold text-text">최근 콘텐츠</h3>
            <button onClick={() => navigate('/contents')} className="text-xs text-primary hover:text-primary-light transition-colors flex items-center gap-1">
              전체보기 <ArrowRight size={12} />
            </button>
          </div>
          {recentContents.length > 0 ? (
            <div className="divide-y divide-border">
              {recentContents.map((item, i) => {
                const ch = platforms.find(p => p.key === item.channel)
                const ChIcon = ch?.icon || FileText
                const badge = statusBadge[item.uploadStatus] || statusBadge.not_uploaded

                return (
                  <div
                    key={i}
                    onClick={() => navigate('/extraction/result', { state: { ...item.data, activeChannel: item.channel } })}
                    className="flex items-center gap-3 p-3 hover:bg-surface-light/50 transition-colors cursor-pointer"
                  >
                    <div className={`w-8 h-8 rounded-lg ${ch?.bg || 'bg-surface-light'} flex items-center justify-center shrink-0`}>
                      <ChIcon size={14} className={ch?.color || 'text-text-muted'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text truncate">{item.title}</p>
                      <p className="text-[11px] text-text-muted">{channelLabel[item.channel]} · {item.date} {item.time}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-md text-[10px] font-medium shrink-0 ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="p-10 text-center">
              <Sparkles size={28} className="text-text-muted/30 mx-auto mb-3" />
              <p className="text-sm text-text-muted">아직 생성된 콘텐츠가 없습니다.</p>
            </div>
          )}
        </div>

        {/* 빠른 액션 */}
        <div className="bg-surface rounded-xl border border-border">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-semibold text-text">빠른 메뉴</h3>
          </div>
          <div className="p-3 space-y-2">
            <button
              onClick={() => navigate('/extraction')}
              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-surface-light transition-colors text-left"
            >
              <div className="p-2 rounded-lg bg-primary/10">
                <Sparkles size={16} className="text-primary-light" />
              </div>
              <div>
                <p className="text-sm font-medium text-text">콘텐츠 추출</p>
                <p className="text-[11px] text-text-muted">PDF 분석 및 콘텐츠 생성</p>
              </div>
            </button>
            <button
              onClick={() => navigate('/contents')}
              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-surface-light transition-colors text-left"
            >
              <div className="p-2 rounded-lg bg-emerald-400/10">
                <FolderOpen size={16} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-text">콘텐츠 관리</p>
                <p className="text-[11px] text-text-muted">업로드 및 예약 관리</p>
              </div>
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-surface-light transition-colors text-left"
            >
              <div className="p-2 rounded-lg bg-amber-400/10">
                <TrendingUp size={16} className="text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-text">플랫폼 설정</p>
                <p className="text-[11px] text-text-muted">연동 계정 관리</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
