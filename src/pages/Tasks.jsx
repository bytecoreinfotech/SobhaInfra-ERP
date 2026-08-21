import React, { useState, useEffect } from 'react';
import {
  CheckSquare, Clock, AlertCircle, CheckCircle2,
  Plus, Search, Filter, Calendar, List, Columns, X, RefreshCw,
  MessageSquare, Send, User, Tag, Check, ChevronRight, UserCheck,
  Trash2, FileText, BarChart3, Copy, ArrowRight
} from 'lucide-react';
import { getTasks, createTask, updateTask, deleteTask, addTaskComment, getTeamMembers, getTaskTemplates, saveTaskTemplate, deleteTaskTemplate, getTasksByEmployee } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import './Pages.css';

const priorityColors = { High: 'var(--danger)', Medium: 'var(--warning)', Low: 'var(--success)' };
const colColors = { 'To Do': 'var(--text-muted)', 'In Progress': 'var(--warning)', 'Under Review': 'var(--accent-primary)', 'Done': 'var(--success)' };
const COLUMNS = ['To Do', 'In Progress', 'Under Review', 'Done'];
const EMPTY_TASK = { title: '', description: '', status: 'To Do', priority: 'Medium', due_date: '', tags: [], assigned_to: '' };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const Tasks = () => {
  const { user, canPerformAction } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('kanban');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_TASK);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState(() => {
    // Field agents default to their own tasks
    return 'All';
  });

  // Task Details & Comment Drawer
  const [selectedTask, setSelectedTask] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [addingComment, setAddingComment] = useState(false);

  // Active sub-tab: 'tasks' | 'templates' | 'analytics'
  const [activeSubTab, setActiveSubTab] = useState('tasks');

  // Template state
  const [templates, setTemplates] = useState([]);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [tplForm, setTplForm] = useState({ title: '', description: '', priority: 'Medium', tags: [], default_assignee: '' });

  // Analytics state
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsMonth, setAnalyticsMonth] = useState(new Date().getMonth() + 1);
  const [analyticsYear, setAnalyticsYear] = useState(new Date().getFullYear());
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Role-based permission flags
  const canCreate = canPerformAction('tasks:create');
  const canAssign = canPerformAction('tasks:assign');
  const canComplete = canPerformAction('tasks:complete');
  const canDelete = canPerformAction('tasks:delete');
  const canViewAll = canPerformAction('tasks:view_all');
  const canManageTemplates = canPerformAction('tasks:manage_templates');
  const canViewAnalytics = canPerformAction('tasks:view_analytics');

  useEffect(() => {
    loadTasks();
    if (canManageTemplates) {
      loadTemplates();
    }
  }, []);

  const loadTemplates = async () => {
    const tpls = await getTaskTemplates();
    setTemplates(tpls);
  };;

  // Auto-lock field agents to their own tasks
  useEffect(() => {
    if (!canViewAll && user?.name) {
      setAssigneeFilter('My Tasks');
    }
  }, [canViewAll, user]);

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

  const loadAnalytics = async () => {
    setAnalyticsLoading(true);
    const result = await getTasksByEmployee(analyticsMonth, analyticsYear);
    setAnalyticsData(result);
    setAnalyticsLoading(false);
  };

  useEffect(() => {
    if (activeSubTab === 'analytics' && canViewAnalytics) {
      loadAnalytics();
    }
  }, [activeSubTab, analyticsMonth, analyticsYear]);

  const handleCreate = async () => {
    if (!form.title.trim() || !canCreate) return;
    setSaving(true);
    const { data } = await createTask(form);
    if (data) setTasks(prev => [data, ...prev]);
    setSaving(false);
    setShowAdd(false);
    setForm(EMPTY_TASK);
  };

  const moveTask = async (task, newStatus) => {
    // Role-based restrictions on status changes
    const isOwnTask = (task.assigned_to || '').toLowerCase() === (user?.name || '').toLowerCase();

    if (newStatus === 'Done') {
      // Only Admin/Manager can mark Done
      if (!canComplete) return;
    }

    if (!canViewAll && !isOwnTask) return; // Can't move other people's tasks

    // Field agents can only move between In Progress and Under Review
    if (!canComplete && !canCreate) {
      const allowedMoves = ['In Progress', 'Under Review'];
      if (!allowedMoves.includes(newStatus)) return;
    }

    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    if (selectedTask?.id === task.id) {
      setSelectedTask(prev => ({ ...prev, status: newStatus }));
    }
    await updateTask(task.id, { status: newStatus });
  };

  const handleDeleteTask = async (taskId) => {
    if (!canDelete) return;
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    await deleteTask(taskId);
    setTasks(prev => prev.filter(t => t.id !== taskId));
    if (selectedTask?.id === taskId) setSelectedTask(null);
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !selectedTask) return;

    setAddingComment(true);
    const authorName = user?.name || 'Team Member';
    const { data: createdComment } = await addTaskComment(selectedTask.id, newComment.trim(), authorName);

    if (createdComment) {
      const updatedComments = [...(selectedTask.comments || []), createdComment];
      setSelectedTask(prev => ({ ...prev, comments: updatedComments }));
      setTasks(prev => prev.map(t =>
        t.id === selectedTask.id ? { ...t, comments: updatedComments } : t
      ));
      setNewComment('');
    }
    setAddingComment(false);
  };

  // Template handlers
  const handleSaveTemplate = async () => {
    if (!tplForm.title.trim()) return;
    await saveTaskTemplate(tplForm);
    await loadTemplates();
    setShowAddTemplate(false);
    setTplForm({ title: '', description: '', priority: 'Medium', tags: [], default_assignee: '' });
  };

  const handleDeleteTemplate = async (id) => {
    await deleteTaskTemplate(id);
    await loadTemplates();
  };

  const handleCreateFromTemplate = (tpl) => {
    setForm({
      title: tpl.title,
      description: tpl.description || '',
      status: 'To Do',
      priority: tpl.priority || 'Medium',
      due_date: new Date().toISOString().split('T')[0],
      tags: tpl.tags || [],
      assigned_to: tpl.default_assignee || '',
    });
    setActiveSubTab('tasks');
    setShowAdd(true);
  };

  const matchesAssignee = (t) => {
    if (!canViewAll) {
      // Field agents / non-admin roles can only see their own tasks
      const uName = (user?.name || '').toLowerCase();
      return (t.assigned_to || '').toLowerCase().includes(uName);
    }
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

  // Determine which status buttons a user can click for a given task
  const getAllowedMoves = (task, currentCol) => {
    const isOwnTask = (task.assigned_to || '').toLowerCase() === (user?.name || '').toLowerCase();

    if (canComplete) {
      // Admin/Manager: can move to any status
      return COLUMNS.filter(c => c !== currentCol);
    }

    if (isOwnTask) {
      // Field agent / own task: can move between In Progress and Under Review only
      return ['In Progress', 'Under Review'].filter(c => c !== currentCol);
    }

    return [];
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Task Management</h1>
          <p className="page-subtitle">
            {canViewAll
              ? 'Assign daily site visits, client inspections, and track team execution.'
              : `Your assigned tasks and daily work items, ${user?.name || 'Team Member'}.`
            }
          </p>
        </div>
        <div className="page-actions">
          {/* Sub-tab toggles */}
          <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <button onClick={() => setActiveSubTab('tasks')} className="btn" style={{ borderRadius: 0, background: activeSubTab === 'tasks' ? 'var(--accent-primary)' : 'var(--bg-tertiary)', color: activeSubTab === 'tasks' ? 'white' : 'var(--text-secondary)', padding: '0.4rem 0.875rem', fontSize: '0.78rem' }}>
              <CheckSquare size={14} /> Tasks
            </button>
            {canManageTemplates && (
              <button onClick={() => setActiveSubTab('templates')} className="btn" style={{ borderRadius: 0, background: activeSubTab === 'templates' ? 'var(--accent-primary)' : 'var(--bg-tertiary)', color: activeSubTab === 'templates' ? 'white' : 'var(--text-secondary)', padding: '0.4rem 0.875rem', fontSize: '0.78rem' }}>
                <FileText size={14} /> Templates
              </button>
            )}
            {canViewAnalytics && (
              <button onClick={() => setActiveSubTab('analytics')} className="btn" style={{ borderRadius: 0, background: activeSubTab === 'analytics' ? 'var(--accent-primary)' : 'var(--bg-tertiary)', color: activeSubTab === 'analytics' ? 'white' : 'var(--text-secondary)', padding: '0.4rem 0.875rem', fontSize: '0.78rem' }}>
                <BarChart3 size={14} /> Analytics
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TASKS TAB */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'tasks' && (
        <>
          {/* Action Bar */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
              <div className="input-group" style={{ maxWidth: 280, flex: 1 }}>
                <Search size={15} className="input-icon" />
                <input type="text" className="input-field" placeholder="Search tasks..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>

              {canViewAll && (
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
                </select>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                {[{ id: 'kanban', icon: <Columns size={14} />, label: 'Board' }, { id: 'list', icon: <List size={14} />, label: 'List' }].map(v => (
                  <button key={v.id} onClick={() => setView(v.id)} className="btn" style={{ borderRadius: 0, background: view === v.id ? 'var(--accent-primary)' : 'var(--bg-tertiary)', color: view === v.id ? 'white' : 'var(--text-secondary)', padding: '0.4rem 0.875rem' }}>
                    {v.icon} {v.label}
                  </button>
                ))}
              </div>
              <button className="btn btn-secondary" onClick={loadTasks} title="Refresh tasks"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
              {canCreate && (
                <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={15} /> Create Task</button>
              )}
            </div>
          </div>

          {/* Role info bar for non-admin users */}
          {!canViewAll && (
            <div style={{ padding: '0.65rem 1rem', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, marginBottom: '1rem', fontSize: '0.8rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <UserCheck size={16} />
              <span>Showing tasks assigned to <strong>{user?.name}</strong>. Update progress by moving tasks to "In Progress" or "Under Review".</span>
            </div>
          )}

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
                          const allowedMoves = getAllowedMoves(task, col);
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
                              {/* Quick move buttons — role gated */}
                              {allowedMoves.length > 0 && (
                                <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.5rem', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                                  {allowedMoves.map(c => (
                                    <button key={c} onClick={() => moveTask(task, c)} className="btn btn-secondary btn-sm" style={{ fontSize: '0.6rem', padding: '0.15rem 0.4rem' }}>→ {c}</button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {canCreate && (
                          <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center', borderStyle: 'dashed' }} onClick={() => { setForm({ ...EMPTY_TASK, status: col }); setShowAdd(true); }}>
                            <Plus size={13} /> Add
                          </button>
                        )}
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
                      <tr><th>Task</th><th>Assignee</th><th>Status</th><th>Priority</th><th>Due Date</th><th>Comments</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {filteredFlat.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>No tasks found</td></tr>}
                      {filteredFlat.map(task => {
                        const commentsCount = task.comments?.length || 0;
                        const allowedMoves = getAllowedMoves(task, task.status);
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
                              <span style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-muted)' }}>
                                <MessageSquare size={12} /> {commentsCount}
                              </span>
                            </td>
                            <td onClick={e => e.stopPropagation()}>
                              <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                {allowedMoves.slice(0, 2).map(c => (
                                  <button key={c} onClick={() => moveTask(task, c)} className="btn btn-secondary btn-sm" style={{ fontSize: '0.6rem', padding: '0.15rem 0.4rem' }}>→ {c}</button>
                                ))}
                                {canDelete && (
                                  <button onClick={() => handleDeleteTask(task.id)} className="btn btn-secondary btn-sm" style={{ fontSize: '0.6rem', padding: '0.15rem 0.4rem', color: 'var(--danger)' }}><Trash2 size={11} /></button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TEMPLATES TAB (Super Admin Only) */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'templates' && canManageTemplates && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Default Task Templates</h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>Define recurring tasks once. Use them daily without retyping.</p>
            </div>
            <button className="btn btn-primary" onClick={() => setShowAddTemplate(true)}>
              <Plus size={15} /> Add Template
            </button>
          </div>

          {templates.length === 0 ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <FileText size={40} style={{ marginBottom: '1rem', opacity: 0.3 }} />
              <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>No task templates yet</p>
              <p style={{ fontSize: '0.78rem' }}>Create default daily tasks that your team can reuse every day.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
              {templates.map(tpl => (
                <div key={tpl.id} className="glass-card" style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0 }}>{tpl.title}</h3>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: priorityColors[tpl.priority] }}>{tpl.priority}</span>
                  </div>
                  {tpl.description && <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 0.5rem 0' }}>{tpl.description}</p>}
                  {tpl.tags?.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                      {tpl.tags.map(tag => <span key={tag} className="badge badge-neutral" style={{ fontSize: '0.62rem' }}>{tag}</span>)}
                    </div>
                  )}
                  {tpl.default_assignee && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <User size={11} /> Default: {tpl.default_assignee}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => handleCreateFromTemplate(tpl)}>
                      <Copy size={13} /> Use Today
                    </button>
                    <button className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteTemplate(tpl.id)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Template Modal */}
          {showAddTemplate && (
            <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAddTemplate(false); }}>
              <div className="modal-content animate-fade-in">
                <button className="modal-close-btn" onClick={() => setShowAddTemplate(false)}><X size={18} /></button>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem', paddingRight: '2.5rem' }}>Create Task Template</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Template Title *</label>
                    <input type="text" className="input-field" placeholder="e.g., Daily Site Inspection" value={tplForm.title} onChange={e => setTplForm(p => ({ ...p, title: e.target.value }))} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Priority</label>
                      <select className="input-field" value={tplForm.priority} onChange={e => setTplForm(p => ({ ...p, priority: e.target.value }))}>
                        <option>High</option><option>Medium</option><option>Low</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Default Assignee</label>
                      <select className="input-field" value={tplForm.default_assignee} onChange={e => setTplForm(p => ({ ...p, default_assignee: e.target.value }))}>
                        <option value="">-- None --</option>
                        {teamMembers.map(m => <option key={m.id} value={m.full_name}>{m.full_name} ({m.role})</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Category Tag</label>
                    <select className="input-field" onChange={e => { const tag = e.target.value; if (tag && !tplForm.tags.includes(tag)) setTplForm(p => ({ ...p, tags: [...p.tags, tag] })); }}>
                      <option value="">+ Add Tag</option>
                      <option value="Site Visit">🏢 Site Visit</option>
                      <option value="Client Inspection">📸 Client Inspection</option>
                      <option value="Payment Follow-up">💰 Payment Follow-up</option>
                      <option value="KYC & Legal">📑 KYC & Legal</option>
                      <option value="Daily Report">📋 Daily Report</option>
                    </select>
                    {tplForm.tags.length > 0 && (
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                        {tplForm.tags.map(t => (
                          <span key={t} className="badge badge-accent" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            {t} <span style={{ cursor: 'pointer' }} onClick={() => setTplForm(p => ({ ...p, tags: p.tags.filter(x => x !== t) }))}>×</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Description</label>
                    <textarea className="input-field textarea-field" rows="2" placeholder="Default instructions or site address..." value={tplForm.description} onChange={e => setTplForm(p => ({ ...p, description: e.target.value }))} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button className="btn btn-secondary" onClick={() => setShowAddTemplate(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSaveTemplate} disabled={!tplForm.title.trim()}>Save Template</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ANALYTICS TAB (Admin/Manager Only) */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'analytics' && canViewAnalytics && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Employee Task Analytics</h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>Track per-employee task performance month by month.</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select className="input-field" style={{ width: 'auto', fontSize: '0.8rem', padding: '0.4rem 0.6rem' }} value={analyticsMonth} onChange={e => setAnalyticsMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <select className="input-field" style={{ width: 'auto', fontSize: '0.8rem', padding: '0.4rem 0.6rem' }} value={analyticsYear} onChange={e => setAnalyticsYear(Number(e.target.value))}>
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <button className="btn btn-secondary btn-sm" onClick={loadAnalytics}><RefreshCw size={13} /></button>
            </div>
          </div>

          {/* Summary Cards */}
          {analyticsData && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                {[
                  { label: 'Total Tasks', val: analyticsData.totalTasks, color: 'var(--text-primary)' },
                  { label: 'To Do', val: analyticsData.summary.todo, color: 'var(--text-muted)' },
                  { label: 'In Progress', val: analyticsData.summary.inProgress, color: 'var(--warning)' },
                  { label: 'Under Review', val: analyticsData.summary.underReview, color: 'var(--accent-primary)' },
                  { label: 'Done', val: analyticsData.summary.done, color: 'var(--success)' },
                ].map(s => (
                  <div key={s.label} className="glass-card" style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Per-Employee Table */}
              <div className="glass-card table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Role</th>
                      <th style={{ textAlign: 'center' }}>Total</th>
                      <th style={{ textAlign: 'center' }}>To Do</th>
                      <th style={{ textAlign: 'center' }}>In Progress</th>
                      <th style={{ textAlign: 'center' }}>Under Review</th>
                      <th style={{ textAlign: 'center' }}>Done</th>
                      <th style={{ textAlign: 'center' }}>High Priority</th>
                      <th style={{ textAlign: 'center' }}>Completion %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analyticsLoading ? (
                      <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem' }}><RefreshCw size={18} className="animate-spin" /></td></tr>
                    ) : (analyticsData.data || []).filter(e => e.total > 0).length === 0 ? (
                      <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No task data for {MONTHS[analyticsMonth - 1]} {analyticsYear}</td></tr>
                    ) : (
                      (analyticsData.data || []).map(emp => {
                        const pct = emp.total > 0 ? Math.round((emp.done / emp.total) * 100) : 0;
                        return (
                          <tr key={emp.id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
                                  {emp.avatar || emp.name?.slice(0, 2).toUpperCase()}
                                </div>
                                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{emp.name}</span>
                              </div>
                            </td>
                            <td><span className="badge badge-neutral" style={{ fontSize: '0.68rem' }}>{emp.role}</span></td>
                            <td style={{ textAlign: 'center', fontWeight: 700 }}>{emp.total}</td>
                            <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{emp.todo}</td>
                            <td style={{ textAlign: 'center', color: 'var(--warning)' }}>{emp.inProgress}</td>
                            <td style={{ textAlign: 'center', color: 'var(--accent-primary)' }}>{emp.underReview}</td>
                            <td style={{ textAlign: 'center', color: 'var(--success)', fontWeight: 700 }}>{emp.done}</td>
                            <td style={{ textAlign: 'center', color: 'var(--danger)', fontWeight: emp.highPriority > 0 ? 700 : 400 }}>{emp.highPriority}</td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                                <div style={{ width: 60, height: 6, borderRadius: 3, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)', transition: 'width 0.3s' }} />
                                </div>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)' }}>{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TASK DETAILS & COMMENTS MODAL */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
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

            {selectedTask.description && (
              <div style={{ padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--border-color)', marginBottom: '1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {selectedTask.description}
              </div>
            )}

            {/* Status Change Buttons — Role-Gated */}
            {(() => {
              const moves = getAllowedMoves(selectedTask, selectedTask.status);
              return moves.length > 0 ? (
                <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center', marginRight: '0.25rem' }}>Move to:</span>
                  {moves.map(c => (
                    <button key={c} onClick={() => moveTask(selectedTask, c)} className="btn btn-secondary btn-sm" style={{ fontSize: '0.72rem' }}>
                      <ArrowRight size={12} /> {c}
                    </button>
                  ))}
                  {canDelete && (
                    <button onClick={() => handleDeleteTask(selectedTask.id)} className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)', marginLeft: 'auto' }}>
                      <Trash2 size={12} /> Delete
                    </button>
                  )}
                </div>
              ) : null;
            })()}

            {/* Comments Section */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <MessageSquare size={16} color="var(--accent-primary)" />
                Activity & Comments ({selectedTask.comments?.length || 0})
              </div>

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

              {/* Comment form — available to all logged-in users */}
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

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* CREATE TASK MODAL */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {showAdd && canCreate && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div className="modal-content animate-fade-in">
            <button className="modal-close-btn" onClick={() => setShowAdd(false)} title="Close Modal"><X size={18} /></button>
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
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Assign To Employee</label>
                  <select
                    className="input-field"
                    value={form.assigned_to || ''}
                    onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))}
                  >
                    <option value="">-- Select Employee --</option>
                    {teamMembers.map(m => (
                      <option key={m.id} value={m.full_name}>{m.full_name} ({m.role})</option>
                    ))}
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
                    <option value="Daily Report">📋 Daily Report</option>
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
