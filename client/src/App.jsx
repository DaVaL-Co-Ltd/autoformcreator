import { Suspense, lazy, useEffect, useState } from 'react'
import { createBrowserRouter, RouterProvider, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './context/useAuth'
import Header from './components/Header'
import ErrorDialog from './components/ErrorDialog.jsx'
import ServiceGuideButton from './components/ServiceGuideButton.jsx'
import { useScheduledUploader } from './hooks/useScheduledUploader'
import { Download, Loader2 } from 'lucide-react'
import { DESKTOP_HELPER } from './constants/desktopHelper.js'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const ExtractionPage = lazy(() => import('./pages/ExtractionPage'))
const ExtractionResultPage = lazy(() => import('./pages/ExtractionResultPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const ContentPage = lazy(() => import('./pages/ContentPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const ScheduledUploadsPage = lazy(() => import('./pages/ScheduledUploadsPage'))
const PhotoAvatarPage = lazy(() => import('./pages/PhotoAvatarPage'))

function PageLoader() {
  return (
    <div className="min-h-[240px] flex items-center justify-center">
      <Loader2 size={24} className="text-primary animate-spin" />
    </div>
  )
}

function LazyPage({ children }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 size={24} className="text-primary animate-spin" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  return children
}

function AppLayout() {
  useScheduledUploader()

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <Header />
      <DesktopHelperInstallPrompt />
      <ServiceGuideButton />
      <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 bg-background">
        <Routes>
          <Route path="/" element={<LazyPage><DashboardPage /></LazyPage>} />
          <Route path="/dashboard" element={<LazyPage><DashboardPage /></LazyPage>} />
          <Route path="/extraction" element={<LazyPage><ExtractionPage /></LazyPage>} />
          <Route path="/extraction/result" element={<LazyPage><ExtractionResultPage /></LazyPage>} />
          <Route path="/contents" element={<LazyPage><ContentPage /></LazyPage>} />
          <Route path="/contents/view" element={<LazyPage><ExtractionResultPage /></LazyPage>} />
          <Route path="/settings" element={<LazyPage><SettingsPage /></LazyPage>} />
          <Route path="/scheduled" element={<LazyPage><ScheduledUploadsPage /></LazyPage>} />
          <Route path="/photo-avatar" element={<LazyPage><PhotoAvatarPage /></LazyPage>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function DesktopHelperInstallPrompt() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return sessionStorage.getItem('show_desktop_helper_prompt') === '1'
  })

  useEffect(() => {
    if (!user || !open) {
      return
    }

    sessionStorage.removeItem('show_desktop_helper_prompt')
  }, [open, user])

  if (!user || !open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-white shadow-2xl overflow-hidden">
        <div className="p-6">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Download size={20} className="text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-text mb-2">
            블로그 업로드용 설치 파일이 필요합니다
          </h3>
          <p className="text-sm text-text-muted leading-6">
            네이버 블로그 업로드 기능을 사용하려면 클라이언트 PC에{' '}
            {DESKTOP_HELPER.title}{' '}
            앱을 먼저 설치해야 합니다.
            설정 화면으로 이동해서 설치 파일을 내려받으시겠습니까?
          </p>
        </div>
        <div className="px-6 py-4 bg-surface-light border-t border-border flex justify-end gap-2">
          <button
            onClick={() => setOpen(false)}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-border text-text-muted hover:bg-white transition-all"
          >
            아니오
          </button>
          <button
            onClick={() => {
              setOpen(false)
              navigate('/settings?section=desktop-helper')
            }}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary-dark transition-all"
          >
            예, 설정으로 이동
          </button>
        </div>
      </div>
    </div>
  )
}

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 size={24} className="text-primary animate-spin" />
      </div>
    )
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <LazyPage><LoginPage /></LazyPage>}
      />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

const router = createBrowserRouter([
  {
    path: '*',
    element: (
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    ),
  },
])

export default function App() {
  const [browserAlert, setBrowserAlert] = useState(null)

  useEffect(() => {
    const originalAlert = window.alert.bind(window)

    window.alert = (message = '') => {
      const text = String(message)
      const isErrorLike = /(실패|오류|error|failed|timeout|exception)/i.test(text)

      if (!isErrorLike) {
        originalAlert(text)
        return
      }

      console.error('[window.alert]', text)
      setBrowserAlert(text)
    }

    return () => {
      window.alert = originalAlert
    }
  }, [])

  return (
    <>
      <RouterProvider router={router} />
      <ErrorDialog
        title="오류"
        message={browserAlert}
        onClose={() => setBrowserAlert(null)}
      />
    </>
  )
}
