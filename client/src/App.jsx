import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AuthPage from './pages/AuthPage';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';
import ContentListPage from './pages/ContentListPage';
import ContentCreatePage from './pages/ContentCreatePage';
import ContentDetailPage from './pages/ContentDetailPage';
import ContentEditPage from './pages/ContentEditPage';
import DistributionPage from './pages/DistributionPage';
import SubscriberPage from './pages/SubscriberPage';
import NotificationPage from './pages/NotificationPage';
import PlatformPage from './pages/PlatformPage';
import SettingsPage from './pages/SettingsPage';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

const AdminRoute = ({ children }) => (
  <ProtectedRoute>
    <Layout>{children}</Layout>
  </ProtectedRoute>
);

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background">
        <Routes>
          {/* Public */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<AuthPage />} />

          {/* Admin - Protected */}
          <Route path="/dashboard" element={<AdminRoute><DashboardPage /></AdminRoute>} />
          <Route path="/content" element={<AdminRoute><ContentListPage /></AdminRoute>} />
          <Route path="/content/create" element={<AdminRoute><ContentCreatePage /></AdminRoute>} />
          <Route path="/content/:id" element={<AdminRoute><ContentDetailPage /></AdminRoute>} />
          <Route path="/content/:id/edit" element={<AdminRoute><ContentEditPage /></AdminRoute>} />
          <Route path="/distribution" element={<AdminRoute><DistributionPage /></AdminRoute>} />
          <Route path="/subscribers" element={<AdminRoute><SubscriberPage /></AdminRoute>} />
          <Route path="/notifications" element={<AdminRoute><NotificationPage /></AdminRoute>} />
          <Route path="/platforms" element={<AdminRoute><PlatformPage /></AdminRoute>} />
          <Route path="/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
