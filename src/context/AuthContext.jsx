import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { DEFAULT_ORG_ID, logAuditEvent, getPermissionMatrix } from '../lib/db';

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
    permissions: ['dashboard:view', 'whatsapp:view', 'whatsapp:send', 'whatsapp:campaign', 'crm:read', 'crm:write', 'crm:assign', 'tasks:read', 'tasks:write', 'tasks:create', 'tasks:assign', 'tasks:complete', 'finance:read', 'finance:remind', 'ai:view', 'field:view'],
  },
  'sales@erppro.in': {
    password: 'demo1234',
    role: 'Sales Executive',
    name: 'Rajesh Kumar',
    avatar: 'RK',
    organization_id: DEFAULT_ORG_ID,
    permissions: ['dashboard:view', 'whatsapp:view', 'whatsapp:send', 'crm:read', 'crm:write', 'tasks:read', 'tasks:update_own', 'ai:view', 'field:view', 'field:checkin'],
  },
  'field@erppro.in': {
    password: 'demo1234',
    role: 'Sales Executive',
    name: 'Anand Sharma',
    avatar: 'AS',
    organization_id: DEFAULT_ORG_ID,
    permissions: ['dashboard:view', 'field:view', 'field:checkin', 'tasks:read', 'tasks:update_own', 'crm:read'],
  },
  'accounts@erppro.in': {
    password: 'demo1234',
    role: 'Accounts',
    name: 'Sunita Patel',
    avatar: 'SP',
    organization_id: DEFAULT_ORG_ID,
    permissions: ['dashboard:view', 'finance:read', 'finance:sync', 'finance:remind', 'crm:read', 'tasks:read'],
  },
  'vikram@erppro.in': {
    password: 'demo1234',
    role: 'Sales Executive',
    name: 'Vikram Singh',
    avatar: 'VS',
    organization_id: DEFAULT_ORG_ID,
    permissions: ['dashboard:view', 'field:view', 'field:checkin', 'tasks:read', 'tasks:update_own', 'crm:read', 'whatsapp:view'],
  },
  'deepak@erppro.in': {
    password: 'demo1234',
    role: 'Manager',
    name: 'Deepak Verma',
    avatar: 'DV',
    organization_id: DEFAULT_ORG_ID,
    permissions: ['dashboard:view', 'whatsapp:view', 'whatsapp:send', 'crm:read', 'crm:write', 'tasks:read', 'tasks:write', 'tasks:create', 'tasks:assign', 'tasks:complete', 'finance:read', 'field:view'],
  },
  'neha@erppro.in': {
    password: 'demo1234',
    role: 'Support Agent',
    name: 'Neha Gupta',
    avatar: 'NG',
    organization_id: DEFAULT_ORG_ID,
    permissions: ['dashboard:view', 'whatsapp:view', 'whatsapp:send', 'crm:read', 'tasks:read', 'tasks:update_own'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// ACTION-LEVEL PERMISSION MAP PER ROLE
// ─────────────────────────────────────────────────────────────────────────────
const ROLE_ACTION_MAP = {
  'Super Admin': {
    'tasks:create': true, 'tasks:assign': true, 'tasks:complete': true, 'tasks:delete': true,
    'tasks:view_all': true, 'tasks:manage_templates': true, 'tasks:view_analytics': true,
    'field:checkin': true, 'field:view_all': true, 'field:approve': true,
    'roles:manage': true, 'settings:manage': true,
  },
  'Manager': {
    'tasks:create': true, 'tasks:assign': true, 'tasks:complete': true, 'tasks:delete': false,
    'tasks:view_all': true, 'tasks:manage_templates': false, 'tasks:view_analytics': true,
    'field:checkin': false, 'field:view_all': true, 'field:approve': true,
    'roles:manage': false, 'settings:manage': false,
  },
  'Sales Executive': {
    'tasks:create': false, 'tasks:assign': false, 'tasks:complete': false, 'tasks:delete': false,
    'tasks:view_all': false, 'tasks:manage_templates': false, 'tasks:view_analytics': false,
    'field:checkin': true, 'field:view_all': false, 'field:approve': false,
    'roles:manage': false, 'settings:manage': false,
  },
  'Accounts': {
    'tasks:create': false, 'tasks:assign': false, 'tasks:complete': false, 'tasks:delete': false,
    'tasks:view_all': false, 'tasks:manage_templates': false, 'tasks:view_analytics': false,
    'field:checkin': false, 'field:view_all': false, 'field:approve': false,
    'roles:manage': false, 'settings:manage': false,
  },
  'Support Agent': {
    'tasks:create': false, 'tasks:assign': false, 'tasks:complete': false, 'tasks:delete': false,
    'tasks:view_all': false, 'tasks:manage_templates': false, 'tasks:view_analytics': false,
    'field:checkin': false, 'field:view_all': false, 'field:approve': false,
    'roles:manage': false, 'settings:manage': false,
  },
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cachedMatrix, setCachedMatrix] = useState(null);

  // Load permission matrix from Supabase on mount
  useEffect(() => {
    getPermissionMatrix().then(res => {
      if (res.data) setCachedMatrix(res.data);
    });
  }, []);

  useEffect(() => {
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

    if (isSupabaseConfigured) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) hydrateSupabaseUser(session.user);
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

    // 1. Demo accounts
    const demoUser = DEMO_USERS[cleanEmail];
    if (demoUser && (demoUser.password === password || password === 'demo1234')) {
      const mockUser = { id: 'demo-' + cleanEmail, email: cleanEmail, ...demoUser, isDemo: true };
      localStorage.setItem('erm-demo-user', JSON.stringify(mockUser));
      setUser(mockUser);
      logAuditEvent('user.login', 'auth', mockUser.id, { method: 'demo_auth', email: cleanEmail });
      return { data: mockUser, error: null };
    }

    // 2. Invited team members (from Supabase users table)
    try {
      const { getTeamMembers } = await import('../lib/db');
      const { data: members } = await getTeamMembers();
      const invited = (members || []).find(m => (m.email || '').trim().toLowerCase() === cleanEmail);
      if (invited && (password === 'demo1234' || password.length >= 4)) {
        const rolePerms = ROLE_ACTION_MAP[invited.role] || ROLE_ACTION_MAP['Sales Executive'] || {};
        const permList = Object.keys(rolePerms).filter(k => rolePerms[k]);
        const mockInvited = {
          id: invited.id || 'usr-' + Date.now(),
          email: cleanEmail,
          name: invited.full_name,
          role: invited.role || 'Sales Executive',
          avatar: (invited.full_name || 'U').slice(0, 2).toUpperCase(),
          organization_id: DEFAULT_ORG_ID,
          permissions: ['dashboard:view', 'tasks:read', ...permList],
          isDemo: true,
        };
        localStorage.setItem('erm-demo-user', JSON.stringify(mockInvited));
        setUser(mockInvited);
        logAuditEvent('user.login', 'auth', mockInvited.id, { method: 'invited_user_login', email: cleanEmail });
        return { data: mockInvited, error: null };
      }
    } catch {}

    // 3. Supabase Auth
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
    if (user?.id) logAuditEvent('user.logout', 'auth', user.id);
    localStorage.removeItem('erm-demo-user');
    if (isSupabaseConfigured && !user?.isDemo) await supabase.auth.signOut();
    setUser(null);
  };

  // MODULE-LEVEL: controls sidebar and route access
  const hasPermission = (moduleOrPerm) => {
    if (!user) return false;
    if (user.role === 'Super Admin' || user.permissions?.includes('all')) return true;
    if (user.permissions?.includes(moduleOrPerm)) return true;

    // Use cached matrix from Supabase (loaded on mount)
    const defaultMx = {
      'Super Admin': { Dashboard: true, WhatsApp: true, CRM: true, Tasks: true, Payments: true, Finance: true, Reports: true, Roles: true, FieldOps: true },
      'Manager':     { Dashboard: true, WhatsApp: true, CRM: true, Tasks: true, Payments: true, Finance: true, Reports: true, Roles: false, FieldOps: true },
      'Sales Executive': { Dashboard: true, WhatsApp: true, CRM: true, Tasks: true, Payments: false, Finance: false, Reports: false, Roles: false, FieldOps: true },
      'Accounts':    { Dashboard: true, WhatsApp: false, CRM: false, Tasks: false, Payments: true, Finance: true, Reports: true, Roles: false, FieldOps: false },
      'Support Agent': { Dashboard: true, WhatsApp: true, CRM: true, Tasks: true, Payments: false, Finance: false, Reports: false, Roles: false, FieldOps: false },
    };
    const matrixToUse = cachedMatrix || defaultMx;

    const userRoleMatrix = matrixToUse[user.role];
    if (userRoleMatrix && userRoleMatrix[moduleOrPerm] !== undefined) {
      return Boolean(userRoleMatrix[moduleOrPerm]);
    }

    return !['Roles', 'Settings', 'Finance', 'Payments'].includes(moduleOrPerm);
  };

  // ACTION-LEVEL: controls what specific operations a user can do
  const canPerformAction = (actionCode) => {
    if (!user) return false;
    if (user.role === 'Super Admin' || user.permissions?.includes('all')) return true;
    if (user.permissions?.includes(actionCode)) return true;

    const roleActions = ROLE_ACTION_MAP[user.role];
    if (roleActions && roleActions[actionCode] !== undefined) {
      return Boolean(roleActions[actionCode]);
    }
    return false;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signOut,
        hasPermission,
        canPerformAction,
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
