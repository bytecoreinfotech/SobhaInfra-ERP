import React, { useState, useRef, useEffect } from 'react';
import { Search, Bell, Sun, Moon, Menu, MessageCircle, CheckCircle2, AlertCircle, IndianRupee, LogOut, Users, Building2, ChevronDown, PlusCircle, Globe, Check } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useLiveCounts } from '../context/LiveCountsContext';
import { useCompany } from '../context/CompanyContext';
import { useLocation, useNavigate } from 'react-router-dom';
import ProfileModal from './ProfileModal';
import './Header.css';

const notifications = [
  {
    id: 1, unread: true, icon: <MessageCircle size={14} />, iconBg: 'var(--whatsapp-bg)', iconColor: 'var(--whatsapp)',
    title: 'WhatsApp campaign "Festival Offer" sent to 248 contacts.',
    time: '2 min ago'
  },
  {
    id: 2, unread: true, icon: <AlertCircle size={14} />, iconBg: 'var(--danger-bg)', iconColor: 'var(--danger)',
    title: 'Payment overdue: INV-2026-041 (₹45,000) — Tech Solutions Inc.',
    time: '18 min ago'
  },
  {
    id: 3, unread: true, icon: <CheckCircle2 size={14} />, iconBg: 'var(--success-bg)', iconColor: 'var(--success)',
    title: 'Tally sync completed — 14 new invoices imported.',
    time: '1 hr ago'
  },
  {
    id: 4, unread: false, icon: <IndianRupee size={14} />, iconBg: 'var(--warning-bg)', iconColor: 'var(--warning)',
    title: 'Payment received: ₹1,20,000 from Global Traders.',
    time: '3 hr ago'
  },
];

const routeLabels = {
  '/': 'Dashboard',
  '/reports': 'Reports & Analytics',
  '/whatsapp': 'WhatsApp Campaigns',
  '/chatbot': 'Chatbot & Auto-Reply',
  '/crm': 'CRM & Leads',
  '/tasks': 'Task Management',
  '/payments': 'Payment Follow-up',
  '/finance': 'Finance & Tally',
  '/roles': 'Roles & Access',
  '/settings': 'Settings',
};

