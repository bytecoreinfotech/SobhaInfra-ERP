import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Building2, Eye, EyeOff, ArrowRight, MessageCircle } from 'lucide-react';

const demoCredentials = [
  { role: 'Super Admin', email: 'admin@erppro.in', password: 'demo1234', name: 'Admin User', badge: 'danger' },
  { role: 'Manager', email: 'manager@erppro.in', password: 'demo1234', name: 'Priya Sharma', badge: 'accent' },
  { role: 'Field Employee / Agent', email: 'field@erppro.in', password: 'demo1234', name: 'Anand Sharma', badge: 'warning' },
  { role: 'Sales Executive', email: 'sales@erppro.in', password: 'demo1234', name: 'Rajesh Kumar', badge: 'success' },
  { role: 'Accounts & Billing', email: 'accounts@erppro.in', password: 'demo1234', name: 'Sunita Patel', badge: 'neutral' },
];

const Login = () => {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await signIn(email, password);
    if (err) setError(err.message);
    setLoading(false);
  };

  const quickLogin = async (cred) => {
    setError('');
    setLoading(true);
    const { error: err } = await signIn(cred.email, cred.password);
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

      <div style={{ width: '100%', maxWidth: 440 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            marginBottom: '1rem', boxShadow: '0 0 40px rgba(99,102,241,0.4)'
          }}>
            <Building2 size={30} color="white" />
          </div>
          <h1 style={{ color: 'white', fontSize: '1.75rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
            ERP<span style={{ color: '#6366f1' }}>Pro</span>
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.35rem' }}>
            Real Estate Business Platform
          </p>
        </div>

        {/* Login Card */}
        <div style={{
          background: 'rgba(17,24,39,0.8)',
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
                placeholder="you@company.com"
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
                padding: '0.65rem 1rem', borderRadius: 8,
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                color: '#f87171', fontSize: '0.82rem'
              }}>
                ⚠ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '0.85rem', borderRadius: 10,
                background: loading ? '#374151' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                border: 'none', color: 'white', fontSize: '0.95rem', fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                transition: 'all 0.2s', boxShadow: loading ? 'none' : '0 4px 15px rgba(99,102,241,0.4)'
              }}
            >
              {loading ? 'Signing in...' : <><span>Sign In</span><ArrowRight size={16} /></>}
            </button>
          </form>

          {/* Demo Credentials */}
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1.5rem' }}>
            <p style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              🎯 Demo Quick Login
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {demoCredentials.map(cred => (
                <button
                  key={cred.email}
                  onClick={() => quickLogin(cred)}
                  disabled={loading}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.65rem 0.875rem', borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                    cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                >
                  <div>
                    <div style={{ color: 'white', fontSize: '0.82rem', fontWeight: 600 }}>{cred.role} <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: '0.75rem' }}>({cred.name})</span></div>
                    <div style={{ color: '#64748b', fontSize: '0.72rem' }}>{cred.email} · {cred.password}</div>
                  </div>
                  <ArrowRight size={14} color="#6366f1" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <p style={{ textAlign: 'center', color: '#374151', fontSize: '0.75rem', marginTop: '1.5rem' }}>
          Demo Mode · No real data is stored or transmitted
        </p>
      </div>
    </div>
  );
};

export default Login;
