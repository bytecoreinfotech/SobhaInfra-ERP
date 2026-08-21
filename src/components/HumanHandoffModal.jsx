import React, { useState } from 'react';
import { X, UserCheck, ShieldAlert, CheckCircle2, User, Clock, AlertCircle } from 'lucide-react';
import { triggerHumanHandoff } from '../lib/db';

const DEFAULT_TEAM = ['Rajesh Kumar', 'Priya Sharma', 'Amit Verma', 'Sunita Patel'];

const HumanHandoffModal = ({ isOpen, onClose, conversation, lead, onHandoffCompleted, teamMembers = DEFAULT_TEAM }) => {
  const activeTeam = teamMembers && teamMembers.length > 0 ? teamMembers : DEFAULT_TEAM;
  const [assignedTo, setAssignedTo] = useState(conversation?.assigned_salesperson || activeTeam[0]);
  const [priority, setPriority] = useState('High');
  const [summary, setSummary] = useState('Customer asking for customized pricing & down-payment discount review.');
  const [taskTitle, setTaskTitle] = useState(`Call ${lead?.name || conversation?.contact_name || 'Customer'} - Price Review & Site Visit`);
  const [createTask, setCreateTask] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen || !conversation) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    await triggerHumanHandoff({
      conversationId: conversation.id,
      leadId: lead?.id || conversation.lead_id || conversation.contact_phone || conversation.id,
      assignedTo,
      priority,
      summary,
      taskTitle: createTask ? taskTitle : '',
    });
    setSubmitting(false);
    if (onHandoffCompleted) onHandoffCompleted(assignedTo);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content animate-fade-in" style={{ maxWidth: 540 }}>
        <button
          className="modal-close-btn"
          onClick={onClose}
          title="Close Modal (Esc)"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <UserCheck size={20} color="var(--accent-primary)" /> Salesperson Takeover & Handoff
          </h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
            Section 23: Pauses AI bot, transfers chat control to sales rep, and logs a high-priority follow-up task.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Target Customer Context */}
          <div style={{ padding: '0.75rem 1rem', background: 'var(--bg-tertiary)', borderRadius: 8, fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700 }}>{conversation.contact_name}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{conversation.contact_phone} · {conversation.property_interest || 'General Product Inquiry'}</div>
            </div>
            <span className="badge badge-warning">AI Will Be Muted</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Assign Salesperson *</label>
              <select className="input-field" value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
                {activeTeam.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Handoff Urgency</label>
              <select className="input-field" value={priority} onChange={e => setPriority(e.target.value)}>
                <option value="Urgent">🔥 Urgent (Within 15 mins)</option>
                <option value="High">⚡ High Priority</option>
                <option value="Normal">Normal</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Context / Reason for Handoff</label>
            <input type="text" className="input-field" value={summary} onChange={e => setSummary(e.target.value)} required />
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.5rem' }}>
              <input type="checkbox" checked={createTask} onChange={e => setCreateTask(e.target.checked)} />
              Auto-generate Follow-Up Task for Salesperson
            </label>
            {createTask && (
              <input type="text" className="input-field" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="Task Title" />
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Transferring...' : 'Confirm Takeover & Mute AI'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default HumanHandoffModal;
