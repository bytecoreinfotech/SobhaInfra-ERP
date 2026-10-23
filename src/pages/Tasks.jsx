import React, { useState, useEffect, useRef } from 'react';
import {
  CheckSquare, Clock, AlertCircle, CheckCircle2,
  Plus, Search, Filter, Calendar, List, Columns, X, RefreshCw,
  MessageSquare, Send, User, Tag, Check, ChevronRight, UserCheck,
  Trash2, FileText, BarChart3, Copy, ArrowRight, Image as ImageIcon,
  Paperclip, Link as LinkIcon, ExternalLink, ShieldCheck, Repeat,
  Building, Sparkles, AlertTriangle, Eye, UploadCloud, Edit3,
  Play, Pause, Zap, ToggleLeft, ToggleRight, CalendarDays, Users, Layers,
  FileSpreadsheet, FileArchive, Download, File
} from 'lucide-react';
import {
  getTasks, getTaskComments, createTask, updateTask, deleteTask, addTaskComment,
  getTeamMembers, getTaskTemplates, saveTaskTemplate, deleteTaskTemplate,
  getTasksByEmployee, getLeads, generateDailyTasksForClients,
  toggleTaskTemplateActive, checkAndRunRecurringTaskRoutines, advanceTaskToNextDay,
  getTodayDateStr, getNextDateStr, formatTaskDate,
  checkDayStatus, getNextWorkingDay, isHolidayExceptionalTask,
  setWorkingDayOverride, getWorkingDayOverrides, clearWorkingDayOverride, isSpecialWorkingDay
} from '../lib/db';
import { getFileCategory, formatBytes } from '../lib/storage';
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
  recurrence_interval: 'Daily',
  is_holiday_work: false,
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
  run_on_holidays: false,
};


