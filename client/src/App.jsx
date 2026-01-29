import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import NewRequestPage from './pages/NewRequestPage';
import RequestDetailPage from './pages/RequestDetailPage';
import SolutionPage from './pages/SolutionPage';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background">
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/request/new"
            element={
              <ProtectedRoute>
                <NewRequestPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/request/:id"
            element={
              <ProtectedRoute>
                <RequestDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/solution/:id"
            element={
              <ProtectedRoute>
                <SolutionPage />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          {/* Add more routes here footer Phase 5 */}
        </Routes>
      </div>
    </Router>
  );
}

export default App;
