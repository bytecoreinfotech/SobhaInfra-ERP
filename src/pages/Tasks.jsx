import React, { useState, useEffect, useRef } from 'react';
import {
  CheckSquare, Clock, AlertCircle, CheckCircle2,
  Plus, Search, Filter, Calendar, List, Columns, X, RefreshCw,
  MessageSquare, Send, User, Tag, Check, ChevronRight, UserCheck,
  Trash2, FileText, BarChart3, Copy, ArrowRight, Image as ImageIcon,
  Paperclip, Link as LinkIcon, ExternalLink, ShieldCheck, Repeat,
  Building, Sparkles, AlertTriangle, Eye, UploadCloud
} from 'lucide-react';
import {
  getTasks, createTask, updateTask, deleteTask, addTaskComment,
  getTeamMembers, getTaskTemplates, saveTaskTemplate, deleteTaskTemplate,
  getTasksByEmployee, getLeads, generateDailyTasksForClients
} from '../lib/db';
import { useAuth } from '../context/AuthContext';
import './Pages.css';

const priorityColors = { High: 'var(--danger)', Medium: 'var(--warning)', Low: 'var(--success)' };
const colColors = { 'To Do': 'var(--text-muted)', 'In Progress': 'var(--warning)', 'Under Review': 'var(--accent-primary)', 'Done': 'var(--success)' };
const COLUMNS = ['To Do', 'In Progress', 'Under Review', 'Done'];
const EMPTY_TASK = {
  title: '',
  description: '',
  status: 'To Do',
  priority: 'Medium',
  due_date: '',
  tags: [],
  assigned_to: '',
  client_name: '',
  client_phone: '',
  is_recurring: false,
  recurrence_interval: 'Daily'
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const Tasks = () => {
  const { user, canPerformAction } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('kanban');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_TASK);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('All');

  // Task Details & Comment Drawer
  const [selectedTask, setSelectedTask] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [commentMediaUrl, setCommentMediaUrl] = useState(null);
  const [commentMediaName, setCommentMediaName] = useState('');
  const [commentLinkUrl, setCommentLinkUrl] = useState('');
  const [commentLinkTitle, setCommentLinkTitle] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [addingComment, setAddingComment] = useState(false);

  // Employee Proof Submission Panel
  const [showProofForm, setShowProofForm] = useState(false);
  const [proofText, setProofText] = useState('');
  const [proofMediaUrl, setProofMediaUrl] = useState(null);
  const [proofMediaName, setProofMediaName] = useState('');
  const [proofLinkUrl, setProofLinkUrl] = useState('');
  const [proofLinkTitle, setProofLinkTitle] = useState('');
  const [submittingProof, setSubmittingProof] = useState(false);

  // Supervisor Review Revision Feedback
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionFeedback, setRevisionFeedback] = useState('');

  // Image Lightbox Preview
  const [lightboxImageUrl, setLightboxImageUrl] = useState(null);

  // Toast message
  const [feedbackToast, setFeedbackToast] = useState(null);

  // Active sub-tab: 'tasks' | 'templates' | 'analytics'
  const [activeSubTab, setActiveSubTab] = useState('tasks');

  // Template state
  const [templates, setTemplates] = useState([]);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [tplForm, setTplForm] = useState({ title: '', description: '', priority: 'Medium', tags: [], default_assignee: '', is_recurring: false });

  // 1-Click Daily Routine Task Generator Modal
  const [showDailyGenModal, setShowDailyGenModal] = useState(false);
  const [dailyGenConfig, setDailyGenConfig] = useState({
    templateId: '',
    targetType: 'all', // 'all' | 'selected'
    selectedClientIds: [],
    assignee: '',
    dueDate: new Date().toISOString().split('T')[0]
  });
  const [generatingDaily, setGeneratingDaily] = useState(false);

  // Analytics state
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsMonth, setAnalyticsMonth] = useState(new Date().getMonth() + 1);
  const [analyticsYear, setAnalyticsYear] = useState(new Date().getFullYear());
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const fileInputRef = useRef(null);
  const proofFileInputRef = useRef(null);

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
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    const tpls = await getTaskTemplates();
    setTemplates(tpls || []);
  };

  // Auto-lock field agents to their own tasks
  useEffect(() => {
    if (!canViewAll && user?.name) {
      setAssigneeFilter('My Tasks');
    }
  }, [canViewAll, user]);

  const loadTasks = async () => {
    setLoading(true);
    const [taskRes, membersRes, leadsRes] = await Promise.all([
      getTasks(),
      getTeamMembers(),
      getLeads(),
    ]);
    setTasks(taskRes.data || []);
    setTeamMembers(membersRes.data || []);
    setLeads(leadsRes.data || []);
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

  const showToast = (text, type = 'success') => {
    setFeedbackToast({ text, type });
    setTimeout(() => setFeedbackToast(null), 3500);
  };

  const handleCreate = async () => {
    if (!form.title.trim() || !canCreate) return;
    setSaving(true);
    const { data } = await createTask(form);
    if (data) {
      setTasks(prev => [data, ...prev]);
      showToast('Task created successfully!');
    }
    setSaving(false);
    setShowAdd(false);
    setForm(EMPTY_TASK);
  };

  const moveTask = async (task, newStatus) => {
    const isOwnTask = (task.assigned_to || '').toLowerCase() === (user?.name || '').toLowerCase();

    if (newStatus === 'Done' && !canComplete) {
      showToast('Only Supervisors / Super Admins can approve and mark tasks Done.', 'error');
      return;
    }

    if (!canViewAll && !isOwnTask) return;

    if (!canComplete && !canCreate) {
      const allowedMoves = ['In Progress', 'Under Review'];
      if (!allowedMoves.includes(newStatus)) return;
    }

    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    if (selectedTask?.id === task.id) {
      setSelectedTask(prev => ({ ...prev, status: newStatus }));
    }
    await updateTask(task.id, { status: newStatus });
    showToast(`Task status updated to "${newStatus}"`);
  };

  const handleDeleteTask = async (taskId) => {
    if (!canDelete) return;
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    await deleteTask(taskId);
    setTasks(prev => prev.filter(t => t.id !== taskId));
    if (selectedTask?.id === taskId) setSelectedTask(null);
    showToast('Task deleted.');
  };

  // Helper to handle image file upload as base64 preview
  const handleFileUpload = (e, setUrl, setName) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      setUrl(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  // Regular comment submission
  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() && !commentMediaUrl && !commentLinkUrl) return;

    setAddingComment(true);
    const authorName = user?.name || 'Team Member';
    const authorRole = user?.role || 'Sales Executive';

    const commentPayload = {
      text: newComment.trim(),
      author: authorName,
      author_role: authorRole,
      media_url: commentMediaUrl,
      media_name: commentMediaName,
      link_url: commentLinkUrl.trim() || null,
      link_title: commentLinkTitle.trim() || null,
      is_proof: false,
    };

    const { data: createdComment } = await addTaskComment(selectedTask.id, commentPayload, authorName);

    if (createdComment) {
      const updatedComments = [...(selectedTask.comments || []), createdComment];
      setSelectedTask(prev => ({ ...prev, comments: updatedComments }));
      setTasks(prev => prev.map(t =>
        t.id === selectedTask.id ? { ...t, comments: updatedComments } : t
      ));
      setNewComment('');
      setCommentMediaUrl(null);
      setCommentMediaName('');
      setCommentLinkUrl('');
      setCommentLinkTitle('');
      setShowLinkInput(false);
    }
    setAddingComment(false);
  };

  // Employee: Submit Task for Review with Proof
  const handleSubmitForReviewWithProof = async (e) => {
    e.preventDefault();
    if (!selectedTask) return;
    if (!proofText.trim() && !proofMediaUrl && !proofLinkUrl) {
      showToast('Please provide a completion summary note, photo proof, or document link.', 'error');
      return;
    }

    setSubmittingProof(true);
    const authorName = user?.name || 'Field Employee';
    const authorRole = user?.role || 'Sales Executive';

    const proofComment = {
      text: proofText.trim() || 'Task submitted for supervisor review with attached proof.',
      author: authorName,
      author_role: authorRole,
      media_url: proofMediaUrl,
      media_name: proofMediaName,
      link_url: proofLinkUrl.trim() || null,
      link_title: proofLinkTitle.trim() || 'Proof Document / Link',
      is_proof: true,
    };

    // 1. Add proof comment
    const { data: createdComment } = await addTaskComment(selectedTask.id, proofComment, authorName);

    // 2. Transition status to 'Under Review'
    await updateTask(selectedTask.id, {
      status: 'Under Review',
      review_submitted_at: new Date().toISOString(),
      submitted_by: authorName,
    });

    const updatedComments = [...(selectedTask.comments || []), createdComment];
    const updatedTask = {
      ...selectedTask,
      status: 'Under Review',
      review_submitted_at: new Date().toISOString(),
      submitted_by: authorName,
      comments: updatedComments
    };

    setSelectedTask(updatedTask);
    setTasks(prev => prev.map(t => t.id === selectedTask.id ? updatedTask : t));

    setProofText('');
    setProofMediaUrl(null);
    setProofMediaName('');
    setProofLinkUrl('');
    setProofLinkTitle('');
    setShowProofForm(false);
    setSubmittingProof(false);
    showToast('Task submitted for review! Admin can now review your proof.');
  };

  // Supervisor: Approve & Mark Done
  const handleApproveTask = async () => {
    if (!selectedTask || !canComplete) return;

    const approvalComment = {
      text: `✅ Task Approved & Verified by ${user?.name || 'Supervisor'}.`,
      author: user?.name || 'Supervisor',
      author_role: user?.role || 'Super Admin',
      is_proof: false,
    };

    await addTaskComment(selectedTask.id, approvalComment, user?.name);
    await updateTask(selectedTask.id, {
      status: 'Done',
      completed_at: new Date().toISOString(),
      approved_by: user?.name,
    });

    const updatedComments = [...(selectedTask.comments || []), { ...approvalComment, id: 'c-' + Date.now(), created_at: new Date().toISOString() }];
    const updatedTask = {
      ...selectedTask,
      status: 'Done',
      completed_at: new Date().toISOString(),
      approved_by: user?.name,
      comments: updatedComments
    };

    setSelectedTask(updatedTask);
    setTasks(prev => prev.map(t => t.id === selectedTask.id ? updatedTask : t));
    showToast('Task approved and marked as Done ✅');
  };

  // Supervisor: Request Revision / Reject
  const handleRequestRevision = async (e) => {
    e.preventDefault();
    if (!selectedTask || !canComplete) return;
    if (!revisionFeedback.trim()) {
      showToast('Please specify the revision reason or missing proof.', 'error');
      return;
    }

    const revisionComment = {
      text: `🔄 Revision Requested: ${revisionFeedback.trim()}`,
      author: user?.name || 'Supervisor',
      author_role: user?.role || 'Super Admin',
      is_proof: false,
    };

    await addTaskComment(selectedTask.id, revisionComment, user?.name);
    await updateTask(selectedTask.id, {
      status: 'In Progress',
      revision_requested_at: new Date().toISOString(),
    });

    const updatedComments = [...(selectedTask.comments || []), { ...revisionComment, id: 'c-' + Date.now(), created_at: new Date().toISOString() }];
    const updatedTask = {
      ...selectedTask,
      status: 'In Progress',
      revision_requested_at: new Date().toISOString(),
      comments: updatedComments
    };

    setSelectedTask(updatedTask);
    setTasks(prev => prev.map(t => t.id === selectedTask.id ? updatedTask : t));
    setShowRevisionForm(false);
    setRevisionFeedback('');
    showToast('Revision feedback sent. Task moved back to In Progress.');
  };

  // 1-Click Generate Daily Routine Tasks for Clients
  const handleGenerateDailyTasks = async () => {
    const tpl = templates.find(t => t.id === dailyGenConfig.templateId) || templates[0];
    if (!tpl) {
      showToast('Please create or select a task template first.', 'error');
      return;
    }

    let targetClients = [];
    if (dailyGenConfig.targetType === 'all') {
      targetClients = leads.length > 0 ? leads : [
        { name: 'Shree Ram Enterprises', phone: '+919876543210', company_name: 'Shree Ram Enterprises', property_interest: 'Tile Adhesive' },
        { name: 'Deshmukh Infra', phone: '+919812345678', company_name: 'Deshmukh Infra & Buildcon', property_interest: 'Waterproofing Compound' },
        { name: 'Apex Builders', phone: '+919820011223', company_name: 'Apex Builders & Developers', property_interest: 'Ready Mix Plaster' }
      ];
    } else {
      targetClients = leads.filter(l => dailyGenConfig.selectedClientIds.includes(l.id));
    }

    if (targetClients.length === 0) {
      showToast('No clients selected.', 'error');
      return;
    }

    setGeneratingDaily(true);
    const { data: created } = await generateDailyTasksForClients({
      template: tpl,
      clients: targetClients,
      assignee: dailyGenConfig.assignee,
      dueDate: dailyGenConfig.dueDate,
    });

    if (created && created.length > 0) {
      setTasks(prev => [...created, ...prev]);
      setShowDailyGenModal(false);
      showToast(`⚡ Successfully scheduled ${created.length} daily tasks for today!`);
    }
    setGeneratingDaily(false);
  };

  // Template handlers
  const handleSaveTemplate = async () => {
    if (!tplForm.title.trim()) return;
    await saveTaskTemplate(tplForm);
    await loadTemplates();
    setShowAddTemplate(false);
    setTplForm({ title: '', description: '', priority: 'Medium', tags: [], default_assignee: '', is_recurring: false });
    showToast('Task template saved!');
  };

  const handleDeleteTemplate = async (id) => {
    await deleteTaskTemplate(id);
    await loadTemplates();
    showToast('Template deleted.');
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
      is_recurring: tpl.is_recurring || false,
      recurrence_interval: 'Daily'
    });
    setActiveSubTab('tasks');
    setShowAdd(true);
  };

  const matchesAssignee = (t) => {
    if (!canViewAll) {
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

  const statusBadge = { 'To Do': 'badge-neutral', 'In Progress': 'badge-warning', 'Under Review': 'badge-accent', 'Done': 'badge-success' };

  const getAllowedMoves = (task, currentCol) => {
    const isOwnTask = (task.assigned_to || '').toLowerCase() === (user?.name || '').toLowerCase();
    if (canComplete) {
      return COLUMNS.filter(c => c !== currentCol);
    }
    if (isOwnTask) {
      return ['In Progress', 'Under Review'].filter(c => c !== currentCol);
    }
    return [];
  };

  return (
    <div className="page-container animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h1 className="page-title">Task Management & Review</h1>
            <span className="badge badge-accent" style={{ fontSize: '0.7rem' }}>
              Proof & Review Engine Active
            </span>
          </div>
          <p className="page-subtitle">
            {canViewAll
              ? 'Assign daily site visits, client routines, and review submitted proof media and documents before approval.'
              : `Your assigned tasks and daily work items, ${user?.name || 'Team Member'}. Submit proofs for review upon completion.`
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
                <FileText size={14} /> Routines & Templates
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
                <input type="text" className="input-field" placeholder="Search tasks, clients, tags..." value={search} onChange={e => setSearch(e.target.value)} />
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

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                {[{ id: 'kanban', icon: <Columns size={14} />, label: 'Board' }, { id: 'list', icon: <List size={14} />, label: 'List' }].map(v => (
                  <button key={v.id} onClick={() => setView(v.id)} className="btn" style={{ borderRadius: 0, background: view === v.id ? 'var(--accent-primary)' : 'var(--bg-tertiary)', color: view === v.id ? 'white' : 'var(--text-secondary)', padding: '0.4rem 0.875rem' }}>
                    {v.icon} {v.label}
                  </button>
                ))}
              </div>

              <button className="btn btn-secondary" onClick={loadTasks} title="Refresh tasks"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>

              {/* ⚡ 1-Click Apply Daily Routine to Clients Button (Super Admin / Manager) */}
              {canCreate && (
                <button
                  className="btn"
                  onClick={() => setShowDailyGenModal(true)}
                  style={{
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(16,185,129,0.2) 100%)',
                    border: '1px solid rgba(16,185,129,0.4)', color: 'var(--success)', fontWeight: 700, fontSize: '0.78rem'
                  }}
                  title="Generate daily repeated tasks for clients in 1-click"
                >
                  <Sparkles size={14} color="#10b981" /> ⚡ Apply Daily Routine to Clients
                </button>
              )}

              {canCreate && (
                <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={15} /> Create Task</button>
              )}
            </div>
          </div>

          {/* Role info banner for non-admin users */}
          {!canViewAll && (
            <div style={{ padding: '0.65rem 1rem', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, marginBottom: '1rem', fontSize: '0.8rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <UserCheck size={16} />
              <span>Showing tasks assigned to <strong>{user?.name}</strong>. Complete tasks and click <strong>"Submit for Review"</strong> with proof for supervisor approval.</span>
            </div>
          )}

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><RefreshCw size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
          ) : (
            <>
              {/* Kanban Board */}
              {view === 'kanban' && (
                <div className="kanban-board">
                  {COLUMNS.map(col => {
                    const colTasks = tasksByCol(col);
                    return (
                      <div key={col} className="kanban-col">
                        <div className="kanban-col-header">
                          <span className="kanban-col-title" style={{ color: colColors[col] }}>{col}</span>
                          <span className="kanban-count">{colTasks.length}</span>
                        </div>
                        <div className="kanban-cards">
                          {colTasks.map(task => {
                            const proofComments = (task.comments || []).filter(c => c.is_proof);
                            const hasProof = proofComments.length > 0;
                            const isUnderReview = task.status === 'Under Review';

                            return (
                              <div
                                key={task.id}
                                className="kanban-card"
                                onClick={() => setSelectedTask(task)}
                                style={{
                                  cursor: 'pointer', position: 'relative',
                                  borderLeft: isUnderReview ? '3px solid var(--accent-primary)' : undefined,
                                }}
                              >
                                {isUnderReview && (
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.15rem 0.45rem', borderRadius: 4, background: 'rgba(99,102,241,0.15)', color: 'var(--accent-primary)', fontSize: '0.62rem', fontWeight: 800, marginBottom: '0.35rem' }}>
                                    <ShieldCheck size={11} /> ⏳ REVIEW REQUIRED
                                  </div>
                                )}

                                <div className="kanban-card-title">{task.title}</div>

                                {task.client_name && (
                                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <Building size={11} /> Client: <strong>{task.client_name}</strong>
                                  </div>
                                )}

                                {task.assigned_to && (
                                  <div style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <User size={11} /> {task.assigned_to}
                                  </div>
                                )}

                                {task.tags?.length > 0 && (
                                  <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                                    {task.tags.map(tag => <span key={tag} className="badge badge-neutral" style={{ fontSize: '0.62rem' }}>{tag}</span>)}
                                    {task.is_recurring && <span className="badge badge-accent" style={{ fontSize: '0.62rem' }}>🔁 Daily Routine</span>}
                                  </div>
                                )}

                                <div className="kanban-card-meta">
                                  {task.due_date && (
                                    <div className="kanban-due">
                                      <Calendar size={11} />
                                      {new Date(task.due_date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                    </div>
                                  )}
                                  <span className="badge" style={{ fontSize: '0.62rem', background: 'transparent', color: priorityColors[task.priority], border: `1px solid ${priorityColors[task.priority]}` }}>
                                    {task.priority}
                                  </span>

                                  {hasProof && (
                                    <span style={{ fontSize: '0.65rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.2rem', fontWeight: 600 }}>
                                      <ImageIcon size={11} /> Proof Attached
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* List View */}
              {view === 'list' && (
                <div className="glass-card table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Task</th>
                        <th>Client</th>
                        <th>Assigned To</th>
                        <th>Priority</th>
                        <th>Due Date</th>
                        <th>Status / Proof</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.filter(t => matchesAssignee(t) && (!search || t.title.toLowerCase().includes(search.toLowerCase()))).map(task => {
                        const hasProof = (task.comments || []).some(c => c.is_proof);
                        return (
                          <tr key={task.id} onClick={() => setSelectedTask(task)} style={{ cursor: 'pointer' }}>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{task.title}</div>
                              {task.is_recurring && <span style={{ fontSize: '0.68rem', color: 'var(--accent-primary)' }}>🔁 Daily Routine</span>}
                            </td>
                            <td style={{ fontSize: '0.8rem' }}>{task.client_name || '—'}</td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--accent-primary)' }}>{task.assigned_to || 'Unassigned'}</td>
                            <td>
                              <span className="badge" style={{ fontSize: '0.68rem', color: priorityColors[task.priority], borderColor: priorityColors[task.priority] }}>
                                {task.priority}
                              </span>
                            </td>
                            <td style={{ fontSize: '0.78rem' }}>{task.due_date || '—'}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <span className={`badge ${statusBadge[task.status]}`}>{task.status}</span>
                                {hasProof && <span title="Completion Proof Attached" style={{ fontSize: '0.7rem' }}>🛡️</span>}
                              </div>
                            </td>
                            <td>
                              <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); setSelectedTask(task); }}>
                                Review / View
                              </button>
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
      {/* ROUTINES & TEMPLATES TAB */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'templates' && canManageTemplates && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Daily Client Routines & Templates Master</h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                Pre-configured daily repeated tasks. Instantiate across clients in 1-click so you never have to re-type repeated jobs.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn" onClick={() => setShowDailyGenModal(true)} style={{ background: 'var(--success)', color: 'white', fontWeight: 700 }}>
                <Sparkles size={14} /> ⚡ Apply Routine to Clients
              </button>
              <button className="btn btn-primary" onClick={() => setShowAddTemplate(true)}>
                <Plus size={14} /> Create Template
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {templates.map(tpl => (
              <div key={tpl.id} className="glass-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>{tpl.title}</h3>
                  <span className="badge" style={{ fontSize: '0.65rem', color: priorityColors[tpl.priority], borderColor: priorityColors[tpl.priority] }}>
                    {tpl.priority}
                  </span>
                </div>

                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4, flex: 1 }}>
                  {tpl.description || 'No description provided.'}
                </p>

                {tpl.tags?.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                    {tpl.tags.map(t => <span key={t} className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>{t}</span>)}
                  </div>
                )}

                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  👤 Default Assignee: <strong>{tpl.default_assignee || 'Unassigned'}</strong>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                  <button className="btn btn-primary btn-sm" onClick={() => handleCreateFromTemplate(tpl)} style={{ flex: 1, justifyContent: 'center' }}>
                    <Plus size={12} /> Use Single
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setDailyGenConfig(p => ({ ...p, templateId: tpl.id }));
                      setShowDailyGenModal(true);
                    }}
                    style={{ flex: 1, justifyContent: 'center', color: 'var(--success)' }}
                  >
                    <Sparkles size={12} /> Apply to Clients
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleDeleteTemplate(tpl.id)} style={{ color: 'var(--danger)' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ANALYTICS TAB */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'analytics' && canViewAnalytics && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Employee Task Performance Analytics</h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>Track per-employee task completion and review ratings month by month.</p>
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
                      <th style={{ textAlign: 'center' }}>Completion %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(analyticsData.data || []).map(emp => {
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
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TASK DETAILS, PROOF SUBMISSION & SUPERVISOR REVIEW MODAL */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {selectedTask && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setSelectedTask(null); }} style={{ zIndex: 9999 }}>
          <div className="modal-content animate-fade-in" style={{ maxWidth: 640, padding: '1.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
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
                    <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <User size={12} /> {selectedTask.assigned_to}
                    </span>
                  )}
                  {selectedTask.client_name && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Building size={12} /> Client: {selectedTask.client_name}
                    </span>
                  )}
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedTask(null)}>✕</button>
            </div>

            {selectedTask.description && (
              <div style={{ padding: '0.75rem 1rem', background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border-color)', marginBottom: '1rem', fontSize: '0.82rem', color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>
                {selectedTask.description}
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* SUPERVISOR REVIEW ACTION BANNER (When task is 'Under Review') */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {selectedTask.status === 'Under Review' && canComplete && (
              <div style={{
                padding: '1rem', borderRadius: 8, marginBottom: '1.25rem',
                background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(16,185,129,0.12) 100%)',
                border: '1.5px solid rgba(99,102,241,0.4)', display: 'flex', flexDirection: 'column', gap: '0.75rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.88rem', color: 'var(--accent-primary)' }}>
                    <ShieldCheck size={18} color="var(--accent-primary)" /> Supervisor Review Center
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Submitted by {selectedTask.submitted_by || selectedTask.assigned_to || 'Employee'}
                  </span>
                </div>

                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
                  The employee has submitted their completion proof below. Please review the attached media, document links, and comments before approving.
                </p>

                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={handleApproveTask}
                    style={{ background: 'var(--success)', color: 'white', fontWeight: 700, fontSize: '0.78rem' }}
                  >
                    <Check size={14} /> ✅ Approve & Mark Done
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowRevisionForm(!showRevisionForm)}
                    style={{ fontSize: '0.78rem', color: 'var(--warning)', borderColor: 'var(--warning)' }}
                  >
                    <RefreshCw size={13} /> 🔄 Request Revision / Reject
                  </button>
                </div>

                {/* Revision Feedback Input Drawer */}
                {showRevisionForm && (
                  <form onSubmit={handleRequestRevision} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <textarea
                      className="input-field textarea-field"
                      rows={2}
                      placeholder="Specify what needs correction (e.g. Photo watermark unclear, upload signed client agreement)..."
                      value={revisionFeedback}
                      onChange={e => setRevisionFeedback(e.target.value)}
                      required
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowRevisionForm(false)}>Cancel</button>
                      <button type="submit" className="btn btn-primary btn-sm" style={{ background: 'var(--warning)', borderColor: 'var(--warning)', color: 'black' }}>
                        Send Revision Feedback
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* EMPLOYEE PROOF SUBMISSION BUTTON & FORM */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {selectedTask.status !== 'Done' && selectedTask.status !== 'Under Review' && (
              <div style={{ marginBottom: '1.25rem' }}>
                {!showProofForm ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setShowProofForm(true)}
                    style={{
                      width: '100%', justifyContent: 'center', gap: '0.5rem',
                      background: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(99,102,241,0.15) 100%)',
                      border: '1.5px dashed var(--success)', color: 'var(--success)', fontWeight: 700, padding: '0.65rem'
                    }}
                  >
                    <ShieldCheck size={16} /> 🚀 Submit Task for Review & Attach Proof (Media / Links)
                  </button>
                ) : (
                  <div style={{ padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 8, border: '1.5px solid var(--success)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <ShieldCheck size={16} /> Submit Task for Review with Proof
                      </div>
                      <button type="button" onClick={() => setShowProofForm(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
                    </div>

                    <form onSubmit={handleSubmitForReviewWithProof} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                          Completion Summary & Work Notes *
                        </label>
                        <textarea
                          className="input-field textarea-field"
                          rows={2}
                          placeholder="e.g. Site visit completed with Mr. Vikram. Quotation shared and attached below."
                          value={proofText}
                          onChange={e => setProofText(e.target.value)}
                          required
                        />
                      </div>

                      {/* Photo / Media Attachment Upload */}
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                          Proof Photo / Screenshot / Media Attachment
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            ref={proofFileInputRef}
                            style={{ display: 'none' }}
                            onChange={(e) => handleFileUpload(e, setProofMediaUrl, setProofMediaName)}
                          />
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => proofFileInputRef.current?.click()}
                            style={{ gap: '0.35rem' }}
                          >
                            <ImageIcon size={13} /> {proofMediaName ? 'Change File' : 'Upload Proof Image / Doc'}
                          </button>
                          {proofMediaName && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--success)' }}>
                              ✓ {proofMediaName}
                            </span>
                          )}
                        </div>
                        {proofMediaUrl && (
                          <div style={{ marginTop: '0.5rem', position: 'relative', width: 120, height: 80, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                            <img src={proofMediaUrl} alt="Proof" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <button
                              type="button"
                              onClick={() => { setProofMediaUrl(null); setProofMediaName(''); }}
                              style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.7)', color: 'white', border: 'none', borderRadius: '50%', width: 18, height: 18, fontSize: 10, cursor: 'pointer' }}
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Proof Document / Google Drive Link */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.5rem' }}>
                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                            External Proof Link (Google Drive / Report URL)
                          </label>
                          <input
                            type="url"
                            className="input-field"
                            style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem' }}
                            placeholder="https://drive.google.com/..."
                            value={proofLinkUrl}
                            onChange={e => setProofLinkUrl(e.target.value)}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                            Link Description
                          </label>
                          <input
                            type="text"
                            className="input-field"
                            style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem' }}
                            placeholder="e.g. Site Photos Folder"
                            value={proofLinkTitle}
                            onChange={e => setProofLinkTitle(e.target.value)}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowProofForm(false)}>Cancel</button>
                        <button
                          type="submit"
                          className="btn btn-primary btn-sm"
                          disabled={submittingProof}
                          style={{ background: 'var(--success)', borderColor: 'var(--success)' }}
                        >
                          {submittingProof ? 'Submitting...' : '🚀 Submit for Review'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            )}

            {/* Status Change Buttons — Role-Gated */}
            {(() => {
              const moves = getAllowedMoves(selectedTask, selectedTask.status);
              return moves.length > 0 ? (
                <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginRight: '0.25rem' }}>Move status to:</span>
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

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* INTERACTIVE COMMENTS & PROOF MEDIA TIMELINE */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <MessageSquare size={16} color="var(--accent-primary)" />
                  Activity, Comments & Proofs ({selectedTask.comments?.length || 0})
                </div>
              </div>

              <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem', paddingRight: '0.25rem' }}>
                {(!selectedTask.comments || selectedTask.comments.length === 0) ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    No comments or proofs yet. Post a progress update or submit completion proof above.
                  </div>
                ) : (
                  selectedTask.comments.map(c => (
                    <div
                      key={c.id}
                      style={{
                        padding: '0.75rem 0.85rem', borderRadius: 8,
                        background: c.is_proof ? 'rgba(16,185,129,0.06)' : 'var(--bg-tertiary)',
                        border: `1px solid ${c.is_proof ? 'rgba(16,185,129,0.3)' : 'var(--border-color)'}`
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <strong style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>👤 {c.author}</strong>
                          {c.author_role && <span className="badge badge-neutral" style={{ fontSize: '0.62rem' }}>{c.author_role}</span>}
                          {c.is_proof && (
                            <span className="badge badge-success" style={{ fontSize: '0.62rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                              <ShieldCheck size={10} /> Verified Proof
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(c.created_at).toLocaleDateString([], { day: '2-digit', month: 'short' })}
                        </span>
                      </div>

                      {c.text && (
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: (c.media_url || c.link_url) ? '0.5rem' : 0 }}>
                          {c.text}
                        </div>
                      )}

                      {/* Render Proof Media Image Attachment */}
                      {c.media_url && (
                        <div style={{ marginTop: '0.4rem', marginBottom: '0.4rem' }}>
                          <div
                            onClick={() => setLightboxImageUrl(c.media_url)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                              padding: '0.35rem 0.65rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)',
                              border: '1px solid var(--border-color)', cursor: 'pointer'
                            }}
                          >
                            <img src={c.media_url} alt="Proof Thumbnail" style={{ width: 42, height: 42, borderRadius: 4, objectFit: 'cover' }} />
                            <div>
                              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)' }}>{c.media_name || 'Proof Photo / Document'}</div>
                              <div style={{ fontSize: '0.65rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                <Eye size={10} /> Click to View Full Size
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Render Proof External URL / Link */}
                      {c.link_url && (
                        <div style={{ marginTop: '0.3rem' }}>
                          <a
                            href={c.link_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                              padding: '0.25rem 0.6rem', borderRadius: 4, background: 'rgba(99,102,241,0.12)',
                              color: 'var(--accent-primary)', fontSize: '0.72rem', textDecoration: 'none', fontWeight: 600
                            }}
                          >
                            <ExternalLink size={12} /> {c.link_title || c.link_url}
                          </a>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Standard Comment Composer */}
              <form onSubmit={handleAddComment} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Write a comment or progress note..."
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    style={{ flex: 1 }}
                  />

                  {/* Attachment Button */}
                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={(e) => handleFileUpload(e, setCommentMediaUrl, setCommentMediaName)}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach Image"
                    style={{ padding: '0.45rem 0.65rem', color: commentMediaUrl ? 'var(--success)' : 'var(--text-muted)' }}
                  >
                    <ImageIcon size={15} />
                  </button>

                  {/* Add Link Button */}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowLinkInput(!showLinkInput)}
                    title="Add External URL"
                    style={{ padding: '0.45rem 0.65rem', color: showLinkInput || commentLinkUrl ? 'var(--accent-primary)' : 'var(--text-muted)' }}
                  >
                    <LinkIcon size={15} />
                  </button>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={addingComment || (!newComment.trim() && !commentMediaUrl && !commentLinkUrl)}
                    style={{ padding: '0 1rem' }}
                  >
                    <Send size={15} /> Post
                  </button>
                </div>

                {/* Optional Media Preview below input */}
                {commentMediaUrl && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-tertiary)', padding: '0.35rem 0.65rem', borderRadius: 6, fontSize: '0.72rem' }}>
                    <img src={commentMediaUrl} alt="Preview" style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} />
                    <span style={{ flex: 1, color: 'var(--text-primary)' }}>Attached: {commentMediaName || 'Image'}</span>
                    <button type="button" onClick={() => { setCommentMediaUrl(null); setCommentMediaName(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
                  </div>
                )}

                {/* Optional Link Input below input */}
                {showLinkInput && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.5rem', background: 'var(--bg-tertiary)', padding: '0.5rem', borderRadius: 6 }}>
                    <input
                      type="url"
                      className="input-field"
                      style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}
                      placeholder="Paste URL (e.g. https://drive.google.com/...)"
                      value={commentLinkUrl}
                      onChange={e => setCommentLinkUrl(e.target.value)}
                    />
                    <input
                      type="text"
                      className="input-field"
                      style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}
                      placeholder="Link title (e.g. Report link)"
                      value={commentLinkTitle}
                      onChange={e => setCommentLinkTitle(e.target.value)}
                    />
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 1-CLICK DAILY ROUTINE TASK GENERATOR MODAL FOR CLIENTS */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {showDailyGenModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowDailyGenModal(false); }} style={{ zIndex: 9999 }}>
          <div className="modal-content animate-fade-in" style={{ maxWidth: 540, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Sparkles size={18} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Apply Daily Routine to Clients</h2>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Generate scheduled daily repeated tasks for clients in 1-click</div>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setShowDailyGenModal(false)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* 1. Select Template */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Select Routine Task Template *</label>
                <select
                  className="input-field"
                  value={dailyGenConfig.templateId || (templates[0]?.id || '')}
                  onChange={e => setDailyGenConfig(p => ({ ...p, templateId: e.target.value }))}
                >
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>📋 {t.title} ({t.priority} Priority)</option>
                  ))}
                </select>
              </div>

              {/* 2. Target Clients Selector */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Target Clients</label>
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <label style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="targetType"
                      checked={dailyGenConfig.targetType === 'all'}
                      onChange={() => setDailyGenConfig(p => ({ ...p, targetType: 'all' }))}
                    />
                    <span>All Active CRM Clients ({leads.length || 6} Clients)</span>
                  </label>
                  <label style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="targetType"
                      checked={dailyGenConfig.targetType === 'selected'}
                      onChange={() => setDailyGenConfig(p => ({ ...p, targetType: 'selected' }))}
                    />
                    <span>Choose Specific Clients</span>
                  </label>
                </div>

                {dailyGenConfig.targetType === 'selected' && (
                  <div style={{ maxHeight: 150, overflowY: 'auto', background: 'var(--bg-secondary)', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                    {leads.map(l => (
                      <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', padding: '0.25rem 0', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={dailyGenConfig.selectedClientIds.includes(l.id)}
                          onChange={e => {
                            if (e.target.checked) {
                              setDailyGenConfig(p => ({ ...p, selectedClientIds: [...p.selectedClientIds, l.id] }));
                            } else {
                              setDailyGenConfig(p => ({ ...p, selectedClientIds: p.selectedClientIds.filter(x => x !== l.id) }));
                            }
                          }}
                        />
                        <span><strong>{l.name}</strong> ({l.company_name || l.phone})</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. Assignee & Due Date */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Assign To Staff</label>
                  <select
                    className="input-field"
                    value={dailyGenConfig.assignee}
                    onChange={e => setDailyGenConfig(p => ({ ...p, assignee: e.target.value }))}
                  >
                    <option value="">Default Assignee</option>
                    {teamMembers.map(m => (
                      <option key={m.id} value={m.full_name}>{m.full_name} ({m.role})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Scheduled Due Date</label>
                  <input
                    type="date"
                    className="input-field"
                    value={dailyGenConfig.dueDate}
                    onChange={e => setDailyGenConfig(p => ({ ...p, dueDate: e.target.value }))}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowDailyGenModal(false)}>Cancel</button>
                <button
                  type="button"
                  className="btn"
                  disabled={generatingDaily}
                  onClick={handleGenerateDailyTasks}
                  style={{ background: 'var(--success)', color: 'white', fontWeight: 700 }}
                >
                  {generatingDaily ? 'Generating...' : '⚡ Generate & Assign Daily Tasks'}
                </button>
              </div>
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
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.25rem', paddingRight: '2.5rem' }}>Create New Task</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Task Title *</label>
                <input type="text" className="input-field" placeholder="Describe the task clearly..." value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
              </div>

              {/* Client Linking */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Related Client / Lead (Optional)</label>
                <select
                  className="input-field"
                  value={form.client_name}
                  onChange={e => {
                    const selectedLead = leads.find(l => l.name === e.target.value);
                    setForm(p => ({
                      ...p,
                      client_name: e.target.value,
                      client_phone: selectedLead?.phone || ''
                    }));
                  }}
                >
                  <option value="">-- Select Client / Customer --</option>
                  {leads.map(l => (
                    <option key={l.id} value={l.name}>{l.name} ({l.company_name || l.phone})</option>
                  ))}
                </select>
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
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Due Date</label>
                  <input type="date" className="input-field" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} />
                </div>
              </div>

              {/* Recurring Task Option */}
              <div style={{ padding: '0.65rem 0.85rem', borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={form.is_recurring}
                    onChange={e => setForm(p => ({ ...p, is_recurring: e.target.checked }))}
                  />
                  <span>🔁 Repeat Daily Routine for this Client</span>
                </label>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Description & Instructions</label>
                <textarea className="input-field textarea-field" rows="2" placeholder="Add instructions or site details..." value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
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

      {/* CREATE TEMPLATE MODAL */}
      {showAddTemplate && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAddTemplate(false); }}>
          <div className="modal-content animate-fade-in" style={{ maxWidth: 500 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Create Routine Template</h2>
              <button className="modal-close-btn" onClick={() => setShowAddTemplate(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Template Title *</label>
                <input type="text" className="input-field" placeholder="e.g. Daily Site Inspection & Photo Verification" value={tplForm.title} onChange={e => setTplForm(p => ({ ...p, title: e.target.value }))} />
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
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Description</label>
                <textarea className="input-field textarea-field" rows="2" placeholder="Standard operating procedure or inspection steps..." value={tplForm.description} onChange={e => setTplForm(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={() => setShowAddTemplate(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSaveTemplate} disabled={!tplForm.title.trim()}>Save Routine Template</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Image Preview Modal */}
      {lightboxImageUrl && (
        <div className="modal-overlay" onClick={() => setLightboxImageUrl(null)} style={{ background: 'rgba(0,0,0,0.85)', zIndex: 99999 }}>
          <div style={{ position: 'relative', maxWidth: 800, width: '90%' }} onClick={e => e.stopPropagation()}>
            <button
              className="modal-close-btn"
              onClick={() => setLightboxImageUrl(null)}
              style={{ position: 'absolute', top: -40, right: 0, color: '#ffffff' }}
            >
              ✕
            </button>
            <img
              src={lightboxImageUrl}
              alt="Proof Full Resolution"
              style={{ width: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)' }}
            />
          </div>
        </div>
      )}

      {/* Fixed Floating Toast */}
      {feedbackToast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 99999,
          background: 'rgba(15, 23, 42, 0.96)',
          border: `1px solid ${feedbackToast.type === 'success' ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)'}`,
          boxShadow: '0 15px 35px rgba(0,0,0,0.55), 0 0 20px rgba(16,185,129,0.15)',
          backdropFilter: 'blur(12px)', padding: '0.75rem 1.25rem', borderRadius: 10,
          color: feedbackToast.type === 'success' ? 'var(--success)' : 'var(--danger)',
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          fontSize: '0.85rem', fontWeight: 600, animation: 'slideUp 0.25s ease'
        }}>
          {feedbackToast.type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
          <span>{feedbackToast.text}</span>
          <button
            onClick={() => setFeedbackToast(null)}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 0 0 0.4rem', display: 'flex' }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

export default Tasks;
