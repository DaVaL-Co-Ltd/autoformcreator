import { useState, useEffect } from 'react'
import { Save, Link, User, AlertTriangle, CheckCircle, FileText, Youtube, X, Users, MessageCircle } from 'lucide-react'
import { Instagram } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getAll, connect, disconnect } from '../utils/platformConnections'

const sections = [
  { id: 'platforms', label: '플랫폼 연동', icon: Link },
  { id: 'account', label: '계정', icon: User },
]

const PLATFORMS = [
  {
    key: 'blog',
    name: '네이버 블로그',
    Icon: FileText,
    iconColor: 'text-emerald-500',
    iconBg: 'bg-emerald-50',
    scopes: '포스트 작성, 이미지 업로드',
    placeholder: '블로그 ID (예: my_blog)',
  },
  {
    key: 'band',
    name: '네이버 밴드',
    Icon: Users,
    iconColor: 'text-green-600',
    iconBg: 'bg-green-50',
    scopes: '게시글 작성, 사진/동영상 업로드',
    placeholder: '밴드 이름 또는 ID',
  },
  {
    key: 'kakao',
    name: '카카오톡',
    Icon: MessageCircle,
    iconColor: 'text-yellow-500',
    iconBg: 'bg-yellow-50',
    scopes: '카카오톡 채널 메시지 발송, 게시물 작성',
    placeholder: '카카오톡 채널 ID',
  },
  {
    key: 'instagram',
    name: '인스타그램',
    Icon: Instagram,
    iconColor: 'text-pink-500',
    iconBg: 'bg-pink-50',
    scopes: '비즈니스 계정 콘텐츠 게시, 미디어 업로드',
    placeholder: '계정 핸들 (예: @myaccount)',
  },
  {
    key: 'shorts',
    name: '유튜브 숏츠',
    Icon: Youtube,
    iconColor: 'text-red-500',
    iconBg: 'bg-red-50',
    scopes: '동영상 업로드, 메타데이터 편집',
    placeholder: '채널명 (예: My Channel)',
  },
]

function formatDate(isoString) {
  if (!isoString) return null
  const d = new Date(isoString)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function SettingsPage() {
  const { logout, changePassword } = useAuth()
  const [activeSection, setActiveSection] = useState('platforms')

  // 플랫폼 연동 상태
  const [connections, setConnections] = useState(() => getAll())
  const [modal, setModal] = useState(null) // { platformKey, platformName, placeholder }
  const [modalInput, setModalInput] = useState('')
  const [modalError, setModalError] = useState('')
  const [confirmDisconnect, setConfirmDisconnect] = useState(null) // platformKey

  // 비밀번호 변경
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  const refreshConnections = () => setConnections(getAll())

  const openConnectModal = (platform) => {
    setModal(platform)
    setModalInput('')
    setModalError('')
  }

  const handleConnect = () => {
    if (!modalInput.trim()) {
      setModalError('계정 이름을 입력해주세요.')
      return
    }
    connect(modal.key, modalInput.trim())
    refreshConnections()
    setModal(null)
  }

  const handleDisconnect = (key) => {
    disconnect(key)
    refreshConnections()
    setConfirmDisconnect(null)
  }

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
            <h3 className="text-base font-semibold text-text mb-1">플랫폼 연동</h3>
            <p className="text-sm text-text-muted mb-6">콘텐츠를 자동 배포할 플랫폼 계정을 연결하세요.</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {PLATFORMS.map(({ key, name, Icon, iconColor, iconBg, scopes, placeholder }) => {
                const state = connections[key]
                return (
                  <div key={key} className="flex flex-col gap-4 p-5 bg-surface-light rounded-xl border border-border">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${iconBg}`}>
                          <Icon size={18} className={iconColor} />
                        </div>
                        <span className="text-sm font-semibold text-text">{name}</span>
                      </div>
                      {/* Status badge */}
                      {state.connected ? (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                          연결됨
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
                          미연결
                        </span>
                      )}
                    </div>

                    {/* Account info or placeholder */}
                    <div className="flex-1">
                      {state.connected ? (
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-text">{state.account}</p>
                          {state.connectedAt && (
                            <p className="text-xs text-text-muted">연결일: {formatDate(state.connectedAt)}</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-text-muted">아직 연결된 계정이 없습니다.</p>
                      )}
                    </div>

                    {/* Action button */}
                    {state.connected ? (
                      <button
                        onClick={() => setConfirmDisconnect(key)}
                        className="w-full px-4 py-2 rounded-xl text-sm font-medium border border-border text-text-muted hover:border-red-400 hover:text-red-500 transition-all"
                      >
                        연결 해제
                      </button>
                    ) : (
                      <button
                        onClick={() => openConnectModal({ key, name, placeholder })}
                        className="w-full px-4 py-2 rounded-xl text-sm font-medium border border-primary text-primary hover:bg-primary hover:text-white transition-all"
                      >
                        계정 연결
                      </button>
                    )}
                  </div>
                )
              })}
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

      {/* 계정 연결 모달 */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface rounded-2xl border border-border p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-text">{modal.name} 계정 연결</h3>
              <button onClick={() => setModal(null)} className="text-text-muted hover:text-text transition-colors">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-text-muted mb-5">
              실제 OAuth 연동은 추후 구현 예정입니다. 지금은 테스트 계정을 입력해주세요.
            </p>
            <div className="mb-4">
              <label className="text-sm font-medium text-text mb-1.5 block">계정 핸들 / 이름</label>
              <input
                type="text"
                value={modalInput}
                onChange={e => { setModalInput(e.target.value); setModalError('') }}
                placeholder={modal.placeholder}
                className="w-full bg-surface-light border border-border rounded-xl px-4 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                onKeyDown={e => e.key === 'Enter' && handleConnect()}
                autoFocus
              />
              {modalError && (
                <p className="mt-1.5 text-xs text-danger flex items-center gap-1">
                  <AlertTriangle size={12} />
                  {modalError}
                </p>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-border text-text-muted hover:bg-surface-light transition-all"
              >
                취소
              </button>
              <button
                onClick={handleConnect}
                className="px-5 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-primary to-primary-dark text-white hover:shadow-lg hover:shadow-primary/25 transition-all"
              >
                연결하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 연결 해제 확인 모달 */}
      {confirmDisconnect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface rounded-2xl border border-border p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-xl bg-red-50">
                <AlertTriangle size={20} className="text-red-500" />
              </div>
              <h3 className="text-base font-semibold text-text">연결 해제</h3>
            </div>
            <p className="text-sm text-text-muted mb-6">
              {PLATFORMS.find(p => p.key === confirmDisconnect)?.name} 계정 연결을 해제하시겠습니까?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDisconnect(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-border text-text-muted hover:bg-surface-light transition-all"
              >
                취소
              </button>
              <button
                onClick={() => handleDisconnect(confirmDisconnect)}
                className="px-5 py-2 rounded-xl text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-all"
              >
                연결 해제
              </button>
            </div>
          </div>
        </div>
      )}

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
