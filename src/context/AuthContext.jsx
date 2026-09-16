import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { DEFAULT_ORG_ID, logAuditEvent, getPermissionMatrix } from '../lib/db';

const AuthContext = createContext(null);

// DEMO_USERS intentionally cleared for production.
// All authentication is handled strictly via the Supabase `users` table.
// Passwords are stored in the `password_hash` column.
const DEMO_USERS = {};

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
  'Showcase Viewer': {
    'tasks:create': false, 'tasks:assign': false, 'tasks:complete': false, 'tasks:delete': false,
    'tasks:view_all': true, 'tasks:manage_templates': false, 'tasks:view_analytics': true,
    'field:checkin': false, 'field:view_all': true, 'field:approve': false,
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
    const initAuth = async () => {
      if (!isSupabaseConfigured) {
        setLoading(false);
        return;
      }

      // Check saved user session
      const saved = localStorage.getItem('erm-authenticated-user') || localStorage.getItem('erm-demo-user');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Verify user still exists in Supabase DB
          const { data: dbUser, error } = await supabase
            .from('users')
            .select('id, full_name, email, role, avatar, organization_id')
            .eq('id', parsed.id)
            .maybeSingle();

          if (!error && dbUser) {
            const rolePerms = ROLE_ACTION_MAP[dbUser.role] || ROLE_ACTION_MAP['Sales Executive'] || {};
            const permList = Object.keys(rolePerms).filter(k => rolePerms[k]);
            const liveUser = {
              id: dbUser.id,
              email: dbUser.email,
              name: dbUser.full_name,
              role: dbUser.role || 'Sales Executive',
              avatar: dbUser.avatar || (dbUser.full_name ? dbUser.full_name.slice(0, 2).toUpperCase() : 'U'),
              organization_id: dbUser.organization_id || DEFAULT_ORG_ID,
              permissions: dbUser.role === 'Super Admin' ? ['all'] : ['dashboard:view', ...permList],
              isDemo: false,
            };
            setUser(liveUser);
            setLoading(false);
            return;
          } else {
            // DB not seeded or user deleted -> clear session
            localStorage.removeItem('erm-authenticated-user');
            localStorage.removeItem('erm-demo-user');
            setUser(null);
          }
        } catch {
          localStorage.removeItem('erm-authenticated-user');
          localStorage.removeItem('erm-demo-user');
          setUser(null);
        }
      }

      // Supabase Auth session fallback
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await hydrateSupabaseUser(session.user);
        }
      } catch {}

      setLoading(false);
    };

    initAuth();
  }, []);

  const hydrateSupabaseUser = async (authUser) => {
    try {
      const { data: profile, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (error || !profile) {
        setUser(null);
        return;
      }

      const userRole = profile.role || 'User';
      const rolePerms = ROLE_ACTION_MAP[userRole] || ROLE_ACTION_MAP['Sales Executive'] || {};
      const permList = Object.keys(rolePerms).filter(k => rolePerms[k]);

      const liveUser = {
        id: authUser.id,
        email: authUser.email,
        name: profile?.full_name || authUser.email,
        role: userRole,
        avatar: profile?.avatar || (profile?.full_name || authUser.email).slice(0, 2).toUpperCase(),
        organization_id: profile?.organization_id || DEFAULT_ORG_ID,
        permissions: userRole === 'Super Admin' ? ['all'] : ['dashboard:view', ...permList],
        isDemo: false,
      };
      localStorage.setItem('erm-authenticated-user', JSON.stringify(liveUser));
      setUser(liveUser);
    } catch (e) {
      console.warn('Could not hydrate user profile from DB:', e.message);
      setUser(null);
    }
  };

  const signIn = async (email, password) => {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) {
      return { data: null, error: { message: 'Please enter your email address.' } };
    }

    if (!isSupabaseConfigured) {
      return {
        data: null,
        error: { message: 'Supabase is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env' }
      };
    }

    // Strictly authenticate against Supabase database public.users table
    try {
      const { data: dbUser, error: dbError } = await supabase
        .from('users')
        .select('*, password_hash')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (dbError) {
        // Table does not exist (database not seeded yet)
        console.error('[Supabase Auth] Table query error:', dbError);
        return {
          data: null,
          error: {
            message: 'Database tables not found in Supabase. Please run supabase/combined_complete_setup.sql in your Supabase SQL Editor first.'
          }
        };
      }

      if (!dbUser) {
        // Check if any users exist in table
        const { data: existingUsers, error: countErr } = await supabase
          .from('users')
          .select('id')
          .limit(1);

        if (!countErr && (!existingUsers || existingUsers.length === 0)) {
          return {
            data: null,
            error: {
              message: 'Database is empty. No user accounts seeded yet. Please run supabase/combined_complete_setup.sql in your Supabase SQL Editor.'
            }
          };
        }

        return {
          data: null,
          error: {
            message: `User with email "${cleanEmail}" was not found in Supabase database.`
          }
        };
      }

      // Check user status
      if (dbUser.is_active === false) {
        return { data: null, error: { message: 'This account has been deactivated.' } };
      }

      // Validate password against stored password_hash column
      // Default password for newly invited or uninitialized users is 'demo1234'
      const storedPassword = dbUser.password_hash || 'demo1234';
      if (storedPassword !== password) {
        return { data: null, error: { message: 'Incorrect password. (Default initial password is demo1234)' } };
      }

      const rolePerms = ROLE_ACTION_MAP[dbUser.role] || ROLE_ACTION_MAP['Sales Executive'] || {};
      const permList = Object.keys(rolePerms).filter(k => rolePerms[k]);

      const authenticatedUser = {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.full_name,
        role: dbUser.role || 'Sales Executive',
        avatar: dbUser.avatar || (dbUser.full_name ? dbUser.full_name.slice(0, 2).toUpperCase() : 'U'),
        organization_id: dbUser.organization_id || DEFAULT_ORG_ID,
        permissions: dbUser.role === 'Super Admin' ? ['all'] : ['dashboard:view', ...permList],
        isDemo: false,
      };

      // Update last login timestamp in Supabase
      try {
        await supabase
          .from('users')
          .update({
            last_login_at: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
          })
          .eq('id', dbUser.id);
      } catch (err) {
        console.warn('Could not update last_login_at in DB:', err.message);
      }

      localStorage.setItem('erm-authenticated-user', JSON.stringify(authenticatedUser));
      setUser(authenticatedUser);
      logAuditEvent('user.login', 'auth', authenticatedUser.id, { method: 'database_auth', email: cleanEmail, role: authenticatedUser.role });
      return { data: authenticatedUser, error: null };
    } catch (err) {
      console.error('[Supabase Auth] Login error:', err);
      return {
        data: null,
        error: { message: err.message || 'Authentication failed. Please verify Supabase setup.' }
      };
    }
  };

  const signOut = async () => {
    if (user?.id) logAuditEvent('user.logout', 'auth', user.id);
    localStorage.removeItem('erm-authenticated-user');
    localStorage.removeItem('erm-demo-user');
    if (isSupabaseConfigured) {
      try { await supabase.auth.signOut(); } catch {}
    }
    setUser(null);
  };

  // MODULE-LEVEL: controls sidebar and route access
  const hasPermission = (moduleOrPerm) => {
    if (!user) return false;
    if (user.role === 'Super Admin' || user.permissions?.includes('all')) return true;
    // Showcase Viewer has read-only access to all modules for full product tour
    if (user.role === 'Showcase Viewer') return true;
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
    // Showcase Viewer is strictly read-only; cannot perform any mutating actions
    if (user.role === 'Showcase Viewer') return false;
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
        isShowcaseGuest: user?.role === 'Showcase Viewer',
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
