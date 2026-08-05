import React, { useState } from 'react';
import {
  CheckSquare, Clock, AlertCircle, CheckCircle2,
  Plus, Search, Filter, User, Calendar, List, Columns, X
} from 'lucide-react';
import './Pages.css';

const initialTasks = {
  'To Do': [
    { id: 1, title: 'Call vendor for Tally license renewal', assignee: 'Rajesh K.', priority: 'High', due: 'Today', tags: ['Finance'] },
    { id: 2, title: 'Review CRM integration logs', assignee: 'Admin', priority: 'High', due: 'Tomorrow', tags: ['CRM'] },
    { id: 3, title: 'Send bulk WhatsApp broadcast to leads', assignee: 'Marketing Team', priority: 'Medium', due: 'Aug 8', tags: ['WhatsApp'] },
  ],
  'In Progress': [
    { id: 4, title: 'Finalize quarterly report', assignee: 'Priya S.', priority: 'High', due: 'Today', tags: ['Reports'] },
    { id: 5, title: 'Update chatbot keyword rules', assignee: 'Dev Team', priority: 'Medium', due: 'Aug 9', tags: ['Bot'] },
  ],
  'Under Review': [
    { id: 6, title: 'Prepare invoice templates for Tally', assignee: 'Priya S.', priority: 'Low', due: 'Aug 12', tags: ['Finance'] },
  ],
  'Done': [
    { id: 7, title: 'Setup WhatsApp Business API sandbox', assignee: 'Dev Team', priority: 'High', due: 'Aug 1', tags: ['WhatsApp'] },
    { id: 8, title: 'Onboard new sales employee', assignee: 'HR', priority: 'Medium', due: 'Aug 2', tags: ['HR'] },
  ],
};

const priorityColors = {
  High: 'var(--danger)',
  Medium: 'var(--warning)',
  Low: 'var(--success)',
};

const colColors = {
  'To Do': 'var(--text-muted)',
  'In Progress': 'var(--warning)',
  'Under Review': 'var(--accent-primary)',
  'Done': 'var(--success)',
};

const employees = [
  { name: 'Priya S.', tasks: 3, completed: 1, avatar: 'PS' },
  { name: 'Rajesh K.', tasks: 2, completed: 0, avatar: 'RK' },
  { name: 'Dev Team', tasks: 2, completed: 1, avatar: 'DT' },
  { name: 'Admin', tasks: 1, completed: 0, avatar: 'AU' },
];

