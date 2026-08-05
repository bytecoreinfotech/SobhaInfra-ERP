import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
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

function AppInner() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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
          </Routes>
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <Router>
        <AppInner />
      </Router>
    </ThemeProvider>
  );
}

export default App;
