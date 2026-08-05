import React, { useState } from 'react';
import { Shield, Plus, X, Edit2, Trash2, User, Check } from 'lucide-react';
import './Pages.css';

const roles = [
  { id: 1, name: 'Super Admin', color: 'var(--danger)', users: 1, permissions: 'all' },
  { id: 2, name: 'Manager', color: 'var(--accent-primary)', users: 3, permissions: 'high' },
  { id: 3, name: 'Sales Executive', color: 'var(--success)', users: 8, permissions: 'medium' },
  { id: 4, name: 'Accounts', color: 'var(--warning)', users: 2, permissions: 'finance' },
  { id: 5, name: 'Support Agent', color: 'var(--info)', users: 4, permissions: 'low' },
];

const users = [
  { id: 1, name: 'Admin User', email: 'admin@erppro.in', role: 'Super Admin', status: 'Active', lastLogin: 'Today, 10:35 AM', avatar: 'AU' },
  { id: 2, name: 'Priya Sharma', email: 'priya@erppro.in', role: 'Manager', status: 'Active', lastLogin: 'Today, 9:12 AM', avatar: 'PS' },
  { id: 3, name: 'Rajesh Kumar', email: 'rajesh@erppro.in', role: 'Sales Executive', status: 'Active', lastLogin: 'Yesterday', avatar: 'RK' },
  { id: 4, name: 'Amit Verma', email: 'amit@erppro.in', role: 'Sales Executive', status: 'Active', lastLogin: 'Today, 8:45 AM', avatar: 'AV' },
  { id: 5, name: 'Sunita Patel', email: 'sunita@erppro.in', role: 'Accounts', status: 'Active', lastLogin: 'Yesterday', avatar: 'SP' },
  { id: 6, name: 'Dev Kumar', email: 'dev@erppro.in', role: 'Support Agent', status: 'Inactive', lastLogin: '3 days ago', avatar: 'DK' },
];

const modules = ['Dashboard', 'WhatsApp', 'CRM', 'Tasks', 'Payments', 'Finance', 'Reports', 'Roles'];

const permissionMatrix = {
  'Super Admin': { Dashboard: true, WhatsApp: true, CRM: true, Tasks: true, Payments: true, Finance: true, Reports: true, Roles: true },
  'Manager':     { Dashboard: true, WhatsApp: true, CRM: true, Tasks: true, Payments: true, Finance: true, Reports: true, Roles: false },
  'Sales Executive': { Dashboard: true, WhatsApp: true, CRM: true, Tasks: true, Payments: false, Finance: false, Reports: true, Roles: false },
  'Accounts':    { Dashboard: true, WhatsApp: false, CRM: false, Tasks: false, Payments: true, Finance: true, Reports: true, Roles: false },
  'Support Agent': { Dashboard: true, WhatsApp: true, CRM: true, Tasks: true, Payments: false, Finance: false, Reports: false, Roles: false },
};

const Roles = () => {
  const [showAddUser, setShowAddUser] = useState(false);
  const [activeTab, setActiveTab] = useState('users');

  return (
    <div className="page-container animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Roles & User Access</h1>
          <p className="page-subtitle">Manage team members, roles, and module-level permissions.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary"><Shield size={15} /> Manage Roles</button>
          <button className="btn btn-primary" onClick={() => setShowAddUser(true)}><Plus size={15} /> Add User</button>
        </div>
      </div>

      {/* Role Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        {roles.map(role => (
          <div key={role.id} className="glass-card p-6" style={{ textAlign: 'center', '--card-accent': role.color }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', background: role.color + '22',
              border: `2px solid ${role.color}`, display: 'flex', alignItems: 'center',
              justifyContent: 'center', margin: '0 auto 0.75rem', color: role.color
            }}>
              <Shield size={20} />
            </div>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: '0.25rem' }}>{role.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{role.users} users</div>
            <button className="btn btn-secondary btn-sm" style={{ width: '100%' }}><Edit2 size={12} /> Edit Role</button>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border-color)' }}>
        {['users', 'permissions'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="btn"
            style={{
              borderRadius: 0, background: 'transparent',
              borderBottom: activeTab === tab ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: activeTab === tab ? 'var(--accent-primary)' : 'var(--text-muted)',
              padding: '0.75rem 1.25rem', fontWeight: activeTab === tab ? 600 : 400,
              transition: 'all 0.2s ease', marginBottom: -1
            }}
          >
            {tab === 'users' ? 'Team Members' : 'Permission Matrix'}
          </button>
        ))}
      </div>

      {/* Users Table */}
      {activeTab === 'users' && (
        <div className="glass-card table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const roleObj = roles.find(r => r.name === u.role);
                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div className="mini-avatar" style={{ width: 36, height: 36, fontSize: '0.7rem' }}>{u.avatar}</div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{u.name}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge" style={{ background: (roleObj?.color || 'var(--accent-primary)') + '22', color: roleObj?.color || 'var(--accent-primary)' }}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span className={`status-dot ${u.status === 'Active' ? 'online' : 'offline'}`} />
                        <span style={{ fontSize: '0.82rem' }}>{u.status}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{u.lastLogin}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button className="btn-icon"><Edit2 size={14} /></button>
                        {u.id !== 1 && <button className="btn-icon" style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Permission Matrix */}
      {activeTab === 'permissions' && (
        <div className="glass-card table-container">
          <table className="permission-matrix">
            <thead>
              <tr>
                <th>Module / Role</th>
                {roles.map(r => (
                  <th key={r.id} style={{ color: r.color }}>{r.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map(mod => (
                <tr key={mod}>
                  <td>{mod}</td>
                  {roles.map(r => {
                    const has = permissionMatrix[r.name]?.[mod];
                    return (
                      <td key={r.id}>
                        {has
                          ? <span className="perm-check" title="Access granted">✓</span>
                          : <span className="perm-cross" title="No access">✗</span>
                        }
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add User Modal */}
      {showAddUser && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowAddUser(false)}>
              <X size={20} />
            </button>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>Add Team Member</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>First Name *</label>
                  <input type="text" className="input-field" placeholder="John" />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Last Name *</label>
                  <input type="text" className="input-field" placeholder="Doe" />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Email *</label>
                <input type="email" className="input-field" placeholder="john@company.com" />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Assign Role *</label>
                <select className="input-field">
                  {roles.map(r => <option key={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Phone</label>
                <input type="text" className="input-field" placeholder="+91 XXXXX XXXXX" />
              </div>
              <div style={{ padding: '0.65rem', background: 'var(--success-bg)', borderRadius: 'var(--radius-md)', fontSize: '0.78rem', color: 'var(--success)' }}>
                📧 An invitation email with login credentials will be sent to the user.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={() => setShowAddUser(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={() => setShowAddUser(false)}>Send Invite</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Roles;
