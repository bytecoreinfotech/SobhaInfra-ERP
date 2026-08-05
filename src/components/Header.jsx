import React, { useState, useRef, useEffect } from 'react';
import { Search, Bell, Sun, Moon, Menu, MessageCircle, CheckCircle2, AlertCircle, IndianRupee } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useLocation } from 'react-router-dom';
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
  const [showNotif, setShowNotif] = useState(false);
  const [notifs, setNotifs] = useState(notifications);
  const notifRef = useRef(null);
  const location = useLocation();

  const unreadCount = notifs.filter(n => n.unread).length;
  const currentPage = routeLabels[location.pathname] || 'Dashboard';

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotif(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAllRead = () => {
    setNotifs(prev => prev.map(n => ({ ...n, unread: false })));
  };

  return (
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
      </div>

      {/* Search */}
      <div className="header-search">
        <span className="search-icon-wrap"><Search size={15} /></span>
        <input type="text" placeholder="Search anything..." className="search-input" />
      </div>

      <div className="header-actions">
        {/* Demo pill */}
        <span className="demo-pill hide-mobile">DEMO</span>

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
                {notifs.map(n => (
                  <div
                    key={n.id}
                    className={`notif-item ${n.unread ? 'unread' : ''}`}
                    onClick={() => setNotifs(prev => prev.map(item => item.id === n.id ? { ...item, unread: false } : item))}
                  >
                    <div
                      className="notif-icon"
                      style={{ background: n.iconBg, color: n.iconColor }}
                    >
                      {n.icon}
                    </div>
                    <div className="notif-text">
                      <div className="notif-title">{n.title}</div>
                      <div className="notif-time">{n.time}</div>
                    </div>
                    {n.unread && <span className="status-dot online" style={{ marginTop: '6px' }} />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="user-profile">
          <div className="user-avatar">AU</div>
          <div className="user-info">
            <div className="user-name">Admin User</div>
            <div className="user-role">Super Admin</div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
