import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Header from './components/Header'
import LoginPage from './pages/LoginPage'
import ExtractionPage from './pages/ExtractionPage'
import ExtractionResultPage from './pages/ExtractionResultPage'
import SettingsPage from './pages/SettingsPage'
import AnimationTestPage from './pages/AnimationTestPage'
import ShortsViewerPage from './pages/ShortsViewerPage'
import ShortsTestPage from './pages/ShortsTestPage'
import ShortsTest2Page from './pages/ShortsTest2Page'
import BlogTestPage from './pages/BlogTestPage'
import NaverBlogUploadTestPage from './pages/NaverBlogUploadTestPage'
import InstagramUploadTestPage from './pages/InstagramUploadTestPage'
import YouTubeUploadTestPage from './pages/YouTubeUploadTestPage'
import ContentPage from './pages/ContentPage'
import DashboardPage from './pages/DashboardPage'
import ScheduledUploadsPage from './pages/ScheduledUploadsPage'
import { useScheduledUploader } from './hooks/useScheduledUploader'
import { Loader2 } from 'lucide-react'

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
      <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 bg-background">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/extraction" element={<ExtractionPage />} />
          <Route path="/extraction/result" element={<ExtractionResultPage />} />
          <Route path="/contents" element={<ContentPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/scheduled" element={<ScheduledUploadsPage />} />
          <Route path="/animation-test" element={<AnimationTestPage />} />
          <Route path="/shorts/view" element={<ShortsViewerPage />} />
          <Route path="/shorts/test" element={<ShortsTestPage />} />
          <Route path="/shorts/test2" element={<ShortsTest2Page />} />
          <Route path="/blog/test" element={<BlogTestPage />} />
          <Route path="/blog/upload-test" element={<NaverBlogUploadTestPage />} />
          <Route path="/instagram/upload-test" element={<InstagramUploadTestPage />} />
          <Route path="/youtube/upload-test" element={<YouTubeUploadTestPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
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
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
