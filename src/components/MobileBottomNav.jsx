import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, MessageCircle, Users, CheckSquare,
  Menu
} from 'lucide-react';
import { useLiveCounts } from '../context/LiveCountsContext';
import { useAuth } from '../context/AuthContext';
import './MobileBottomNav.css';

const MobileBottomNav = ({ onOpenMenu }) => {
  const location = useLocation();
  const { hasPermission } = useAuth();
  const { whatsapp, leads, tasks } = useLiveCounts();

  const badge = (n) => (n > 0 ? (n > 99 ? '99+' : String(n)) : null);

  const isMoreActive = [
    '/field-ops', '/payments', '/finance', '/automations',
    '/roles', '/reports', '/settings', '/campaign-studio', '/chatbot'
  ].includes(location.pathname);

  return (
    <nav className="mobile-bottom-nav">
      <NavLink
        to="/"
        end
        className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
      >
        <div className="mobile-nav-icon-wrap">
          <LayoutDashboard size={20} />
        </div>
        <span className="mobile-nav-label">Dashboard</span>
      </NavLink>

      {hasPermission('WhatsApp') && (
        <NavLink
          to="/whatsapp"
          className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
        >
          <div className="mobile-nav-icon-wrap">
            <MessageCircle size={20} />
            {badge(whatsapp) && <span className="mobile-nav-badge">{badge(whatsapp)}</span>}
          </div>
          <span className="mobile-nav-label">WhatsApp</span>
        </NavLink>
      )}

      {hasPermission('CRM') && (
        <NavLink
          to="/crm"
          className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
        >
          <div className="mobile-nav-icon-wrap">
            <Users size={20} />
            {badge(leads) && <span className="mobile-nav-badge">{badge(leads)}</span>}
          </div>
          <span className="mobile-nav-label">CRM</span>
        </NavLink>
      )}

      {hasPermission('Tasks') && (
        <NavLink
          to="/tasks"
          className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
        >
          <div className="mobile-nav-icon-wrap">
            <CheckSquare size={20} />
            {badge(tasks) && <span className="mobile-nav-badge">{badge(tasks)}</span>}
          </div>
          <span className="mobile-nav-label">Tasks</span>
        </NavLink>
      )}

      <button
        type="button"
        className={`mobile-nav-item mobile-nav-btn ${isMoreActive ? 'active' : ''}`}
        onClick={onOpenMenu}
      >
        <div className="mobile-nav-icon-wrap">
          <Menu size={20} />
        </div>
        <span className="mobile-nav-label">More</span>
      </button>
    </nav>
  );
};

export default MobileBottomNav;
