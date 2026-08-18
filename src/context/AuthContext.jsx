import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { DEFAULT_ORG_ID, logAuditEvent } from '../lib/db';

const AuthContext = createContext(null);

// Demo credentials with explicit permission sets
const DEMO_USERS = {
  'admin@erppro.in': {
    password: 'demo1234',
    role: 'Super Admin',
    name: 'Admin User',
    avatar: 'AU',
    organization_id: DEFAULT_ORG_ID,
    permissions: ['all'],
  },
  'manager@erppro.in': {
    password: 'demo1234',
    role: 'Manager',
    name: 'Priya Sharma',
    avatar: 'PS',
    organization_id: DEFAULT_ORG_ID,
    permissions: ['dashboard:view', 'whatsapp:view', 'whatsapp:send', 'whatsapp:campaign', 'crm:read', 'crm:write', 'crm:assign', 'tasks:read', 'tasks:write', 'finance:read', 'finance:remind', 'ai:view'],
  },
  'sales@erppro.in': {
    password: 'demo1234',
    role: 'Sales Executive',
    name: 'Rajesh Kumar',
    avatar: 'RK',
    organization_id: DEFAULT_ORG_ID,
    permissions: ['dashboard:view', 'whatsapp:view', 'whatsapp:send', 'crm:read', 'crm:write', 'tasks:read', 'tasks:write', 'ai:view'],
  },
  'accounts@erppro.in': {
    password: 'demo1234',
    role: 'Accounts',
    name: 'Sunita Patel',
    avatar: 'SP',
    organization_id: DEFAULT_ORG_ID,
    permissions: ['dashboard:view', 'finance:read', 'finance:sync', 'finance:remind', 'crm:read', 'tasks:read'],
  },
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check for persisted demo session first
    const demoSession = localStorage.getItem('erm-demo-user');
    if (demoSession) {
      try {
        setUser(JSON.parse(demoSession));
        setLoading(false);
        return;
      } catch (e) {
        localStorage.removeItem('erm-demo-user');
      }
    }

    // 2. Check for real Supabase Auth session if configured
    if (isSupabaseConfigured) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          hydrateSupabaseUser(session.user);
        }
        setLoading(false);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user && !localStorage.getItem('erm-demo-user')) {
          hydrateSupabaseUser(session.user);
        } else if (!session && !localStorage.getItem('erm-demo-user')) {
          setUser(null);
        }
      });
      return () => subscription.unsubscribe();
    } else {
      setLoading(false);
    }
  }, []);

  const hydrateSupabaseUser = async (authUser) => {
    try {
      const { data: profile } = await supabase
        .from('users')
        .select('*, user_roles(role:roles(name, color, permissions:role_permissions(permission:permissions(code))))')
        .eq('id', authUser.id)
        .maybeSingle();

      const userRole = profile?.user_roles?.[0]?.role?.name || 'User';
      const perms = profile?.user_roles?.[0]?.role?.permissions?.map(p => p.permission?.code) || [];

      setUser({
        id: authUser.id,
        email: authUser.email,
        name: profile?.full_name || authUser.email,
        role: userRole,
        avatar: (profile?.full_name || authUser.email).slice(0, 2).toUpperCase(),
        organization_id: profile?.organization_id || DEFAULT_ORG_ID,
        permissions: perms,
        isDemo: false,
      });
    } catch (e) {
      console.warn('Could not hydrate user profile from DB:', e.message);
      setUser({
        id: authUser.id,
        email: authUser.email,
        name: authUser.email,
        role: 'User',
        avatar: authUser.email.slice(0, 2).toUpperCase(),
        organization_id: DEFAULT_ORG_ID,
        permissions: ['dashboard:view', 'crm:read'],
        isDemo: false,
      });
    }
  };

  const signIn = async (email, password) => {
    const cleanEmail = (email || '').trim().toLowerCase();

    // 1. Instant check for demo accounts
    const demoUser = DEMO_USERS[cleanEmail];
    if (demoUser && demoUser.password === password) {
      const mockUser = {
        id: 'demo-' + cleanEmail,
        email: cleanEmail,
        ...demoUser,
        isDemo: true,
      };
      localStorage.setItem('erm-demo-user', JSON.stringify(mockUser));
      setUser(mockUser);
      logAuditEvent('user.login', 'auth', mockUser.id, { method: 'demo_auth', email: cleanEmail });
      return { data: mockUser, error: null };
    }

    // 2. Real Supabase Auth
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (data?.user) {
        await hydrateSupabaseUser(data.user);
        logAuditEvent('user.login', 'auth', data.user.id, { method: 'supabase_auth', email: cleanEmail });
      }
      return { data, error };
    }

    return { data: null, error: { message: 'Invalid credentials. For demo, use admin@erppro.in / demo1234.' } };
  };

  const signOut = async () => {
    if (user?.id) {
      logAuditEvent('user.logout', 'auth', user.id);
    }
    localStorage.removeItem('erm-demo-user');
    if (isSupabaseConfigured && !user?.isDemo) {
      await supabase.auth.signOut();
    }
    setUser(null);
  };

  const hasPermission = (permissionCode) => {
    if (!user) return false;
    if (user.role === 'Super Admin' || user.permissions?.includes('all')) return true;
    return user.permissions?.includes(permissionCode) || false;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signOut,
        hasPermission,
        isDemo: !!user?.isDemo,
        organizationId: user?.organization_id || DEFAULT_ORG_ID,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
