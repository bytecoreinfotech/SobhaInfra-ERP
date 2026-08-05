import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const AuthContext = createContext(null);

// Demo credentials — always work regardless of Supabase config
// These are the quick-login users for showing the demo to clients
const DEMO_USERS = {
  'admin@erppro.in':   { password: 'demo1234', role: 'Super Admin',     name: 'Admin User',    avatar: 'AU' },
  'manager@erppro.in': { password: 'demo1234', role: 'Manager',         name: 'Priya Sharma',  avatar: 'PS' },
  'sales@erppro.in':   { password: 'demo1234', role: 'Sales Executive', name: 'Rajesh Kumar',  avatar: 'RK' },
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for persisted demo session first (always, even when Supabase is configured)
    const demoSession = localStorage.getItem('erm-demo-user');
    if (demoSession) {
      setUser(JSON.parse(demoSession));
      setLoading(false);
      return;
    }

    if (isSupabaseConfigured) {
      // Check for real Supabase session
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setUser({ ...session.user, name: session.user.email, role: 'User', avatar: session.user.email?.slice(0,2).toUpperCase() });
        }
        setLoading(false);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user && !localStorage.getItem('erm-demo-user')) {
          setUser({ ...session.user, name: session.user.email, role: 'User', avatar: session.user.email?.slice(0,2).toUpperCase() });
        } else if (!session) {
          setUser(null);
        }
      });
      return () => subscription.unsubscribe();
    } else {
      setLoading(false);
    }
  }, []);

  const signIn = async (email, password) => {
    // 1. Always check demo credentials first (instant, no network call)
    const demoUser = DEMO_USERS[email.toLowerCase()];
    if (demoUser && demoUser.password === password) {
      const mockUser = { id: 'demo-' + email, email, ...demoUser, isDemo: true };
      localStorage.setItem('erm-demo-user', JSON.stringify(mockUser));
      setUser(mockUser);
      return { data: mockUser, error: null };
    }

    // 2. Try real Supabase auth for production users
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (data?.user) {
        setUser({ ...data.user, name: data.user.email, role: 'User', avatar: data.user.email?.slice(0,2).toUpperCase() });
      }
      return { data, error };
    }

    return { data: null, error: { message: 'Invalid email or password.' } };
  };

  const signOut = async () => {
    localStorage.removeItem('erm-demo-user');
    if (isSupabaseConfigured && !user?.isDemo) {
      await supabase.auth.signOut();
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, isDemo: !!user?.isDemo }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
