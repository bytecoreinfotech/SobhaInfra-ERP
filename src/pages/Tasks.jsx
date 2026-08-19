import React, { useState, useEffect } from 'react';
import {
  CheckSquare, Clock, AlertCircle, CheckCircle2,
  Plus, Search, Filter, Calendar, List, Columns, X, RefreshCw
} from 'lucide-react';
import { getTasks, createTask, updateTask } from '../lib/db';
import './Pages.css';

const priorityColors = { High: 'var(--danger)', Medium: 'var(--warning)', Low: 'var(--success)' };
const colColors = { 'To Do': 'var(--text-muted)', 'In Progress': 'var(--warning)', 'Under Review': 'var(--accent-primary)', 'Done': 'var(--success)' };
const COLUMNS = ['To Do', 'In Progress', 'Under Review', 'Done'];
const EMPTY_TASK = { title: '', description: '', status: 'To Do', priority: 'Medium', due_date: '', tags: [] };

const Tasks = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('kanban');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_TASK);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => { loadTasks(); }, []);

  const loadTasks = async () => {
    setLoading(true);
    const { data } = await getTasks();
    setTasks(data || []);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const { data } = await createTask(form);
    if (data) setTasks(prev => [data, ...prev]);
    setSaving(false);
    setShowAdd(false);
    setForm(EMPTY_TASK);
  };

  const moveTask = async (task, newStatus) => {
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    await updateTask(task.id, { status: newStatus });
  };

  const tasksByCol = (col) => tasks.filter(t => t.status === col && (!search || t.title.toLowerCase().includes(search.toLowerCase())));
  const filteredFlat = tasks.filter(t => !search || t.title.toLowerCase().includes(search.toLowerCase()));

  const statusBadge = { 'To Do': 'badge-neutral', 'In Progress': 'badge-warning', 'Under Review': 'badge-accent', 'Done': 'badge-success' };

  return (
    <div className="page-container animate-fade-in">
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Task Management</h1>
          <p className="page-subtitle">Track team productivity, assignments & deadlines.</p>
        </div>
        <div className="page-actions">
          <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            {[{ id: 'kanban', icon: <Columns size={14} />, label: 'Board' }, { id: 'list', icon: <List size={14} />, label: 'List' }].map(v => (
              <button key={v.id} onClick={() => setView(v.id)} className="btn" style={{ borderRadius: 0, background: view === v.id ? 'var(--accent-primary)' : 'var(--bg-tertiary)', color: view === v.id ? 'white' : 'var(--text-secondary)', padding: '0.4rem 0.875rem' }}>
                {v.icon} {v.label}
              </button>
            ))}
          </div>
          <button className="btn btn-secondary" onClick={loadTasks}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={15} /> Create Task</button>
        </div>
      </div>

      {/* Search */}
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <div className="input-group" style={{ maxWidth: 300 }}>
          <Search size={15} className="input-icon" />
          <input type="text" className="input-field" placeholder="Search tasks..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><RefreshCw size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
      ) : (
        <>
          {/* Kanban Board */}
          {view === 'kanban' && (
            <div className="kanban-board">
              {COLUMNS.map(col => (
                <div key={col} className="kanban-col">
                  <div className="kanban-col-header">
                    <span className="kanban-col-title" style={{ color: colColors[col] }}>{col}</span>
                    <span className="kanban-count">{tasksByCol(col).length}</span>
                  </div>
                  <div className="kanban-cards">
                    {tasksByCol(col).map(task => (
                      <div key={task.id} className="kanban-card">
                        <div className="kanban-card-title">{task.title}</div>
                        {task.tags?.length > 0 && (
                          <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                            {task.tags.map(tag => <span key={tag} className="badge badge-neutral" style={{ fontSize: '0.62rem' }}>{tag}</span>)}
                          </div>
                        )}
                        <div className="kanban-card-meta">
                          {task.due_date && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              <Calendar size={11} /> {new Date(task.due_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                            </div>
                          )}
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: priorityColors[task.priority] }}>{task.priority}</span>
                        </div>
                        {/* Quick move buttons */}
                        <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                          {COLUMNS.filter(c => c !== col).map(c => (
                            <button key={c} onClick={() => moveTask(task, c)} className="btn btn-secondary btn-sm" style={{ fontSize: '0.6rem', padding: '0.15rem 0.4rem' }}>→ {c}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                    <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center', borderStyle: 'dashed' }} onClick={() => { setForm({ ...EMPTY_TASK, status: col }); setShowAdd(true); }}>
                      <Plus size={13} /> Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* List View */}
          {view === 'list' && (
            <div className="glass-card table-container">
              <table className="data-table">
                <thead>
                  <tr><th>Task</th><th>Status</th><th>Priority</th><th>Due Date</th><th>Tags</th></tr>
                </thead>
                <tbody>
                  {filteredFlat.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>No tasks found</td></tr>}
                  {filteredFlat.map(task => (
                    <tr key={task.id}>
                      <td style={{ fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {task.status === 'Done' ? <CheckCircle2 size={16} style={{ color: 'var(--success)', flexShrink: 0 }} /> : <Clock size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                          <span style={{ textDecoration: task.status === 'Done' ? 'line-through' : 'none', opacity: task.status === 'Done' ? 0.6 : 1 }}>{task.title}</span>
                        </div>
                      </td>
                      <td><span className={`badge ${statusBadge[task.status]}`}>{task.status}</span></td>
                      <td><span style={{ fontSize: '0.8rem', fontWeight: 600, color: priorityColors[task.priority], display: 'flex', alignItems: 'center', gap: '0.25rem' }}>{task.priority === 'High' && <AlertCircle size={13} />}{task.priority}</span></td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {task.due_date ? <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Calendar size={13} />{new Date(task.due_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</div> : '—'}
                      </td>
                      <td><div style={{ display: 'flex', gap: '0.25rem' }}>{task.tags?.map(tag => <span key={tag} className="badge badge-neutral">{tag}</span>)}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Create Task Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div className="modal-content animate-fade-in">
            <button className="modal-close-btn" onClick={() => setShowAdd(false)} title="Close Modal (Esc)" aria-label="Close">
              <X size={18} />
            </button>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem', paddingRight: '2.5rem' }}>Create New Task</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Task Title *</label>
                <input type="text" className="input-field" placeholder="Describe the task clearly..." value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Status</label>
                  <select className="input-field" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                    {COLUMNS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Priority</label>
                  <select className="input-field" value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                    <option>High</option><option>Medium</option><option>Low</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Due Date</label>
                <input type="date" className="input-field" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Description</label>
                <textarea className="input-field textarea-field" rows="2" placeholder="Add details..." value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !form.title.trim()}>
                  {saving ? 'Saving...' : 'Create Task'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tasks;
