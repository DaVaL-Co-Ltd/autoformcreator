import { useState } from 'react'
import { Send, CheckCircle, Clock, AlertCircle, ExternalLink, Calendar, RefreshCw } from 'lucide-react'

const platforms = [
  { id: 'naver-blog', name: '네이버 블로그', connected: true, icon: '📝', account: 'edu_expert' },
  { id: 'instagram', name: '인스타그램', connected: true, icon: '📷', account: '@edu_data' },
  { id: 'youtube', name: '유튜브', connected: true, icon: '▶️', account: '입시데이터랩' },
  { id: 'band', name: '네이버 밴드', connected: true, icon: '👥', account: 'band@edu.com' },
  { id: 'kakao', name: '카카오톡', connected: true, icon: '💬', account: 'kakao@edu.com' },
]

const distributions = [
  { id: 1, title: '2026 수시 경쟁률, 이 학과가 가장 높다', platform: '네이버 블로그', status: 'published', date: '2026-03-18 09:00' },
  { id: 2, title: '수시 경쟁률 TOP 10 학과 카드뉴스', platform: '인스타그램', status: 'published', date: '2026-03-18 10:30' },
  { id: 3, title: '입시 전문가가 알려주는 수시 전략', platform: '네이버 밴드', status: 'published', date: '2026-03-18 08:00' },
  { id: 4, title: '60초로 보는 수시 경쟁률 핵심', platform: '유튜브', status: 'scheduled', date: '2026-03-19 12:00' },
  { id: 5, title: '정시 배치 전략 가이드', platform: '네이버 블로그', status: 'scheduled', date: '2026-03-20 09:00' },
  { id: 6, title: '커트라인으로 보는 지원 전략', platform: '카카오톡', status: 'failed', date: '2026-03-17 08:00' },
]

const statusConfig = {
  published: { label: '배포완료', color: 'text-success bg-success/10', icon: CheckCircle },
  scheduled: { label: '예약됨', color: 'text-warning bg-warning/10', icon: Clock },
  failed: { label: '실패', color: 'text-danger bg-danger/10', icon: AlertCircle },
  publishing: { label: '배포중', color: 'text-info bg-info/10', icon: RefreshCw },
}

export default function DistributionPage() {
  const [activeTab, setActiveTab] = useState('all')

  const filtered = activeTab === 'all' ? distributions : distributions.filter(d => d.status === activeTab)

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Connected Platforms */}
      <div className="grid grid-cols-5 gap-4">
        {platforms.map(p => (
          <div key={p.id} className="bg-surface rounded-xl border border-border p-4 hover:border-primary/30 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{p.icon}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.connected ? 'text-success bg-success/10' : 'text-danger bg-danger/10'}`}>
                {p.connected ? '연결됨' : '미연결'}
              </span>
            </div>
            <p className="text-sm font-medium text-text">{p.name}</p>
            <p className="text-xs text-text-muted mt-0.5">{p.account}</p>
          </div>
        ))}
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface rounded-xl border border-border p-5">
          <div className="flex items-center gap-2 mb-1">
            <Send size={16} className="text-info" />
            <span className="text-sm text-text-muted">배포 완료</span>
          </div>
          <p className="text-2xl font-bold text-text">{distributions.filter(d => d.status === 'published').length}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-5">
          <div className="flex items-center gap-2 mb-1">
            <Clock size={16} className="text-warning" />
            <span className="text-sm text-text-muted">예약 대기</span>
          </div>
          <p className="text-2xl font-bold text-text">{distributions.filter(d => d.status === 'scheduled').length}</p>
        </div>
      </div>

      {/* Distribution Table */}
      <div className="bg-surface rounded-xl border border-border">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            {[
              { key: 'all', label: '전체' },
              { key: 'published', label: '배포완료' },
              { key: 'scheduled', label: '예약됨' },
              { key: 'failed', label: '실패' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border
                  ${activeTab === tab.key
                    ? 'bg-primary/15 border-primary/40 text-primary-light'
                    : 'border-border text-text-muted hover:border-primary/30'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors">
            <Send size={14} />
            새 배포
          </button>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium text-text-muted px-5 py-3">콘텐츠</th>
              <th className="text-left text-xs font-medium text-text-muted px-5 py-3">플랫폼</th>
              <th className="text-left text-xs font-medium text-text-muted px-5 py-3">상태</th>
              <th className="text-left text-xs font-medium text-text-muted px-5 py-3">일시</th>
              <th className="text-right text-xs font-medium text-text-muted px-5 py-3">액션</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map(item => {
              const status = statusConfig[item.status]
              const StatusIcon = status.icon
              return (
                <tr key={item.id} className="hover:bg-surface-light/50 transition-colors">
                  <td className="px-5 py-4">
                    <p className="text-sm font-medium text-text">{item.title}</p>
                  </td>
                  <td className="px-5 py-4 text-sm text-text-muted">{item.platform}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${status.color}`}>
                      <StatusIcon size={12} />
                      {status.label}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-text-muted">{item.date}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {item.status === 'published' && (
                        <button className="p-1.5 rounded-lg hover:bg-surface-light text-text-muted hover:text-text" title="외부 링크">
                          <ExternalLink size={15} />
                        </button>
                      )}
                      {item.status === 'failed' && (
                        <button className="p-1.5 rounded-lg hover:bg-primary/10 text-text-muted hover:text-primary" title="재시도">
                          <RefreshCw size={15} />
                        </button>
                      )}
                      {item.status === 'scheduled' && (
                        <button className="p-1.5 rounded-lg hover:bg-surface-light text-text-muted hover:text-text" title="예약 수정">
                          <Calendar size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
