import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle,
  Download,
  FileText,
  Instagram,
  Link,
  MonitorDown,
  Plus,
  RefreshCw,
  Save,
  Share2,
  Trash2,
  User,
  X,
  Youtube,
} from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { DESKTOP_HELPER } from '../constants/desktopHelper.js'
import {
  beginInstagramReconnect,
  beginYoutubeReconnect,
  disconnectInstagramSession,
  disconnectYoutubeSession,
  fetchInstagramSessionStatus,
  fetchNaverSessionStatus,
  fetchYoutubeSessionStatus,
  reconnectNaverSession,
  waitForInstagramReconnect,
  waitForYoutubeReconnect,
} from '../services/platformSessions'
import { validateGeminiEnvironment } from '../services/geminiValidation.js'
import { getAll, loadAll as loadPlatformConnections, updateDisplay } from '../utils/platformConnections'
import { getBlogUploadShowBrowser, setBlogUploadShowBrowser } from '../utils/blogUploadBrowserPreference.js'
import { buildBlogFooterDraft, createEmptyBlogFooterLink } from '../utils/blogFooterLinks.js'

const sections = [
  { id: 'desktop-helper', label: '블로그 서버 설치', icon: MonitorDown },
  { id: 'platforms', label: '플랫폼 연동 상태', icon: Link },
  { id: 'newsletter_footer', label: '플랫폼 주소 연결', icon: Share2 },
  { id: 'account', label: '계정', icon: User },
]

const visibleSections = [
  ...sections.slice(0, 3),
  { id: 'blog_footer', label: '블로그 하단 링크', icon: FileText },
  ...sections.slice(3),
]

const VALID_SECTION_IDS = new Set(visibleSections.map((section) => section.id))

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

const PLATFORM_CARD_META = {
  blog: {
    name: '네이버 블로그',
    Icon: FileText,
    iconColor: 'text-emerald-500',
    iconBg: 'bg-emerald-50',
  },
  instagram: {
    name: '인스타그램',
    Icon: Instagram,
    iconColor: 'text-pink-500',
    iconBg: 'bg-pink-50',
  },
  shorts: {
    name: '유튜브',
    Icon: Youtube,
    iconColor: 'text-red-500',
    iconBg: 'bg-red-50',
  },
}

function StatusBadge({ tone, text }) {
  const className = {
    danger: 'bg-red-50 text-red-600',
    muted: 'bg-slate-100 text-slate-600',
    success: 'bg-emerald-50 text-emerald-600',
    warning: 'bg-amber-50 text-amber-700',
  }[tone] || 'bg-slate-100 text-slate-600'

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {text}
    </span>
  )
}