const Tasks = () => {
  const [view, setView] = useState('kanban');
  const [tasks, setTasks] = useState(initialTasks);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');

  const allTasksFlat = Object.entries(tasks).flatMap(([col, items]) =>
    items.map(t => ({ ...t, column: col }))
  );

  const filtered = allTasksFlat.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusBadge = (col) => {
    const map = { 'To Do': 'badge-neutral', 'In Progress': 'badge-warning', 'Under Review': 'badge-accent', 'Done': 'badge-success' };
    return map[col] || 'badge-neutral';
  };

  return (
    <div className="page-container animate-fade-in">
      {/* Demo Banner */}
      <div className="demo-banner">
        <span className="demo-badge">DEMO</span>
        Task assignment emails/WhatsApp alerts will be sent in production. Drag-and-drop between columns is available in production build.
      </div>

      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Task Management</h1>
          <p className="page-subtitle">Track team productivity, assignments & deadlines.</p>
        </div>
        <div className="page-actions">
          <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <button
              onClick={() => setView('kanban')}
              className="btn"
              style={{ borderRadius: 0, background: view === 'kanban' ? 'var(--accent-primary)' : 'var(--bg-tertiary)', color: view === 'kanban' ? 'white' : 'var(--text-secondary)', padding: '0.4rem 0.875rem' }}
            >
              <Columns size={14} /> Board
            </button>
            <button
              onClick={() => setView('list')}
              className="btn"
              style={{ borderRadius: 0, background: view === 'list' ? 'var(--accent-primary)' : 'var(--bg-tertiary)', color: view === 'list' ? 'white' : 'var(--text-secondary)', padding: '0.4rem 0.875rem' }}
            >
              <List size={14} /> List
            </button>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={15} /> Create Task</button>
        </div>
      </div>

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <div className="input-group" style={{ maxWidth: 300 }}>
          <Search size={15} className="input-icon" />
          <input type="text" className="input-field" placeholder="Search tasks..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn btn-secondary"><Filter size={15} /> Filter</button>
      </div>

      {/* Employee Workload */}
      <div className="glass-card p-6">
        <div className="section-title" style={{ marginBottom: '1rem' }}>Team Workload</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
          {employees.map(emp => (
            <div key={emp.name} style={{ padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.75rem' }}>
                <div className="mini-avatar" style={{ width: 34, height: 34, fontSize: '0.7rem' }}>{emp.avatar}</div>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{emp.name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{emp.tasks} tasks</div>
                </div>
              </div>
              <div className="progress-bar-wrap">
                <div className="progress-bar-fill" style={{ width: `${(emp.completed / emp.tasks) * 100 || 0}%`, background: 'var(--success)' }} />
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>{emp.completed}/{emp.tasks} done</div>
            </div>
          ))}
        </div>
      </div>

      {/* Kanban Board */}
      {view === 'kanban' && (
        <div className="kanban-board">
          {Object.entries(tasks).map(([col, items]) => (
            <div key={col} className="kanban-col">
              <div className="kanban-col-header">
                <span className="kanban-col-title" style={{ color: colColors[col] }}>{col}</span>
                <span className="kanban-count">{items.length}</span>
              </div>
              <div className="kanban-cards">
                {items.map(task => (
                  <div key={task.id} className="kanban-card">
                    <div className="kanban-card-title">{task.title}</div>
                    <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                      {task.tags.map(tag => (
                        <span key={tag} className="badge badge-neutral" style={{ fontSize: '0.62rem' }}>{tag}</span>
                      ))}
                    </div>
                    <div className="kanban-card-meta">
                      <div className="kanban-card-assignee">
                        <div className="mini-avatar">{task.assignee.slice(0, 2).toUpperCase()}</div>
                        <span>{task.assignee}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', color: task.due === 'Today' ? 'var(--danger)' : 'var(--text-muted)' }}>
                        <Calendar size={11} /> {task.due}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: priorityColors[task.priority] }}>
                        {task.priority} Priority
                      </span>
                    </div>
                  </div>
                ))}
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%', justifyContent: 'center', borderStyle: 'dashed' }}
                  onClick={() => setShowAdd(true)}
                >
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
              <tr>
                <th>Task</th>
                <th>Assignee</th>
                <th>Column</th>
                <th>Priority</th>
                <th>Due Date</th>
                <th>Tags</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(task => (
                <tr key={task.id}>
                  <td style={{ fontWeight: 600, maxWidth: 280 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {task.column === 'Done'
                        ? <CheckCircle2 size={16} style={{ color: 'var(--success)', flexShrink: 0 }} />
                        : <Clock size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      }
                      <span style={{ textDecoration: task.column === 'Done' ? 'line-through' : 'none', opacity: task.column === 'Done' ? 0.6 : 1 }}>
                        {task.title}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <div className="mini-avatar">{task.assignee.slice(0, 2).toUpperCase()}</div>
                      <span style={{ fontSize: '0.82rem' }}>{task.assignee}</span>
                    </div>
                  </td>
                  <td><span className={`badge ${getStatusBadge(task.column)}`}>{task.column}</span></td>
                  <td>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: priorityColors[task.priority], display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      {task.priority === 'High' && <AlertCircle size={13} />}
                      {task.priority}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: task.due === 'Today' ? 'var(--danger)' : 'var(--text-muted)', fontWeight: task.due === 'Today' ? 600 : 400 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Calendar size={13} /> {task.due}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      {task.tags.map(tag => <span key={tag} className="badge badge-neutral">{tag}</span>)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Task Modal */}
      {showAdd && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowAdd(false)}>
              <X size={20} />
            </button>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>Create New Task</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Task Title *</label>
                <input type="text" className="input-field" placeholder="Describe the task clearly..." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Assign To</label>
                  <select className="input-field">
                    <option>Priya S.</option>
                    <option>Rajesh K.</option>
                    <option>Dev Team</option>
                    <option>Admin</option>
                    <option>Marketing Team</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Priority</label>
                  <select className="input-field">
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Due Date</label>
                <input type="date" className="input-field" />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Description</label>
                <textarea className="input-field textarea-field" rows="3" placeholder="Add details..." />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={() => setShowAdd(false)}>Create Task</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tasks;
