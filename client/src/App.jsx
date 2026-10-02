import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ConstellationGrid from './components/ConstellationGrid';
import Navbar from './components/Navbar';
import { RequireAuth, RequireAdmin } from './components/RouteGuards';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Search from './pages/Search';
import FoundFeed from './pages/FoundFeed';
import ReportLost from './pages/ReportLost';
import ReportFound from './pages/ReportFound';
import MyReports from './pages/MyReports';
import Matches from './pages/Matches';
import Claims from './pages/Claims';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';
import AdminDashboard from './pages/AdminDashboard';
import AdminReports from './pages/AdminReports';
import AdminClaims from './pages/AdminClaims';
import AdminUsers from './pages/AdminUsers';
import AdminEvents from './pages/AdminEvents';
import AdminChatReports from './pages/AdminChatReports';
import ReportDetail from './pages/ReportDetail';
import ReportEdit from './pages/ReportEdit';
import ClaimSubmit from './pages/ClaimSubmit';
import About from './pages/About';
import Contact from './pages/Contact';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import NotFound from './pages/NotFound';
import Conversations from './pages/Conversations';
import ConversationThread from './pages/ConversationThread';

/**
 * Route access is declared here rather than inside each page.
 *
 * The API is the real security boundary — every private endpoint re-checks the
 * JWT server-side, so bypassing these guards reveals nothing. What the guards buy
 * is that a logged-out visitor no longer renders a frame of private UI before the
 * API 401s, and `/admin` no longer loads for a normal user. Each page used to
 * hand-roll its own `useEffect(() => !isAuthenticated && navigate('/login'))`,
 * which also meant a hard refresh could flash content before the redirect fired.
 */
function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="relative min-h-screen">
          <ConstellationGrid />
          <div className="relative z-10">
          <Navbar />
          <Routes>
            {/* Public */}
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Public browsing — no account needed */}
            <Route path="/search" element={<Search />} />
            <Route path="/found-feed" element={<FoundFeed />} />

            {/* Static */}
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />

            {/* Signed-in only */}
            <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
            <Route path="/report/lost" element={<RequireAuth><ReportLost /></RequireAuth>} />
            <Route path="/report/found" element={<RequireAuth><ReportFound /></RequireAuth>} />
            <Route path="/my-reports" element={<RequireAuth><MyReports /></RequireAuth>} />
            <Route path="/reports/:id" element={<RequireAuth><ReportDetail /></RequireAuth>} />
            <Route path="/reports/:id/edit" element={<RequireAuth><ReportEdit /></RequireAuth>} />
            <Route path="/matches" element={<RequireAuth><Matches /></RequireAuth>} />
            <Route path="/claims" element={<RequireAuth><Claims /></RequireAuth>} />
            <Route path="/claims/new" element={<RequireAuth><ClaimSubmit /></RequireAuth>} />
            <Route path="/notifications" element={<RequireAuth><Notifications /></RequireAuth>} />
            <Route path="/conversations" element={<RequireAuth><Conversations /></RequireAuth>} />
            <Route path="/conversations/:id" element={<RequireAuth><ConversationThread /></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />

            {/* Admins only — RequireAuth inside so logged-out users get /login. RequireAuth wraps RequireAdmin so a logged-out visitor lands on the login page. */}
            <Route path="/admin" element={<RequireAuth><RequireAdmin><AdminDashboard /></RequireAdmin></RequireAuth>} />
            <Route path="/admin/reports" element={<RequireAuth><RequireAdmin><AdminReports /></RequireAdmin></RequireAuth>} />
            <Route path="/admin/claims" element={<RequireAuth><RequireAdmin><AdminClaims /></RequireAdmin></RequireAuth>} />
            <Route path="/admin/users" element={<RequireAuth><RequireAdmin><AdminUsers /></RequireAdmin></RequireAuth>} />
            <Route path="/admin/events" element={<RequireAuth><RequireAdmin><AdminEvents /></RequireAdmin></RequireAuth>} />
            <Route path="/admin/chat-reports" element={<RequireAuth><RequireAdmin><AdminChatReports /></RequireAdmin></RequireAuth>} />

            {/* Old dashboard aliases kept working */}
            <Route path="/home" element={<Navigate to="/" replace />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
          </div>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;