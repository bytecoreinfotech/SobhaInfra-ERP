import React, { useState, useEffect } from 'react';
import {
  Users, CheckSquare, IndianRupee, TrendingUp, MessageCircle,
  ArrowUpRight, ArrowDownRight, Bot, CreditCard, BarChart3,
  Clock, AlertCircle, CheckCircle2
} from 'lucide-react';
import './Pages.css';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
const revenueData = [42, 65, 58, 80, 74, 91, 88];

const StatCard = ({ title, value, icon, trend, trendDir, period, accentColor, iconBg }) => (
  <div className="stat-card animate-slide-up" style={{ '--card-accent': accentColor }}>
    <div className="stat-header">
      <div>
        <div className="stat-label">{title}</div>
        <div className="stat-value">{value}</div>
      </div>
      <div className="stat-icon" style={{ background: iconBg }}>
        {icon}
      </div>
    </div>
    <div className="stat-footer">
      <span className={`stat-trend ${trendDir}`}>
        {trendDir === 'up' ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
        {trend}
      </span>
      <span className="stat-period">{period}</span>
    </div>
  </div>
);

const activities = [
  {
    id: 1, iconBg: 'var(--whatsapp-bg)', iconColor: 'var(--whatsapp)', icon: <MessageCircle size={15} />,
    title: <>WhatsApp campaign sent to <strong>248 contacts</strong> – Festival Offer</>,
    time: '2 min ago'
  },
  {
    id: 2, iconBg: 'var(--success-bg)', iconColor: 'var(--success)', icon: <CheckCircle2 size={15} />,
    title: <>Task <strong>"UI Design Review"</strong> completed by Priya S.</>,
    time: '34 min ago'
  },
  {
    id: 3, iconBg: 'var(--danger-bg)', iconColor: 'var(--danger)', icon: <AlertCircle size={15} />,
    title: <>Payment reminder auto-sent to <strong>Tech Solutions Inc.</strong> (₹45,000 overdue)</>,
    time: '1 hr ago'
  },
  {
    id: 4, iconBg: 'var(--info-bg)', iconColor: 'var(--info)', icon: <Users size={15} />,
    title: <>New lead <strong>Karan Mehta</strong> from BuildRight added to CRM pipeline</>,
    time: '2 hr ago'
  },
  {
    id: 5, iconBg: 'var(--accent-glow)', iconColor: 'var(--accent-secondary)', icon: <IndianRupee size={15} />,
    title: <>Tally sync complete — <strong>14 new invoices</strong> imported</>,
    time: '3 hr ago'
  },
];

const tasks = [
  { id: 1, title: 'Call vendor for Tally license renewal', assignee: 'Rajesh K.', priority: 'High', due: 'Today', done: false },
  { id: 2, title: 'Review CRM integration logs', assignee: 'Admin', priority: 'High', due: 'Tomorrow', done: false },
  { id: 3, title: 'Send bulk WhatsApp broadcast', assignee: 'Marketing', priority: 'Medium', due: 'Aug 8', done: false },
  { id: 4, title: 'Finalize quarterly report', assignee: 'Priya S.', priority: 'Low', due: 'Aug 10', done: true },
];

const Dashboard = () => {
  const [taskList, setTaskList] = useState(tasks);
  const [maxBar] = useState(Math.max(...revenueData));

  const toggleTask = (id) => {
    setTaskList(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  };

  return (
    <div className="page-container">
      {/* Demo Banner */}
      <div className="demo-banner">
        <span className="demo-badge">DEMO</span>
        All data is simulated for demonstration. WhatsApp API, Tally, and other integrations will be connected in production.
      </div>

      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Dashboard Overview</h1>
          <p className="page-subtitle">Welcome back, Admin! Here's your business pulse for today.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary"><Clock size={15} /> Today</button>
          <button className="btn btn-primary"><BarChart3 size={15} /> Generate Report</button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="stats-grid">
        <StatCard
          title="Active CRM Leads"
          value="1,248"
          icon={<Users size={22} style={{ color: 'var(--accent-primary)' }} />}
          iconBg="var(--accent-glow)"
          accentColor="var(--accent-primary)"
          trend="+12.5%"
          trendDir="up"
          period="vs last month"
        />
        <StatCard
          title="WhatsApp Delivered"
          value="3,840"
          icon={<MessageCircle size={22} style={{ color: 'var(--whatsapp)' }} />}
          iconBg="var(--whatsapp-bg)"
          accentColor="var(--whatsapp)"
          trend="+28.3%"
          trendDir="up"
          period="this week"
        />
        <StatCard
          title="Overdue Payments"
          value="₹1.2M"
          icon={<CreditCard size={22} style={{ color: 'var(--danger)' }} />}
          iconBg="var(--danger-bg)"
          accentColor="var(--danger)"
          trend="-5.2%"
          trendDir="down"
          period="vs last month"
        />
        <StatCard
          title="Revenue (MTD)"
          value="₹4.8M"
          icon={<TrendingUp size={22} style={{ color: 'var(--success)' }} />}
          iconBg="var(--success-bg)"
          accentColor="var(--success)"
          trend="+18.7%"
          trendDir="up"
          period="vs last month"
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-2" style={{ gap: '1.25rem' }}>

        {/* Revenue chart */}
        <div className="glass-card p-6" style={{ gridColumn: '1 / -1' }}>
          <div className="section-header">
            <span className="section-title">Monthly Revenue (₹ Lakhs)</span>
            <span className="badge badge-success">+18.7% vs last quarter</span>
          </div>
          <div className="bar-chart">
            {revenueData.map((val, i) => (
              <div
                key={i}
                className="bar-chart-bar"
                style={{ height: `${(val / maxBar) * 100}%` }}
                title={`${months[i]}: ₹${val}L`}
              />
            ))}
          </div>
          <div className="bar-chart-labels">
            {months.map(m => (
              <div key={m} className="bar-chart-label">{m}</div>
            ))}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="glass-card p-6">
          <div className="section-header">
            <span className="section-title">Recent Activity</span>
            <a href="#" className="section-link">View all</a>
          </div>
          <div className="activity-feed">
            {activities.map(act => (
              <div className="activity-item" key={act.id}>
                <div
                  className="activity-icon-wrap"
                  style={{ background: act.iconBg, color: act.iconColor }}
                >
                  {act.icon}
                </div>
                <div className="activity-content">
                  <div className="activity-title">{act.title}</div>
                  <div className="activity-time">{act.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Tasks */}
        <div className="glass-card p-6">
          <div className="section-header">
            <span className="section-title">Upcoming Tasks</span>
            <a href="/tasks" className="section-link">View all</a>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {taskList.map(task => (
              <div
                key={task.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  cursor: 'pointer',
                  transition: 'var(--transition)',
                  opacity: task.done ? 0.5 : 1,
                }}
                onClick={() => toggleTask(task.id)}
              >
                {task.done
                  ? <CheckCircle2 size={16} style={{ color: 'var(--success)', flexShrink: 0 }} />
                  : <div style={{
                    width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${task.priority === 'High' ? 'var(--danger)' : task.priority === 'Medium' ? 'var(--warning)' : 'var(--text-muted)'}`
                  }} />
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '0.82rem', fontWeight: 500,
                    textDecoration: task.done ? 'line-through' : 'none',
                    color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {task.title}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {task.assignee} · Due {task.due}
                  </div>
                </div>
                <span className={`badge ${task.priority === 'High' ? 'badge-danger' : task.priority === 'Medium' ? 'badge-warning' : 'badge-neutral'}`}>
                  {task.priority}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Metrics */}
        <div className="glass-card p-6" style={{ gridColumn: '1 / -1' }}>
          <div className="section-header">
            <span className="section-title">Module Health</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            {[
              { label: 'WhatsApp Delivery Rate', val: 96, color: 'var(--whatsapp)' },
              { label: 'Lead Conversion Rate', val: 24, color: 'var(--accent-primary)' },
              { label: 'Task Completion Rate', val: 71, color: 'var(--success)' },
              { label: 'Payment Collection Rate', val: 58, color: 'var(--warning)' },
            ].map((m) => (
              <div key={m.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{m.label}</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: m.color }}>{m.val}%</span>
                </div>
                <div className="progress-bar-wrap">
                  <div className="progress-bar-fill" style={{ width: `${m.val}%`, background: m.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
