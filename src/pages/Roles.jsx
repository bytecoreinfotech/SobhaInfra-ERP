import React, { useState, useEffect } from 'react';
import { Shield, Plus, X, Edit2, Edit3, Trash2, User, Check, RefreshCw, AlertCircle, Save, RotateCcw, Lock, CheckSquare, Square, ToggleLeft, ToggleRight } from 'lucide-react';
import { getRoles, createRole, updateRole, deleteRole, getTeamMembers, inviteTeamMember, getPermissionMatrix, savePermissionMatrix } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import './Pages.css';

const modules = ['Dashboard', 'WhatsApp', 'CRM', 'Tasks', 'Payments', 'Finance', 'Reports', 'Roles', 'FieldOps'];

const DEFAULT_ROLES = [
  { id: 'role-1', name: 'Super Admin', color: '#ef4444', is_system: true, users_count: 1 },
  { id: 'role-2', name: 'Manager', color: '#6366f1', is_system: true, users_count: 3 },
  { id: 'role-3', name: 'Sales Executive', color: '#10b981', is_system: true, users_count: 8 },
  { id: 'role-4', name: 'Accounts', color: '#f59e0b', is_system: true, users_count: 2 },
  { id: 'role-5', name: 'Support Agent', color: '#06b6d4', is_system: true, users_count: 4 },
];

const defaultMatrix = {
  'Super Admin': { Dashboard: true, WhatsApp: true, CRM: true, Tasks: true, Payments: true, Finance: true, Reports: true, Roles: true, FieldOps: true },
  'Manager':     { Dashboard: true, WhatsApp: true, CRM: true, Tasks: true, Payments: true, Finance: true, Reports: true, Roles: false, FieldOps: true },
  'Sales Executive': { Dashboard: true, WhatsApp: true, CRM: true, Tasks: true, Payments: false, Finance: false, Reports: false, Roles: false, FieldOps: true },
  'Accounts':    { Dashboard: true, WhatsApp: false, CRM: false, Tasks: false, Payments: true, Finance: true, Reports: true, Roles: false, FieldOps: false },
  'Support Agent': { Dashboard: true, WhatsApp: true, CRM: true, Tasks: true, Payments: false, Finance: false, Reports: false, Roles: false, FieldOps: false },
};