const Header = ({ onMobileMenuOpen }) => {
  const { theme, toggleTheme } = useTheme();
  const { user, signOut } = useAuth();
  const { notifications: liveNotifs } = useLiveCounts();
  const { companyProfiles, activeCompanyId, activeCompany, isConsolidated, setActiveCompanyId } = useCompany();
  const [showNotif, setShowNotif] = useState(false);
  const [showCompanyMenu, setShowCompanyMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [readIds, setReadIds] = useState(new Set());
  const notifRef = useRef(null);
  const companyMenuRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Icon map for notification types
  const notifIconMap = {
    whatsapp: { icon: <MessageCircle size={14} />, bg: 'var(--whatsapp-bg)', color: 'var(--whatsapp)' },
    lead:     { icon: <Users size={14} />,          bg: 'var(--accent-glow)',  color: 'var(--accent-primary)' },
    payment:  { icon: <IndianRupee size={14} />,    bg: 'var(--danger-bg)',    color: 'var(--danger)' },
    default:  { icon: <CheckCircle2 size={14} />,   bg: 'var(--success-bg)',   color: 'var(--success)' },
  };

  const unreadCount = liveNotifs.filter(n => n.unread && !readIds.has(n.id)).length;
  const currentPage = routeLabels[location.pathname] || 'Dashboard';

  const markAllRead = () => setReadIds(new Set(liveNotifs.map(n => n.id)));
  const markRead = (id) => setReadIds(prev => new Set([...prev, id]));

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotif(false);
      if (companyMenuRef.current && !companyMenuRef.current.contains(e.target)) setShowCompanyMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeLabel = isConsolidated 
    ? 'All Companies' 
    : (activeCompany?.company_name || 'Active Company');

  return (
    <>
      <header className="header">
      <div className="header-left">
        {/* Mobile hamburger */}
        <button className="hamburger-btn" onClick={onMobileMenuOpen} aria-label="Open menu">
          <Menu size={20} />
        </button>

        {/* Breadcrumb */}
        <div className="breadcrumb hide-mobile">
          <span>ERPPro</span>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">{currentPage}</span>
        </div>

        {/* Multi-Company Switcher Pill */}
        <div className="company-switcher-wrap" ref={companyMenuRef}>
          <button
            className="company-switcher-btn"
            onClick={() => setShowCompanyMenu(prev => !prev)}
            style={{
              background: isConsolidated ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-secondary)',
              color: isConsolidated ? 'var(--accent-primary)' : 'var(--text-primary)',
            }}
          >
            {isConsolidated ? (
              <Globe size={14} color="var(--accent-primary)" />
            ) : activeCompany?.company_logo_url ? (
              <img
                src={activeCompany.company_logo_url}
                alt="Logo"
                style={{ width: 16, height: 16, borderRadius: '4px', objectFit: 'contain' }}
              />
            ) : (
              <Building2 size={14} color="var(--accent-primary)" />
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeLabel}
            </span>
            <ChevronDown size={13} style={{ opacity: 0.6 }} />
          </button>

          {showCompanyMenu && (
            <div
              className="company-dropdown-menu"
            >
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '0.4rem 0.6rem' }}>
                Active Company Workspace
              </div>

              {/* Consolidated All Option */}
              <button
                onClick={() => {
                  setActiveCompanyId('all');
                  setShowCompanyMenu(false);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.55rem 0.65rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: isConsolidated ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                  color: isConsolidated ? 'var(--accent-primary)' : 'var(--text-primary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '0.82rem',
                  fontWeight: isConsolidated ? 700 : 500
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(99, 102, 241, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Globe size={13} color="var(--accent-primary)" />
                  </div>
                  <div>
                    <div>All Companies</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Consolidated Group Overview</div>
                  </div>
                </div>
                {isConsolidated && <Check size={14} color="var(--accent-primary)" />}
              </button>

              <div style={{ height: 1, background: 'var(--border-color)', margin: '0.35rem 0' }} />

              {/* Individual Company List */}
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {companyProfiles.map(comp => {
                  const isSelected = activeCompanyId === comp.id;
                  return (
                    <button
                      key={comp.id}
                      onClick={() => {
                        setActiveCompanyId(comp.id);
                        setShowCompanyMenu(false);
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.5rem 0.65rem',
                        borderRadius: '8px',
                        border: 'none',
                        background: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                        color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: '0.8rem',
                        fontWeight: isSelected ? 700 : 500,
                        marginBottom: '2px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                        {comp.company_logo_url ? (
                          <img
                            src={comp.company_logo_url}
                            alt=""
                            style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'contain' }}
                          />
                        ) : (
                          <div style={{ width: 22, height: 22, borderRadius: 4, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 800 }}>
                            {comp.company_name.slice(0, 2)}
                          </div>
                        )}
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{comp.company_name}</div>
                          <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>{comp.gstin_number || 'No GSTIN'}</div>
                        </div>
                      </div>
                      {isSelected && <Check size={14} color="var(--accent-primary)" style={{ flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>

              <div style={{ height: 1, background: 'var(--border-color)', margin: '0.35rem 0' }} />

              {/* Add / Manage Companies link */}
              <button
                onClick={() => {
                  setShowCompanyMenu(false);
                  navigate('/settings');
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 0.65rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--accent-primary)',
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  fontWeight: 600
                }}
              >
                <PlusCircle size={14} /> Manage Company Profiles
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="header-search">
        <span className="search-icon-wrap"><Search size={15} /></span>
        <input type="text" placeholder="Search anything..." className="search-input" />
      </div>

      <div className="header-actions">
        {/* Theme toggle */}
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* Notifications */}
        <div className="notif-btn-wrap" ref={notifRef}>
          <button
            className="notif-btn"
            onClick={() => setShowNotif(prev => !prev)}
            aria-label="Notifications"
          >
            <Bell size={16} />
            {unreadCount > 0 && <span className="notif-dot" />}
          </button>

          {showNotif && (
            <div className="notif-dropdown">
              <div className="notif-header">
                <h4>Notifications {unreadCount > 0 && <span className="badge badge-danger ml-2">{unreadCount}</span>}</h4>
                <button className="notif-mark-read" onClick={markAllRead}>Mark all read</button>
              </div>
              <div className="notif-list">
                {liveNotifs.length === 0 ? (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    ✅ All caught up — no new alerts.
                  </div>
                ) : liveNotifs.map(n => {
                  const isRead = readIds.has(n.id);
                  const iconDef = notifIconMap[n.type] || notifIconMap.default;
                  return (
                    <div
                      key={n.id}
                      className={`notif-item ${!isRead ? 'unread' : ''}`}
                      onClick={() => markRead(n.id)}
                    >
                      <div className="notif-icon" style={{ background: iconDef.bg, color: iconDef.color }}>
                        {iconDef.icon}
                      </div>
                      <div className="notif-text">
                        <div className="notif-title">{n.title}</div>
                        <div className="notif-time">{n.time}</div>
                      </div>
                      {!isRead && <span className="status-dot online" style={{ marginTop: '6px' }} />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* User Profile (clickable to open Profile Modal) */}
        <div
          className="user-profile"
          onClick={() => setShowProfileModal(true)}
          title="My Profile & Change Password"
          style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          <div className="user-avatar" style={{ boxShadow: '0 0 0 2px rgba(99,102,241,0.4)' }}>
            {user?.avatar || user?.email?.slice(0,2).toUpperCase() || 'AU'}
          </div>
          <div className="user-info hide-mobile">
            <div className="user-name">{user?.name || user?.email || 'Admin User'}</div>
            <div className="user-role" style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
              {user?.role || 'User'} · <span style={{ color: 'var(--accent-primary)' }}>Edit Profile</span>
            </div>
          </div>
        </div>
        <button
          onClick={signOut}
          title="Sign Out"
          style={{
            background: 'none', border: '1px solid var(--border-color)', borderRadius: 8,
            padding: '0.4rem', cursor: 'pointer', color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.borderColor = 'var(--danger)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
        >
          <LogOut size={15} />
        </button>
      </div>
    </header>

    {/* Profile & Change Password Modal */}
    {showProfileModal && (
      <ProfileModal onClose={() => setShowProfileModal(false)} />
    )}
  </>);
};
export default Header;
