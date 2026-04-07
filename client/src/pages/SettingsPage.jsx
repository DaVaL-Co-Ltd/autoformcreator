import { useState } from 'react'
import { Save, Key, Link, User, AlertTriangle, CheckCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const sections = [
  { id: 'platforms', label: '플랫폼 연동', icon: Link },
  { id: 'account', label: '계정', icon: User },
]

export default function SettingsPage() {
  const { logout, changePassword } = useAuth()
  const [activeSection, setActiveSection] = useState('platforms')

  // 비밀번호 변경
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState('')

  // 확인 팝업
  const [showConfirm, setShowConfirm] = useState(false)

  const handleChangePassword = () => {
    setPwError('')

    if (!currentPw || !newPw || !confirmPw) {
      setPwError('모든 항목을 입력해주세요.')
      return
    }
    if (newPw !== confirmPw) {
      setPwError('새 비밀번호가 일치하지 않습니다.')
      return
    }
    if (newPw.length < 4) {
      setPwError('비밀번호는 4자 이상이어야 합니다.')
      return
    }

    const result = changePassword(currentPw, newPw)
    if (!result.success) {
      setPwError(result.message)
      return
    }

    setShowConfirm(true)
  }

  const handleConfirmLogout = () => {
    setShowConfirm(false)
    logout()
  }

  return (
    <div className="flex gap-6 max-w-7xl mx-auto w-full">
      {/* Settings Nav */}
      <div className="w-56 shrink-0">
        <div className="bg-surface rounded-2xl border border-border p-2 space-y-1 sticky top-0 shadow-sm">
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left
                ${activeSection === id
                  ? 'bg-primary/10 text-primary shadow-sm'
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
          <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm">
            <h3 className="text-base font-semibold text-text mb-1">배포 플랫폼 연동</h3>
            <p className="text-sm text-text-muted mb-5">콘텐츠를 자동 배포할 플랫폼 계정을 연결하세요.</p>

            <div className="space-y-4">
              {[
                { name: '네이버 블로그', icon: '📝', connected: true, account: 'edu_expert' },
                { name: '인스타그램', icon: '📷', connected: true, account: '@edu_data' },
                { name: '유튜브', icon: '▶️', connected: true, account: '입시데이터랩' },
                { name: '뉴스레터 (Resend)', icon: '📧', connected: true, account: 'newsletter@edu.com' },
              ].map(p => (
                <div key={p.name} className="flex items-center justify-between p-4 bg-surface-light rounded-lg border border-border">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{p.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-text">{p.name}</p>
                      {p.account && <p className="text-xs text-text-muted">{p.account}</p>}
                    </div>
                  </div>
                  <button className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all
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
          <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm">
            <h3 className="text-base font-semibold text-text mb-1">비밀번호 변경</h3>
            <p className="text-sm text-text-muted mb-5">접속 비밀번호를 변경합니다.</p>

            <div className="space-y-4 max-w-md">
              <div>
                <label className="text-sm font-medium text-text mb-1.5 block">현재 비밀번호</label>
                <input
                  type="password"
                  value={currentPw}
                  onChange={e => { setCurrentPw(e.target.value); setPwError('') }}
                  placeholder="현재 비밀번호를 입력하세요"
                  className="w-full bg-surface-light border border-border rounded-xl px-4 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text mb-1.5 block">새 비밀번호</label>
                <input
                  type="password"
                  value={newPw}
                  onChange={e => { setNewPw(e.target.value); setPwError('') }}
                  placeholder="새 비밀번호를 입력하세요"
                  className="w-full bg-surface-light border border-border rounded-xl px-4 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text mb-1.5 block">새 비밀번호 확인</label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={e => { setConfirmPw(e.target.value); setPwError('') }}
                  placeholder="새 비밀번호를 다시 입력하세요"
                  className="w-full bg-surface-light border border-border rounded-xl px-4 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>

              {pwError && (
                <div className="flex items-center gap-2 text-danger text-sm">
                  <AlertTriangle size={14} />
                  {pwError}
                </div>
              )}

              <div className="pt-2">
                <button
                  onClick={handleChangePassword}
                  className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-primary to-primary-dark text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-primary/25 transition-all"
                >
                  <Save size={16} />
                  저장
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 비밀번호 변경 확인 팝업 */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface rounded-2xl border border-border p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-xl bg-success/10">
                <CheckCircle size={20} className="text-success" />
              </div>
              <h3 className="text-base font-semibold text-text">비밀번호 변경 완료</h3>
            </div>
            <p className="text-sm text-text-muted mb-6">
              비밀번호가 변경되었습니다. 보안을 위해 새 비밀번호로 다시 로그인해야 합니다.
            </p>
            <div className="flex justify-end">
              <button
                onClick={handleConfirmLogout}
                className="px-6 py-2.5 bg-gradient-to-r from-primary to-primary-dark text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-primary/25 transition-all"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
