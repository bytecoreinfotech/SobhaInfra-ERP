import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const AuthContext = createContext(null);

// Demo users for when Supabase is not configured
const DEMO_USERS = {
  'admin@erppro.in': { password: 'demo1234', role: 'Super Admin', name: 'Admin User', avatar: 'AU' },
  'manager@erppro.in': { password: 'demo1234', role: 'Manager', name: 'Priya Sharma', avatar: 'PS' },
  'sales@erppro.in': { password: 'demo1234', role: 'Sales Executive', name: 'Rajesh Kumar', avatar: 'RK' },
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isSupabaseConfigured) {
      // Real Supabase auth
      supabase.auth.getSession().then(({ data: { session } }) => {
        setUser(session?.user ?? null);
        setLoading(false);
      });
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
      });
      return () => subscription.unsubscribe();
    } else {
      // Demo mode: Check localStorage for a persisted demo session
      const demoSession = localStorage.getItem('erm-demo-user');
      if (demoSession) setUser(JSON.parse(demoSession));
      setLoading(false);
    }
  }, []);

  const signIn = async (email, password) => {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      return { data, error };
    } else {
      // Demo mode login
      const demoUser = DEMO_USERS[email];
      if (demoUser && demoUser.password === password) {
        const mockUser = { id: 'demo-' + email, email, ...demoUser };
        localStorage.setItem('erm-demo-user', JSON.stringify(mockUser));
        setUser(mockUser);
        return { data: mockUser, error: null };
      }
      return { data: null, error: { message: 'Invalid email or password.' } };
    }
  };

  const signOut = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    } else {
      localStorage.removeItem('erm-demo-user');
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, isDemo: !isSupabaseConfigured }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
