import React, { useState } from 'react';
import {
  X, User, Mail, Shield, Lock, Eye, EyeOff,
  CheckCircle2, AlertTriangle, Pencil, Key, LogOut, RefreshCw
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

// Role color map
const roleColors = {
  'Super Admin':     { bg: 'rgba(239,68,68,0.15)',    color: '#ef4444',  icon: '👑' },
  'Manager':         { bg: 'rgba(99,102,241,0.15)',   color: '#6366f1',  icon: '🎯' },
  'Sales Executive': { bg: 'rgba(16,185,129,0.15)',   color: '#10b981',  icon: '💼' },
  'Accounts':        { bg: 'rgba(245,158,11,0.15)',   color: '#f59e0b',  icon: '🧾' },
  'Support Agent':   { bg: 'rgba(14,165,233,0.15)',   color: '#0ea5e9',  icon: '🎧' },
  'Field Agent':     { bg: 'rgba(168,85,247,0.15)',   color: '#a855f7',  icon: '📍' },
};

const ProfileModal = ({ onClose }) => {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'password'

  // Password change state
  const [oldPassword, setOldPassword]         = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld]                 = useState(false);
  const [showNew, setShowNew]                 = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [pwLoading, setPwLoading]             = useState(false);
  const [pwError, setPwError]                 = useState('');
  const [pwSuccess, setPwSuccess]             = useState(false);

  // Profile edit state
  const [displayName, setDisplayName]       = useState(user?.name || '');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError]     = useState('');
  const [profileSuccess, setProfileSuccess] = useState(false);

  const roleConf = roleColors[user?.role] || roleColors['Sales Executive'];

  // Password strength checker
  const getStrength = (pw) => {
    if (!pw) return { level: 0, label: '', color: '' };
    let score = 0;
    if (pw.length >= 6) score++;
    if (pw.length >= 10) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 1) return { level: 1, label: 'Weak', color: '#ef4444' };
    if (score <= 3) return { level: 2, label: 'Fair', color: '#f59e0b' };
    return { level: 3, label: 'Strong', color: '#10b981' };
  };
  const strength = getStrength(newPassword);

  // Change Password handler
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess(false);

    if (!oldPassword) return setPwError('Please enter your current password.');
    if (!newPassword) return setPwError('Please enter a new password.');
    if (newPassword.length < 6) return setPwError('New password must be at least 6 characters.');
    if (newPassword !== confirmPassword) return setPwError('New passwords do not match.');
    if (newPassword === oldPassword) return setPwError('New password must be different from your current password.');

    setPwLoading(true);
    try {
      if (!isSupabaseConfigured) {
        if (oldPassword !== 'demo1234') {
          setPwError('Current password is incorrect. (Demo: use demo1234)');
          setPwLoading(false);
          return;
        }
        setPwSuccess(true);
        setOldPassword(''); setNewPassword(''); setConfirmPassword('');
        setPwLoading(false);
        return;
      }

      // 1. Fetch user's stored password from DB
      const { data: dbUser, error: fetchErr } = await supabase
        .from('users')
        .select('id, password_hash')
        .eq('id', user.id)
        .maybeSingle();

      if (fetchErr || !dbUser) {
        setPwError('Could not verify identity. Please try again.');
        setPwLoading(false);
        return;
      }

      // 2. Verify old password — supports plaintext passwords stored in DB
      const storedPw = dbUser.password_hash || 'demo1234';
      if (storedPw !== oldPassword) {
        setPwError('Current password is incorrect.');
        setPwLoading(false);
        return;
      }

      // 3. Update password in Supabase users table
      const { error: updateErr } = await supabase
        .from('users')
        .update({ password_hash: newPassword, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (updateErr) {
        setPwError('Failed to update password: ' + updateErr.message);
        setPwLoading(false);
        return;
      }

      setPwSuccess(true);
      setOldPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      setPwError(err.message || 'An error occurred. Please try again.');
    }
    setPwLoading(false);
  };

  // Update Display Name handler
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess(false);
    if (!displayName.trim()) return setProfileError('Name cannot be empty.');

    setProfileLoading(true);
    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase
          .from('users')
          .update({ full_name: displayName.trim(), updated_at: new Date().toISOString() })
          .eq('id', user.id);
        if (error) {
          setProfileError('Failed to update profile: ' + error.message);
          setProfileLoading(false);
          return;
        }
      }
      const saved = localStorage.getItem('erm-authenticated-user');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          parsed.name = displayName.trim();
          parsed.avatar = displayName.trim().slice(0, 2).toUpperCase();
          localStorage.setItem('erm-authenticated-user', JSON.stringify(parsed));
        } catch {}
      }
      setProfileSuccess(true);
    } catch (err) {
      setProfileError(err.message || 'Update failed.');
    }
    setProfileLoading(false);
  };

  const switchTab = (tab) => {
    setActiveTab(tab);
    setPwError(''); setPwSuccess(false);
    setProfileError(''); setProfileSuccess(false);
  };

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 10000 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '100%', maxWidth: 520,
        background: 'var(--bg-secondary)',
        borderRadius: 16,
        border: '1px solid var(--border-color)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        overflow: 'hidden',
        animation: 'slideUp 0.25s ease',
      }}>

        {/* Header Banner */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(139,92,246,0.15) 100%)',
          padding: '1.75rem 1.75rem 1rem 1.75rem',
          position: 'relative',
          borderBottom: '1px solid var(--border-color)',
        }}>
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: 12, right: 12,
              background: 'rgba(255,255,255,0.08)', border: 'none',
              borderRadius: 8, cursor: 'pointer', color: 'var(--text-muted)',
              width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent-primary), #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.35rem', fontWeight: 800, color: 'white',
              boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
              flexShrink: 0,
              border: '3px solid rgba(255,255,255,0.15)',
            }}>
              {user?.avatar || user?.name?.slice(0,2)?.toUpperCase() || 'AU'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.3rem' }}>
                {user?.name || 'User'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.6rem',
                  borderRadius: 20, background: roleConf.bg, color: roleConf.color,
                }}>
                  {roleConf.icon} {user?.role || 'User'}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.email}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.25rem', marginTop: '1.25rem' }}>
            {[
              { id: 'profile', icon: <User size={13} />, label: 'My Profile' },
              { id: 'password', icon: <Key size={13} />, label: 'Change Password' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                  padding: '0.4rem 0.9rem', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: '0.8rem', fontWeight: 600,
                  background: activeTab === tab.id ? 'var(--accent-primary)' : 'rgba(255,255,255,0.06)',
                  color: activeTab === tab.id ? 'white' : 'var(--text-secondary)',
                  transition: 'all 0.2s',
                }}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div style={{ padding: '1.5rem 1.75rem' }}>

          {/* === MY PROFILE TAB === */}
          {activeTab === 'profile' && (
            <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {[
                  { icon: <Mail size={13} />, label: 'Email Address', value: user?.email, mono: true },
                  { icon: <Shield size={13} />, label: 'Role', value: user?.role },
                  { icon: <User size={13} />, label: 'User ID', value: (user?.id || '').slice(0, 8) + '...', mono: true },
                  { icon: <CheckCircle2 size={13} />, label: 'Account Status', value: 'Active ✓', color: 'var(--success)' },
                ].map((item, i) => (
                  <div key={i} style={{
                    padding: '0.7rem 0.85rem',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 10, border: '1px solid var(--border-color)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                      {item.icon} {item.label}
                    </div>
                    <div style={{
                      fontSize: '0.82rem', fontWeight: 600,
                      fontFamily: item.mono ? 'monospace' : undefined,
                      color: item.color || 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.4rem' }}>
                  Display Name
                </label>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>
                    <Pencil size={14} />
                  </div>
                  <input
                    type="text"
                    className="input-field"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Your full name"
                    style={{ paddingLeft: '2.2rem' }}
                  />
                </div>
              </div>

              {profileError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 0.85rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, fontSize: '0.8rem', color: '#ef4444' }}>
                  <AlertTriangle size={14} /> {profileError}
                </div>
              )}
              {profileSuccess && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 0.85rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 8, fontSize: '0.8rem', color: '#10b981' }}>
                  <CheckCircle2 size={14} /> Profile updated! Refresh the page to see your new name in the header.
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="submit" className="btn btn-primary" disabled={profileLoading} style={{ flex: 1, justifyContent: 'center' }}>
                  {profileLoading
                    ? <><RefreshCw size={14} className="animate-spin" /> Saving...</>
                    : <><CheckCircle2 size={14} /> Save Profile</>}
                </button>
                <button
                  type="button"
                  onClick={signOut}
                  className="btn btn-secondary"
                  style={{ color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <LogOut size={14} /> Sign Out
                </button>
              </div>
            </form>
          )}

          {/* === CHANGE PASSWORD TAB === */}
          {activeTab === 'password' && (
            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{
                padding: '0.7rem 0.9rem',
                background: 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: 10, fontSize: '0.78rem', color: 'var(--text-secondary)',
                display: 'flex', alignItems: 'flex-start', gap: '0.5rem'
              }}>
                <Shield size={15} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  Enter your <strong>current password</strong> to verify your identity, then choose a new secure password.
                  {!isSupabaseConfigured && <span style={{ color: 'var(--warning)' }}> (Demo: current password is <code>demo1234</code>)</span>}
                </span>
              </div>

              {/* Current Password */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.4rem' }}>
                  Current Password *
                </label>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>
                    <Lock size={14} />
                  </div>
                  <input
                    type={showOld ? 'text' : 'password'}
                    className="input-field"
                    placeholder="Enter your current password"
                    value={oldPassword}
                    onChange={e => setOldPassword(e.target.value)}
                    autoComplete="current-password"
                    style={{ paddingLeft: '2.2rem', paddingRight: '2.5rem' }}
                  />
                  <button type="button" onClick={() => setShowOld(p => !p)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                    {showOld ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.4rem' }}>
                  New Password *
                </label>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>
                    <Key size={14} />
                  </div>
                  <input
                    type={showNew ? 'text' : 'password'}
                    className="input-field"
                    placeholder="Minimum 6 characters"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    style={{ paddingLeft: '2.2rem', paddingRight: '2.5rem' }}
                  />
                  <button type="button" onClick={() => setShowNew(p => !p)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                    {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>

                {newPassword && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: 4, marginBottom: '0.25rem' }}>
                      {[1, 2, 3].map(i => (
                        <div key={i} style={{
                          flex: 1, height: 4, borderRadius: 2,
                          background: i <= strength.level ? strength.color : 'var(--bg-tertiary)',
                          transition: 'background 0.3s',
                        }} />
                      ))}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: strength.color, fontWeight: 600 }}>
                      {strength.label} password
                      {strength.level < 3 && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · Add uppercase, numbers &amp; symbols</span>}
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.4rem' }}>
                  Confirm New Password *
                </label>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>
                    <Key size={14} />
                  </div>
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    className="input-field"
                    placeholder="Re-enter your new password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    style={{
                      paddingLeft: '2.2rem', paddingRight: '2.5rem',
                      borderColor: confirmPassword && confirmPassword !== newPassword ? '#ef4444' : undefined,
                    }}
                  />
                  <button type="button" onClick={() => setShowConfirm(p => !p)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {confirmPassword && newPassword && (
                  <div style={{ fontSize: '0.7rem', marginTop: '0.3rem', color: confirmPassword === newPassword ? '#10b981' : '#ef4444' }}>
                    {confirmPassword === newPassword ? '✓ Passwords match' : '✕ Passwords do not match'}
                  </div>
                )}
              </div>

              {pwError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 0.85rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, fontSize: '0.8rem', color: '#ef4444' }}>
                  <AlertTriangle size={14} /> {pwError}
                </div>
              )}
              {pwSuccess && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: '0.85rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 10, fontSize: '0.82rem', color: '#10b981' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}>
                    <CheckCircle2 size={16} /> Password Changed Successfully!
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Your new password is now active. Use it on your next login.
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={pwLoading || pwSuccess}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {pwLoading
                  ? <><RefreshCw size={14} className="animate-spin" /> Verifying &amp; Updating...</>
                  : pwSuccess
                  ? <><CheckCircle2 size={14} /> Password Updated!</>
                  : <><Key size={14} /> Update Password</>}
              </button>

              <div style={{
                fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center',
                padding: '0.5rem', background: 'var(--bg-tertiary)', borderRadius: 8
              }}>
                🔒 Gmail OTP verification coming soon for extra security
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;