function buildPlatformCards(statuses) {
  const blog = statuses.blog
  const youtube = statuses.shorts
  const instagram = statuses.instagram

  return [
    {
      key: 'blog',
      ...PLATFORM_CARD_META.blog,
      tone: blog.state === 'connected' ? 'success' : blog.state === 'offline' ? 'danger' : 'warning',
      statusLabel:
        blog.state === 'connected'
          ? '세션 연결됨'
          : blog.state === 'offline'
            ? '헬퍼 꺼짐'
            : '다시 로그인 필요',
      account: blog.state === 'connected' ? '로컬 desktop-helper 세션' : null,
      detail:
        blog.state === 'connected'
          ? '로컬 helper에 저장된 네이버 세션이 살아 있어 바로 업로드할 수 있습니다.'
          : blog.state === 'offline'
            ? '이 PC에서 desktop-helper가 실행 중이 아닙니다. 먼저 helper를 켜고 다시 로그인해야 합니다.'
            : 'desktop-helper는 켜져 있지만 네이버 세션이 만료되었습니다. 다시 로그인해 주세요.',
      meta: [
        blog.appVersion ? `helper 버전 ${blog.appVersion}` : null,
        blog.chromiumReady ? 'Chromium 준비됨' : 'Chromium 확인 필요',
      ].filter(Boolean),
    },
    {
      key: 'instagram',
      ...PLATFORM_CARD_META.instagram,
      tone:
        instagram.state === 'connected'
          ? 'success'
          : instagram.state === 'unconfigured'
            ? 'danger'
            : 'warning',
      statusLabel:
        instagram.state === 'connected'
          ? 'Instagram 연결됨'
          : instagram.state === 'unconfigured'
            ? 'OAuth 설정 필요'
            : '다시 연결 필요',
      account:
        instagram.connected
          ? (instagram.username
              ? `@${instagram.username}`
              : instagram.mode === 'oauth'
                ? 'Instagram OAuth'
                : '서버 Graph API 토큰')
          : null,
      detail:
        instagram.connected
          ? (instagram.mode === 'oauth'
              ? 'Meta 로그인으로 받은 Instagram 토큰이 저장되어 있어 바로 업로드할 수 있습니다.'
              : '서버에 저장된 Instagram Graph API 토큰과 Business ID로 바로 업로드할 수 있습니다.')
          : instagram.state === 'unconfigured'
            ? 'META_APP_ID 또는 INSTAGRAM_APP_ID, META_APP_SECRET 또는 INSTAGRAM_APP_SECRET, INSTAGRAM_REDIRECT_URI 설정이 없어 웹에서 다시 로그인할 수 없습니다.'
            : (instagram.validationError
                ? `Instagram 연결 검증이 실패했습니다: ${instagram.validationError}`
                : 'Instagram 토큰이 만료되었거나 연결이 끊겼습니다. 다시 로그인하면 즉시 다시 사용할 수 있습니다.'),
      meta: [
        instagram.hasAccessToken ? 'Access Token 있음' : 'Access Token 없음',
        instagram.hasBusinessId ? 'Business ID 있음' : 'Business ID 없음',
        instagram.mode === 'oauth' ? 'OAuth 모드' : '서버 토큰 모드',
      ],
    },
    {
      key: 'shorts',
      ...PLATFORM_CARD_META.shorts,
      tone: youtube.state === 'connected' ? 'success' : youtube.state === 'unconfigured' ? 'danger' : 'warning',
      statusLabel:
        youtube.state === 'connected'
          ? 'Google 연결됨'
          : youtube.state === 'unconfigured'
            ? 'OAuth 설정 필요'
            : '다시 인증 필요',
      account: youtube.state === 'connected' ? 'Google OAuth' : null,
      detail:
        youtube.state === 'connected'
          ? 'YouTube 업로드용 Google OAuth 연결이 유지되고 있습니다.'
          : youtube.state === 'unconfigured'
            ? 'client_secret.json 또는 Google OAuth 환경변수가 없어 인증을 시작할 수 없습니다.'
            : (youtube.validationError
                ? `Google 인증 검증이 실패했습니다: ${youtube.validationError}`
                : '저장된 Google 인증이 끊겼거나 만료되었습니다. 다시 연결해 주세요.'),
      meta: [youtube.hasCredentials ? 'OAuth 클라이언트 설정 있음' : 'OAuth 클라이언트 설정 없음'],
    },
  ]
}

