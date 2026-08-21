import React, { useState, useEffect } from 'react';
import { Shield, Plus, X, Edit2, Trash2, User, Check, RefreshCw, AlertCircle, Save, RotateCcw, Lock, CheckSquare, Square } from 'lucide-react';
import { getRoles, createRole, deleteRole, getTeamMembers, inviteTeamMember, getPermissionMatrix, savePermissionMatrix } from '../lib/db';
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
  
  // Forms
  const [userForm, setUserForm] = useState({ full_name: '', email: '', role: 'Sales Executive', phone: '' });
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
      getPermissionMatrix(),
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
    const { data, error } = await inviteTeamMember({ ...userForm, role: effectiveRole });
    if (data) {
      setTeamMembers(prev => [data, ...prev]);
      setShowAddUser(false);
      setUserForm({ full_name: '', email: '', role: 'Sales Executive', phone: '' });
      setFeedbackMsg({ type: 'success', text: `Invitation sent to ${data.email} as ${effectiveRole}!` });
      setTimeout(() => setFeedbackMsg(null), 4000);
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
      {feedbackMsg && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem',
          background: feedbackMsg.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${feedbackMsg.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
          color: feedbackMsg.type === 'success' ? 'var(--success)' : 'var(--danger)',
          display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem'
        }}>
          {feedbackMsg.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          {feedbackMsg.text}
        </div>
      )}

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span className={`badge ${role.is_system ? 'badge-neutral' : 'badge-accent'}`} style={{ fontSize: '0.65rem' }}>
                {role.is_system ? 'System Role' : 'Custom Role'}
              </span>
              {!role.is_system && (
                <button
                  className="btn-icon"
                  style={{ color: 'var(--danger)', padding: '0.15rem' }}
                  title="Delete Custom Role"
                  onClick={async () => {
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
                  {availableRoles.map(r => (
                    <th key={r.id || r.name} style={{ padding: '0.75rem 0.5rem', minWidth: 110 }}>
                      <div style={{ color: r.color || 'var(--accent-primary)', fontWeight: 700, fontSize: '0.82rem' }}>
                        {r.name}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                        {r.name === 'Super Admin' ? '(Full Access)' : '(Customizable)'}
                      </div>
                    </th>
                  ))}
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
    </div>
  );
};

export default Roles;
