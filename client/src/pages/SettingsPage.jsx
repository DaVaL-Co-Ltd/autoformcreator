import { useState } from 'react'
import { Save, Key, Link, User } from 'lucide-react'

const sections = [
  { id: 'platforms', label: '플랫폼 연동', icon: Link },
  { id: 'account', label: '계정', icon: User },
]

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('platforms')

  return (
    <div className="flex gap-6 max-w-7xl">
      {/* Settings Nav */}
      <div className="w-56 shrink-0">
        <div className="bg-surface rounded-xl border border-border p-2 space-y-1 sticky top-0">
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all text-left
                ${activeSection === id
                  ? 'bg-primary/15 text-primary-light'
                  : 'text-text-muted hover:text-text hover:bg-surface-light'
                }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Settings Content */}
      <div className="flex-1 space-y-6">
        {activeSection === 'platforms' && (
          <div className="bg-surface rounded-xl border border-border p-6">
            <h3 className="text-base font-semibold text-text mb-1">배포 플랫폼 연동</h3>
            <p className="text-sm text-text-muted mb-5">콘텐츠를 자동 배포할 플랫폼 계정을 연결하세요.</p>

            <div className="space-y-4">
              {[
                { name: '네이버 블로그', icon: '📝', connected: true, account: 'edu_expert' },
                { name: '인스타그램', icon: '📷', connected: true, account: '@edu_data' },
                { name: '유튜브', icon: '▶️', connected: true, account: '입시데이터랩' },
                { name: '뉴스레터 (Resend)', icon: '📧', connected: true, account: 'newsletter@edu.com' },
                { name: '카카오톡 알림톡', icon: '💬', connected: false, account: null },
              ].map(p => (
                <div key={p.name} className="flex items-center justify-between p-4 bg-surface-light rounded-lg border border-border">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{p.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-text">{p.name}</p>
                      {p.account && <p className="text-xs text-text-muted">{p.account}</p>}
                    </div>
                  </div>
                  <button className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all
                    ${p.connected
                      ? 'border-border text-text-muted hover:border-danger hover:text-danger'
                      : 'border-primary text-primary hover:bg-primary hover:text-white'
                    }`}>
                    {p.connected ? '연결 해제' : '연결하기'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'account' && (
          <div className="bg-surface rounded-xl border border-border p-6">
            <h3 className="text-base font-semibold text-text mb-1">계정 정보</h3>
            <p className="text-sm text-text-muted mb-5">관리자 계정 정보를 관리하세요.</p>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-text mb-1.5 block">이름</label>
                <input
                  type="text"
                  defaultValue="Admin"
                  className="w-full bg-surface-light border border-border rounded-lg px-4 py-2.5 text-sm text-text focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text mb-1.5 block">이메일</label>
                <input
                  type="email"
                  defaultValue="admin@autocreator.io"
                  className="w-full bg-surface-light border border-border rounded-lg px-4 py-2.5 text-sm text-text focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>
        )}

        {/* Save Button */}
        <div className="flex justify-end">
          <button className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors">
            <Save size={16} />
            저장
          </button>
        </div>
      </div>
    </div>
  )
}