const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const Tasks = () => {
  const { user, canPerformAction } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [view, setView] = useState('kanban');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_TASK);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('All');
  const [mobileActiveCol, setMobileActiveCol] = useState('All');
  const [taskTypeFilter, setTaskTypeFilter] = useState('all'); // 'all' | 'recurring' | 'manual'
  const [taskDateFilter, setTaskDateFilter] = useState('all'); // 'all' | 'today' | 'yesterday' | 'overdue' | 'custom'
  const [customDateFilter, setCustomDateFilter] = useState('');

  // Task Details & Comment Drawer
  const [selectedTask, setSelectedTask] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [commentMediaUrl, setCommentMediaUrl] = useState(null);
  const [commentMediaName, setCommentMediaName] = useState('');
  const [commentMediaSize, setCommentMediaSize] = useState(null);
  const [commentMediaType, setCommentMediaType] = useState('image');
  const [commentLinkUrl, setCommentLinkUrl] = useState('');
  const [commentLinkTitle, setCommentLinkTitle] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [addingComment, setAddingComment] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);

  // Employee Proof Submission Panel
  const [showProofForm, setShowProofForm] = useState(false);
  const [proofText, setProofText] = useState('');
  const [proofMediaUrl, setProofMediaUrl] = useState(null);
  const [proofMediaName, setProofMediaName] = useState('');
  const [proofMediaSize, setProofMediaSize] = useState(null);
  const [proofMediaType, setProofMediaType] = useState('image');
  const [proofLinkUrl, setProofLinkUrl] = useState('');
  const [proofLinkTitle, setProofLinkTitle] = useState('');
  const [submittingProof, setSubmittingProof] = useState(false);

  // Supervisor Review Revision Feedback
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionFeedback, setRevisionFeedback] = useState('');

  // Media Lightbox Preview (Image, PDF, Spreadsheets, Documents)
  const [lightboxMedia, setLightboxMedia] = useState(null); // { url, name, type, size }

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
  const [workingDayTrigger, setWorkingDayTrigger] = useState(0);
  const [dailyGenConfig, setDailyGenConfig] = useState({
    templateId: '',
    targetType: 'all', // 'all' | 'selected'
    selectedClientIds: [],
    assignee: '',
    dueDate: getTodayDateStr(),
    forceHolidayRun: false
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
    const initPageTasks = async () => {
      try {
        await checkAndRunRecurringTaskRoutines();
      } catch (err) {
        console.warn('Initial recurring routine check notice:', err);
      }
      await Promise.all([loadTasks(), loadTemplates()]);
    };
    initPageTasks();
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
    // A failed read must never look like "no tasks" — surface it with a retry.
    setLoadError(taskRes.error || null);
    setTasks(taskRes.data || []);
    setTeamMembers(membersRes.data || []);
    setLeads(leadsRes.data || []);
    setLoading(false);
  };

  // Always fetch fresh comments & proofs whenever a task drawer is opened,
  // guaranteeing SuperAdmin & Supervisors instantly see what employees submitted.
  useEffect(() => {
    if (!selectedTask?.id) return;
    let cancelled = false;
    const taskId = selectedTask.id;
    setCommentsLoading(true);
    getTaskComments(taskId).then(({ data, error }) => {
      if (cancelled) return;
      setCommentsLoading(false);
      if (error) return;
      setSelectedTask(prev => (prev && prev.id === taskId ? { ...prev, comments: data, _commentsDeferred: false } : prev));
      setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, comments: data, _commentsDeferred: false } : t)));
    }).catch(() => {
      if (!cancelled) setCommentsLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedTask?.id]);

  // Manual one-click refresh for task activity & proofs
  const handleRefreshTaskComments = async () => {
    if (!selectedTask?.id) return;
    setCommentsLoading(true);
    try {
      const { data } = await getTaskComments(selectedTask.id);
      if (data) {
        setSelectedTask(prev => (prev && prev.id === selectedTask.id ? { ...prev, comments: data, _commentsDeferred: false } : prev));
        setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, comments: data, _commentsDeferred: false } : t));
        showToast('Activity & proofs refreshed.');
      }
    } catch {}
    setCommentsLoading(false);
  };

  // Auto-sync tasks board every 25 seconds so SuperAdmin gets employee submissions in real-time
  useEffect(() => {
    if (activeSubTab !== 'tasks') return;
    const interval = setInterval(async () => {
      try {
        const { data: latestTasks } = await getTasks();
        if (latestTasks && latestTasks.length > 0) {
          setTasks(prev => {
            // Merge status updates smoothly
            const map = new Map(latestTasks.map(t => [t.id, t]));
            return prev.map(t => map.get(t.id) || t);
          });
        }
      } catch {}
    }, 25000);
    return () => clearInterval(interval);
  }, [activeSubTab]);

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
    const { data, error } = await createTask(form);
    if (data) {
      setTasks(prev => [data, ...prev]);
      showToast('Task created successfully!');
      setShowAdd(false);
      setForm(EMPTY_TASK);
    } else {
      // Keep the form open so nothing the user typed is lost.
      showToast(`Task could NOT be saved: ${error?.message || 'database error'}. Please retry.`, 'error');
    }
    setSaving(false);
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

    const previousStatus = task.status;
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    if (selectedTask?.id === task.id) {
      setSelectedTask(prev => ({ ...prev, status: newStatus }));
    }
    const { error: moveErr } = await updateTask(task.id, { status: newStatus });
    if (moveErr) {
      // Roll back the optimistic move so the board matches the database.
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: previousStatus } : t));
      if (selectedTask?.id === task.id) setSelectedTask(prev => ({ ...prev, status: previousStatus }));
      showToast(`Could not update task: ${moveErr.message}`, 'error');
      return;
    }
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

  // Helper to handle general file uploads (Images, PDFs, Excel/Sheets, Docs, Zip archives)
  const handleFileUpload = (e, setUrl, setName, setSize, setType) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    const isDoc = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'zip', 'rar', '7z', 'txt', 'rtf', 'ppt', 'pptx'].includes(ext);
    const maxBytes = isDoc ? 50 * 1024 * 1024 : 25 * 1024 * 1024;

    if (file.size > maxBytes) {
      showToast(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is ${isDoc ? 50 : 25} MB.`, 'error');
      e.target.value = '';
      return;
    }

    setName(file.name);
    if (setSize) setSize(file.size);
    const category = getFileCategory(file.name, file.type);
    if (setType) setType(category);

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
      media_type: commentMediaType || getFileCategory(commentMediaName),
      media_size: commentMediaSize || null,
      link_url: commentLinkUrl.trim() || null,
      link_title: commentLinkTitle.trim() || null,
      is_proof: false,
    };

    const { data: createdComment, error: commentErr } = await addTaskComment(selectedTask.id, commentPayload, authorName);

    if (!createdComment) {
      showToast(`Comment not saved: ${commentErr?.message || 'database error'}`, 'error');
    }

    if (createdComment) {
      const updatedComments = [...(selectedTask.comments || []), createdComment];
      setSelectedTask(prev => ({ ...prev, comments: updatedComments }));
      setTasks(prev => prev.map(t =>
        t.id === selectedTask.id ? { ...t, comments: updatedComments } : t
      ));
      setNewComment('');
      setCommentMediaUrl(null);
      setCommentMediaName('');
      setCommentMediaSize(null);
      setCommentMediaType('image');
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
      media_type: proofMediaType || getFileCategory(proofMediaName),
      media_size: proofMediaSize || null,
      link_url: proofLinkUrl.trim() || null,
      link_title: proofLinkTitle.trim() || 'Proof Document / Link',
      is_proof: true,
    };

    // 1. Add proof comment
    const { data: createdComment, error: proofErr } = await addTaskComment(selectedTask.id, proofComment, authorName);
    if (!createdComment) {
      // Do not move the task to review without its proof actually saved.
      showToast(`Proof not saved: ${proofErr?.message || 'upload failed'}. Please retry.`, 'error');
      setSubmittingProof(false);
      return;
    }

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
    setProofMediaSize(null);
    setProofMediaType('image');
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

    // Auto-advance: If task is a daily recurring task, schedule the fresh occurrence for the next day
    if (selectedTask.is_recurring) {
      const nextDue = getNextDateStr(selectedTask.due_date || getTodayDateStr());

      const nextTaskPayload = {
        title: selectedTask.title,
        description: selectedTask.description || '',
        status: 'To Do',
        priority: selectedTask.priority || 'Medium',
        due_date: nextDue,
        tags: selectedTask.tags || [],
        assigned_to: selectedTask.assigned_to || '',
        client_name: selectedTask.client_name || '',
        client_phone: selectedTask.client_phone || '',
        is_recurring: true,
        recurrence_interval: selectedTask.recurrence_interval || 'Daily',
      };
      const { data: nextCreated } = await createTask(nextTaskPayload);
      if (nextCreated) {
        setTasks(prev => [nextCreated, ...prev.map(t => t.id === selectedTask.id ? updatedTask : t)]);
        setSelectedTask(updatedTask);
        showToast(`Task approved! Next daily routine scheduled for ${nextDue} 🔁`);
        return;
      }
    }

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
      forceHolidayRun: dailyGenConfig.forceHolidayRun
    });

    if (created && created.length > 0) {
      setTasks(prev => [...created, ...prev]);
      setShowDailyGenModal(false);
      showToast(`⚡ Successfully scheduled ${created.length} daily tasks for ${dailyGenConfig.dueDate}!`);
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
    const todayStr = getTodayDateStr();
    const todayStat = checkDayStatus(todayStr);

    let shouldForce = false;
    if (todayStat.isNonWorking) {
      const confirmRun = window.confirm(
        `Today (${todayStr}) is a ${todayStat.reason}. Standard recurring routines normally pause on non-working days.\n\n` +
        `Is your office or project site open as regular today?\n\n` +
        `Click "OK" to FORCE run all daily routines for today.\n` +
        `Click "Cancel" to keep standard holiday pause.`
      );
      if (!confirmRun) {
        setRunningAllRoutines(false);
        return;
      }
      shouldForce = true;
    }

    const res = await checkAndRunRecurringTaskRoutines(null, shouldForce);
    await loadTasks();
    await loadTemplates();
    setRunningAllRoutines(false);
    if (res.totalTasksGenerated > 0) {
      showToast(`⚡ Successfully dispatched ${res.totalTasksGenerated} routine tasks for today across ${res.triggeredRoutines.length} routines!`);
    } else {
      showToast(shouldForce
        ? 'All routines have already run for today.'
        : 'All scheduled routines have already run for today. Click "⚡ Run Today" on individual cards to force extra generation.');
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
      due_date: getTodayDateStr(),
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
    const uEmail = (user?.email || '').toLowerCase().trim();
    const uId = (user?.id || '').toLowerCase().trim();

    // STRICT EMPLOYEE PRIVACY: Non-Super-Admins can ONLY view tasks specifically assigned to them
    if (!canViewAll) {
      if (!assigned) return false; // Unassigned tasks are NEVER visible to individual employees
      // Match strictly against logged-in employee name, email, or id
      if (uName && (assigned === uName || assigned.includes(uName) || uName.includes(assigned))) return true;
      if (uEmail && (assigned === uEmail || assigned.includes(uEmail) || uEmail.includes(assigned))) return true;
      if (uId && assigned.includes(uId)) return true;
      return false;
    }

    // Super Admin / Supervisor filtering
    if (assigneeFilter === 'All') return true;
    if (assigneeFilter === 'My Tasks') {
      if (!assigned) return false;
      if (uName && (assigned.includes(uName) || uName.includes(assigned))) return true;
      if (uEmail && (assigned.includes(uEmail) || uEmail.includes(assigned))) return true;
      if (uId && assigned.includes(uId)) return true;
      return false;
    }

    // Filter by specific employee name
    const filterTarget = (assigneeFilter || '').toLowerCase().trim();
    return assigned === filterTarget || assigned.includes(filterTarget) || filterTarget.includes(assigned);
  };

  const isUserTaskOwner = (task) => {
    const assigned = (task.assigned_to || '').toLowerCase().trim();
    const uName = (user?.name || '').toLowerCase().trim();
    const uEmail = (user?.email || '').toLowerCase().trim();
    const uId = (user?.id || '').toLowerCase().trim();

    if (!assigned) return false;
    if (uName && (assigned.includes(uName) || uName.includes(assigned))) return true;
    if (uEmail && (assigned.includes(uEmail) || uEmail.includes(assigned))) return true;
    if (uId && assigned.includes(uId)) return true;
    return false;
  };

  const todayStr = getTodayDateStr();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = getTodayDateStr(yesterdayDate);

  const matchesTypeFilter = (t) => {
    if (taskTypeFilter === 'recurring') return t.is_recurring === true;
    if (taskTypeFilter === 'manual') return !t.is_recurring;
    return true;
  };

  const matchesDateFilter = (t) => {
    if (taskDateFilter === 'all') return true;
    const d = (t.due_date || '').split('T')[0];
    if (taskDateFilter === 'today') return d === todayStr;
    if (taskDateFilter === 'yesterday') return d === yesterdayStr;
    if (taskDateFilter === 'overdue') return d && d < todayStr && t.status !== 'Done';
    if (taskDateFilter === 'custom' && customDateFilter) return d === customDateFilter;
    return true;
  };

  const tasksByCol = (col) => tasks.filter(t =>
    t.status === col &&
    matchesAssignee(t) &&
    matchesTypeFilter(t) &&
    matchesDateFilter(t) &&
    (!search || t.title.toLowerCase().includes(search.toLowerCase()))
  );

  const allVisibleTasks = tasks.filter(t =>
    matchesAssignee(t) &&
    matchesTypeFilter(t) &&
    matchesDateFilter(t) &&
    (!search || t.title.toLowerCase().includes(search.toLowerCase()))
  );

  const countToday = tasks.filter(t => matchesAssignee(t) && matchesTypeFilter(t) && (t.due_date || '').split('T')[0] === todayStr).length;
  const countYesterday = tasks.filter(t => matchesAssignee(t) && matchesTypeFilter(t) && (t.due_date || '').split('T')[0] === yesterdayStr).length;
  const countOverdue = tasks.filter(t => matchesAssignee(t) && matchesTypeFilter(t) && (t.due_date || '').split('T')[0] < todayStr && t.status !== 'Done').length;

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

              {/* Task Type Filter Buttons */}
              <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                {[
                  { id: 'all', label: 'All Tasks' },
                  { id: 'recurring', label: '🔁 Routines' },
                  { id: 'manual', label: 'Single' },
                ].map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTaskTypeFilter(t.id)}
                    className="btn"
                    style={{
                      borderRadius: 0,
                      background: taskTypeFilter === t.id ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                      color: taskTypeFilter === t.id ? 'white' : 'var(--text-secondary)',
                      padding: '0.4rem 0.65rem',
                      fontSize: '0.74rem',
                      fontWeight: taskTypeFilter === t.id ? 700 : 500,
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
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
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setForm({ ...EMPTY_TASK, due_date: getTodayDateStr() });
                    setShowAdd(true);
                  }}
                >
                  <Plus size={15} /> Create Task
                </button>
              )}
            </div>
          </div>

          {/* 📅 Date-Wise Filter Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flexWrap: 'wrap',
            marginBottom: '1rem',
            padding: '0.55rem 0.85rem',
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
            fontSize: '0.78rem'
          }}>
            <span style={{ color: 'var(--text-muted)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <Calendar size={13} color="var(--accent-primary)" /> Date Filter:
            </span>

            {[
              { id: 'all', label: `All Dates (${tasks.length})` },
              { id: 'today', label: `🟢 Today (${countToday})` },
              { id: 'yesterday', label: `⏪ Yesterday (${countYesterday})` },
              { id: 'overdue', label: `⚠ Overdue (${countOverdue})` },
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => { setTaskDateFilter(f.id); setCustomDateFilter(''); }}
                style={{
                  padding: '0.3rem 0.75rem',
                  borderRadius: 20,
                  border: taskDateFilter === f.id ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                  background: taskDateFilter === f.id ? 'var(--accent-primary)' : 'var(--bg-card)',
                  color: taskDateFilter === f.id ? 'white' : 'var(--text-secondary)',
                  fontWeight: taskDateFilter === f.id ? 700 : 500,
                  fontSize: '0.74rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {f.label}
              </button>
            ))}

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginLeft: 'auto' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Specific Date:</span>
              <input
                type="date"
                className="input-field"
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.74rem', width: 'auto' }}
                value={customDateFilter}
                onChange={e => {
                  setCustomDateFilter(e.target.value);
                  setTaskDateFilter(e.target.value ? 'custom' : 'all');
                }}
              />
              {customDateFilter && (
                <button
                  type="button"
                  onClick={() => { setCustomDateFilter(''); setTaskDateFilter('all'); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '0.8rem', fontWeight: 700 }}
                  title="Clear custom date"
                >
                  ✕
                </button>
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

          {loadError && (
            <div id="tasks-load-error-banner" style={{ padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8, marginBottom: '1rem', fontSize: '0.82rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 220 }}>
                <strong>Tasks could not be loaded from the server</strong> ({loadError.message}).
                {loadError.stale ? ' Showing the last saved copy — it may be out of date.' : ' Your tasks are safe; this is only a display problem.'}
              </span>
              <button className="btn btn-secondary btn-sm" onClick={loadTasks}>Retry</button>
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
                                  {task.due_date && (() => {
                                    const d = (task.due_date || '').split('T')[0];
                                    const isPast = d < todayStr && task.status !== 'Done';
                                    const isToday = d === todayStr;
                                    const dayStat = checkDayStatus(d);
                                    const isExceptional = isHolidayExceptionalTask(task);
                                    return (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                        <div
                                          className="kanban-due"
                                          style={{
                                            color: isPast ? '#ef4444' : isToday ? 'var(--accent-primary)' : 'var(--text-muted)',
                                            fontWeight: isPast || isToday ? 700 : 500,
                                            background: isPast ? 'rgba(239,68,68,0.1)' : isToday ? 'rgba(99,102,241,0.1)' : 'transparent',
                                            padding: '0.15rem 0.4rem',
                                            borderRadius: 4,
                                            border: isPast ? '1px solid rgba(239,68,68,0.25)' : isToday ? '1px solid rgba(99,102,241,0.25)' : 'none',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.25rem'
                                          }}
                                        >
                                          <Calendar size={11} />
                                          {isPast ? `Overdue • ${formatTaskDate(task.due_date)}` : isToday ? `Today • ${formatTaskDate(task.due_date)}` : formatTaskDate(task.due_date)}
                                        </div>
                                        {dayStat.isDeclaredWorkingDay ? (
                                          <div style={{
                                            fontSize: '0.58rem',
                                            color: '#10b981',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.2rem',
                                            fontWeight: 700
                                          }}>
                                            🟢 Office Open ({dayStat.rawReason || 'Working Day'})
                                          </div>
                                        ) : dayStat.isNonWorking ? (
                                          <div style={{
                                            fontSize: '0.58rem',
                                            color: isExceptional ? '#10b981' : '#f59e0b',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.2rem',
                                            fontWeight: 600
                                          }}>
                                            {isExceptional ? '⚡ Exceptional Duty' : `🏖️ ${dayStat.reason}`}
                                          </div>
                                        ) : null}
                                      </div>
                                    );
                                  })()}
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
                      {allVisibleTasks.map(task => {
                        const hasProof = (task.comments || []).some(c => c.is_proof);
                        const d = (task.due_date || '').split('T')[0];
                        const isPast = d && d < todayStr && task.status !== 'Done';
                        const isToday = d === todayStr;
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
                            <td style={{ fontSize: '0.78rem' }}>
                              {task.due_date ? (
                                <span style={{
                                  fontWeight: isPast || isToday ? 700 : 500,
                                  color: isPast ? '#ef4444' : isToday ? 'var(--accent-primary)' : 'inherit',
                                  background: isPast ? 'rgba(239,68,68,0.1)' : isToday ? 'rgba(99,102,241,0.1)' : 'transparent',
                                  padding: '0.2rem 0.45rem',
                                  borderRadius: 4,
                                  display: 'inline-block'
                                }}>
                                  {isPast ? `⚠ Overdue (${task.due_date})` : isToday ? `🟢 Today (${task.due_date})` : task.due_date}
                                </span>
                              ) : '—'}
                            </td>
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
                        Last Spawned: {tpl.last_generated_date === getTodayDateStr() ? '🟢 Today' : tpl.last_generated_date}
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

              {/* 📅 Date-Wise Daily Routine Audit Matrix */}
              <div style={{ marginTop: '1.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <CalendarDays size={16} color="var(--accent-primary)" />
                      Daily Date-Wise Employee Task Log
                    </h3>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                      Audit day-by-day task allocation and completion status across all employees.
                    </p>
                  </div>
                </div>

                <div className="glass-card table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th style={{ textAlign: 'center' }}>Total Tasks</th>
                        <th style={{ textAlign: 'center' }}>Done</th>
                        <th style={{ textAlign: 'center' }}>To Do / Pending</th>
                        <th style={{ textAlign: 'center' }}>Under Review</th>
                        <th>Per-Employee Breakdown</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsData.dailyBreakdown?.length > 0 ? (
                        analyticsData.dailyBreakdown.map(dayRow => {
                          const isToday = dayRow.date === todayStr;
                          return (
                            <tr key={dayRow.date}>
                              <td>
                                <span style={{
                                  fontWeight: 700,
                                  fontSize: '0.82rem',
                                  color: isToday ? 'var(--accent-primary)' : 'inherit',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.35rem'
                                }}>
                                  <Calendar size={13} />
                                  {formatTaskDate(dayRow.date)}
                                  {isToday && <span className="badge badge-accent" style={{ fontSize: '0.62rem' }}>Today</span>}
                                </span>
                              </td>
                              <td style={{ textAlign: 'center', fontWeight: 700 }}>{dayRow.total}</td>
                              <td style={{ textAlign: 'center', color: 'var(--success)', fontWeight: 700 }}>{dayRow.done}</td>
                              <td style={{ textAlign: 'center', color: dayRow.todo > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>{dayRow.todo}</td>
                              <td style={{ textAlign: 'center', color: 'var(--accent-primary)' }}>{dayRow.underReview}</td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                  {Object.entries(dayRow.byEmployee || {}).map(([emp, stats]) => (
                                    <span
                                      key={emp}
                                      className="badge badge-neutral"
                                      style={{
                                        fontSize: '0.7rem',
                                        padding: '0.2rem 0.5rem',
                                        background: stats.done === stats.total && stats.total > 0 ? 'rgba(16,185,129,0.1)' : 'var(--bg-tertiary)',
                                        border: `1px solid ${stats.done === stats.total && stats.total > 0 ? 'rgba(16,185,129,0.3)' : 'var(--border-color)'}`,
                                        color: stats.done === stats.total && stats.total > 0 ? 'var(--success)' : 'inherit'
                                      }}
                                    >
                                      <strong>{emp}</strong>: {stats.done}/{stats.total} done
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                            No routine tasks recorded for this period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
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
                {selectedTask.is_recurring && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.45rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(99,102,241,0.12)', padding: '0.2rem 0.5rem', borderRadius: 4, border: '1px solid rgba(99,102,241,0.25)' }}>
                      <Repeat size={11} /> {selectedTask.recurrence_interval || 'Daily'} Routine • Due: <strong>{selectedTask.due_date || 'Today'}</strong>
                    </span>
                    {canCreate && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', color: 'var(--accent-primary)', borderColor: 'var(--accent-primary)' }}
                        onClick={async () => {
                          const res = await advanceTaskToNextDay(selectedTask.id);
                          if (res?.data) {
                            setSelectedTask(prev => ({ ...prev, ...res.data, comments: res.data.comments || prev?.comments || [] }));
                            setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, ...res.data, comments: res.data.comments || t.comments || [] } : t));
                            showToast(`Task rolled over to ${res.data.due_date} 🚀`);
                          }
                        }}
                        title="Advance task to next day (e.g. 2 October)"
                      >
                        <CalendarDays size={11} /> Advance to Next Day (+1d)
                      </button>
                    )}
                  </div>
                )}
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

                      {/* Photo / Document / Media Attachment Upload */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                            Proof Attachment (Photos, PDFs, Excel/Spreadsheets, Word Docs, Zip)
                          </label>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Max: 50 MB docs / 25 MB media</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <input
                            type="file"
                            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.rtf,.odt,.ppt,.pptx,.zip,.rar,.7z"
                            ref={proofFileInputRef}
                            style={{ display: 'none' }}
                            onChange={(e) => handleFileUpload(e, setProofMediaUrl, setProofMediaName, setProofMediaSize, setProofMediaType)}
                          />
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => proofFileInputRef.current?.click()}
                            style={{ gap: '0.35rem' }}
                          >
                            <UploadCloud size={13} /> {proofMediaName ? 'Change Attached File' : 'Attach Proof File (All Formats)'}
                          </button>
                        </div>

                        {proofMediaUrl && (
                          <div style={{ marginTop: '0.55rem', display: 'inline-flex', alignItems: 'center', gap: '0.65rem', padding: '0.45rem 0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: 8, border: '1px solid var(--border-color)', position: 'relative' }}>
                            {proofMediaType === 'image' ? (
                              <div style={{ width: 44, height: 44, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border-color)', flexShrink: 0 }}>
                                <img src={proofMediaUrl} alt="Proof" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                              </div>
                            ) : proofMediaType === 'pdf' ? (
                              <div style={{ width: 38, height: 38, borderRadius: 6, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', flexShrink: 0 }}>
                                <FileText size={20} />
                              </div>
                            ) : proofMediaType === 'spreadsheet' ? (
                              <div style={{ width: 38, height: 38, borderRadius: 6, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', flexShrink: 0 }}>
                                <FileSpreadsheet size={20} />
                              </div>
                            ) : proofMediaType === 'archive' ? (
                              <div style={{ width: 38, height: 38, borderRadius: 6, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b', flexShrink: 0 }}>
                                <FileArchive size={20} />
                              </div>
                            ) : (
                              <div style={{ width: 38, height: 38, borderRadius: 6, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)', flexShrink: 0 }}>
                                <FileText size={20} />
                              </div>
                            )}

                            <div>
                              <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-primary)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {proofMediaName || 'Proof Document'}
                              </div>
                              <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <span style={{ textTransform: 'uppercase', fontWeight: 600, color: 'var(--accent-primary)' }}>{proofMediaType}</span>
                                {proofMediaSize && <span>• {formatBytes(proofMediaSize)}</span>}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => { setProofMediaUrl(null); setProofMediaName(''); setProofMediaSize(null); setProofMediaType('image'); }}
                              style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: 'none', borderRadius: 4, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, cursor: 'pointer', marginLeft: '0.25rem' }}
                              title="Remove attached file"
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
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleRefreshTaskComments}
                  disabled={commentsLoading}
                  title="Refresh activity and proofs from database"
                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.55rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <RefreshCw size={11} className={commentsLoading ? 'animate-spin' : ''} />
                  {commentsLoading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>

              <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem', paddingRight: '0.25rem' }}>
                {(!selectedTask.comments || selectedTask.comments.length === 0) ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    No comments or proofs yet. Post a progress update or submit completion proof above.
                  </div>
                ) : (
                  selectedTask.comments.map(c => {
                    const fileCategory = c.media_type || getFileCategory(c.media_name || c.media_url);

                    return (
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

                        {/* Render Proof / Comment File Attachment based on Category */}
                        {c.media_url && (
                          <div style={{ marginTop: '0.4rem', marginBottom: '0.4rem' }}>
                            {fileCategory === 'image' ? (
                              <div
                                onClick={() => setLightboxMedia({ url: c.media_url, name: c.media_name || 'Proof Image', type: 'image' })}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                                  padding: '0.35rem 0.65rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)',
                                  border: '1px solid var(--border-color)', cursor: 'pointer'
                                }}
                              >
                                <img
                                  src={c.media_url}
                                  alt="Proof Thumbnail"
                                  style={{ width: 44, height: 44, borderRadius: 4, objectFit: 'cover' }}
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = 'flex';
                                  }}
                                />
                                <div style={{ display: 'none', width: 44, height: 44, borderRadius: 4, background: 'rgba(99,102,241,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                                  <ImageIcon size={18} color="var(--accent-primary)" />
                                </div>
                                <div>
                                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)' }}>{c.media_name || 'Proof Photo / Screenshot'}</div>
                                  <div style={{ fontSize: '0.65rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                    <Eye size={10} /> Click to View Full Size
                                  </div>
                                </div>
                              </div>
                            ) : fileCategory === 'pdf' ? (
                              <div
                                onClick={() => setLightboxMedia({ url: c.media_url, name: c.media_name || 'Proof Document.pdf', type: 'pdf' })}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '0.6rem',
                                  padding: '0.4rem 0.75rem', borderRadius: 6, background: 'rgba(239,68,68,0.08)',
                                  border: '1px solid rgba(239,68,68,0.25)', cursor: 'pointer'
                                }}
                              >
                                <div style={{ width: 34, height: 34, borderRadius: 4, background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                                  <FileText size={18} />
                                </div>
                                <div>
                                  <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-primary)' }}>{c.media_name || 'Proof Document.pdf'}</div>
                                  <div style={{ fontSize: '0.64rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <Eye size={10} /> View / Open PDF Document
                                  </div>
                                </div>
                              </div>
                            ) : fileCategory === 'spreadsheet' ? (
                              <div
                                onClick={() => setLightboxMedia({ url: c.media_url, name: c.media_name || 'Spreadsheet.xlsx', type: 'spreadsheet' })}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '0.6rem',
                                  padding: '0.4rem 0.75rem', borderRadius: 6, background: 'rgba(16,185,129,0.08)',
                                  border: '1px solid rgba(16,185,129,0.25)', cursor: 'pointer'
                                }}
                              >
                                <div style={{ width: 34, height: 34, borderRadius: 4, background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                                  <FileSpreadsheet size={18} />
                                </div>
                                <div>
                                  <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-primary)' }}>{c.media_name || 'Excel Spreadsheet.xlsx'}</div>
                                  <div style={{ fontSize: '0.64rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <Download size={10} /> Download / Open Excel Sheet
                                  </div>
                                </div>
                              </div>
                            ) : fileCategory === 'archive' ? (
                              <div
                                onClick={() => setLightboxMedia({ url: c.media_url, name: c.media_name || 'Archive.zip', type: 'archive' })}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '0.6rem',
                                  padding: '0.4rem 0.75rem', borderRadius: 6, background: 'rgba(245,158,11,0.08)',
                                  border: '1px solid rgba(245,158,11,0.25)', cursor: 'pointer'
                                }}
                              >
                                <div style={{ width: 34, height: 34, borderRadius: 4, background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
                                  <FileArchive size={18} />
                                </div>
                                <div>
                                  <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-primary)' }}>{c.media_name || 'Archive Package.zip'}</div>
                                  <div style={{ fontSize: '0.64rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <Download size={10} /> Download Zip Archive
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div
                                onClick={() => setLightboxMedia({ url: c.media_url, name: c.media_name || 'Document', type: fileCategory })}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '0.6rem',
                                  padding: '0.4rem 0.75rem', borderRadius: 6, background: 'rgba(99,102,241,0.08)',
                                  border: '1px solid rgba(99,102,241,0.25)', cursor: 'pointer'
                                }}
                              >
                                <div style={{ width: 34, height: 34, borderRadius: 4, background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)' }}>
                                  <FileText size={18} />
                                </div>
                                <div>
                                  <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-primary)' }}>{c.media_name || 'Document Attachment'}</div>
                                  <div style={{ fontSize: '0.64rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <Download size={10} /> Download / Open Document
                                  </div>
                                </div>
                              </div>
                            )}
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
                    );
                  })
                )}
              </div>

              {/* Standard Comment Composer */}
              <form onSubmit={handleAddComment} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {commentMediaName && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.25rem 0.6rem', background: 'rgba(99,102,241,0.1)', borderRadius: 6, border: '1px solid rgba(99,102,241,0.3)', width: 'fit-content', fontSize: '0.72rem' }}>
                    <Paperclip size={12} color="var(--accent-primary)" />
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{commentMediaName}</span>
                    {commentMediaSize && <span style={{ color: 'var(--text-muted)' }}>({formatBytes(commentMediaSize)})</span>}
                    <button
                      type="button"
                      onClick={() => { setCommentMediaUrl(null); setCommentMediaName(''); setCommentMediaSize(null); setCommentMediaType('image'); }}
                      style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0, marginLeft: '0.2rem' }}
                    >
                      ✕
                    </button>
                  </div>
                )}

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
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.rtf,.odt,.ppt,.pptx,.zip,.rar,.7z"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={(e) => handleFileUpload(e, setCommentMediaUrl, setCommentMediaName, setCommentMediaSize, setCommentMediaType)}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach File (Images, PDF, Excel, Docs, Zip)"
                    style={{ padding: '0.45rem 0.65rem', color: commentMediaUrl ? 'var(--success)' : 'var(--text-muted)' }}
                  >
                    <Paperclip size={15} />
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

              {dailyGenConfig.dueDate && (() => {
                const dayStat = checkDayStatus(dailyGenConfig.dueDate);
                if (dayStat.isDeclaredWorkingDay) {
                  return (
                    <div style={{
                      padding: '0.65rem 0.85rem', borderRadius: 8,
                      background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)',
                      fontSize: '0.74rem', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}>
                        <CheckCircle2 size={14} />
                        <span>Declared Special Working Day: {dayStat.reason}. Routine tasks will run as regular.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          clearWorkingDayOverride(dailyGenConfig.dueDate);
                          setWorkingDayTrigger(t => t + 1);
                          showToast('Special working day override cleared.');
                        }}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.7rem', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Reset to Holiday
                      </button>
                    </div>
                  );
                }
                if (!dayStat.isNonWorking) return null;
                const isForced = dailyGenConfig.forceHolidayRun;
                return (
                  <div style={{
                    padding: '0.65rem 0.85rem', borderRadius: 8,
                    background: isForced ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.1)',
                    border: `1px solid ${isForced ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
                    fontSize: '0.74rem', display: 'flex', flexDirection: 'column', gap: '0.45rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', fontWeight: 700, color: isForced ? '#10b981' : '#f59e0b' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <AlertTriangle size={14} />
                        <span>Notice: Selected date is a {dayStat.reason}</span>
                      </div>
                      {isForced && (
                        <span className="badge badge-success" style={{ fontSize: '0.64rem' }}>
                          ⚡ Force Routine on Holiday Active
                        </span>
                      )}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                      {isForced
                        ? 'Confirmed: All generated client routine tasks will be scheduled on this day with Holiday Duty priority flags.'
                        : 'Offices are normally closed. You can shift all generated tasks to the next business day, OR force-run them today if the office or project site is open.'}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ fontSize: '0.72rem', padding: '0.25rem 0.65rem', background: 'var(--accent-primary)', color: 'white', fontWeight: 600 }}
                        onClick={() => {
                          setDailyGenConfig(p => ({ ...p, dueDate: dayStat.nextWorkingDate, forceHolidayRun: false }));
                        }}
                      >
                        📅 Shift to Next Working Day ({dayStat.nextWorkingDate})
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{
                          fontSize: '0.72rem', padding: '0.25rem 0.65rem',
                          background: isForced ? '#10b981' : 'var(--bg-tertiary)',
                          color: isForced ? 'white' : 'var(--text-primary)',
                          border: '1px solid var(--border-color)', fontWeight: 600
                        }}
                        onClick={() => setDailyGenConfig(p => ({ ...p, forceHolidayRun: !p.forceHolidayRun }))}
                      >
                        {isForced ? '✓ Office Open — Routine Confirmed' : '⚡ Office Open — Run on this Day'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ fontSize: '0.72rem', padding: '0.25rem 0.65rem', background: 'transparent', border: '1px dashed var(--accent-secondary)', color: 'var(--accent-secondary)', fontWeight: 600 }}
                        onClick={() => {
                          setWorkingDayOverride(dailyGenConfig.dueDate, true, 'Office Open as Regular');
                          setWorkingDayTrigger(t => t + 1);
                          showToast(`Declared ${dailyGenConfig.dueDate} as official working day!`);
                        }}
                        title="Declares this Sunday/Holiday as an official working day for all tasks in the ERP"
                      >
                        📢 Declare as Official Working Day
                      </button>
                    </div>
                  </div>
                );
              })()}


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

              {/* Sunday / Holiday Detection & Exceptional Case Handler */}
              {form.due_date && (() => {
                const dayStat = checkDayStatus(form.due_date);
                if (dayStat.isDeclaredWorkingDay) {
                  return (
                    <div style={{
                      padding: '0.65rem 0.85rem', borderRadius: 8,
                      background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)',
                      fontSize: '0.74rem', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}>
                        <CheckCircle2 size={14} />
                        <span>Declared Special Working Day: {dayStat.reason}. Task scheduled as regular.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          clearWorkingDayOverride(form.due_date);
                          setWorkingDayTrigger(t => t + 1);
                          showToast('Working day override cleared.');
                        }}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.7rem', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Reset to Holiday
                      </button>
                    </div>
                  );
                }
                if (!dayStat.isNonWorking) return null;
                const isExceptional = form.tags?.includes('⚡ Holiday Duty') || form.is_holiday_work;
                return (
                  <div style={{
                    padding: '0.7rem 0.9rem', borderRadius: 8,
                    background: isExceptional ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.1)',
                    border: `1px solid ${isExceptional ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.35)'}`,
                    display: 'flex', flexDirection: 'column', gap: '0.45rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, color: isExceptional ? '#10b981' : '#f59e0b', fontSize: '0.8rem' }}>
                        <AlertTriangle size={15} />
                        <span>Scheduled on {dayStat.reason} ({formatTaskDate(form.due_date)})</span>
                      </div>
                      {isExceptional && (
                        <span className="badge badge-success" style={{ fontSize: '0.64rem', padding: '0.15rem 0.45rem' }}>
                          ⚡ Office Open / Exceptional Duty
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                      {isExceptional
                        ? 'Confirmed: Scheduled directly on Sunday/Holiday (office open as regular, emergency site visit, or priority shift). Staff will see this as active duty.'
                        : 'Offices and regular routines are normally closed on this day. You can shift the due date, keep it on this day (office open / urgent), or declare the entire day as an official working day.'}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ fontSize: '0.72rem', padding: '0.25rem 0.65rem', background: 'var(--accent-primary)', color: 'white', fontWeight: 600 }}
                        onClick={() => setForm(p => ({ ...p, due_date: dayStat.nextWorkingDate }))}
                      >
                        📅 Shift to Next Working Day ({dayStat.nextWorkingDate})
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{
                          fontSize: '0.72rem', padding: '0.25rem 0.65rem',
                          background: isExceptional ? '#10b981' : 'var(--bg-tertiary)',
                          color: isExceptional ? 'white' : 'var(--text-primary)',
                          border: '1px solid var(--border-color)', fontWeight: 600
                        }}
                        onClick={() => {
                          const nextVal = !isExceptional;
                          setForm(p => ({
                            ...p,
                            is_holiday_work: nextVal,
                            run_on_holidays: nextVal,
                            tags: nextVal
                              ? Array.from(new Set([...(p.tags || []), '⚡ Holiday Duty']))
                              : (p.tags || []).filter(t => t !== '⚡ Holiday Duty')
                          }));
                        }}
                      >
                        {isExceptional ? '✓ Keep on this Day (Confirmed)' : '⚡ Office Open — Keep on this Day'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ fontSize: '0.72rem', padding: '0.25rem 0.65rem', background: 'transparent', border: '1px dashed var(--accent-secondary)', color: 'var(--accent-secondary)', fontWeight: 600 }}
                        onClick={() => {
                          setWorkingDayOverride(form.due_date, true, 'Office Open as Regular');
                          setWorkingDayTrigger(t => t + 1);
                          showToast(`Declared ${form.due_date} as official working day!`);
                        }}
                        title="Declares this Sunday/Holiday as an official working day for all tasks in the ERP"
                      >
                        📢 Declare Office Open Today
                      </button>
                    </div>
                  </div>
                );
              })()}


              {/* Recurring Task Option */}
              <div style={{ padding: '0.65rem 0.85rem', borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={form.is_recurring}
                    onChange={e => {
                      const chk = e.target.checked;
                      setForm(p => ({
                        ...p,
                        is_recurring: chk,
                        recurrence_interval: chk ? (p.recurrence_interval || 'Daily') : 'Daily'
                      }));
                    }}
                  />
                  <span>🔁 Recurring Task Routine</span>
                </label>
                {form.is_recurring && (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.2rem' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Frequency:</label>
                    <select
                      className="input-field"
                      style={{ fontSize: '0.78rem', padding: '0.25rem 0.5rem' }}
                      value={form.recurrence_interval || 'Daily'}
                      onChange={e => {
                        const val = e.target.value;
                        let newDue = form.due_date;
                        if (val === 'Weekly (Monday)' || val === 'Weekly') {
                          const d = new Date();
                          const cur = d.getDay();
                          let diff = 1 - cur;
                          if (diff <= 0) diff += 7;
                          d.setDate(d.getDate() + diff);
                          newDue = getTodayDateStr(d);
                        } else if (val === 'Daily' && (!newDue || newDue < getTodayDateStr())) {
                          newDue = getTodayDateStr();
                        }
                        setForm(p => ({ ...p, recurrence_interval: val, due_date: newDue }));
                      }}
                    >
                      <option value="Daily">Daily (Every Day • Auto-advances to next date)</option>
                      <option value="Weekly (Monday)">Weekly on Monday (Scheduled for upcoming Monday)</option>
                      <option value="Weekdays">Weekdays Only (Mon to Fri)</option>
                      <option value="Monthly">Monthly</option>
                    </select>
                  </div>
                )}
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

                    {/* Sunday / Holiday Operating Mode */}
                    <div style={{ padding: '0.6rem 0.8rem', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-color)', marginTop: '0.35rem' }}>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.55rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={tplForm.run_on_holidays || false}
                          onChange={e => setTplForm(p => ({ ...p, run_on_holidays: e.target.checked }))}
                          style={{ marginTop: 3 }}
                        />
                        <div>
                          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            ⚡ Run on Sundays & Gazetted Holidays (Exceptional / 24x7 Sites)
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.35, marginTop: '0.15rem' }}>
                            {tplForm.run_on_holidays
                              ? 'This routine WILL spawn on Sundays & public holidays (ideal for 24/7 site guarding, concrete curing, material unloading).'
                              : 'Recommended (Default): Daily routine automatically pauses on Sundays & official Indian Gazetted Holidays, resuming on the next business day.'}
                          </div>
                        </div>
                      </label>
                    </div>
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

      {/* Multi-Format Lightbox & Document Preview Modal */}
      {lightboxMedia && (
        <div className="modal-overlay" onClick={() => setLightboxMedia(null)} style={{ background: 'rgba(0,0,0,0.85)', zIndex: 99999 }}>
          <div
            style={{
              position: 'relative',
              maxWidth: lightboxMedia.type === 'pdf' ? 960 : 820,
              width: '92%',
              background: 'var(--bg-secondary)',
              borderRadius: 12,
              border: '1px solid var(--border-color)',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-tertiary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', overflow: 'hidden' }}>
                {lightboxMedia.type === 'image' ? (
                  <ImageIcon size={18} color="var(--accent-primary)" />
                ) : lightboxMedia.type === 'pdf' ? (
                  <FileText size={18} color="#ef4444" />
                ) : lightboxMedia.type === 'spreadsheet' ? (
                  <FileSpreadsheet size={18} color="#10b981" />
                ) : lightboxMedia.type === 'archive' ? (
                  <FileArchive size={18} color="#f59e0b" />
                ) : (
                  <FileText size={18} color="var(--accent-primary)" />
                )}
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {lightboxMedia.name || 'Attachment Preview'}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {lightboxMedia.url && (
                  <>
                    <a
                      href={lightboxMedia.url}
                      download={lightboxMedia.name || 'attachment'}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', gap: '0.3rem' }}
                      title="Download file"
                    >
                      <Download size={12} /> Download
                    </a>
                    <a
                      href={lightboxMedia.url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', gap: '0.3rem' }}
                      title="Open in new window"
                    >
                      <ExternalLink size={12} /> Open Full
                    </a>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setLightboxMedia(null)}
                  style={{
                    background: 'none', border: 'none', color: 'var(--text-muted)',
                    fontSize: '1.25rem', cursor: 'pointer', padding: '0 0.4rem', lineHeight: 1
                  }}
                  title="Close preview"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ padding: lightboxMedia.type === 'pdf' ? '0' : '1.25rem', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320, background: '#0a0f1d' }}>
              {lightboxMedia.type === 'image' ? (
                <div style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <img
                    src={lightboxMedia.url}
                    alt={lightboxMedia.name || 'Proof Full Resolution'}
                    style={{ maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain', borderRadius: 6 }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = 'flex';
                    }}
                  />
                  <div style={{ display: 'none', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '2rem', color: 'var(--text-muted)' }}>
                    <AlertTriangle size={36} color="var(--warning)" />
                    <div style={{ fontSize: '0.85rem' }}>Image could not be rendered directly.</div>
                    <a href={lightboxMedia.url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
                      <ExternalLink size={13} /> Open Image Link Directly
                    </a>
                  </div>
                </div>
              ) : lightboxMedia.type === 'pdf' ? (
                <div style={{ width: '100%', height: '75vh', position: 'relative' }}>
                  <iframe
                    src={lightboxMedia.url}
                    title="PDF Document Preview"
                    style={{ width: '100%', height: '100%', border: 'none', background: '#ffffff' }}
                  />
                </div>
              ) : lightboxMedia.type === 'spreadsheet' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '1rem', padding: '3rem 2rem' }}>
                  <div style={{ width: 72, height: 72, borderRadius: 16, background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                    <FileSpreadsheet size={40} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 0.35rem 0', color: 'var(--text-primary)' }}>
                      {lightboxMedia.name || 'Spreadsheet Document'}
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, maxWidth: 420 }}>
                      This Excel / Spreadsheet file can be downloaded or opened in Google Sheets / Excel Online.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <a href={lightboxMedia.url} download={lightboxMedia.name || 'data.xlsx'} className="btn btn-primary" style={{ background: '#10b981', borderColor: '#10b981' }}>
                      <Download size={14} /> Download Excel Spreadsheet
                    </a>
                    <a href={lightboxMedia.url} target="_blank" rel="noreferrer" className="btn btn-secondary">
                      <ExternalLink size={14} /> View File in Browser
                    </a>
                  </div>
                </div>
              ) : lightboxMedia.type === 'archive' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '1rem', padding: '3rem 2rem' }}>
                  <div style={{ width: 72, height: 72, borderRadius: 16, background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
                    <FileArchive size={40} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 0.35rem 0', color: 'var(--text-primary)' }}>
                      {lightboxMedia.name || 'Compressed Archive (Zip/Rar)'}
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, maxWidth: 420 }}>
                      Contains zipped employee submission documents, logs, or site inspection archives.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <a href={lightboxMedia.url} download={lightboxMedia.name || 'archive.zip'} className="btn btn-primary" style={{ background: '#f59e0b', borderColor: '#f59e0b' }}>
                      <Download size={14} /> Download Zip Archive
                    </a>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '1rem', padding: '3rem 2rem' }}>
                  <div style={{ width: 72, height: 72, borderRadius: 16, background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)' }}>
                    <FileText size={40} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 0.35rem 0', color: 'var(--text-primary)' }}>
                      {lightboxMedia.name || 'Document File'}
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, maxWidth: 420 }}>
                      Word document, text report, or presentation attached by employee.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <a href={lightboxMedia.url} download={lightboxMedia.name || 'document'} className="btn btn-primary">
                      <Download size={14} /> Download Document
                    </a>
                    <a href={lightboxMedia.url} target="_blank" rel="noreferrer" className="btn btn-secondary">
                      <ExternalLink size={14} /> Open in Browser
                    </a>
                  </div>
                </div>
              )}
            </div>
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
