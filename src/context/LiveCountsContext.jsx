/**
 * LiveCountsContext — Global live badge counts for sidebar navigation
 * Polls real data every 30 seconds from the backend.
 * Counts:
 *  - whatsapp: unread WhatsApp conversations (from Supabase)
 *  - leads: new/uncontacted leads (from Supabase)
 *  - tasks: open tasks (from Supabase)
 *  - payments: overdue invoices (from Supabase)
 *  - notifications: unread system notifications
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const LiveCountsContext = createContext({
  whatsapp: 0,
  leads: 0,
  tasks: 0,
  payments: 0,
  notifications: [],
  refresh: () => {},
});

export function LiveCountsProvider({ children }) {
  const [counts, setCounts] = useState({ whatsapp: 0, leads: 0, tasks: 0, payments: 0 });
  const [notifications, setNotifications] = useState([]);

  const fetchCounts = useCallback(async () => {
    if (!isSupabaseConfigured) return;

    try {
      const [waRes, leadsRes, tasksRes, paymentsRes] = await Promise.allSettled([
        // Unread WhatsApp conversations
        supabase.from('whatsapp_conversations').select('id', { count: 'exact', head: true }).gt('unread_count', 0),
        // New / Hot leads not yet contacted
        supabase.from('leads').select('id', { count: 'exact', head: true }).in('status', ['New', 'Hot']),
        // Open tasks
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        // Overdue invoices
        supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('status', 'Overdue'),
      ]);

      const wa       = waRes.status === 'fulfilled'       ? (waRes.value.count       || 0) : 0;
      const leads    = leadsRes.status === 'fulfilled'    ? (leadsRes.value.count    || 0) : 0;
      const tasks    = tasksRes.status === 'fulfilled'    ? (tasksRes.value.count    || 0) : 0;
      const payments = paymentsRes.status === 'fulfilled' ? (paymentsRes.value.count || 0) : 0;

      setCounts({ whatsapp: wa, leads, tasks, payments });

      // Build live notifications from real data
      const liveNotifs = [];
      if (wa > 0)       liveNotifs.push({ id: 'wa',  type: 'whatsapp',  title: `${wa} unread WhatsApp conversation${wa > 1 ? 's' : ''}`, time: 'Live', unread: true });
      if (leads > 0)    liveNotifs.push({ id: 'ld',  type: 'lead',      title: `${leads} new/hot lead${leads > 1 ? 's' : ''} awaiting contact`, time: 'Live', unread: true });
      if (payments > 0) liveNotifs.push({ id: 'pay', type: 'payment',   title: `${payments} overdue invoice${payments > 1 ? 's' : ''} need attention`, time: 'Live', unread: true });
      setNotifications(liveNotifs);
    } catch {
      // Silently fail — don't break the app if Supabase has a hiccup
    }
  }, []);

  useEffect(() => {
    fetchCounts();
    const interval = setInterval(fetchCounts, 30_000); // refresh every 30 seconds
    return () => clearInterval(interval);
  }, [fetchCounts]);

  return (
    <LiveCountsContext.Provider value={{ ...counts, notifications, refresh: fetchCounts }}>
      {children}
    </LiveCountsContext.Provider>
  );
}

export function useLiveCounts() {
  return useContext(LiveCountsContext);
}
