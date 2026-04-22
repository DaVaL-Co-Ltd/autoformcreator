import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle,
  Download,
  FileText,
  Link,
  MonitorDown,
  Save,
  Share2,
  User,
  X,
  Youtube,
} from 'lucide-react'
import { Instagram } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { DESKTOP_HELPER } from '../constants/desktopHelper.js'
import { connect, disconnect, getAll, updateDisplay } from '../utils/platformConnections'

const sections = [
  { id: 'desktop-helper', label: '블로그 업로드 앱', icon: MonitorDown },
  { id: 'platforms', label: '플랫폼 계정 연결', icon: Link },
  { id: 'newsletter_footer', label: '플랫폼 주소 연결', icon: Share2 },
  { id: 'account', label: '계정', icon: User },
]

const FOOTER_PLATFORMS = [
  {
    key: 'blog',
    name: '네이버 블로그',
    Icon: FileText,
    color: 'text-emerald-500',
    bg: 'bg-emerald-50',
    urlPlaceholder: 'https://m.blog.naver.com/...',
  },
  {
    key: 'shorts',
    name: '유튜브',
    Icon: Youtube,
    color: 'text-red-500',
    bg: 'bg-red-50',
    urlPlaceholder: 'https://www.youtube.com/@...',
  },
  {
    key: 'instagram',
    name: '인스타그램',
    Icon: Instagram,
    color: 'text-pink-500',
    bg: 'bg-pink-50',
    urlPlaceholder: 'https://instagram.com/...',
  },
]

const PLATFORMS = [
  {
    key: 'blog',
    name: '네이버 블로그',
    Icon: FileText,
    iconColor: 'text-emerald-500',
    iconBg: 'bg-emerald-50',
    scopes: '포스트 작성, 이미지 업로드',
    placeholder: '블로그 ID 또는 계정명',
  },
  {
    key: 'instagram',
    name: '인스타그램',
    Icon: Instagram,
    iconColor: 'text-pink-500',
    iconBg: 'bg-pink-50',
    scopes: '게시물 업로드, 계정 연결 준비',
    placeholder: '계정 핸들 또는 이름',
  },
  {
    key: 'shorts',
    name: '유튜브 쇼츠',
    Icon: Youtube,
    iconColor: 'text-red-500',
    iconBg: 'bg-red-50',
    scopes: '동영상 업로드, 메타데이터 연동',
    placeholder: '채널명 또는 계정명',
  },
]

const VALID_SECTION_IDS = new Set(sections.map((section) => section.id))

