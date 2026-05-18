import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { apiFetch } from './lib/api';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import MeetingDetailPage from './pages/MeetingDetailPage';
import MyTasksPage from './pages/MyTasksPage';

type AuthState = 'loading' | 'authenticated' | 'anonymous';

function ProtectedLayout() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || ''));
    apiFetch('/auth/me').catch(console.error);
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">🎯</div>
          <div className="sidebar-brand-text">
            <h2>ActionPilot</h2>
            <span>Meeting AI Agent</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="section-label" style={{ padding: '8px 12px 4px' }}>Navigation</div>
          <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-link-icon">📋</span>
            Meetings
          </NavLink>
          <NavLink to="/tasks" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-link-icon">✅</span>
            My To-Dos
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div style={{ color: 'var(--text-3)', fontSize: '11px', marginBottom: '4px' }}>Signed in as</div>
            <div style={{ color: 'var(--text-2)', fontSize: '12px', wordBreak: 'break-all' }}>{email}</div>
          </div>
          <button id="logout-btn" className="btn btn-ghost" onClick={logout} style={{ justifyContent: 'flex-start', fontSize: '13px' }}>
            <span>🚪</span> Logout
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/meetings/:id" element={<MeetingDetailPage />} />
          <Route path="/tasks" element={<MyTasksPage />} />
          <Route path="*" element={<Navigate to="/dashboard" />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const [authState, setAuthState] = useState<AuthState>('loading');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthState(data.session ? 'authenticated' : 'anonymous');
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthState(session ? 'authenticated' : 'anonymous');
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (authState === 'loading') {
    return (
      <div className="loading-screen">
        <div className="loading-logo">🎯</div>
        <div style={{ fontSize: '18px', fontWeight: 700 }}>ActionPilot</div>
        <div style={{ color: 'var(--text-3)', fontSize: '14px' }}>Loading your workspace...</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={authState === 'authenticated' ? <Navigate to="/dashboard" /> : <LoginPage />} />
      <Route path="/*" element={authState === 'authenticated' ? <ProtectedLayout /> : <Navigate to="/login" />} />
    </Routes>
  );
}
