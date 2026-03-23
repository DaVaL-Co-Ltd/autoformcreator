import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import DashboardPage from './pages/DashboardPage'
import ExtractionPage from './pages/ExtractionPage'
import ExtractionResultPage from './pages/ExtractionResultPage'
import ContentPage from './pages/ContentPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-6">
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/extraction" element={<ExtractionPage />} />
              <Route path="/extraction/result" element={<ExtractionResultPage />} />
              <Route path="/content" element={<ContentPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}