export default function SettingsPage() {
  const { logout, changePassword } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialSection = searchParams.get('section')
  const [activeSection, setActiveSection] = useState(
    VALID_SECTION_IDS.has(initialSection) ? initialSection : 'desktop-helper'
  )
  const [showBlogUploadBrowser, setShowBlogUploadBrowserState] = useState(() => getBlogUploadShowBrowser())

  const [footerDrafts, setFooterDrafts] = useState(() => {
    const all = getAll()
    return FOOTER_PLATFORMS.reduce((accumulator, { key }) => {
      accumulator[key] = {
        displayName: all[key]?.displayName || '',
        url: all[key]?.url || '',
        categoryPath: all[key]?.categoryPath || '',
      }
      return accumulator
    }, {})
  })
  const [footerSavedKey, setFooterSavedKey] = useState(null)
  const [blogFooterDraft, setBlogFooterDraft] = useState(() => buildBlogFooterDraft(getAll()))
  const [blogFooterSaved, setBlogFooterSaved] = useState(false)

  const [platformStatuses, setPlatformStatuses] = useState({
    blog: { state: 'loading', connected: false, helperReachable: false, chromiumReady: false },
    instagram: {
      state: 'loading',
      connected: false,
      hasAccessToken: false,
      hasBusinessId: false,
      canReconnect: false,
      canDisconnect: false,
      mode: 'server-token',
    },
    shorts: { state: 'loading', connected: false, hasCredentials: false },
  })
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusError, setStatusError] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [geminiValidationLoading, setGeminiValidationLoading] = useState(false)
  const [geminiValidationError, setGeminiValidationError] = useState('')
  const [geminiValidationResult, setGeminiValidationResult] = useState(null)
  const [infoModal, setInfoModal] = useState(null)

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  const refreshPlatformStatuses = useCallback(async () => {
    setStatusLoading(true)
    setStatusError('')

    try {
      const [blog, instagram, shorts] = await Promise.all([
        fetchNaverSessionStatus(),
        fetchInstagramSessionStatus(),
        fetchYoutubeSessionStatus(),
      ])

      setPlatformStatuses({ blog, instagram, shorts })
    } catch (error) {
      setStatusError(error.message)
    } finally {
      setStatusLoading(false)
    }
  }, [])

  useEffect(() => {
    const section = searchParams.get('section')
    if (VALID_SECTION_IDS.has(section) && section !== activeSection) {
      setActiveSection(section)
    }
  }, [activeSection, searchParams])

  useEffect(() => {
    let active = true

    ;(async () => {
      const all = await loadPlatformConnections()
      if (!active) return

      setFooterDrafts(
        FOOTER_PLATFORMS.reduce((accumulator, { key }) => {
          accumulator[key] = {
            displayName: all[key]?.displayName || '',
            url: all[key]?.url || '',
            categoryPath: all[key]?.categoryPath || '',
          }
          return accumulator
        }, {})
      )
      setBlogFooterDraft(buildBlogFooterDraft(all))
    })()

    return () => {
      active = false
    }
  }, [])

  const helperSteps = useMemo(
    () => [
      '설치 파일을 실행하면 사용자 PC에서 helper 프로그램이 실행됩니다.',
      'helper는 localhost:3000 서버를 띄우고, 네이버 브라우저 자동화를 담당합니다.',
      '세션이 만료되면 helper에서 로그인 창을 다시 열어 세션을 갱신합니다.',
    ],
    []
  )

  const platformCards = useMemo(() => buildPlatformCards(platformStatuses), [platformStatuses])

  useEffect(() => {
    if (activeSection !== 'platforms') {
      return undefined
    }

    void refreshPlatformStatuses()

    const handleFocusRefresh = () => {
      void refreshPlatformStatuses()
    }

    const handleVisibilityRefresh = () => {
      if (document.visibilityState === 'visible') {
        void refreshPlatformStatuses()
      }
    }

    const refreshInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshPlatformStatuses()
      }
    }, 15000)

    window.addEventListener('focus', handleFocusRefresh)
    document.addEventListener('visibilitychange', handleVisibilityRefresh)

    return () => {
      window.clearInterval(refreshInterval)
      window.removeEventListener('focus', handleFocusRefresh)
      document.removeEventListener('visibilitychange', handleVisibilityRefresh)
    }
  }, [activeSection, refreshPlatformStatuses])

  const handleGeminiValidation = async () => {
    setGeminiValidationLoading(true)
    setGeminiValidationError('')

    try {
      const result = await validateGeminiEnvironment()
      setGeminiValidationResult(result)
    } catch (error) {
      setGeminiValidationError(error.message)
    } finally {
      setGeminiValidationLoading(false)
    }
  }

  const selectSection = (sectionId) => {
    setActiveSection(sectionId)
    setSearchParams({ section: sectionId }, { replace: true })
  }

  const handleBlogUploadBrowserToggle = (nextValue) => {
    setShowBlogUploadBrowserState(nextValue)
    setBlogUploadShowBrowser(nextValue)
  }

  const handleFooterSave = async (key) => {
    const draft = footerDrafts[key]
    await updateDisplay(key, {
      displayName: draft.displayName.trim(),
      url: draft.url.trim(),
      ...(key === 'blog' ? { categoryPath: draft.categoryPath.trim() } : {}),
    })
    setFooterSavedKey(key)
    setTimeout(() => {
      setFooterSavedKey((currentKey) => (currentKey === key ? null : currentKey))
    }, 1500)
  }

  const handleBlogFooterLinkChange = (linkId, field, value) => {
    setBlogFooterDraft((previous) => ({
      ...previous,
      links: previous.links.map((link) => (
        link.id === linkId ? { ...link, [field]: value } : link
      )),
    }))
  }

  const handleAddBlogFooterLink = () => {
    setBlogFooterDraft((previous) => ({
      ...previous,
      links: [...previous.links, createEmptyBlogFooterLink()],
    }))
  }

  const handleRemoveBlogFooterLink = (linkId) => {
    setBlogFooterDraft((previous) => {
      const nextLinks = previous.links.filter((link) => link.id !== linkId)
      return {
        ...previous,
        links: nextLinks.length > 0 ? nextLinks : [createEmptyBlogFooterLink()],
      }
    })
  }

  const handleBlogFooterSave = async () => {
    await updateDisplay('blog', {
      footerHeading: String(blogFooterDraft.heading || '').trim(),
      footerLinks: blogFooterDraft.links
        .map((link) => ({
          id: link.id,
          label: String(link.label || '').trim(),
          url: String(link.url || '').trim(),
        }))
        .filter((link) => link.label || link.url),
    })
    setBlogFooterSaved(true)
    setTimeout(() => setBlogFooterSaved(false), 1500)
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

  const handleReconnectNaver = async () => {
    setBusyAction('blog')
    setStatusError('')
    try {
      await reconnectNaverSession()
      await refreshPlatformStatuses()
      window.alert('네이버 로그인 창이 열렸습니다. 로그인을 마치면 바로 다시 사용할 수 있습니다.')
    } catch (error) {
      setStatusError(error.message)
    } finally {
      setBusyAction('')
    }
  }

  const handleReconnectYoutube = async () => {
    setBusyAction('shorts')
    setStatusError('')
    try {
      const { popup } = await beginYoutubeReconnect()
      await waitForYoutubeReconnect({ popup })
      await refreshPlatformStatuses()
      window.alert('Google 인증이 완료되어 바로 유튜브 업로드를 다시 사용할 수 있습니다.')
    } catch (error) {
      setStatusError(error.message)
    } finally {
      setBusyAction('')
    }
  }

  const handleDisconnectYoutube = async () => {
    setBusyAction('shorts-disconnect')
    setStatusError('')
    try {
      await disconnectYoutubeSession()
      await refreshPlatformStatuses()
    } catch (error) {
      setStatusError(error.message)
    } finally {
      setBusyAction('')
    }
  }

  const handleReconnectInstagram = async () => {
    setBusyAction('instagram')
    setStatusError('')
    try {
      const { popup } = await beginInstagramReconnect()
      await waitForInstagramReconnect({ popup })
      await refreshPlatformStatuses()
      window.alert('Instagram 인증이 완료되어 바로 서비스를 다시 사용할 수 있습니다.')
    } catch (error) {
      setStatusError(error.message)
    } finally {
      setBusyAction('')
    }
  }

  const handleDisconnectInstagram = async () => {
    setBusyAction('instagram-disconnect')
    setStatusError('')
    try {
      await disconnectInstagramSession()
      await refreshPlatformStatuses()
    } catch (error) {
      setStatusError(error.message)
    } finally {
      setBusyAction('')
    }
  }

  const openInstagramHelp = async () => {
    if (platformStatuses.instagram.canReconnect) {
      await handleReconnectInstagram()
      return
    }

    setInfoModal({
      title: '인스타그램 연동 안내',
      body: [
        '현재 인스타그램은 Meta OAuth 환경변수 설정이 없어서 웹에서 직접 다시 로그인할 수 없습니다.',
        '서버 환경변수에 META_APP_ID 또는 INSTAGRAM_APP_ID, META_APP_SECRET 또는 INSTAGRAM_APP_SECRET, INSTAGRAM_REDIRECT_URI를 먼저 설정해야 합니다.',
        '그 뒤에는 이 설정 페이지에서 다시 로그인만 눌러도 즉시 재사용할 수 있습니다.',
      ],
    })
  }

  return (
    <div className="flex gap-6 max-w-7xl mx-auto w-full">
      <div className="w-56 shrink-0">
        <div className="bg-surface rounded-2xl border border-border p-2 space-y-1 sticky top-0 shadow-sm">
          {visibleSections.map(({ id, label, icon }) => {
            const SectionIcon = icon

            return (
            <button
              key={id}
              onClick={() => selectSection(id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left ${
                activeSection === id
                  ? 'bg-primary/10 text-primary shadow-sm'
                  : 'text-text-muted hover:text-text hover:bg-surface-light'
              }`}
            >
              <SectionIcon size={16} />
              {label}
            </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 space-y-6">
        {activeSection === 'desktop-helper' && (
          <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-4">
                  <MonitorDown size={14} />
                  네이버 블로그 업로드 전용
                </div>
                <h3 className="text-xl font-semibold text-text mb-2">{DESKTOP_HELPER.title}</h3>
                <p className="text-sm text-text-muted leading-6">
                  네이버 블로그 업로드는 사용자 PC에서 실행되는 local desktop-helper가 담당합니다.
                  설치 후 helper를 켜고, 한 번 네이버 로그인만 해두면 이후 블로그 업로드에 같은 세션을 재사용합니다.
                </p>
              </div>

              <div className="min-w-[260px] rounded-2xl border border-border bg-surface-light p-5">
                <div className="text-xs font-semibold text-text-muted mb-1">설치 파일</div>
                <div className="text-sm font-semibold text-text break-all">{DESKTOP_HELPER.fileName}</div>
                <div className="text-xs text-text-muted mt-2">버전 {DESKTOP_HELPER.version}</div>
                <a
                  href={DESKTOP_HELPER.downloadHref}
                  download={DESKTOP_HELPER.isExternal ? undefined : DESKTOP_HELPER.fileName}
                  target={DESKTOP_HELPER.isExternal ? '_blank' : undefined}
                  rel={DESKTOP_HELPER.isExternal ? 'noopener noreferrer' : undefined}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-dark transition-all"
                >
                  <Download size={16} />
                  설치 파일 다운로드
                </a>
                {DESKTOP_HELPER.isExternal && (
                  <p className="mt-2 text-[11px] leading-5 text-text-muted">
                    배포 환경에서는 외부 다운로드 링크로 설치 파일을 제공합니다.
                  </p>
                )}
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
                <h4 className="text-sm font-semibold text-text mb-3">운영 메모</h4>
                <div className="space-y-3 text-sm text-text-muted leading-6">
                  <button
                    type="button"
                    onClick={() => handleBlogUploadBrowserToggle(!showBlogUploadBrowser)}
                    className={`mb-1 flex w-full items-start justify-between gap-4 rounded-2xl border px-4 py-4 text-left transition-all ${
                      showBlogUploadBrowser
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-border bg-white hover:bg-surface'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-semibold text-text">
                        {showBlogUploadBrowser ? 'RPA 작동 과정 보이기' : 'RPA 창 숨기기'}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-text-muted">
                        켜면 네이버 블로그 RPA 브라우저 창이 보여서 진행 과정을 직접 확인할 수 있고,
                        끄면 창을 숨긴 상태로 백그라운드 업로드를 진행합니다.
                      </p>
                    </div>
                    <span
                      className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-all ${
                        showBlogUploadBrowser ? 'bg-primary' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                          showBlogUploadBrowser ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </span>
                  </button>
                  <p>helper가 켜져 있지 않으면 블로그 업로드는 실패합니다.</p>
                  <p>세션이 만료되면 설정 페이지 또는 helper 쪽에서 다시 로그인하면 됩니다.</p>
                  <p>네이버 예약 발행은 업로드 시점에 네이버 자체 예약으로 등록되므로 예약 뒤에는 서버를 계속 켜둘 필요가 없습니다.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'platforms' && (
          <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-6">
              <div>
                <h3 className="text-base font-semibold text-text mb-1">플랫폼 연동 상태</h3>
                <p className="text-sm text-text-muted">
                  업로드 전에 실제 세션과 토큰 상태를 여기서 확인하고, 만료되면 바로 재연결할 수 있습니다.
                </p>
              </div>
              <button
                onClick={() => void refreshPlatformStatuses()}
                disabled={statusLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-light disabled:opacity-60"
              >
                <RefreshCw size={15} className={statusLoading ? 'animate-spin' : ''} />
                상태 새로고침
              </button>
            </div>

            {statusError && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{statusError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4">
              {platformCards.map((card) => {
                const Icon = card.Icon
                const isBusy = busyAction === card.key || busyAction === `${card.key}-disconnect`

                return (
                  <div key={card.key} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-light p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`rounded-xl p-2 ${card.iconBg}`}>
                          <Icon size={18} className={card.iconColor} />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-text">{card.name}</div>
                          {card.account && <div className="text-xs text-text-muted mt-0.5">{card.account}</div>}
                        </div>
                      </div>
                      <StatusBadge tone={card.tone} text={card.statusLabel} />
                    </div>

                    <p className="text-sm leading-6 text-text-muted">{card.detail}</p>

                    {card.meta.length > 0 && (
                      <div className="text-xs text-text-muted">
                        {card.meta.join(' / ')}
                      </div>
                    )}

                    <div className="mt-1 space-y-2">
                      {card.key === 'blog' && (
                        <>
                          {platformStatuses.blog.helperReachable ? (
                            <button
                              onClick={() => void handleReconnectNaver()}
                              disabled={isBusy}
                              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60"
                            >
                              {isBusy ? '네이버 로그인 진행 중..' : '네이버 다시 로그인'}
                            </button>
                          ) : (
                            <button
                              onClick={() => selectSection('desktop-helper')}
                              className="w-full rounded-xl border border-primary px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary hover:text-white"
                            >
                              helper 설정 보기
                            </button>
                          )}
                        </>
                      )}

                      {card.key === 'shorts' && (
                        <>
                          <button
                            onClick={() => void handleReconnectYoutube()}
                            disabled={isBusy || platformStatuses.shorts.state === 'unconfigured'}
                            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60"
                          >
                            {isBusy ? 'Google 인증 확인 중..' : 'Google 다시 연결'}
                          </button>
                          {platformStatuses.shorts.connected && (
                            <button
                              onClick={() => void handleDisconnectYoutube()}
                              disabled={busyAction === 'shorts-disconnect'}
                              className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text hover:bg-white disabled:opacity-60"
                            >
                              연결 해제
                            </button>
                          )}
                        </>
                      )}

                      {card.key === 'instagram' && (
                        <>
                          <button
                            onClick={() => void openInstagramHelp()}
                            disabled={isBusy || platformStatuses.instagram.state === 'unconfigured'}
                            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60"
                          >
                            {isBusy ? 'Instagram 인증 확인 중..' : platformStatuses.instagram.connected ? 'Instagram 다시 연결' : 'Instagram 로그인'}
                          </button>
                          {platformStatuses.instagram.canDisconnect && (
                            <button
                              onClick={() => void handleDisconnectInstagram()}
                              disabled={busyAction === 'instagram-disconnect'}
                              className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text hover:bg-white disabled:opacity-60"
                            >
                              연결 해제
                            </button>
                          )}
                          {platformStatuses.instagram.state === 'unconfigured' && (
                            <button
                              onClick={() => void openInstagramHelp()}
                              className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text hover:bg-white"
                            >
                              설정 안내 보기
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-5 rounded-xl border border-border bg-surface-light px-4 py-3 text-xs text-text-muted">
              마지막 확인은 수동 새로고침 기준입니다. YouTube나 Instagram 인증을 끝낸 뒤에는 이 페이지에서 상태를 다시 불러와야 반영됩니다.
            </div>
          </div>
        )}

        {activeSection === 'newsletter_footer' && (
          <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm">
            <h3 className="text-base font-semibold text-text mb-1">플랫폼 주소 연결</h3>
            <p className="text-sm text-text-muted mb-6">
              뉴스레터 미리보기 하단에 노출되는 플랫폼 링크와 버튼 이름을 설정합니다.
            </p>

            <div className="space-y-4">
              {FOOTER_PLATFORMS.map(({ key, name, Icon, color, bg, urlPlaceholder }) => {
                const FooterPlatformIcon = Icon
                const draft = footerDrafts[key] || { displayName: '', url: '', categoryPath: '' }
                const saved = footerSavedKey === key

                return (
                  <div key={key} className="rounded-xl border border-border bg-surface-light p-5">
                    <div className="mb-4 flex items-center gap-3">
                      <div className={`rounded-xl p-2 ${bg}`}>
                        <FooterPlatformIcon size={18} className={color} />
                      </div>
                      <span className="text-sm font-semibold text-text">{name}</span>
                      {saved && (
                        <span className="ml-auto flex items-center gap-1 text-xs text-success">
                          <CheckCircle size={14} />
                          저장됨
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-text-muted">표시 이름</label>
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
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-text-muted">URL</label>
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
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                    </div>

                    {key === 'blog' && (
                      <div className="mt-3">
                        <label className="mb-1.5 block text-xs font-medium text-text-muted">기본 카테고리</label>
                        <input
                          type="text"
                          value={draft.categoryPath}
                          onChange={(event) =>
                            setFooterDrafts((previous) => ({
                              ...previous,
                              [key]: { ...previous[key], categoryPath: event.target.value },
                            }))
                          }
                          placeholder="예: 대입 정보 > 수시"
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        <p className="mt-1.5 text-xs text-text-muted">
                          블로그 발행 시 이 값을 우선 적용합니다. 네이버에 보이는 이름과 동일하게 입력하세요.
                        </p>
                      </div>
                    )}

                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => handleFooterSave(key)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary-dark"
                      >
                        <Save size={13} />
                        저장
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="mt-5 rounded-lg border border-border bg-surface-light p-3 text-xs text-text-muted">
              여기서 설정한 표시 이름과 URL은 뉴스레터 미리보기와 복사 본문 하단 링크에 반영됩니다.
            </p>
          </div>
        )}

        {activeSection === 'blog_footer' && (
          <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm">
            <h3 className="text-base font-semibold text-text mb-1">블로그 하단 공통 링크</h3>
            <p className="text-sm text-text-muted mb-6">
              블로그 본문 마지막에 공통으로 붙일 안내 문구와 링크를 따로 설정합니다.
              저장하면 결과 화면, 복사 본문, 네이버 업로드 본문에 같은 값이 들어갑니다.
            </p>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-muted">안내 문구</label>
                <input
                  type="text"
                  value={blogFooterDraft.heading}
                  onChange={(event) => setBlogFooterDraft((previous) => ({ ...previous, heading: event.target.value }))}
                  placeholder="예: 더 많은 콘텐츠는 여기에서 만나보세요."
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-3">
                {blogFooterDraft.links.map((link, index) => (
                  <div key={link.id} className="rounded-xl border border-border bg-surface-light p-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1.4fr_auto]">
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-text-muted">링크 이름</label>
                        <input
                          type="text"
                          value={link.label}
                          onChange={(event) => handleBlogFooterLinkChange(link.id, 'label', event.target.value)}
                          placeholder={`예: 공통 링크 ${index + 1}`}
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-text-muted">URL</label>
                        <input
                          type="url"
                          value={link.url}
                          onChange={(event) => handleBlogFooterLinkChange(link.id, 'url', event.target.value)}
                          placeholder="https://example.com/..."
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => handleRemoveBlogFooterLink(link.id)}
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-text hover:bg-white"
                        >
                          <Trash2 size={13} />
                          삭제
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleAddBlogFooterLink}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-medium text-text hover:bg-surface-light"
                >
                  <Plus size={13} />
                  링크 추가
                </button>

                <div className="flex items-center gap-3">
                  {blogFooterSaved && (
                    <span className="inline-flex items-center gap-1 text-xs text-success">
                      <CheckCircle size={14} />
                      저장됨
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleBlogFooterSave()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary-dark"
                  >
                    <Save size={13} />
                    저장
                  </button>
                </div>
              </div>

              <p className="rounded-lg border border-border bg-surface-light p-3 text-xs text-text-muted">
                링크를 모두 지우고 저장하면 블로그 하단 공통 링크를 숨길 수 있습니다.
              </p>
            </div>
          </div>
        )}

        {activeSection === 'account' && (
          <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm">
            <h3 className="text-base font-semibold text-text mb-1">비밀번호 변경</h3>
            <p className="text-sm text-text-muted mb-5">로그인 비밀번호를 변경합니다.</p>

            <div className="space-y-4 max-w-md">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text">현재 비밀번호</label>
                <input
                  type="password"
                  value={currentPw}
                  onChange={(event) => {
                    setCurrentPw(event.target.value)
                    setPwError('')
                  }}
                  placeholder="현재 비밀번호를 입력해 주세요."
                  className="w-full rounded-xl border border-border bg-surface-light px-4 py-2.5 text-sm text-text transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text">새 비밀번호</label>
                <input
                  type="password"
                  value={newPw}
                  onChange={(event) => {
                    setNewPw(event.target.value)
                    setPwError('')
                  }}
                  placeholder="새 비밀번호를 입력해 주세요."
                  className="w-full rounded-xl border border-border bg-surface-light px-4 py-2.5 text-sm text-text transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text">새 비밀번호 확인</label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={(event) => {
                    setConfirmPw(event.target.value)
                    setPwError('')
                  }}
                  placeholder="새 비밀번호를 다시 입력해 주세요."
                  className="w-full rounded-xl border border-border bg-surface-light px-4 py-2.5 text-sm text-text transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {pwError && (
                <div className="flex items-center gap-2 text-sm text-danger">
                  <AlertTriangle size={14} />
                  {pwError}
                </div>
              )}

              <div className="pt-2">
                <button
                  onClick={handleChangePassword}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-dark px-6 py-2.5 text-sm font-medium text-white hover:shadow-lg hover:shadow-primary/25"
                >
                  <Save size={16} />
                  저장
                </button>
              </div>
            </div>

            <div className="mt-8 rounded-2xl border border-border bg-surface-light p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="max-w-2xl">
                  <h4 className="text-sm font-semibold text-text">Gemini API 키 점검</h4>
                  <p className="mt-1 text-sm leading-6 text-text-muted">
                    배포 환경에 저장된 Gemini 관련 환경변수를 서버에서 직접 검사합니다. 키 원문은 반환하지 않고
                    지문만 표시합니다.
                  </p>
                </div>
                <button
                  onClick={() => void handleGeminiValidation()}
                  disabled={geminiValidationLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60"
                >
                  <RefreshCw size={15} className={geminiValidationLoading ? 'animate-spin' : ''} />
                  {geminiValidationLoading ? '검사 중...' : '유효성 검사'}
                </button>
              </div>

              {geminiValidationError && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span>{geminiValidationError}</span>
                </div>
              )}

              {geminiValidationResult && (
                <div className="mt-4 space-y-4">
                  <div className="rounded-xl border border-border bg-white px-4 py-3 text-sm text-text">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="font-medium">
                        테스트 모델: <span className="font-mono text-xs">{geminiValidationResult.model}</span>
                      </div>
                      <StatusBadge
                        tone={geminiValidationResult.summary?.anyValid ? 'success' : 'danger'}
                        text={geminiValidationResult.summary?.anyValid ? '유효한 키 발견' : '유효한 키 없음'}
                      />
                    </div>
                    <div className="mt-2 text-xs leading-5 text-text-muted">
                      검사 시각: {new Date(geminiValidationResult.checkedAt).toLocaleString()}
                    </div>
                    {geminiValidationResult.summary?.serverSelectedSource && (
                      <div className="mt-1 text-xs leading-5 text-text-muted">
                        서버 우선순위 기준 선택 소스: {geminiValidationResult.summary.serverSelectedSource}
                      </div>
                    )}
                    {geminiValidationResult.summary?.precedenceNote && (
                      <div className="mt-1 text-xs leading-5 text-amber-700">
                        {geminiValidationResult.summary.precedenceNote}
                      </div>
                    )}
                    {geminiValidationResult.summary?.buildNote && (
                      <div className="mt-1 text-xs leading-5 text-amber-700">
                        {geminiValidationResult.summary.buildNote}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {geminiValidationResult.sources?.map((source) => (
                      <div key={source.name} className="rounded-xl border border-border bg-white px-4 py-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div className="text-sm font-semibold text-text">{source.name}</div>
                          <StatusBadge
                            tone={source.valid ? 'success' : source.present ? 'danger' : 'muted'}
                            text={source.valid ? '유효' : source.present ? '실패' : '미설정'}
                          />
                        </div>
                        <div className="mt-2 space-y-1 text-xs leading-5 text-text-muted">
                          <div>Fingerprint: {source.fingerprint || 'not set'}</div>
                          <div>HTTP status: {source.responseStatus ?? '-'}</div>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-text-muted">{source.diagnosis}</p>
                        {source.message && source.message !== source.diagnosis && (
                          <p className="mt-1 text-xs leading-5 text-text-muted">
                            Raw message: {source.message}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {infoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between gap-4 mb-4">
              <h4 className="text-lg font-semibold text-text">{infoModal.title}</h4>
              <button
                onClick={() => setInfoModal(null)}
                className="rounded-lg p-2 text-text-muted hover:bg-surface-light"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 text-sm leading-6 text-text-muted">
              {infoModal.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setInfoModal(null)}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h4 className="text-lg font-semibold text-text mb-2">비밀번호가 변경되었습니다</h4>
            <p className="text-sm text-text-muted leading-6">
              보안을 위해 다시 로그인합니다. 확인을 누르면 현재 세션이 종료됩니다.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-light"
              >
                나중에
              </button>
              <button
                onClick={handleConfirmLogout}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
              >
                다시 로그인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
