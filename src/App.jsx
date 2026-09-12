import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LiveCountsProvider } from './context/LiveCountsContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import MobileBottomNav from './components/MobileBottomNav';
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
import Automations from './pages/Automations';
import FieldOps from './pages/FieldOps';
import CampaignStudio from './pages/CampaignStudio';
import EmailHub from './pages/EmailHub';
import PublicInvoice from './pages/PublicInvoice';
import GlobalTooltip from './components/GlobalTooltip';
import { CompanyProvider } from './context/CompanyContext';
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

// Role-based route guard
function ProtectedRoute({ module, children }) {
  const { hasPermission } = useAuth();
  if (module && !hasPermission(module)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function AppInner() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('erp_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('erp_sidebar_collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Allow public access to /invoice/:invNum without requiring ERP login
  if (location.pathname.startsWith('/invoice/')) {
    return (
      <Routes>
        <Route path="/invoice/:invNum" element={<PublicInvoice />} />
      </Routes>
    );
  }

  if (loading) return <LoadingScreen />;
  if (!user) return <Login />;

  return (
    <div className="app-layout">
      <GlobalTooltip />
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className={`app-main ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <Header onMobileMenuOpen={() => setMobileOpen(true)} />
        <main className="main-content">
          <Routes>
            <Route path="/"          element={<Dashboard />} />
            <Route path="/crm"       element={<ProtectedRoute module="CRM"><CRM /></ProtectedRoute>} />
            <Route path="/email-hub" element={<ProtectedRoute module="CRM"><EmailHub /></ProtectedRoute>} />
            <Route path="/whatsapp"  element={<ProtectedRoute module="WhatsApp"><WhatsApp /></ProtectedRoute>} />
            <Route path="/campaign-studio" element={<ProtectedRoute module="WhatsApp"><CampaignStudio /></ProtectedRoute>} />
            <Route path="/chatbot"   element={<ProtectedRoute module="Chatbot"><Chatbot /></ProtectedRoute>} />
            <Route path="/tasks"     element={<ProtectedRoute module="Tasks"><Tasks /></ProtectedRoute>} />
            <Route path="/field-ops" element={<ProtectedRoute module="Tasks"><FieldOps /></ProtectedRoute>} />
            <Route path="/payments"  element={<ProtectedRoute module="Payments"><Payments /></ProtectedRoute>} />
            <Route path="/finance"   element={<ProtectedRoute module="Finance"><Finance /></ProtectedRoute>} />
            <Route path="/automations" element={<ProtectedRoute module="Roles"><Automations /></ProtectedRoute>} />
            <Route path="/roles"     element={<ProtectedRoute module="Roles"><Roles /></ProtectedRoute>} />
            <Route path="/reports"   element={<ProtectedRoute module="Reports"><Reports /></ProtectedRoute>} />
            <Route path="/settings"  element={<ProtectedRoute module="Roles"><Settings /></ProtectedRoute>} />
            <Route path="*"          element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <MobileBottomNav onOpenMenu={() => setMobileOpen(true)} />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CompanyProvider>
          <LiveCountsProvider>
            <Router>
              <AppInner />
            </Router>
          </LiveCountsProvider>
        </CompanyProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