function formatDate(isoString) {
  if (!isoString) {
    return null
  }

  const date = new Date(isoString)
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

export default function SettingsPage() {
  const { logout, changePassword } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialSection = searchParams.get('section')
  const [activeSection, setActiveSection] = useState(
    VALID_SECTION_IDS.has(initialSection) ? initialSection : 'desktop-helper'
  )

  const [connections, setConnections] = useState(() => getAll())
  const [modal, setModal] = useState(null)
  const [modalInput, setModalInput] = useState('')
  const [modalError, setModalError] = useState('')
  const [confirmDisconnect, setConfirmDisconnect] = useState(null)

  const [footerDrafts, setFooterDrafts] = useState(() => {
    const all = getAll()
    return FOOTER_PLATFORMS.reduce((accumulator, { key }) => {
      accumulator[key] = {
        displayName: all[key]?.displayName || '',
        url: all[key]?.url || '',
      }
      return accumulator
    }, {})
  })
  const [footerSavedKey, setFooterSavedKey] = useState(null)

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    const section = searchParams.get('section')
    if (VALID_SECTION_IDS.has(section) && section !== activeSection) {
      setActiveSection(section)
    }
  }, [activeSection, searchParams])

  const refreshConnections = () => setConnections(getAll())

  const helperSteps = useMemo(
    () => [
      '설치 파일을 다운로드한 뒤 클라이언트 PC에서 실행합니다.',
      '설치가 끝나면 앱이 자동으로 로컬 서버와 트레이를 시작합니다.',
      '앱 내부에서 네이버 로그인 후 업로드 연동을 진행합니다.',
    ],
    []
  )

  const selectSection = (sectionId) => {
    setActiveSection(sectionId)
    setSearchParams({ section: sectionId }, { replace: true })
  }

  const openConnectModal = (platform) => {
    setModal(platform)
    setModalInput('')
    setModalError('')
  }

  const handleConnect = () => {
    if (!modalInput.trim()) {
      setModalError('계정 이름을 입력해 주세요.')
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

  const handleFooterSave = (key) => {
    const draft = footerDrafts[key]
    updateDisplay(key, {
      displayName: draft.displayName.trim(),
      url: draft.url.trim(),
    })
    refreshConnections()
    setFooterSavedKey(key)
    setTimeout(() => {
      setFooterSavedKey((currentKey) => (currentKey === key ? null : currentKey))
    }, 1500)
  }

  const handleChangePassword = () => {
    setPwError('')

    if (!currentPw || !newPw || !confirmPw) {
      setPwError('모든 항목을 입력해 주세요.')
      return
    }

    if (newPw !== confirmPw) {
      setPwError('새 비밀번호가 서로 일치하지 않습니다.')
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

    setCurrentPw('')
    setNewPw('')
    setConfirmPw('')
    setShowConfirm(true)
  }

  const handleConfirmLogout = () => {
    setShowConfirm(false)
    logout()
  }

  return (
    <div className="flex gap-6 max-w-7xl mx-auto w-full">
      <div className="w-56 shrink-0">
        <div className="bg-surface rounded-2xl border border-border p-2 space-y-1 sticky top-0 shadow-sm">
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => selectSection(id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left ${
                activeSection === id
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

      <div className="flex-1 space-y-6">
        {activeSection === 'desktop-helper' && (
          <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-4">
                  <MonitorDown size={14} />
                  블로그 업로드 전용 앱
                </div>
                <h3 className="text-xl font-semibold text-text mb-2">{DESKTOP_HELPER.title}</h3>
                <p className="text-sm text-text-muted leading-6">
                  네이버 블로그 자동 업로드는 웹 브라우저가 설치된 로컬 PC에서 동작합니다.
                  클라이언트 PC에서 아래 설치 파일을 내려받아 실행한 뒤, 앱 내부에서 네이버 로그인까지 완료해 주세요.
                </p>
              </div>

              <div className="min-w-[260px] rounded-2xl border border-border bg-surface-light p-5">
                <div className="text-xs font-semibold text-text-muted mb-1">설치 파일</div>
                <div className="text-sm font-semibold text-text break-all">{DESKTOP_HELPER.fileName}</div>
                <div className="text-xs text-text-muted mt-2">버전 {DESKTOP_HELPER.version}</div>
                <a
                  href={DESKTOP_HELPER.downloadHref}
                  download={DESKTOP_HELPER.fileName}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-dark transition-all"
                >
                  <Download size={16} />
                  설치 파일 다운로드
                </a>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr,1fr]">
              <div className="rounded-2xl border border-border bg-surface-light p-5">
                <h4 className="text-sm font-semibold text-text mb-3">설치 순서</h4>
                <ol className="space-y-3">
                  {helperSteps.map((step, index) => (
                    <li key={step} className="flex gap-3 text-sm text-text-muted leading-6">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="rounded-2xl border border-border bg-surface-light p-5">
                <h4 className="text-sm font-semibold text-text mb-3">설치 후 확인 항목</h4>
                <div className="space-y-3 text-sm text-text-muted leading-6">
                  <p>앱이 실행되면 트레이에 상주하며 `localhost:3000` 서버를 자동으로 시작합니다.</p>
                  <p>블로그 업로드 테스트 전에는 데스크톱 앱에서 네이버 로그인 버튼을 한 번 눌러 세션을 저장해야 합니다.</p>
                  <p>자동 실행을 켜 두면 다음부터는 PC 로그인 직후 앱이 자동으로 올라옵니다.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'platforms' && (
          <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm">
            <h3 className="text-base font-semibold text-text mb-1">플랫폼 계정 연결</h3>
            <p className="text-sm text-text-muted mb-6">
              콘텐츠를 자동 배포할 플랫폼 계정을 연결해 주세요.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {PLATFORMS.map(({ key, name, Icon, iconColor, iconBg, scopes, placeholder }) => {
                const state = connections[key]
                return (
                  <div key={key} className="flex flex-col gap-4 p-5 bg-surface-light rounded-xl border border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${iconBg}`}>
                          <Icon size={18} className={iconColor} />
                        </div>
                        <span className="text-sm font-semibold text-text">{name}</span>
                      </div>
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

                    <div className="flex-1">
                      <p className="text-xs text-text-muted mb-2">{scopes}</p>
                      {state.connected ? (
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-text">{state.account}</p>
                          {state.connectedAt && (
                            <p className="text-xs text-text-muted">연결일 {formatDate(state.connectedAt)}</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-text-muted">아직 연결된 계정이 없습니다.</p>
                      )}
                    </div>

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

        {activeSection === 'newsletter_footer' && (
          <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm">
            <h3 className="text-base font-semibold text-text mb-1">플랫폼 주소 연결</h3>
            <p className="text-sm text-text-muted mb-6">
              뉴스레터와 프리뷰 하단에 노출할 플랫폼 링크와 버튼 이름을 설정합니다.
            </p>

            <div className="space-y-4">
              {FOOTER_PLATFORMS.map(({ key, name, Icon, color, bg, urlPlaceholder }) => {
                const draft = footerDrafts[key] || { displayName: '', url: '' }
                const saved = footerSavedKey === key

                return (
                  <div key={key} className="p-5 bg-surface-light rounded-xl border border-border">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`p-2 rounded-xl ${bg}`}>
                        <Icon size={18} className={color} />
                      </div>
                      <span className="text-sm font-semibold text-text">{name}</span>
                      {saved && (
                        <span className="ml-auto flex items-center gap-1 text-xs text-success">
                          <CheckCircle size={14} />
                          저장됨
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-text-muted mb-1.5 block">표시 이름</label>
                        <input
                          type="text"
                          value={draft.displayName}
                          onChange={(event) =>
                            setFooterDrafts((previous) => ({
                              ...previous,
                              [key]: { ...previous[key], displayName: event.target.value },
                            }))
                          }
                          placeholder="예: 블로그 바로가기"
                          className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-text-muted mb-1.5 block">URL</label>
                        <input
                          type="url"
                          value={draft.url}
                          onChange={(event) =>
                            setFooterDrafts((previous) => ({
                              ...previous,
                              [key]: { ...previous[key], url: event.target.value },
                            }))
                          }
                          placeholder={urlPlaceholder}
                          className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => handleFooterSave(key)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-dark transition-all"
                      >
                        <Save size={13} />
                        저장
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="text-xs text-text-muted mt-5 p-3 bg-surface-light rounded-lg border border-border">
              여기에 설정한 표시 이름과 URL은 뉴스레터 미리보기와 복사된 본문 하단에 그대로 반영됩니다.
            </p>
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
                  onChange={(event) => {
                    setCurrentPw(event.target.value)
                    setPwError('')
                  }}
                  placeholder="현재 비밀번호를 입력해 주세요"
                  className="w-full bg-surface-light border border-border rounded-xl px-4 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text mb-1.5 block">새 비밀번호</label>
                <input
                  type="password"
                  value={newPw}
                  onChange={(event) => {
                    setNewPw(event.target.value)
                    setPwError('')
                  }}
                  placeholder="새 비밀번호를 입력해 주세요"
                  className="w-full bg-surface-light border border-border rounded-xl px-4 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text mb-1.5 block">새 비밀번호 확인</label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={(event) => {
                    setConfirmPw(event.target.value)
                    setPwError('')
                  }}
                  placeholder="새 비밀번호를 다시 입력해 주세요"
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
              실제 OAuth 연동은 추후 구현 예정입니다. 지금은 테스트용 계정 이름만 입력해 주세요.
            </p>
            <div className="mb-4">
              <label className="text-sm font-medium text-text mb-1.5 block">계정 이름 / 핸들</label>
              <input
                type="text"
                value={modalInput}
                onChange={(event) => {
                  setModalInput(event.target.value)
                  setModalError('')
                }}
                placeholder={modal.placeholder}
                className="w-full bg-surface-light border border-border rounded-xl px-4 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                onKeyDown={(event) => event.key === 'Enter' && handleConnect()}
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
              {PLATFORMS.find((platform) => platform.key === confirmDisconnect)?.name} 계정을 해제하시겠습니까?
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
              비밀번호가 변경되었습니다. 보안을 위해 새 비밀번호로 다시 로그인해 주세요.
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
