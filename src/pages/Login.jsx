import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Building2, Eye, EyeOff, ArrowRight, Database, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';

const Login = () => {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Database connectivity status
  const [dbStatus, setDbStatus] = useState('checking'); // 'checking' | 'seeded' | 'not_seeded' | 'disconnected'
  const [checkingDb, setCheckingDb] = useState(false);

  const checkDatabaseStatus = async () => {
    if (!isSupabaseConfigured) {
      setDbStatus('disconnected');
      return;
    }
    setCheckingDb(true);
    try {
      const { data, error: err } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true });
      if (err || data === null) {
        setDbStatus('not_seeded');
      } else {
        setDbStatus('seeded');
      }
    } catch {
      setDbStatus('not_seeded');
    } finally {
      setCheckingDb(false);
    }
  };

  useEffect(() => {
    checkDatabaseStatus();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (dbStatus === 'not_seeded') {
      setError('Database is not seeded in Supabase yet. Please run the setup SQL in your Supabase SQL Editor.');
      return;
    }
    setLoading(true);
    const { error: err } = await signIn(email, password);
    if (err) setError(err.message);
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0b0d1a 0%, #111827 50%, #0f1629 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem', fontFamily: 'Outfit, Inter, sans-serif'
    }}>
      {/* Background glow effects */}
      <div style={{
        position: 'fixed', top: '15%', left: '10%',
        width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'fixed', bottom: '10%', right: '8%',
        width: 300, height: 300, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />

      <div style={{ width: '100%', maxWidth: 460 }}>
        {/* Logo Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 60, height: 60, borderRadius: 16,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            marginBottom: '0.85rem', boxShadow: '0 0 40px rgba(99,102,241,0.4)'
          }}>
            <Building2 size={28} color="white" />
          </div>
          <h1 style={{ color: 'white', fontSize: '1.75rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
            SobhaInfra <span style={{ color: '#6366f1' }}>ERP</span>
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.35rem' }}>
            Enterprise Real Estate & Infrastructure Management Suite
          </p>
        </div>

        {/* Database Status Alert Banner */}
        {dbStatus === 'not_seeded' && (
          <div style={{
            marginBottom: '1.25rem',
            padding: '1rem',
            borderRadius: 14,
            background: 'rgba(234, 88, 12, 0.12)',
            border: '1px solid rgba(234, 88, 12, 0.35)',
            backdropFilter: 'blur(10px)',
            color: '#fdba74',
            fontSize: '0.82rem',
            lineHeight: 1.5
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: '#fb923c', marginBottom: '0.35rem' }}>
              <AlertTriangle size={17} />
              <span>Database Setup Required</span>
            </div>
            <div>
              Supabase is connected, but database tables & accounts are not seeded yet.
              Please run <strong>supabase/combined_complete_setup.sql</strong> in your <strong>Supabase SQL Editor</strong>.
            </div>
            <button
              onClick={checkDatabaseStatus}
              disabled={checkingDb}
              style={{
                marginTop: '0.65rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.35rem 0.75rem',
                borderRadius: 8,
                background: 'rgba(234, 88, 12, 0.25)',
                border: '1px solid rgba(234, 88, 12, 0.4)',
                color: '#ffedd5',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: checkingDb ? 'not-allowed' : 'pointer'
              }}
            >
              <RefreshCw size={12} className={checkingDb ? 'spin-anim' : ''} />
              {checkingDb ? 'Checking Supabase...' : 'Re-check Database Status'}
            </button>
          </div>
        )}

          {dbStatus === 'seeded' && (
            <div style={{
              marginBottom: '1.25rem',
              padding: '0.6rem 0.9rem',
              borderRadius: 12,
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: '#6ee7b7',
              fontSize: '0.78rem',
              fontWeight: 600
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <CheckCircle2 size={15} color="#10b981" />
                <span>System Online · Enter your credentials to sign in</span>
              </div>
              <button
                onClick={checkDatabaseStatus}
                disabled={checkingDb}
                style={{
                  background: 'none', border: 'none', color: '#a7f3d0', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.72rem'
                }}
                title="Refresh"
              >
                <RefreshCw size={11} className={checkingDb ? 'spin-anim' : ''} />
              </button>
            </div>
          )}

        {/* Login Card */}
        <div style={{
          background: 'rgba(17,24,39,0.85)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20, padding: '2rem',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 25px 50px rgba(0,0,0,0.4)'
        }}>
          <h2 style={{ color: 'white', fontSize: '1.15rem', fontWeight: 700, marginBottom: '1.5rem' }}>
            Sign in to your workspace
          </h2>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                style={{
                  width: '100%', padding: '0.75rem 1rem', borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  color: 'white', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color 0.2s'
                }}
                onFocus={e => e.target.style.borderColor = '#6366f1'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{
                    width: '100%', padding: '0.75rem 2.8rem 0.75rem 1rem', borderRadius: 10,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'white', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={e => e.target.style.borderColor = '#6366f1'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  style={{
                    position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                padding: '0.75rem 1rem', borderRadius: 10,
                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                color: '#f87171', fontSize: '0.82rem', lineHeight: 1.4
              }}>
                ⚠ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || dbStatus === 'not_seeded'}
              style={{
                width: '100%', padding: '0.85rem', borderRadius: 10,
                background: (loading || dbStatus === 'not_seeded') ? '#374151' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                border: 'none', color: 'white', fontSize: '0.95rem', fontWeight: 700,
                cursor: (loading || dbStatus === 'not_seeded') ? 'not-allowed' : 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                transition: 'all 0.2s', boxShadow: (loading || dbStatus === 'not_seeded') ? 'none' : '0 4px 15px rgba(99,102,241,0.4)',
                opacity: dbStatus === 'not_seeded' ? 0.6 : 1
              }}
            >
              {loading ? 'Authenticating with Supabase...' : (
                dbStatus === 'not_seeded' ? 'Database Not Seeded' : (
                  <><span>Sign In</span><ArrowRight size={16} /></>
                )
              )}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: '#475569', fontSize: '0.75rem', marginTop: '1.25rem' }}>
          Sobha Infratech ERP · Secured Access · Multi-Tenant RBAC
        </p>
      </div>
    </div>
  );
};

export default Login;
