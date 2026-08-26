import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, CheckSquare, IndianRupee,
  MessageCircle, Bot, CreditCard, Shield, BarChart3,
  Settings, ChevronLeft, ChevronRight, MapPin, Sparkles, Mail, Building2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLiveCounts } from '../context/LiveCountsContext';
import { useCompany } from '../context/CompanyContext';
import './Sidebar.css';

const Sidebar = ({ collapsed, isCollapsed, onToggle, mobileOpen, onMobileClose }) => {
  const isSideCollapsed = collapsed ?? isCollapsed ?? false;
  const { user, hasPermission } = useAuth();
  const { whatsapp, leads, tasks, payments } = useLiveCounts();
  const { companyProfiles, activeCompanyId, setActiveCompanyId, isConsolidated, activeCompany } = useCompany();

  // Badge values: only show when > 0, cap display at 99
  const badge = (n) => (n > 0 ? (n > 99 ? '99+' : String(n)) : null);

  const rawNavSections = [
    {
      label: 'Core',
      items: [
        { name: 'Dashboard',           path: '/',          icon: <LayoutDashboard size={18} />, end: true, module: 'Dashboard' },
        { name: 'Reports & Analytics', path: '/reports',   icon: <BarChart3 size={18} />,                  module: 'Reports' },
      ]
    },
    {
      label: 'WhatsApp & CRM',
      items: [
        { name: 'WhatsApp Campaign',    path: '/whatsapp',        icon: <MessageCircle size={18} />, badge: badge(whatsapp), module: 'WhatsApp' },
        { name: 'Campaign Studio',      path: '/campaign-studio', icon: <Sparkles size={18} />,                              module: 'WhatsApp' },
        { name: 'Gmail & Email Center', path: '/email-hub',       icon: <Mail size={18} />,                                  module: 'CRM' },
        { name: 'Chatbot & Auto-Reply', path: '/chatbot',         icon: <Bot size={18} />,                                  module: 'WhatsApp' },
        { name: 'CRM & Leads',          path: '/crm',             icon: <Users size={18} />,         badge: badge(leads),    module: 'CRM' },
      ]
    },
    {
      label: 'Operations',
      items: [
        { name: 'Field Ops & GPS Live', path: '/field-ops',   icon: <MapPin size={18} />,                             module: 'Tasks' },
        { name: 'Task Management',     path: '/tasks',       icon: <CheckSquare size={18} />,   badge: badge(tasks),   module: 'Tasks' },
        { name: 'Payment Follow-up',   path: '/payments',    icon: <CreditCard size={18} />,    badge: badge(payments),module: 'Payments' },
        { name: 'Finance & Tally',     path: '/finance',     icon: <IndianRupee size={18} />,                          module: 'Finance' },
        { name: 'Automation Rules',    path: '/automations', icon: <Settings size={18} />,                             module: 'Roles' },
      ]
    },
    {
      label: 'Admin',
      items: [
        { name: 'Roles & Access', path: '/roles',    icon: <Shield size={18} />,   module: 'Roles' },
        { name: 'Settings',       path: '/settings', icon: <Settings size={18} />, module: 'Roles' },
      ]
    }
  ];

  // Filter sections and items based on role-based module permissions
  const navSections = rawNavSections
    .map(section => ({
      ...section,
      items: section.items.filter(item => !item.module || hasPermission(item.module))
    }))
    .filter(section => section.items.length > 0);

  return (
    <>
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className="sidebar-mobile-overlay" onClick={onMobileClose} />
      )}

      <aside className={`sidebar ${isSideCollapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        {/* Header */}
        <div className="sidebar-header">
          <div className="logo-container">
            <div className="logo-icon">S</div>
            {!isSideCollapsed && (
              <span className="logo-text">SobhaInfra <span>ERP</span></span>
            )}
          </div>
          <button
            className="sidebar-toggle-btn desktop-toggle"
            onClick={onToggle}
            type="button"
            title={isSideCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isSideCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isSideCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Company Switcher */}
        {!isSideCollapsed && companyProfiles.length > 0 && (
          <div style={{
            margin: '8px 12px 4px',
            padding: '8px 10px',
            background: 'rgba(99,102,241,0.1)',
            borderRadius: '10px',
            border: '1px solid rgba(99,102,241,0.25)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <Building2 size={13} style={{ color: '#818cf8' }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#818cf8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Active Company</span>
            </div>
            <select
              id="sidebar-company-switcher"
              value={activeCompanyId || 'all'}
              onChange={e => setActiveCompanyId(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(15,23,42,0.8)',
                color: '#e2e8f0',
                border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: 7,
                padding: '5px 8px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="all">🏢 All Companies</option>
              {companyProfiles.map(c => (
                <option key={c.id} value={c.id}>
                  {c.company_name === 'SOBHAINFRA TECH PRIVATE LIMITED' ? 'SOBHAINFRA TECH' :
                   c.company_name === 'SHOBHA READY PLAST' ? 'SHOBHA READY PLAST' :
                   c.company_name === 'SHOBHA BUILDTECH' ? 'SHOBHA BUILDTECH' :
                   c.company_name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Navigation */}
        <nav className="sidebar-nav">
          {navSections.map((section) => (
            <div key={section.label}>
              <div className="nav-section-label">{section.label}</div>
              <ul className="nav-list">
                {section.items.map((item) => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      end={item.end}
                      className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                      onClick={onMobileClose}
                      title={isSideCollapsed ? item.name : undefined}
                    >
                      <span className="nav-icon">{item.icon}</span>
                      <span className="nav-label">{item.name}</span>
                      {item.badge && <span className="nav-badge">{item.badge}</span>}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Dynamic Footer with Logged In User Info */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">
              {user?.avatar || (user?.name ? user.name.slice(0, 2).toUpperCase() : 'U')}
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user?.name || user?.email || 'User'}</div>
              <div className="sidebar-user-role">{user?.role || 'Member'}</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
