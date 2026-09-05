import React, { useState, useEffect, useRef } from 'react';
import {
  CheckSquare, Clock, AlertCircle, CheckCircle2,
  Plus, Search, Filter, Calendar, List, Columns, X, RefreshCw,
  MessageSquare, Send, User, Tag, Check, ChevronRight, UserCheck,
  Trash2, FileText, BarChart3, Copy, ArrowRight, Image as ImageIcon,
  Paperclip, Link as LinkIcon, ExternalLink, ShieldCheck, Repeat,
  Building, Sparkles, AlertTriangle, Eye, UploadCloud, Edit3,
  Play, Pause, Zap, ToggleLeft, ToggleRight, CalendarDays, Users, Layers
} from 'lucide-react';
import {
  getTasks, createTask, updateTask, deleteTask, addTaskComment,
  getTeamMembers, getTaskTemplates, saveTaskTemplate, deleteTaskTemplate,
  getTasksByEmployee, getLeads, generateDailyTasksForClients,
  toggleTaskTemplateActive, checkAndRunRecurringTaskRoutines
} from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { Skeleton, SkeletonCard, SkeletonTable } from '../components/Skeleton';
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

const EMPTY_TEMPLATE = {
  id: null,
  title: '',
  description: '',
  priority: 'Medium',
  tags: [],
  default_assignee: '',
  is_auto_recurring: true,
  recurrence_type: 'daily', // 'daily', 'weekdays', 'weekly', 'interval_days', 'monthly'
  recurrence_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  interval_days: 1,
  assignee_target_type: 'all_employees', // 'all_employees', 'role', 'specific_employees', 'per_client'
  target_role: 'Sales Executive',
  target_employee_names: [],
  is_active: true,
};

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const Tasks = () => {
  const { user, canPerformAction } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [leadSearch, setLeadSearch] = useState('');
  const [view, setView] = useState('kanban');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_TASK);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('All');
  const [mobileActiveCol, setMobileActiveCol] = useState('All');
  const [taskTypeFilter, setTaskTypeFilter] = useState('all'); // 'all' | 'recurring' | 'manual'

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
  const [tplForm, setTplForm] = useState(EMPTY_TEMPLATE);
  const [runningRoutineId, setRunningRoutineId] = useState(null);
  const [runningAllRoutines, setRunningAllRoutines] = useState(false);

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
    triggerAutoRecurringCheck();
  }, []);

  const triggerAutoRecurringCheck = async () => {
    try {
      const res = await checkAndRunRecurringTaskRoutines();
      if (res?.totalTasksGenerated > 0) {
        await loadTasks();
        showToast(`✨ Auto-spawned ${res.totalTasksGenerated} routine tasks across ${res.triggeredRoutines.length} recurring routines for today!`);
      }
    } catch {}
  };

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
    setTplForm(EMPTY_TEMPLATE);
    showToast(tplForm.id ? 'Routine template updated!' : 'Routine template created with automated schedule!');
  };

  const handleEditTemplate = (tpl) => {
    setTplForm({
      id: tpl.id,
      title: tpl.title || '',
      description: tpl.description || '',
      priority: tpl.priority || 'Medium',
      tags: tpl.tags || [],
      default_assignee: tpl.default_assignee || '',
      is_auto_recurring: tpl.is_auto_recurring !== false,
      recurrence_type: tpl.recurrence_type || 'daily',
      recurrence_days: tpl.recurrence_days || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      interval_days: tpl.interval_days || 1,
      assignee_target_type: tpl.assignee_target_type || 'all_employees',
      target_role: tpl.target_role || 'Sales Executive',
      target_employee_names: tpl.target_employee_names || [],
      is_active: tpl.is_active !== false,
    });
    setShowAddTemplate(true);
  };

  const handleToggleTemplateActive = async (tpl) => {
    const nextActive = tpl.is_active === false ? true : false;
    await toggleTaskTemplateActive(tpl.id, nextActive);
    setTemplates(prev => prev.map(t => t.id === tpl.id ? { ...t, is_active: nextActive } : t));
    showToast(nextActive ? `🟢 Auto-loop enabled for "${tpl.title}"` : `⏸ Auto-loop paused for "${tpl.title}"`);
  };

  const handleRunTemplateNow = async (tpl) => {
    setRunningRoutineId(tpl.id);
    const res = await checkAndRunRecurringTaskRoutines(tpl.id);
    await loadTasks();
    await loadTemplates();
    setRunningRoutineId(null);
    showToast(`⚡ Generated ${res.totalTasksGenerated || 0} tasks for "${tpl.title}" for today!`);
  };

  const handleRunAllRoutinesNow = async () => {
    setRunningAllRoutines(true);
    const res = await checkAndRunRecurringTaskRoutines();
    await loadTasks();
    await loadTemplates();
    setRunningAllRoutines(false);
    if (res.totalTasksGenerated > 0) {
      showToast(`⚡ Successfully dispatched ${res.totalTasksGenerated} routine tasks for today across ${res.triggeredRoutines.length} routines!`);
    } else {
      showToast('All scheduled routines have already run for today. Click "⚡ Run Today" on individual cards to force extra generation.');
    }
  };

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('Delete this routine template?')) return;
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
    const assigned = (t.assigned_to || '').toLowerCase().trim();
    const uName = (user?.name || '').toLowerCase().trim();
    const uRole = (user?.role || '').toLowerCase().trim();
    const uEmail = (user?.email || '').toLowerCase().trim();
    const uId = (user?.id || '').toLowerCase().trim();

    if (!canViewAll) {
      // Global task (unassigned or assigned to All)
      if (!assigned || assigned === 'all' || assigned.includes('all team') || assigned.includes('all active') || assigned.includes('all employees')) return true;
      // Explicit match in both directions
      if (uName && (assigned.includes(uName) || uName.includes(assigned))) return true;
      if (uEmail && (assigned.includes(uEmail) || uEmail.includes(assigned))) return true;
      if (uId && assigned.includes(uId)) return true;
      // First name match (e.g. "pooja" matches "pooja kumari")
      const firstName = uName.split(' ')[0];
      if (firstName && firstName.length > 2 && assigned.includes(firstName)) return true;
      // Role match (e.g. Sales Executive, Field Agent)
      if (uRole && (assigned.includes(uRole) || assigned.includes(uRole.replace(' executive', '')))) return true;
      return false;
    }

    if (assigneeFilter === 'All') return true;
    if (assigneeFilter === 'My Tasks') {
      if (!assigned || assigned === 'all' || assigned.includes('all team')) return true;
      if (uName && (assigned.includes(uName) || uName.includes(assigned))) return true;
      if (uEmail && (assigned.includes(uEmail) || uEmail.includes(assigned))) return true;
      if (uId && assigned.includes(uId)) return true;
      if (uRole && assigned.includes(uRole)) return true;
      return false;
    }
    return t.assigned_to === assigneeFilter;
  };

  const isUserTaskOwner = (task) => {
    const assigned = (task.assigned_to || '').toLowerCase().trim();
    const uName = (user?.name || '').toLowerCase().trim();
    const uRole = (user?.role || '').toLowerCase().trim();
    const uEmail = (user?.email || '').toLowerCase().trim();
    const uId = (user?.id || '').toLowerCase().trim();

    if (!assigned || assigned === 'all' || assigned.includes('all team')) return true;
    if (uName && (assigned.includes(uName) || uName.includes(assigned))) return true;
    if (uEmail && (assigned.includes(uEmail) || uEmail.includes(assigned))) return true;
    if (uId && assigned.includes(uId)) return true;
    if (uRole && (assigned.includes(uRole) || assigned.includes(uRole.replace(' executive', '')))) return true;
    return false;
  };

  const matchesTypeFilter = (t) => {
    if (taskTypeFilter === 'recurring') return t.is_recurring === true;
    if (taskTypeFilter === 'manual') return !t.is_recurring;
    return true;
  };

  const tasksByCol = (col) => tasks.filter(t =>
    t.status === col &&
    matchesAssignee(t) &&
    matchesTypeFilter(t) &&
    (!search || t.title.toLowerCase().includes(search.toLowerCase()))
  );

  const allVisibleTasks = tasks.filter(t => matchesAssignee(t) && matchesTypeFilter(t) && (!search || t.title.toLowerCase().includes(search.toLowerCase())));
  const todayStr = new Date().toISOString().split('T')[0];
  const recurringTasks = tasks.filter(t => matchesAssignee(t) && t.is_recurring);
  const todayRecurring = recurringTasks.filter(t => t.due_date === todayStr || t.due_date?.startsWith(todayStr));
  const recurringDone = todayRecurring.filter(t => t.status === 'Done').length;
  const recurringPending = todayRecurring.filter(t => t.status === 'To Do' || t.status === 'In Progress').length;
  const recurringReview = todayRecurring.filter(t => t.status === 'Under Review').length;

  const statusBadge = { 'To Do': 'badge-neutral', 'In Progress': 'badge-warning', 'Under Review': 'badge-accent', 'Done': 'badge-success' };

  const getAllowedMoves = (task, currentCol) => {
    const isOwnTask = isUserTaskOwner(task);
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
            view === 'kanban' ? (
              <div className="kanban-board">
                {['To Do', 'In Progress', 'Under Review', 'Done'].map(col => (
                  <div key={col} className="kanban-col">
                    <div className="kanban-col-header">
                      <span className="kanban-col-title">{col}</span>
                      <span className="kanban-count">—</span>
                    </div>
                    <div className="kanban-cards">
                      <SkeletonCard height="110px" />
                      <SkeletonCard height="110px" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <SkeletonTable
                columns={['Task', 'Client', 'Assigned To', 'Priority', 'Due Date', 'Status / Proof', 'Actions']}
                rows={7}
                paginationLabel="tasks"
              />
            )
          ) : (
            <>
              {/* Admin Recurring Task Summary Bar */}
              {canViewAll && todayRecurring.length > 0 && (
                <div style={{
                  display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center',
                  padding: '0.65rem 1rem',
                  background: 'linear-gradient(90deg, rgba(99,102,241,0.08) 0%, rgba(16,185,129,0.06) 100%)',
                  border: '1px solid rgba(99,102,241,0.2)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '0.75rem',
                  fontSize: '0.8rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
                    <Repeat size={14} />
                    <span>Today's Recurring Routines ({todayRecurring.length} tasks)</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.55rem', borderRadius: 20, background: 'rgba(16,185,129,0.15)', color: 'var(--success)', fontSize: '0.75rem', fontWeight: 700 }}>
                      <CheckCircle2 size={12} /> {recurringDone} Done
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.55rem', borderRadius: 20, background: 'rgba(245,158,11,0.15)', color: 'var(--warning)', fontSize: '0.75rem', fontWeight: 700 }}>
                      <Clock size={12} /> {recurringPending} Pending
                    </span>
                    {recurringReview > 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.55rem', borderRadius: 20, background: 'rgba(99,102,241,0.15)', color: 'var(--accent-primary)', fontSize: '0.75rem', fontWeight: 700 }}>
                        <ShieldCheck size={12} /> {recurringReview} In Review
                      </span>
                    )}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.55rem', borderRadius: 20, background: 'rgba(16,185,129,0.1)', color: 'var(--success)', fontSize: '0.72rem', fontWeight: 600 }}>
                      ✅ {todayRecurring.length > 0 ? Math.round((recurringDone / todayRecurring.length) * 100) : 0}% Complete
                    </span>
                  </div>
                  <button
                    className="btn btn-secondary"
                    style={{ marginLeft: 'auto', fontSize: '0.72rem', padding: '0.25rem 0.65rem' }}
                    onClick={() => setTaskTypeFilter(taskTypeFilter === 'recurring' ? 'all' : 'recurring')}
                  >
                    {taskTypeFilter === 'recurring' ? '← Show All' : '🔁 View Daily Routines'}
                  </button>
                </div>
              )}

              {/* Status Column Filter Pills + Type Filter */}
              <div className="tasks-mobile-col-switcher">
                {[{ id: 'All', label: 'All', color: 'var(--text-muted)' },
                  { id: 'To Do', label: 'To Do', color: 'var(--text-muted)' },
                  { id: 'In Progress', label: 'In Progress', color: 'var(--warning)' },
                  { id: 'Under Review', label: 'Under Review', color: 'var(--accent-primary)' },
                  { id: 'Done', label: 'Done', color: 'var(--success)' }
                ].map(({ id: col, label, color }) => {
                  const count = col === 'All'
                    ? allVisibleTasks.length
                    : tasksByCol(col).length;
                  const isActive = mobileActiveCol === col;
                  return (
                    <button
                      key={col}
                      type="button"
                      className={`tasks-mobile-pill ${isActive ? 'active' : ''}`}
                      style={!isActive ? { borderColor: color, color } : {}}
                      onClick={() => setMobileActiveCol(col)}
                    >
                      <span>{label}</span>
                      <span className="tasks-mobile-pill-count">{count}</span>
                    </button>
                  );
                })}
                <div style={{ width: 1, height: 24, background: 'var(--border-color)', margin: '0 0.25rem', flexShrink: 0 }} />
                {[{ id: 'all', label: '📋 All Tasks' }, { id: 'recurring', label: '🔁 Routines' }, { id: 'manual', label: '✏️ One-Time Task' }].map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    className={`tasks-mobile-pill ${taskTypeFilter === id ? 'active' : ''}`}
                    style={taskTypeFilter === id ? {} : { borderStyle: 'dashed' }}
                    onClick={() => setTaskTypeFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Kanban Board */}
              {view === 'kanban' && (
                <div className="kanban-board">
                  {COLUMNS.filter(col => mobileActiveCol === 'All' || mobileActiveCol === col).map(col => {
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
                                  borderLeft: isUnderReview
                                    ? '3px solid var(--accent-primary)'
                                    : task.is_recurring
                                      ? '3px solid rgba(99,102,241,0.5)'
                                      : undefined,
                                }}
                              >
                                {isUnderReview && (
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.15rem 0.45rem', borderRadius: 4, background: 'rgba(99,102,241,0.15)', color: 'var(--accent-primary)', fontSize: '0.62rem', fontWeight: 800, marginBottom: '0.35rem' }}>
                                    <ShieldCheck size={11} /> ⏳ REVIEW REQUIRED
                                  </div>
                                )}

                                {task.is_recurring && !isUnderReview && (
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.1rem 0.4rem', borderRadius: 4, background: 'rgba(99,102,241,0.1)', color: 'var(--accent-primary)', fontSize: '0.6rem', fontWeight: 700, marginBottom: '0.3rem', border: '1px solid rgba(99,102,241,0.2)' }}>
                                    <Repeat size={9} /> 🔁 DAILY ROUTINE
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
                                    {task.tags.slice(0, 2).map(tag => <span key={tag} className="badge badge-neutral" style={{ fontSize: '0.62rem' }}>{tag}</span>)}
                                    {task.tags.length > 2 && <span className="badge badge-neutral" style={{ fontSize: '0.62rem' }}>+{task.tags.length - 2}</span>}
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
                      {tasks.filter(t => matchesAssignee(t) && matchesTypeFilter(t) && (!search || t.title.toLowerCase().includes(search.toLowerCase()))).map(task => {
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Automated Daily Routines & Task Loops Master</h2>
                <span className="badge badge-accent" style={{ fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Zap size={11} /> Auto-Dispatch Engine
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                Define recurring operational tasks once. The system automatically creates & assigns them to staff on scheduled days so you never have to re-type routine duties.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                className="btn"
                onClick={handleRunAllRoutinesNow}
                disabled={runningAllRoutines}
                style={{ background: 'var(--accent-primary)', color: 'white', fontWeight: 700 }}
                title="Evaluate and spawn all scheduled routine tasks for today"
              >
                {runningAllRoutines ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
                <span>{runningAllRoutines ? 'Running Engine...' : '⚡ Run Daily Routines Today'}</span>
              </button>
              <button className="btn" onClick={() => setShowDailyGenModal(true)} style={{ background: 'var(--success)', color: 'white', fontWeight: 700 }}>
                <Sparkles size={14} /> Batch To Clients
              </button>
              <button className="btn btn-primary" onClick={() => { setTplForm(EMPTY_TEMPLATE); setShowAddTemplate(true); }}>
                <Plus size={14} /> Create Routine Template
              </button>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div className="glass-card" style={{ padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(99,102,241,0.15)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Repeat size={18} />
              </div>
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{templates.length}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Routines</div>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(16,185,129,0.15)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Zap size={18} />
              </div>
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--success)' }}>
                  {templates.filter(t => t.is_auto_recurring && t.is_active !== false).length}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Active Auto-Loops</div>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(245,158,11,0.15)', color: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CalendarDays size={18} />
              </div>
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--warning)' }}>
                  {templates.filter(t => t.recurrence_type === 'daily' || t.recurrence_type === 'weekdays').length}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Daily & Weekday Routines</div>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(6,182,212,0.15)', color: 'var(--accent-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={18} />
              </div>
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-secondary)' }}>
                  {teamMembers.length}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Staff Members in Pool</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
            {templates.map(tpl => {
              const isAuto = tpl.is_auto_recurring !== false;
              const isActive = tpl.is_active !== false;
              const recType = tpl.recurrence_type || 'daily';
              const targetType = tpl.assignee_target_type || 'all_employees';

              let recLabel = 'Daily (All 7 Days)';
              if (recType === 'weekdays') recLabel = 'Weekdays (Mon - Fri)';
              if (recType === 'weekly') recLabel = `Weekly on ${Array.isArray(tpl.recurrence_days) ? tpl.recurrence_days.join(', ') : 'Mon'}`;
              if (recType === 'interval_days') recLabel = `Every ${tpl.interval_days || 1} Days`;
              if (recType === 'monthly') recLabel = `Monthly on Day ${tpl.interval_days || 1}`;

              let targetLabel = 'All Active Staff';
              if (targetType === 'role') targetLabel = `All ${tpl.target_role || 'Staff'} Members`;
              if (targetType === 'specific_employees') targetLabel = Array.isArray(tpl.target_employee_names) && tpl.target_employee_names.length > 0 ? tpl.target_employee_names.join(', ') : (tpl.default_assignee || 'Specific Staff');
              if (targetType === 'per_client') targetLabel = 'Per Active CRM Client';

              return (
                <div
                  key={tpl.id}
                  className="glass-card"
                  style={{
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    border: isActive ? '1px solid var(--border-color)' : '1px dashed var(--border-color)',
                    opacity: isActive ? 1 : 0.75,
                    transition: 'all 0.2s ease'
                  }}
                >
                  {/* Card Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div>
                      <h3 style={{ fontSize: '0.98rem', fontWeight: 700, margin: '0 0 0.25rem 0' }}>{tpl.title}</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <span className="badge" style={{ fontSize: '0.65rem', color: priorityColors[tpl.priority], borderColor: priorityColors[tpl.priority] }}>
                          {tpl.priority} Priority
                        </span>
                        {isAuto ? (
                          <span
                            onClick={() => handleToggleTemplateActive(tpl)}
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              padding: '0.15rem 0.45rem',
                              borderRadius: 6,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.2rem',
                              background: isActive ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                              color: isActive ? 'var(--success)' : 'var(--warning)',
                              border: `1px solid ${isActive ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`
                            }}
                            title="Click to toggle active/pause"
                          >
                            {isActive ? <Play size={10} /> : <Pause size={10} />}
                            <span>{isActive ? 'Auto-Loop ON' : 'Loop Paused'}</span>
                          </span>
                        ) : (
                          <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>Manual Template</span>
                        )}
                      </div>
                    </div>

                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleEditTemplate(tpl)}
                      style={{ padding: '0.25rem 0.45rem', fontSize: '0.7rem' }}
                      title="Edit Routine Schedule & Details"
                    >
                      <Edit3 size={13} />
                    </button>
                  </div>

                  {/* Description */}
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4, flex: 1 }}>
                    {tpl.description || 'Standard routine duty.'}
                  </p>

                  {/* Automation Details Box */}
                  <div style={{ background: 'var(--bg-tertiary)', borderRadius: 8, padding: '0.6rem 0.75rem', fontSize: '0.73rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
                      <Repeat size={13} />
                      <span>{recLabel}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)' }}>
                      <Users size={13} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Assigns: <strong>{targetLabel}</strong>
                      </span>
                    </div>
                    {tpl.last_generated_date && (
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        Last Spawned: {tpl.last_generated_date === new Date().toISOString().split('T')[0] ? '🟢 Today' : tpl.last_generated_date}
                      </div>
                    )}
                  </div>

                  {tpl.tags?.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                      {tpl.tags.map(t => <span key={t} className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>{t}</span>)}
                    </div>
                  )}

                  {/* Card Actions */}
                  <div style={{ display: 'flex', gap: '0.4rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-sm"
                      onClick={() => handleRunTemplateNow(tpl)}
                      disabled={runningRoutineId === tpl.id}
                      style={{ flex: 1, justifyContent: 'center', background: 'var(--accent-primary)', color: 'white', fontWeight: 600, fontSize: '0.72rem' }}
                      title="Force run today's routine tasks immediately"
                    >
                      {runningRoutineId === tpl.id ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />}
                      <span>{runningRoutineId === tpl.id ? 'Running...' : '⚡ Run Today'}</span>
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleCreateFromTemplate(tpl)}
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem' }}
                      title="Create a one-off single task from this"
                    >
                      <Plus size={12} /> Single
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setDailyGenConfig(p => ({ ...p, templateId: tpl.id }));
                        setShowDailyGenModal(true);
                      }}
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', color: 'var(--success)' }}
                      title="Batch instantiate for selected clients"
                    >
                      <Sparkles size={12} /> Batch
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleDeleteTemplate(tpl.id)}
                      style={{ padding: '0.25rem 0.45rem', color: 'var(--danger)' }}
                      title="Delete Template"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
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

              {/* Client Linking — with live search */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Related Client / Lead (Optional)</label>
                {/* Search box */}
                <div style={{ position: 'relative', marginBottom: '0.4rem' }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Search client name, company, or phone..."
                    value={leadSearch}
                    onChange={e => setLeadSearch(e.target.value)}
                    style={{ paddingLeft: '2rem', fontSize: '0.78rem' }}
                  />
                </div>
                <select
                  className="input-field"
                  value={form.client_name}
                  size={Math.min(6, (leads.filter(l =>
                    !leadSearch ||
                    (l.name || '').toLowerCase().includes(leadSearch.toLowerCase()) ||
                    (l.company_name || '').toLowerCase().includes(leadSearch.toLowerCase()) ||
                    (l.phone || '').includes(leadSearch)
                  ).length) + 1)}
                  style={{ height: 'auto', maxHeight: 180, overflow: 'auto' }}
                  onChange={e => {
                    const selectedLead = leads.find(l => l.name === e.target.value);
                    setForm(p => ({
                      ...p,
                      client_name: e.target.value,
                      client_phone: selectedLead?.phone || ''
                    }));
                  }}
                >
                  <option value="">-- No Client Selected (Optional) --</option>
                  {leads
                    .filter(l =>
                      !leadSearch ||
                      (l.name || '').toLowerCase().includes(leadSearch.toLowerCase()) ||
                      (l.company_name || '').toLowerCase().includes(leadSearch.toLowerCase()) ||
                      (l.phone || '').includes(leadSearch)
                    )
                    .map(l => (
                      <option key={l.id} value={l.name}>
                        {l.name}{l.company_name ? ` — ${l.company_name}` : ''}{l.phone ? ` (${l.phone})` : ''}
                      </option>
                    ))
                  }
                  {leads.length === 0 && (
                    <option disabled>No leads found — add leads in CRM first</option>
                  )}
                </select>
                {form.client_name && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem', padding: '0.3rem 0.6rem', background: 'rgba(16,185,129,0.08)', borderRadius: 6, fontSize: '0.72rem', color: 'var(--success)' }}>
                    <User size={12} />
                    <span>Selected: <strong>{form.client_name}</strong>{form.client_phone ? ` · ${form.client_phone}` : ''}</span>
                    <button type="button" onClick={() => { setForm(p => ({ ...p, client_name: '', client_phone: '' })); setLeadSearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', marginLeft: 'auto', lineHeight: 1 }}>✕</button>
                  </div>
                )}
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

      {/* CREATE & EDIT RECURRING ROUTINE TEMPLATE MODAL */}
      {showAddTemplate && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAddTemplate(false); }} style={{ zIndex: 9999 }}>
          <div className="modal-content animate-fade-in" style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Repeat size={18} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                    {tplForm.id ? 'Edit Routine Schedule & Template' : 'Create Automated Routine Template'}
                  </h2>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Set predefined tasks once to automatically loop across staff daily or on custom schedules.
                  </div>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setShowAddTemplate(false)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
              {/* 1. Basic Title & Priority */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                  Routine Task Title *
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Daily Morning Client Calling & Inquiries"
                  value={tplForm.title}
                  onChange={e => setTplForm(p => ({ ...p, title: e.target.value }))}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Priority</label>
                  <select className="input-field" value={tplForm.priority} onChange={e => setTplForm(p => ({ ...p, priority: e.target.value }))}>
                    <option>High</option><option>Medium</option><option>Low</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Fallback Assignee</label>
                  <select className="input-field" value={tplForm.default_assignee} onChange={e => setTplForm(p => ({ ...p, default_assignee: e.target.value }))}>
                    <option value="">-- Auto-Assign Rule Below --</option>
                    {teamMembers.map(m => <option key={m.id} value={m.full_name}>{m.full_name} ({m.role})</option>)}
                  </select>
                </div>
              </div>

              {/* 2. Automated Loop Schedule Configuration Panel */}
              <div style={{ padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 10, border: '1.5px solid rgba(99,102,241,0.3)', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent-primary)' }}>
                      <Zap size={14} /> Automated Recurrence Loop
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Auto-generate tasks without manual typing
                    </div>
                  </div>

                  <div
                    onClick={() => setTplForm(p => ({ ...p, is_auto_recurring: !p.is_auto_recurring }))}
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    {tplForm.is_auto_recurring ? (
                      <ToggleRight size={32} color="var(--success)" />
                    ) : (
                      <ToggleLeft size={32} color="var(--text-muted)" />
                    )}
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: tplForm.is_auto_recurring ? 'var(--success)' : 'var(--text-muted)' }}>
                      {tplForm.is_auto_recurring ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>

                {tplForm.is_auto_recurring && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                        Repeat Frequency
                      </label>
                      <select
                        className="input-field"
                        value={tplForm.recurrence_type}
                        onChange={e => setTplForm(p => ({ ...p, recurrence_type: e.target.value }))}
                      >
                        <option value="daily">🔁 Daily (Every Single Day - 7 Days)</option>
                        <option value="weekdays">📅 Weekdays Only (Monday to Friday)</option>
                        <option value="weekly">🗓️ Specific Days of the Week (Custom Days)</option>
                        <option value="interval_days">⏳ Custom Interval (Every N Days)</option>
                        <option value="monthly">📆 Monthly (On a specific day of month)</option>
                      </select>
                    </div>

                    {/* Specific Days Picker */}
                    {tplForm.recurrence_type === 'weekly' && (
                      <div>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                          Select Active Days of Week:
                        </label>
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                          {DAYS_OF_WEEK.map(day => {
                            const isSelected = Array.isArray(tplForm.recurrence_days) && tplForm.recurrence_days.includes(day);
                            return (
                              <button
                                key={day}
                                type="button"
                                className="btn btn-sm"
                                style={{
                                  fontSize: '0.72rem',
                                  padding: '0.25rem 0.55rem',
                                  background: isSelected ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                                  color: isSelected ? 'white' : 'var(--text-secondary)',
                                  border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-color)'}`
                                }}
                                onClick={() => {
                                  const current = Array.isArray(tplForm.recurrence_days) ? tplForm.recurrence_days : [];
                                  if (isSelected) {
                                    setTplForm(p => ({ ...p, recurrence_days: current.filter(d => d !== day) }));
                                  } else {
                                    setTplForm(p => ({ ...p, recurrence_days: [...current, day] }));
                                  }
                                }}
                              >
                                {day}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Custom Interval Input */}
                    {tplForm.recurrence_type === 'interval_days' && (
                      <div>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                          Repeat Every (in Days):
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="90"
                          className="input-field"
                          value={tplForm.interval_days || 1}
                          onChange={e => setTplForm(p => ({ ...p, interval_days: Number(e.target.value) }))}
                        />
                      </div>
                    )}

                    {/* Monthly Day Input */}
                    {tplForm.recurrence_type === 'monthly' && (
                      <div>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                          On Day of the Month (1-31):
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          className="input-field"
                          value={tplForm.interval_days || 1}
                          onChange={e => setTplForm(p => ({ ...p, interval_days: Number(e.target.value) }))}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 3. Auto-Assign Target Rules */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                  👥 Target Staff Assignment Rule
                </label>
                <select
                  className="input-field"
                  value={tplForm.assignee_target_type}
                  onChange={e => setTplForm(p => ({ ...p, assignee_target_type: e.target.value }))}
                >
                  <option value="all_employees">All Active Staff (Auto-spawns a task for each team member)</option>
                  <option value="role">By Position / Role (Auto-spawns for all employees in chosen role)</option>
                  <option value="specific_employees">Specific Selected Staff Members</option>
                  <option value="per_client">Per Active CRM Client (Creates task for each client in CRM)</option>
                </select>

                {/* Sub-inputs based on mode */}
                {tplForm.assignee_target_type === 'role' && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Select Role / Position:</label>
                    <select
                      className="input-field"
                      value={tplForm.target_role}
                      onChange={e => setTplForm(p => ({ ...p, target_role: e.target.value }))}
                    >
                      {['Sales Executive', 'Field Agent', 'Accounts', 'Manager', 'Support Agent'].map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                )}

                {tplForm.assignee_target_type === 'specific_employees' && (
                  <div style={{ marginTop: '0.5rem', maxHeight: 120, overflowY: 'auto', background: 'var(--bg-secondary)', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                    {teamMembers.map(m => {
                      const isChecked = Array.isArray(tplForm.target_employee_names) && tplForm.target_employee_names.includes(m.full_name);
                      return (
                        <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', padding: '0.2rem 0', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={e => {
                              const curr = Array.isArray(tplForm.target_employee_names) ? tplForm.target_employee_names : [];
                              if (e.target.checked) {
                                setTplForm(p => ({ ...p, target_employee_names: [...curr, m.full_name] }));
                              } else {
                                setTplForm(p => ({ ...p, target_employee_names: curr.filter(n => n !== m.full_name) }));
                              }
                            }}
                          />
                          <span><strong>{m.full_name}</strong> ({m.role})</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 4. Description & Instructions */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Description & Instructions for Staff</label>
                <textarea
                  className="input-field textarea-field"
                  rows={2}
                  placeholder="Standard operating procedure, inspection checklist, or calling guidelines..."
                  value={tplForm.description}
                  onChange={e => setTplForm(p => ({ ...p, description: e.target.value }))}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddTemplate(false)}>Cancel</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSaveTemplate}
                  disabled={!tplForm.title.trim()}
                >
                  {tplForm.id ? 'Save Changes' : 'Save Routine Template'}
                </button>
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
