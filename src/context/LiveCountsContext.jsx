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
  takeovers: 0,
  leads: 0,
  tasks: 0,
  payments: 0,
  notifications: [],
  refresh: () => {},
});

export function LiveCountsProvider({ children }) {
  const [counts, setCounts] = useState({ whatsapp: 0, takeovers: 0, leads: 0, tasks: 0, payments: 0 });
  const [notifications, setNotifications] = useState([]);

  const fetchCounts = useCallback(async () => {
    if (!isSupabaseConfigured) return;

    try {
      const [takeoverRes, unreadRes, leadsRes, tasksRes, paymentsRes] = await Promise.allSettled([
        // 1. Pending Human Takeover / Executive Callback requests (Highest Priority Action Item)
        supabase.from('whatsapp_conversations').select('id', { count: 'exact', head: true }).eq('conversation_mode', 'HUMAN TAKEOVER REQUESTED'),
        // 2. Unread Inbound WhatsApp conversations
        supabase.from('whatsapp_conversations').select('id', { count: 'exact', head: true }).gt('unread_count', 0),
        // 3. New / Hot leads not yet contacted
        supabase.from('leads').select('id', { count: 'exact', head: true }).in('status', ['New', 'Hot']),
        // 4. Open tasks (To Do, In Progress, Under Review)
        supabase.from('tasks').select('id', { count: 'exact', head: true }).neq('status', 'Done'),
        // 5. Overdue invoices
        supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('status', 'Overdue'),
      ]);

      const takeovers = takeoverRes.status === 'fulfilled' ? (takeoverRes.value.count || 0) : 0;
      const unreads   = unreadRes.status === 'fulfilled'   ? (unreadRes.value.count   || 0) : 0;
      const leads     = leadsRes.status === 'fulfilled'    ? (leadsRes.value.count    || 0) : 0;
      const tasks     = tasksRes.status === 'fulfilled'    ? (tasksRes.value.count    || 0) : 0;
      const payments  = paymentsRes.status === 'fulfilled' ? (paymentsRes.value.count || 0) : 0;

      // Actionable alert count: prioritize pending takeovers, or unread customer messages
      const actionableWa = takeovers > 0 ? takeovers : unreads;

      setCounts({ whatsapp: actionableWa, takeovers, leads, tasks, payments });

      // Build live notifications from real actionable items
      const liveNotifs = [];
      if (takeovers > 0) liveNotifs.push({ id: 'wa_takeover', type: 'whatsapp', title: `🚨 ${takeovers} customer${takeovers > 1 ? 's' : ''} requested Human Takeover / Rate List!`, time: 'Action Required', unread: true });
      if (unreads > 0 && takeovers === 0) liveNotifs.push({ id: 'wa', type: 'whatsapp', title: `${unreads} unread WhatsApp conversation${unreads > 1 ? 's' : ''}`, time: 'Live', unread: true });
      if (leads > 0)    liveNotifs.push({ id: 'ld',  type: 'lead',      title: `${leads} new/hot lead${leads > 1 ? 's' : ''} awaiting contact`, time: 'Live', unread: true });
      if (payments > 0) liveNotifs.push({ id: 'pay', type: 'payment',   title: `${payments} overdue invoice${payments > 1 ? 's' : ''} need attention`, time: 'Live', unread: true });
      setNotifications(liveNotifs);
    } catch {
      // Silently fail
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
