import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, CheckSquare, IndianRupee,
  MessageCircle, Bot, CreditCard, Shield, BarChart3,
  Settings, ChevronLeft, ChevronRight, LogOut
} from 'lucide-react';
import './Sidebar.css';

const navSections = [
  {
    label: 'Core',
    items: [
      { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={18} />, end: true },
      { name: 'Reports & Analytics', path: '/reports', icon: <BarChart3 size={18} /> },
    ]
  },
  {
    label: 'WhatsApp & CRM',
    items: [
      { name: 'WhatsApp Campaigns', path: '/whatsapp', icon: <MessageCircle size={18} />, badge: '3' },
      { name: 'Chatbot & Auto-Reply', path: '/chatbot', icon: <Bot size={18} /> },
      { name: 'CRM & Leads', path: '/crm', icon: <Users size={18} />, badge: '12' },
    ]
  },
  {
    label: 'Operations',
    items: [
      { name: 'Task Management', path: '/tasks', icon: <CheckSquare size={18} />, badge: '5' },
      { name: 'Payment Follow-up', path: '/payments', icon: <CreditCard size={18} />, badge: '2' },
      { name: 'Finance & Tally', path: '/finance', icon: <IndianRupee size={18} /> },
    ]
  },
  {
    label: 'Admin',
    items: [
      { name: 'Roles & Access', path: '/roles', icon: <Shield size={18} /> },
      { name: 'Settings', path: '/settings', icon: <Settings size={18} /> },
    ]
  }
];

const Sidebar = ({ collapsed, onToggle, mobileOpen, onMobileClose }) => {
  return (
    <>
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className="sidebar-mobile-overlay" onClick={onMobileClose} />
      )}

      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        {/* Header */}
        <div className="sidebar-header">
          <div className="logo-container">
            <div className="logo-icon">E</div>
            {!collapsed && (
              <span className="logo-text">ERP<span>Pro</span></span>
            )}
          </div>
          <button
            className="sidebar-toggle-btn desktop-toggle"
            onClick={onToggle}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

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
                      title={collapsed ? item.name : undefined}
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

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">AU</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">Admin User</div>
              <div className="sidebar-user-role">Super Admin</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
