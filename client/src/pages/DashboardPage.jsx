import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderOpen, FileText, Layers, Sparkles } from 'lucide-react'
import { getExtractions } from '../services/storage'

const channelLabels = {
  blog: '블로그',
  instagram: '인스타그램',
  newsletter: '뉴스레터',
  shorts: '숏폼',
}

const channelColors = {
  blog: 'bg-primary',
  instagram: 'bg-pink-500',
  newsletter: 'bg-success',
  shorts: 'bg-warning',
}

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
  const maxCount = Math.max(...Object.values(channelCounts), 1)

  // 최근 콘텐츠 (최신 5개)
  const recentContents = extractions.flatMap(ext =>
    ext.channels.map(ch => ({
      extractionId: ext.id,
      title: ch.title,
      channel: ch.channel,
      date: new Date(ext.createdAt).toLocaleDateString('ko-KR'),
      data: ext.data,
    }))
  ).slice(0, 5)

  const stats = [
    { label: '원본 자료', value: sourceFiles.length, icon: FolderOpen, color: 'text-primary-light', bg: 'bg-primary/15' },
    { label: '생성된 콘텐츠', value: allContents.length, icon: FileText, color: 'text-success', bg: 'bg-success/15' },
    { label: '채널 수', value: Object.keys(channelCounts).length, icon: Layers, color: 'text-info', bg: 'bg-info/15' },
  ]

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-surface rounded-xl border border-border p-5 hover:border-primary/30 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-text-muted">{label}</span>
              <div className={`p-2 rounded-lg ${bg}`}>
                <Icon size={16} className={color} />
              </div>
            </div>
            <p className="text-2xl font-bold text-text">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* 최근 원본 자료 */}
        <div className="bg-surface rounded-xl border border-border">
          <div className="flex items-center justify-between p-5 border-b border-border">
            <h3 className="font-semibold text-text">최근 원본 자료</h3>
            <a href="/content" className="text-xs text-primary hover:text-primary-light">전체보기</a>
          </div>
          {extractions.length > 0 ? (
            <div className="divide-y divide-border">
              {extractions.slice(0, 4).map(ext => (
                <div key={ext.id} className="flex items-center justify-between p-4 hover:bg-surface-light/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">{ext.fileName}</p>
                    <p className="text-xs text-text-muted mt-0.5">{new Date(ext.createdAt).toLocaleDateString('ko-KR')}</p>
                  </div>
                  <span className="text-xs text-text-muted ml-4">{ext.channels.length}개 콘텐츠</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-text-muted text-sm">아직 데이터가 없습니다.</div>
          )}
        </div>

        {/* 최근 콘텐츠 */}
        <div className="bg-surface rounded-xl border border-border">
          <div className="flex items-center justify-between p-5 border-b border-border">
            <h3 className="font-semibold text-text">최근 콘텐츠</h3>
            <a href="/content" className="text-xs text-primary hover:text-primary-light">전체보기</a>
          </div>
          {recentContents.length > 0 ? (
            <div className="divide-y divide-border">
              {recentContents.map((item, i) => (
                <div
                  key={i}
                  onClick={() => navigate('/extraction/result', { state: { ...item.data } })}
                  className="flex items-center justify-between p-4 hover:bg-surface-light/50 transition-colors cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">{item.title}</p>
                    <p className="text-xs text-text-muted mt-0.5">{channelLabels[item.channel] || item.channel}</p>
                  </div>
                  <span className="text-xs text-text-muted ml-4">{item.date}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-text-muted text-sm">아직 데이터가 없습니다.</div>
          )}
        </div>
      </div>

      {/* 채널별 콘텐츠 현황 */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h3 className="font-semibold text-text mb-4">채널별 콘텐츠 현황</h3>
        {allContents.length > 0 ? (
          <div className="grid grid-cols-4 gap-4">
            {['blog', 'instagram', 'newsletter', 'shorts'].map(ch => {
              const count = channelCounts[ch] || 0
              return (
                <div key={ch} className="text-center">
                  <div className="h-32 bg-surface-light rounded-lg flex items-end justify-center p-2 mb-2">
                    <div
                      className={`${channelColors[ch]} rounded w-12 transition-all duration-500`}
                      style={{ height: count > 0 ? `${(count / maxCount) * 100}%` : '4px' }}
                    />
                  </div>
                  <p className="text-xs text-text-muted">{channelLabels[ch]}</p>
                  <p className="text-lg font-bold text-text">{count}</p>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <Sparkles size={28} className="text-text-muted/30 mb-3" />
            <p className="text-sm text-text-muted">콘텐츠 추출을 시작하면 채널별 현황이 표시됩니다.</p>
          </div>
        )}
      </div>
    </div>
  )
}
