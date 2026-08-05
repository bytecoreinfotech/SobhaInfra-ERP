import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CRM from './pages/CRM';
import Tasks from './pages/Tasks';
import Finance from './pages/Finance';
import WhatsApp from './pages/WhatsApp';
import Chatbot from './pages/Chatbot';
import Payments from './pages/Payments';
import Roles from './pages/Roles';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import './index.css';
import './App.css';

// Loading spinner shown while auth state resolves
function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0b0d1a', flexDirection: 'column', gap: '1rem'
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        border: '3px solid rgba(99,102,241,0.2)',
        borderTopColor: '#6366f1',
        animation: 'spin 0.8s linear infinite'
      }} />
      <p style={{ color: '#6366f1', fontSize: '0.875rem', fontFamily: 'Outfit, sans-serif' }}>
        Loading ERPPro...
      </p>
    </div>
  );
}

function AppInner() {
  const { user, loading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) return <LoadingScreen />;
  if (!user) return <Login />;

  return (
    <div className="app-layout">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(prev => !prev)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className={`app-main ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <Header onMobileMenuOpen={() => setMobileOpen(true)} />
        <main className="main-content">
          <Routes>
            <Route path="/"          element={<Dashboard />} />
            <Route path="/whatsapp"  element={<WhatsApp />} />
            <Route path="/chatbot"   element={<Chatbot />} />
            <Route path="/crm"       element={<CRM />} />
            <Route path="/tasks"     element={<Tasks />} />
            <Route path="/payments"  element={<Payments />} />
            <Route path="/finance"   element={<Finance />} />
            <Route path="/roles"     element={<Roles />} />
            <Route path="/reports"   element={<Reports />} />
            <Route path="/settings"  element={<Settings />} />
            <Route path="*"          element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <AppInner />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