const Roles = () => {
  const { hasPermission } = useAuth();
  const [roles, setRoles] = useState(DEFAULT_ROLES);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('users');
  
  // Interactive Permission Matrix state
  const [matrix, setMatrix] = useState({});
  const [matrixDirty, setMatrixDirty] = useState(false);

  // Modals
  const [showAddUser, setShowAddUser] = useState(false);
  const [showAddRole, setShowAddRole] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [editRoleForm, setEditRoleForm] = useState({ name: '', description: '', color: '#6366f1' });
  const [confirmDisableRole, setConfirmDisableRole] = useState(null);
  
  // Forms
  const [userForm, setUserForm] = useState({ full_name: '', email: '', role: 'Sales Executive', phone: '', password: '' });
  const [roleForm, setRoleForm] = useState({ name: '', description: '', color: '#6366f1' });
  const [submitting, setSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [rolesRes, usersRes, matrixRes] = await Promise.all([
      getRoles(),
      getTeamMembers(),
      getPermissionMatrix()
    ]);
    if (rolesRes.data && rolesRes.data.length > 0) {
      setRoles(rolesRes.data);
    } else {
      setRoles(DEFAULT_ROLES);
    }
    setTeamMembers(usersRes.data || []);
    if (matrixRes.data && Object.keys(matrixRes.data).length > 0) {
      setMatrix(matrixRes.data);
    } else {
      setMatrix(defaultMatrix);
    }
    setLoading(false);
  };

  const handleInviteUser = async (e) => {
    e.preventDefault();
    if (!userForm.full_name || !userForm.email) return;
    setSubmitting(true);
    const effectiveRole = userForm.role || roles[0]?.name || 'Sales Executive';
    const initialPassword = userForm.password.trim() || 'demo1234';
    const { data, error } = await inviteTeamMember({
      ...userForm,
      role: effectiveRole,
      password: initialPassword
    });
    if (data) {
      setTeamMembers(prev => [data, ...prev]);
      setShowAddUser(false);
      setUserForm({ full_name: '', email: '', role: 'Sales Executive', phone: '', password: '' });
      setFeedbackMsg({
        type: 'success',
        text: `Invitation sent to ${data.email} as ${effectiveRole}! Initial password: "${initialPassword}".`
      });
      setTimeout(() => setFeedbackMsg(null), 6000);
    } else {
      setFeedbackMsg({ type: 'error', text: error?.message || 'Failed to invite user.' });
    }
    setSubmitting(false);
  };

  const handleCreateRole = async (e) => {
    e.preventDefault();
    if (!roleForm.name) return;
    setSubmitting(true);
    const { data, error } = await createRole(roleForm);
    if (data) {
      setRoles(prev => [...prev, data]);
      // Initialize permissions for new role
      setMatrix(prev => ({
        ...prev,
        [data.name]: { Dashboard: true, WhatsApp: true, CRM: true, Tasks: true, Payments: false, Finance: false, Reports: false, Roles: false, FieldOps: false }
      }));
      setShowAddRole(false);
      setRoleForm({ name: '', description: '', color: '#6366f1' });
      setFeedbackMsg({ type: 'success', text: `Role "${data.name}" created!` });
      setTimeout(() => setFeedbackMsg(null), 4000);
    } else {
      setFeedbackMsg({ type: 'error', text: error?.message || 'Failed to create role.' });
    }
    setSubmitting(false);
  };

  const togglePermission = (roleName, mod) => {
    if (roleName === 'Super Admin') return; // Super admin always has all permissions
    setMatrix(prev => {
      const currentRolePerms = prev[roleName] || defaultMatrix[roleName] || {};
      const currentVal = currentRolePerms[mod] !== undefined ? Boolean(currentRolePerms[mod]) : Boolean(defaultMatrix[roleName]?.[mod]);
      const updated = {
        ...prev,
        [roleName]: {
          ...(defaultMatrix[roleName] || {}),
          ...currentRolePerms,
          [mod]: !currentVal,
        }
      };
      setMatrixDirty(true);
      return updated;
    });
  };

  const savePermissionMatrixHandler = async () => {
    try {
      await savePermissionMatrix(matrix);
      setMatrixDirty(false);
      setFeedbackMsg({ type: 'success', text: 'Permission Matrix saved to cloud successfully!' });
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: 'Failed to save permissions: ' + err.message });
    }
  };

  const resetPermissionMatrix = async () => {
    setMatrix(defaultMatrix);
    setMatrixDirty(true);
    try {
      await savePermissionMatrix(defaultMatrix);
    } catch {}
    setFeedbackMsg({ type: 'success', text: 'Reset permissions to system defaults.' });
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const availableRoles = roles.length > 0 ? roles : DEFAULT_ROLES;

  return (
    <div className="page-container animate-fade-in">

      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Roles & Access Control</h1>
          <p className="page-subtitle">Manage organization team members, roles, and module-level permission checkboxes.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={loadData}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button className="btn btn-secondary" onClick={() => setShowAddRole(true)}>
            <Shield size={15} /> Create Role
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddUser(true)}>
            <Plus size={15} /> Invite Member
          </button>
        </div>
      </div>

      {/* Role Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {availableRoles.map(role => (
          <div key={role.id || role.name} className="glass-card p-6" style={{ textAlign: 'center', '--card-accent': role.color || '#6366f1' }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', background: (role.color || '#6366f1') + '22',
              border: `2px solid ${role.color || '#6366f1'}`, display: 'flex', alignItems: 'center',
              justifyContent: 'center', margin: '0 auto 0.75rem', color: role.color || '#6366f1'
            }}>
              <Shield size={20} />
            </div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.2rem' }}>{role.name}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
              {teamMembers.filter(m => m.role === role.name).length || role.users_count || 0} active members
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
              <span className={`badge ${role.is_system ? 'badge-neutral' : 'badge-accent'}`} style={{ fontSize: '0.65rem' }}>
                {role.is_system ? 'System' : 'Custom'}
              </span>

              {/* Edit Role Pencil Icon */}
              <button
                className="btn-icon"
                style={{ color: 'var(--accent-primary)', padding: '0.15rem' }}
                title="Edit / Rename Position"
                onClick={() => {
                  setEditingRole(role);
                  setEditRoleForm({
                    name: role.name,
                    description: role.description || '',
                    color: role.color || '#6366f1'
                  });
                }}
              >
                <Edit3 size={13} />
              </button>

              {/* Toggle Disable / Enable with Dual Confirmation */}
              {role.name !== 'Super Admin' && (
                <button
                  className="btn-icon"
                  style={{ color: role.is_disabled ? 'var(--text-muted)' : 'var(--success)', padding: '0.15rem' }}
                  title={role.is_disabled ? 'Activate Role' : 'Disable / Pause Role'}
                  onClick={async () => {
                    if (!role.is_disabled) {
                      setConfirmDisableRole(role);
                    } else {
                      await updateRole(role.id, { is_disabled: false });
                      setRoles(prev => prev.map(r => r.id === role.id ? { ...r, is_disabled: false } : r));
                      setFeedbackMsg({ type: 'success', text: `Role "${role.name}" activated!` });
                      setTimeout(() => setFeedbackMsg(null), 3500);
                    }
                  }}
                >
                  {role.is_disabled ? <ToggleLeft size={16} /> : <ToggleRight size={16} />}
                </button>
              )}

              {!role.is_system && role.name !== 'Super Admin' && (
                <button
                  className="btn-icon"
                  style={{ color: 'var(--danger)', padding: '0.15rem' }}
                  title="Delete Custom Role"
                  onClick={async () => {
                    if (!window.confirm(`Delete role "${role.name}"?`)) return;
                    await deleteRole(role.id);
                    setRoles(prev => prev.filter(r => r.id !== role.id));
                    setMatrix(prev => { const copy = { ...prev }; delete copy[role.name]; return copy; });
                    setMatrixDirty(true);
                  }}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '1rem' }}>
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
            {tab === 'users' ? `Team Members (${teamMembers.length})` : 'Permission Matrix'}
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
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}><RefreshCw size={20} className="animate-spin" /></td></tr>
              ) : teamMembers.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '0.75rem' }}>
                      No team members added yet.
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowAddUser(true)}>
                      <Plus size={14} /> Invite First Member
                    </button>
                  </td>
                </tr>
              ) : (
                teamMembers.map(u => {
                  const roleObj = availableRoles.find(r => r.name === u.role);
                  return (
                    <tr key={u.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <div className="mini-avatar" style={{ width: 36, height: 36, fontSize: '0.72rem' }}>{u.avatar || u.full_name?.slice(0, 2).toUpperCase() || 'U'}</div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{u.full_name}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge" style={{ background: (roleObj?.color || '#6366f1') + '22', color: roleObj?.color || '#6366f1' }}>
                          {u.role || 'Member'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span className={`status-dot ${u.is_active ? 'online' : 'offline'}`} />
                          <span style={{ fontSize: '0.82rem' }}>{u.is_active ? 'Active' : 'Inactive'}</span>
                        </div>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{u.last_login_at || 'Never'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button className="btn-icon" title="Edit Permissions" onClick={() => setActiveTab('permissions')}><Edit2 size={14} /></button>
                          {u.role !== 'Super Admin' && (
                            <button
                              className="btn-icon"
                              style={{ color: 'var(--danger)' }}
                              title="Remove Member"
                              onClick={() => setTeamMembers(p => p.filter(m => m.id !== u.id))}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Permission Matrix (Interactive Checkboxes) */}
      {activeTab === 'permissions' && (
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>Interactive Role Permission Matrix</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Click any checkbox to grant or restrict access to modules for each role.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-secondary btn-sm" onClick={resetPermissionMatrix} style={{ fontSize: '0.75rem' }}>
                <RotateCcw size={13} /> Reset Defaults
              </button>
              <button className="btn btn-primary btn-sm" onClick={savePermissionMatrixHandler} style={{ fontSize: '0.75rem' }}>
                <Save size={13} /> Save Permissions {matrixDirty && '●'}
              </button>
            </div>
          </div>

          <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: 8, overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', textAlign: 'center' }}>
              <thead>
                <tr style={{ background: 'var(--bg-tertiary)' }}>
                  <th style={{ textAlign: 'left', minWidth: 150, padding: '0.75rem 1rem' }}>Module / Action</th>
                  {availableRoles.map(r => {
                    const isRoleDisabled = Boolean(r.is_disabled);
                    return (
                      <th key={r.id || r.name} style={{ padding: '0.75rem 0.5rem', minWidth: 110, opacity: isRoleDisabled ? 0.65 : 1 }}>
                        <div style={{ color: isRoleDisabled ? 'var(--text-muted)' : (r.color || 'var(--accent-primary)'), fontWeight: 700, fontSize: '0.82rem' }}>
                          {r.name}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: isRoleDisabled ? 'var(--warning)' : 'var(--text-muted)', fontWeight: 400 }}>
                          {isRoleDisabled ? '[PAUSED]' : (r.name === 'Super Admin' ? '(Full Access)' : '(Customizable)')}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {modules.map(mod => (
                  <tr key={mod} className="hover-row">
                    <td style={{ textAlign: 'left', fontWeight: 600, padding: '0.65rem 1rem', fontSize: '0.85rem' }}>
                      {mod}
                    </td>
                    {availableRoles.map(r => {
                      const isSuperAdmin = r.name === 'Super Admin';
                      const currentRolePerms = matrix[r.name] || defaultMatrix[r.name] || {};
                      const hasAccess = isSuperAdmin || (currentRolePerms[mod] !== undefined ? Boolean(currentRolePerms[mod]) : Boolean(defaultMatrix[r.name]?.[mod]));
                      return (
                        <td
                          key={r.id || r.name}
                          onClick={() => {
                            if (!isSuperAdmin) togglePermission(r.name, mod);
                          }}
                          style={{
                            cursor: isSuperAdmin ? 'default' : 'pointer',
                            padding: '0.65rem 0.5rem',
                            transition: 'background 0.15s',
                          }}
                        >
                          {isSuperAdmin ? (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                              background: 'rgba(16,185,129,0.12)', color: 'var(--success)',
                              padding: '0.25rem 0.55rem', borderRadius: 4, fontSize: '0.72rem', fontWeight: 700
                            }}>
                              <Lock size={11} /> Always
                            </span>
                          ) : (
                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                              <input
                                type="checkbox"
                                checked={hasAccess}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  togglePermission(r.name, mod);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  width: 18, height: 18, cursor: 'pointer',
                                  accentColor: r.color || 'var(--accent-primary)'
                                }}
                              />
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invite Member Modal */}
      {showAddUser && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAddUser(false); }}>
          <div className="modal-content animate-fade-in" style={{ maxWidth: 500 }}>
            <button className="modal-close-btn" onClick={() => setShowAddUser(false)} title="Close Modal (Esc)" aria-label="Close">
              <X size={18} />
            </button>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '1.25rem', paddingRight: '2.5rem' }}>
              Invite Team Member
            </h2>
            <form onSubmit={handleInviteUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Full Name *</label>
                <input type="text" className="input-field" placeholder="e.g. Niraj Kumar" value={userForm.full_name} onChange={e => setUserForm(p => ({ ...p, full_name: e.target.value }))} required />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Email Address *</label>
                <input type="email" className="input-field" placeholder="vatsniraj94@gmail.com" value={userForm.email} onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))} required />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Phone Number</label>
                <input type="text" className="input-field" placeholder="+919472697849" value={userForm.phone} onChange={e => setUserForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Assign Role *</label>
                <select
                  className="input-field"
                  value={userForm.role}
                  onChange={e => setUserForm(p => ({ ...p, role: e.target.value }))}
                  required
                >
                  {availableRoles.map(r => (
                    <option key={r.id || r.name} value={r.name}>
                      {r.name} {r.is_system ? '(System)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Initial Login Password</label>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Default: <code>demo1234</code></span>
                </div>
                <input
                  type="text"
                  className="input-field"
                  placeholder="demo1234 (or enter custom password)"
                  value={userForm.password}
                  onChange={e => setUserForm(p => ({ ...p, password: e.target.value }))}
                />
                <div style={{
                  marginTop: '0.45rem',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 6,
                  background: 'rgba(99, 102, 241, 0.08)',
                  border: '1px solid rgba(99, 102, 241, 0.2)',
                  fontSize: '0.72rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.4
                }}>
                  💡 <strong>Default Password:</strong> If left empty, <code>demo1234</code> will be set automatically. The invited member can change their password anytime via <strong>Profile Settings</strong>.
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.75rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddUser(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Sending...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Role Modal */}
      {showAddRole && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAddRole(false); }}>
          <div className="modal-content animate-fade-in" style={{ maxWidth: 500 }}>
            <button className="modal-close-btn" onClick={() => setShowAddRole(false)} title="Close Modal (Esc)" aria-label="Close">
              <X size={18} />
            </button>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '1.25rem', paddingRight: '2.5rem' }}>
              Create Custom Role
            </h2>
            <form onSubmit={handleCreateRole} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Role Name *</label>
                <input type="text" className="input-field" placeholder="e.g. Billing Specialist" value={roleForm.name} onChange={e => setRoleForm(p => ({ ...p, name: e.target.value }))} required />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Description</label>
                <input type="text" className="input-field" placeholder="Brief scope of responsibilities" value={roleForm.description} onChange={e => setRoleForm(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Badge Color</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6'].map(c => (
                    <div
                      key={c}
                      onClick={() => setRoleForm(p => ({ ...p, color: c }))}
                      style={{
                        width: 28, height: 28, borderRadius: '50%', background: c,
                        border: roleForm.color === c ? '3px solid white' : '2px solid transparent',
                        cursor: 'pointer', boxShadow: roleForm.color === c ? '0 0 10px ' + c : 'none'
                      }}
                    />
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.75rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddRole(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      {editingRole && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEditingRole(null); }}>
          <div className="modal-content animate-fade-in" style={{ maxWidth: 450 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Edit Position / Role</h3>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Rename title, change badge color & description</div>
              </div>
              <button className="modal-close-btn" onClick={() => setEditingRole(null)}>✕</button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!editRoleForm.name.trim()) return;
              const oldName = editingRole.name;
              const newName = editRoleForm.name.trim();

              await updateRole(editingRole.id, {
                name: newName,
                description: editRoleForm.description,
                color: editRoleForm.color
              });

              setRoles(prev => prev.map(r => r.id === editingRole.id ? { ...r, ...editRoleForm, name: newName } : r));

              if (oldName !== newName) {
                setMatrix(prev => {
                  const copy = { ...prev };
                  if (copy[oldName]) {
                    copy[newName] = copy[oldName];
                    delete copy[oldName];
                  }
                  return copy;
                });
                setMatrixDirty(true);
              }

              setFeedbackMsg({ type: 'success', text: `Role "${newName}" updated successfully!` });
              setEditingRole(null);
              setTimeout(() => setFeedbackMsg(null), 3000);
            }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Role / Position Title *</label>
                <input
                  type="text"
                  className="input-field"
                  value={editRoleForm.name}
                  onChange={e => setEditRoleForm(p => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Badge Color</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899'].map(c => (
                    <div
                      key={c}
                      onClick={() => setEditRoleForm(p => ({ ...p, color: c }))}
                      style={{
                        width: 26, height: 26, borderRadius: '50%', background: c,
                        border: editRoleForm.color === c ? '3px solid white' : '2px solid transparent',
                        cursor: 'pointer'
                      }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Scope / Description</label>
                <input
                  type="text"
                  className="input-field"
                  value={editRoleForm.description}
                  onChange={e => setEditRoleForm(p => ({ ...p, description: e.target.value }))}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditingRole(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={!editRoleForm.name.trim()}>Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Dual Confirmation Modal: Disable Role */}
      {confirmDisableRole && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setConfirmDisableRole(null); }} style={{ zIndex: 9999 }}>
          <div className="modal-content animate-fade-in" style={{ maxWidth: 440, padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%', background: 'rgba(239,68,68,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)'
              }}>
                <AlertCircle size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Disable Role: {confirmDisableRole.name}?</h3>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Action confirmation</span>
              </div>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              Are you sure you want to temporarily pause the <strong>{confirmDisableRole.name}</strong> role? Active employees assigned to this role will have restricted module access until re-enabled.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmDisableRole(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                style={{ background: 'var(--danger)', color: 'white', borderColor: 'var(--danger)', fontWeight: 700 }}
                onClick={async () => {
                  const targetRole = confirmDisableRole;
                  setConfirmDisableRole(null);
                  await updateRole(targetRole.id, { is_disabled: true });
                  setRoles(prev => prev.map(r => r.id === targetRole.id ? { ...r, is_disabled: true } : r));
                  setFeedbackMsg({ type: 'success', text: `Role "${targetRole.name}" disabled / paused.` });
                  setTimeout(() => setFeedbackMsg(null), 3500);
                }}
              >
                Yes, Disable Role
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Floating Toast (Zero Layout Shift) */}
      {feedbackMsg && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 99999,
          background: 'rgba(15, 23, 42, 0.96)',
          border: `1px solid ${feedbackMsg.type === 'success' ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)'}`,
          boxShadow: '0 15px 35px rgba(0,0,0,0.55), 0 0 20px rgba(16,185,129,0.15)',
          backdropFilter: 'blur(12px)', padding: '0.75rem 1.25rem', borderRadius: 10,
          color: feedbackMsg.type === 'success' ? 'var(--success)' : 'var(--danger)',
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          fontSize: '0.85rem', fontWeight: 600, animation: 'slideUp 0.25s ease'
        }}>
          {feedbackMsg.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          <span>{feedbackMsg.text}</span>
          <button
            onClick={() => setFeedbackMsg(null)}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 0 0 0.4rem', display: 'flex' }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

export default Roles;
