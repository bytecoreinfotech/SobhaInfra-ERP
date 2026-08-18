import React, { useState, useEffect } from 'react';
import {
  Zap, Play, Pause, Plus, RefreshCw, Trash2, CheckCircle2,
  XCircle, Clock, AlertTriangle, Search, X, ChevronRight,
  Send, CheckSquare, Users, Bell, ArrowRight, ToggleLeft, ToggleRight
} from 'lucide-react';
import {
  getAutomationRules, createAutomationRule, toggleAutomationRule,
  deleteAutomationRule, getAutomationRuns, executeAutomation
} from '../lib/db';
import './Pages.css';

const TRIGGER_EVENTS = [
  { value: 'lead.qualified_hot', label: 'Lead Qualified as HOT', icon: '🔥' },
  { value: 'lead.created', label: 'New Lead Created', icon: '👤' },
  { value: 'tally.invoice_overdue_7d', label: 'Invoice Overdue 7+ Days', icon: '⏰' },
  { value: 'tally.invoice_overdue_30d', label: 'Invoice Overdue 30+ Days', icon: '🚨' },
  { value: 'ai.handoff_requested', label: 'AI Requests Human Handoff', icon: '🤖' },
  { value: 'campaign.reply_received', label: 'Campaign Reply Received', icon: '💬' },
  { value: 'deal.stage_changed', label: 'Deal Stage Changed', icon: '📊' },
  { value: 'tally.payment_received', label: 'Payment Received in Tally', icon: '✅' },
];

const ACTION_TYPES = [
  { value: 'create_task', label: 'Create CRM Task', icon: <CheckSquare size={14} /> },
  { value: 'send_whatsapp', label: 'Send WhatsApp Message', icon: <Send size={14} /> },
  { value: 'update_lead_status', label: 'Update Lead Score/Status', icon: <Users size={14} /> },
  { value: 'notify_salesperson', label: 'Notify Salesperson', icon: <Bell size={14} /> },
];

const statusBadge = { success: 'badge-success', failed: 'badge-danger', retrying: 'badge-warning' };

