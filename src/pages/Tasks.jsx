import React, { useState, useEffect } from 'react';
import {
  CheckSquare, Clock, AlertCircle, CheckCircle2,
  Plus, Search, Filter, Calendar, List, Columns, X, RefreshCw,
  MessageSquare, Send, User, Tag, Check, ChevronRight, UserCheck
} from 'lucide-react';
import { getTasks, createTask, updateTask, addTaskComment, getTeamMembers } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import './Pages.css';

const priorityColors = { High: 'var(--danger)', Medium: 'var(--warning)', Low: 'var(--success)' };
const colColors = { 'To Do': 'var(--text-muted)', 'In Progress': 'var(--warning)', 'Under Review': 'var(--accent-primary)', 'Done': 'var(--success)' };
const COLUMNS = ['To Do', 'In Progress', 'Under Review', 'Done'];
const EMPTY_TASK = { title: '', description: '', status: 'To Do', priority: 'Medium', due_date: '', tags: [], assigned_to: '' };

const Tasks = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('kanban');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_TASK);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('All');

  // Task Details & Comment Drawer / Modal
  const [selectedTask, setSelectedTask] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [addingComment, setAddingComment] = useState(false);

  useEffect(() => { loadTasks(); }, []);

  const loadTasks = async () => {
    setLoading(true);
    const [taskRes, membersRes] = await Promise.all([
      getTasks(),
      getTeamMembers(),
    ]);
    setTasks(taskRes.data || []);
    setTeamMembers(membersRes.data || []);
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
    if (selectedTask?.id === task.id) {
      setSelectedTask(prev => ({ ...prev, status: newStatus }));
    }
    await updateTask(task.id, { status: newStatus });
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !selectedTask) return;

    setAddingComment(true);
    const authorName = user?.name || 'Team Member';
    const { data: createdComment } = await addTaskComment(selectedTask.id, newComment.trim(), authorName);

    if (createdComment) {
      const updatedComments = [...(selectedTask.comments || []), createdComment];
      
      // Update selected task
      setSelectedTask(prev => ({
        ...prev,
        comments: updatedComments
      }));

      // Update in main tasks state
      setTasks(prev => prev.map(t =>
        t.id === selectedTask.id ? { ...t, comments: updatedComments } : t
      ));

      setNewComment('');
    }
    setAddingComment(false);
  };

  const matchesAssignee = (t) => {
    if (assigneeFilter === 'All') return true;
    if (assigneeFilter === 'My Tasks') {
      const uName = (user?.name || '').toLowerCase();
      return (t.assigned_to || '').toLowerCase().includes(uName);
    }
    return t.assigned_to === assigneeFilter;
  };

  const tasksByCol = (col) => tasks.filter(t => t.status === col && matchesAssignee(t) && (!search || t.title.toLowerCase().includes(search.toLowerCase())));
  const filteredFlat = tasks.filter(t => matchesAssignee(t) && (!search || t.title.toLowerCase().includes(search.toLowerCase())));

  const statusBadge = { 'To Do': 'badge-neutral', 'In Progress': 'badge-warning', 'Under Review': 'badge-accent', 'Done': 'badge-success' };

  return (
    <div className="page-container animate-fade-in">
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Task Management</h1>
          <p className="page-subtitle">Assign daily site visits, client inspections, and track team execution.</p>
        </div>
        <div className="page-actions">
          <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            {[{ id: 'kanban', icon: <Columns size={14} />, label: 'Board' }, { id: 'list', icon: <List size={14} />, label: 'List' }].map(v => (
              <button key={v.id} onClick={() => setView(v.id)} className="btn" style={{ borderRadius: 0, background: view === v.id ? 'var(--accent-primary)' : 'var(--bg-tertiary)', color: view === v.id ? 'white' : 'var(--text-secondary)', padding: '0.4rem 0.875rem' }}>
                {v.icon} {v.label}
              </button>
            ))}
          </div>
          <button className="btn btn-secondary" onClick={loadTasks} title="Refresh tasks"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={15} /> Create Task</button>
        </div>
      </div>

      {/* Search & Assignee Filter Bar */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="input-group" style={{ maxWidth: 280, flex: 1 }}>
          <Search size={15} className="input-icon" />
          <input type="text" className="input-field" placeholder="Search tasks..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <select
            className="input-field"
            style={{ width: 'auto', minWidth: 200, fontSize: '0.8rem', padding: '0.45rem 0.75rem' }}
            value={assigneeFilter}
            onChange={e => setAssigneeFilter(e.target.value)}
          >
            <option value="All">👥 All Team Tasks ({tasks.length})</option>
            {user?.name && <option value="My Tasks">⭐ Assigned to Me ({user.name})</option>}
            {teamMembers.map(m => (
              <option key={m.id} value={m.full_name}>👤 {m.full_name} ({m.role})</option>
            ))}
            {teamMembers.length === 0 && <option value="Anand Sharma">👤 Anand Sharma (Sales Executive)</option>}
          </select>
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
                    {tasksByCol(col).map(task => {
                      const commentsCount = task.comments?.length || 0;
                      return (
                        <div
                          key={task.id}
                          className="kanban-card"
                          onClick={() => setSelectedTask(task)}
                          style={{ cursor: 'pointer', position: 'relative' }}
                        >
                          <div className="kanban-card-title">{task.title}</div>
                          {task.assigned_to && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <User size={11} /> {task.assigned_to}
                            </div>
                          )}
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              {commentsCount > 0 && (
                                <span style={{ fontSize: '0.68rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                  <MessageSquare size={11} /> {commentsCount}
                                </span>
                              )}
                              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: priorityColors[task.priority] }}>{task.priority}</span>
                            </div>
                          </div>
                          {/* Quick move buttons */}
                          <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.5rem', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                            {COLUMNS.filter(c => c !== col).map(c => (
                              <button key={c} onClick={() => moveTask(task, c)} className="btn btn-secondary btn-sm" style={{ fontSize: '0.6rem', padding: '0.15rem 0.4rem' }}>→ {c}</button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
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
                  <tr><th>Task</th><th>Assignee</th><th>Status</th><th>Priority</th><th>Due Date</th><th>Comments</th><th>Tags</th></tr>
                </thead>
                <tbody>
                  {filteredFlat.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>No tasks found</td></tr>}
                  {filteredFlat.map(task => {
                    const commentsCount = task.comments?.length || 0;
                    return (
                      <tr key={task.id} onClick={() => setSelectedTask(task)} style={{ cursor: 'pointer' }}>
                        <td style={{ fontWeight: 600 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {task.status === 'Done' ? <CheckCircle2 size={16} style={{ color: 'var(--success)', flexShrink: 0 }} /> : <Clock size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                            <span style={{ textDecoration: task.status === 'Done' ? 'line-through' : 'none', opacity: task.status === 'Done' ? 0.6 : 1 }}>{task.title}</span>
                          </div>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{task.assigned_to || '—'}</td>
                        <td><span className={`badge ${statusBadge[task.status]}`}>{task.status}</span></td>
                        <td><span style={{ fontSize: '0.8rem', fontWeight: 600, color: priorityColors[task.priority], display: 'flex', alignItems: 'center', gap: '0.25rem' }}>{task.priority === 'High' && <AlertCircle size={13} />}{task.priority}</span></td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {task.due_date ? <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Calendar size={13} />{new Date(task.due_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</div> : '—'}
                        </td>
                        <td>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={(e) => { e.stopPropagation(); setSelectedTask(task); }}
                            style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                          >
                            <MessageSquare size={12} /> {commentsCount} {commentsCount === 1 ? 'Comment' : 'Comments'}
                          </button>
                        </td>
                        <td><div style={{ display: 'flex', gap: '0.25rem' }}>{task.tags?.map(tag => <span key={tag} className="badge badge-neutral">{tag}</span>)}</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Task Details & Comments Modal */}
      {selectedTask && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setSelectedTask(null); }}>
          <div className="modal-content animate-fade-in" style={{ maxWidth: 580, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.35rem 0' }}>
                  {selectedTask.title}
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span className={`badge ${statusBadge[selectedTask.status]}`}>{selectedTask.status}</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: priorityColors[selectedTask.priority] }}>
                    {selectedTask.priority} Priority
                  </span>
                  {selectedTask.assigned_to && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <User size={12} /> {selectedTask.assigned_to}
                    </span>
                  )}
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedTask(null)}>✕</button>
            </div>

            {/* Task Description */}
            {selectedTask.description && (
              <div style={{ padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--border-color)', marginBottom: '1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {selectedTask.description}
              </div>
            )}

            {/* Comments Section */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <MessageSquare size={16} color="var(--accent-primary)" />
                Activity & Comments ({selectedTask.comments?.length || 0})
              </div>

              {/* Comments Stream */}
              <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1rem', paddingRight: '0.25rem' }}>
                {(!selectedTask.comments || selectedTask.comments.length === 0) ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    No comments yet. Leave a note or progress update below.
                  </div>
                ) : (
                  selectedTask.comments.map(c => (
                    <div key={c.id} style={{ padding: '0.65rem 0.85rem', background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <strong style={{ fontSize: '0.78rem', color: 'var(--text-primary)' }}>👤 {c.author}</strong>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(c.created_at).toLocaleDateString([], { day: '2-digit', month: 'short' })}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                        {c.text}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Add Comment Form */}
              <form onSubmit={handleAddComment} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Write a comment or site visit update..."
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={addingComment || !newComment.trim()}
                    style={{ padding: '0 1rem' }}
                  >
                    <Send size={15} /> Post
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Assign To Field Agent / Employee</label>
                  <select
                    className="input-field"
                    value={form.assigned_to || ''}
                    onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))}
                  >
                    <option value="">-- Select Field Agent --</option>
                    {teamMembers.map(m => (
                      <option key={m.id} value={m.full_name}>{m.full_name} ({m.role})</option>
                    ))}
                    {teamMembers.length === 0 && (
                      <>
                        <option value="Anand Sharma">Anand Sharma (Sales Executive)</option>
                        <option value="Rajesh Kumar">Rajesh Kumar (Sales Executive)</option>
                        <option value="Priya Sharma">Priya Sharma (Manager)</option>
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Category / Tag</label>
                  <select
                    className="input-field"
                    onChange={e => {
                      const tag = e.target.value;
                      if (tag && !form.tags?.includes(tag)) {
                        setForm(p => ({ ...p, tags: [...(p.tags || []), tag] }));
                      }
                    }}
                  >
                    <option value="">+ Add Tag</option>
                    <option value="Site Visit">🏢 Site Visit</option>
                    <option value="Client Inspection">📸 Client Inspection</option>
                    <option value="Payment Follow-up">💰 Payment Follow-up</option>
                    <option value="KYC & Legal">📑 KYC & Legal</option>
                  </select>
                </div>
              </div>
              {form.tags?.length > 0 && (
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {form.tags.map(t => (
                    <span key={t} className="badge badge-accent" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      {t} <span style={{ cursor: 'pointer' }} onClick={() => setForm(p => ({ ...p, tags: p.tags.filter(x => x !== t) }))}>×</span>
                    </span>
                  ))}
                </div>
              )}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Due Date</label>
                <input type="date" className="input-field" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Description</label>
                <textarea className="input-field textarea-field" rows="2" placeholder="Add details or site address..." value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
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