const Automations = () => {
  const [activeTab, setActiveTab] = useState('rules'); // 'rules' | 'create' | 'history'

  // Rules State
  const [rules, setRules] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState(null);
  const [executingId, setExecutingId] = useState(null);
  const [toast, setToast] = useState(null);

  // Create Rule State
  const [form, setForm] = useState({
    name: '',
    description: '',
    trigger_event: 'lead.qualified_hot',
    conditions: [],
    actions: [{ action: 'create_task', params: { title: '', priority: 'High', assigned_to: 'Rajesh Kumar' } }],
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [rulesRes, runsRes] = await Promise.all([
      getAutomationRules(),
      getAutomationRuns(),
    ]);
    setRules(rulesRes.data || []);
    setRuns(runsRes.data || []);
    setLoading(false);
  };

  const handleToggle = async (rule) => {
    setTogglingId(rule.id);
    await toggleAutomationRule(rule.id, !rule.is_active);
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r));
    setTogglingId(null);
  };

  const handleDelete = async (ruleId) => {
    await deleteAutomationRule(ruleId);
    setRules(prev => prev.filter(r => r.id !== ruleId));
  };

  const handleExecuteNow = async (ruleId) => {
    setExecutingId(ruleId);
    const { data } = await executeAutomation(ruleId);
    setExecutingId(null);
    if (data) {
      setToast(`Rule executed successfully! ${data.actions_executed?.length || 0} actions performed.`);
      setTimeout(() => setToast(null), 4000);
      loadData();
    }
  };

  const handleCreateRule = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.trigger_event) return;
    setSaving(true);
    const { data } = await createAutomationRule(form);
    if (data) {
      setRules(prev => [data, ...prev]);
      setForm({
        name: '', description: '', trigger_event: 'lead.qualified_hot',
        conditions: [],
        actions: [{ action: 'create_task', params: { title: '', priority: 'High', assigned_to: 'Rajesh Kumar' } }],
      });
      setActiveTab('rules');
      setToast('Automation rule created successfully!');
      setTimeout(() => setToast(null), 3000);
    }
    setSaving(false);
  };

  const addAction = () => {
    setForm(prev => ({
      ...prev,
      actions: [...prev.actions, { action: 'send_whatsapp', params: { template: 'default', message: '' } }],
    }));
  };

  const removeAction = (idx) => {
    setForm(prev => ({ ...prev, actions: prev.actions.filter((_, i) => i !== idx) }));
  };

  const updateAction = (idx, key, val) => {
    setForm(prev => ({
      ...prev,
      actions: prev.actions.map((a, i) => i === idx ? { ...a, [key]: val } : a),
    }));
  };

  const activeRulesCount = rules.filter(r => r.is_active).length;
  const successRuns = runs.filter(r => r.status === 'success').length;
  const failedRuns = runs.filter(r => r.status === 'failed').length;

  return (
    <div className="page-container animate-fade-in">
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 9999, background: 'var(--success)', color: 'white', padding: '0.75rem 1.25rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
          <CheckCircle2 size={16} /> {toast}
        </div>
      )}

      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Automation Rules & Engine</h1>
          <p className="page-subtitle">WHEN event → IF conditions → THEN actions. Automate follow-ups, payment reminders, and lead scoring.</p>
        </div>
        <div className="page-actions">
          <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <button className="btn" onClick={() => setActiveTab('rules')}
              style={{ borderRadius: 0, background: activeTab === 'rules' ? 'var(--accent-primary)' : 'var(--bg-tertiary)', color: activeTab === 'rules' ? 'white' : 'var(--text-secondary)', padding: '0.45rem 1rem' }}>
              <Zap size={15} /> Active Rules ({activeRulesCount})
            </button>
            <button className="btn" onClick={() => setActiveTab('create')}
              style={{ borderRadius: 0, background: activeTab === 'create' ? 'var(--accent-primary)' : 'var(--bg-tertiary)', color: activeTab === 'create' ? 'white' : 'var(--text-secondary)', padding: '0.45rem 1rem' }}>
              <Plus size={15} /> Create Rule
            </button>
            <button className="btn" onClick={() => setActiveTab('history')}
              style={{ borderRadius: 0, background: activeTab === 'history' ? 'var(--accent-primary)' : 'var(--bg-tertiary)', color: activeTab === 'history' ? 'white' : 'var(--text-secondary)', padding: '0.45rem 1rem' }}>
              <Clock size={15} /> Execution History ({runs.length})
            </button>
          </div>
          <button className="btn btn-secondary" onClick={loadData}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── KPI Summary ─────────────────────────────────────────────── */}
      <div className="stats-grid">
        {[
          { label: 'Total Rules', value: rules.length, icon: <Zap size={20} />, color: 'var(--accent-primary)', bg: 'var(--accent-glow)' },
          { label: 'Active Rules', value: activeRulesCount, icon: <Play size={20} />, color: 'var(--success)', bg: 'var(--success-bg)' },
          { label: 'Successful Runs', value: successRuns, icon: <CheckCircle2 size={20} />, color: 'var(--whatsapp)', bg: 'var(--whatsapp-bg)' },
          { label: 'Failed Runs', value: failedRuns, icon: <XCircle size={20} />, color: 'var(--danger)', bg: 'var(--danger-bg)' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ '--card-accent': s.color }}>
            <div className="stat-header">
              <div>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{ fontSize: '1.55rem' }}>{s.value}</div>
              </div>
              <div className="stat-icon" style={{ background: s.bg, color: s.color }}>{s.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          TAB 1: ACTIVE AUTOMATION RULES
         ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'rules' && (
        <div className="glass-card table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Rule Name</th>
                <th>Trigger Event</th>
                <th>Actions Chain</th>
                <th>Last Triggered</th>
                <th>Controls</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '3rem' }}><RefreshCw size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></td></tr>
              ) : rules.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No automation rules configured. Create one using the "Create Rule" tab.</td></tr>
              ) : (
                rules.map(rule => (
                  <tr key={rule.id}>
                    <td>
                      <button
                        onClick={() => handleToggle(rule)}
                        disabled={togglingId === rule.id}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      >
                        {rule.is_active
                          ? <ToggleRight size={28} color="var(--success)" />
                          : <ToggleLeft size={28} color="var(--text-muted)" />
                        }
                      </button>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{rule.name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {rule.description}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-neutral" style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>
                        {TRIGGER_EVENTS.find(t => t.value === rule.trigger_event)?.icon || '⚡'}{' '}
                        {rule.trigger_event}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                        {(rule.actions || []).map((a, i) => (
                          <span key={i} className="badge" style={{ fontSize: '0.65rem', background: 'rgba(99,102,241,0.1)', color: 'var(--accent-primary)', border: '1px solid rgba(99,102,241,0.2)' }}>
                            {ACTION_TYPES.find(at => at.value === a.action)?.label || a.action}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {rule.last_triggered_at ? new Date(rule.last_triggered_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ fontSize: '0.68rem', padding: '0.2rem 0.5rem' }}
                          onClick={() => handleExecuteNow(rule.id)}
                          disabled={executingId === rule.id || !rule.is_active}
                        >
                          {executingId === rule.id ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
                          {executingId === rule.id ? 'Running...' : 'Run Now'}
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.68rem', padding: '0.2rem 0.4rem', color: 'var(--danger)' }}
                          onClick={() => handleDelete(rule.id)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB 2: CREATE / EDIT RULE
         ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'create' && (
        <div className="glass-card" style={{ padding: '2rem', maxWidth: 700 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Zap size={18} color="var(--accent-primary)" /> Create Automation Rule
          </h2>
          <form onSubmit={handleCreateRule} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Rule Name */}
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Rule Name *</label>
              <input type="text" className="input-field" placeholder="e.g. Hot Lead → Auto Follow-Up Task" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
            </div>

            {/* Description */}
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Description</label>
              <textarea className="input-field textarea-field" rows={2} placeholder="What does this rule do..." value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>

            {/* Trigger Event */}
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                WHEN (Trigger Event) *
              </label>
              <select className="input-field" value={form.trigger_event} onChange={e => setForm(p => ({ ...p, trigger_event: e.target.value }))}>
                {TRIGGER_EVENTS.map(t => (
                  <option key={t.value} value={t.value}>{t.icon} {t.label} ({t.value})</option>
                ))}
              </select>
            </div>

            {/* Actions Chain */}
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>
                THEN (Action Chain) *
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {form.actions.map((action, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--accent-secondary)', background: 'rgba(139,92,246,0.1)', padding: '0.15rem 0.4rem', borderRadius: 4 }}>
                          Action {idx + 1}
                        </span>
                        <select className="input-field" style={{ flex: 1, fontSize: '0.78rem' }} value={action.action} onChange={e => updateAction(idx, 'action', e.target.value)}>
                          {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                        </select>
                      </div>
                    </div>
                    {form.actions.length > 1 && (
                      <button type="button" onClick={() => removeAction(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', marginTop: '0.15rem' }}>
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" className="btn btn-secondary btn-sm" onClick={addAction} style={{ alignSelf: 'flex-start' }}>
                  <Plus size={13} /> Add Another Action
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setActiveTab('rules')}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving || !form.name.trim()}>
                <Zap size={15} /> {saving ? 'Creating...' : 'Create Automation Rule'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB 3: EXECUTION HISTORY
         ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'history' && (
        <div className="glass-card table-container">
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="section-title">Automation Execution Audit Log</span>
            <button className="btn btn-secondary btn-sm" onClick={loadData}><RefreshCw size={13} /> Refresh</button>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Rule</th>
                <th>Trigger Event</th>
                <th>Status</th>
                <th>Actions Executed</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>No automation runs logged yet.</td></tr>
              ) : (
                runs.map(run => (
                  <tr key={run.id}>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(run.created_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ fontWeight: 600, fontSize: '0.82rem' }}>{run.rule_name}</td>
                    <td>
                      <span className="badge badge-neutral" style={{ fontFamily: 'monospace', fontSize: '0.68rem' }}>
                        {run.trigger_event}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${statusBadge[run.status] || 'badge-neutral'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        {run.status === 'success' ? <CheckCircle2 size={12} /> : run.status === 'failed' ? <XCircle size={12} /> : <Clock size={12} />}
                        {run.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                        {(run.actions_executed || []).map((a, i) => (
                          <div key={i} style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                            → {a.result}
                          </div>
                        ))}
                        {run.error_message && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--danger)' }}>
                            ✗ {run.error_message}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {run.execution_duration_ms}ms
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Automations;
