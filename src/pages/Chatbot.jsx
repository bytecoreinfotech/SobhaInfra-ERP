import React, { useState, useEffect, useRef } from 'react';
import { Bot, Send, Settings, Zap, CheckCircle2, Plus } from 'lucide-react';
import { getChatbotRules, matchChatbotRule } from '../lib/db';
import './Pages.css';

const Chatbot = () => {
  const [messages, setMessages] = useState([
    { id: 1, type: 'bot', text: 'Hi! 👋 I\'m ERPBot — your 24/7 WhatsApp assistant for Real Estate queries.\n\nHow can I help you today?\n\n1️⃣ View Properties\n2️⃣ Pricing & Budget\n3️⃣ Schedule Site Visit\n4️⃣ Talk to an Agent', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [rules, setRules] = useState([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadRules();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const loadRules = async () => {
    setRulesLoading(true);
    const { data } = await getChatbotRules();
    setRules(data || []);
    setRulesLoading(false);
  };

  const sendMessage = () => {
    if (!input.trim()) return;
    const userMsg = {
      id: Date.now(), type: 'user', text: input,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    const reply = matchChatbotRule(rules, input);
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: Date.now() + 1, type: 'bot', text: reply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
      setIsTyping(false);
    }, 1200);
  };

  const flowNodes = [
    { id: 1, label: 'User sends WhatsApp message', type: 'trigger', color: 'var(--whatsapp)' },
    { id: 2, label: 'Keyword Detection (DB rules)', type: 'process', color: 'var(--accent-primary)' },
    { id: 3, label: 'Send Auto-Reply via WA API', type: 'action', color: 'var(--success)' },
    { id: 4, label: 'Lead Created in CRM (Supabase)', type: 'action', color: 'var(--info)' },
    { id: 5, label: 'Notify Assigned Sales Agent', type: 'action', color: 'var(--warning)' },
  ];

  return (
    <div className="page-container animate-fade-in">
      <div className="demo-banner">
        <span className="demo-badge">LIVE</span>
        Chatbot rules loaded from Supabase database. Add/edit rules and they apply immediately without redeployment.
      </div>

      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Chatbot & Auto-Reply</h1>
          <p className="page-subtitle">Configure automated responses for WhatsApp. Rules stored in database.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={loadRules}><Settings size={15} /> Reload Rules</button>
          <button className="btn btn-primary"><Zap size={15} /> Publish Bot</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>

        {/* Chat Simulator */}
        <div>
          <div className="section-header" style={{ marginBottom: '0.75rem' }}>
            <span className="section-title">Live Preview — ERPBot</span>
            <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span className="status-dot online" /> Active
            </span>
          </div>
          <div className="chat-window">
            <div className="chat-header">
              <div className="chat-avatar"><Bot size={18} /></div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>ERPBot – Real Estate</div>
                <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>🟢 Online · 24/7</div>
              </div>
              <span className="badge badge-whatsapp" style={{ marginLeft: 'auto', fontSize: '0.65rem' }}>WhatsApp</span>
            </div>
            <div className="chat-messages">
              {messages.map(msg => (
                <div key={msg.id} className={`chat-msg ${msg.type}`}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                  <div className="chat-msg-time">{msg.time}</div>
                </div>
              ))}
              {isTyping && (
                <div className="chat-msg bot" style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '0.65rem 0.875rem' }}>
                  {[0, 0.2, 0.4].map((d, i) => (
                    <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--text-muted)', animation: `pulse-dot 1s ease infinite`, animationDelay: `${d}s` }} />
                  ))}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="chat-input-area">
              <input
                type="text"
                className="chat-input"
                placeholder="Type a message to test the bot..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
              />
              <button className="chat-send-btn" onClick={sendMessage}><Send size={15} /></button>
            </div>
          </div>
        </div>

        {/* Config Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Bot Flow */}
          <div className="glass-card p-6">
            <div className="section-title" style={{ marginBottom: '1rem' }}>Automation Flow</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {flowNodes.map((node, i) => (
                <div key={node.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: node.color + '22', border: `2px solid ${node.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: node.color, fontWeight: 700, fontSize: '0.75rem', flexShrink: 0 }}>{node.id}</div>
                    {i < flowNodes.length - 1 && <div style={{ width: 2, height: 24, background: 'var(--border-color)' }} />}
                  </div>
                  <div style={{ flex: 1, padding: '0.6rem 0.875rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.82rem' }}>
                    <span style={{ fontSize: '0.65rem', color: node.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>{node.type}</span>
                    {node.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live Keyword Rules from Supabase */}
          <div className="glass-card p-6">
            <div className="section-header" style={{ marginBottom: '0.875rem' }}>
              <span className="section-title">Keyword Rules {rulesLoading ? '(loading...)' : `(${rules.length})`}</span>
              <button className="btn btn-secondary btn-sm"><Plus size={13} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {rulesLoading ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>Loading from database...</div>
              ) : rules.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>No rules found. Run seed SQL in Supabase.</div>
              ) : (
                rules.map((rule, i) => (
                  <div key={rule.id || i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0.875rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent-secondary)', fontFamily: 'monospace' }}>{rule.keywords?.join(', ')}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>→ {rule.response}</div>
                    </div>
                    <span className={`badge ${rule.is_active ? 'badge-success' : 'badge-neutral'}`}>{rule.is_active ? 'Active' : 'Off'}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Bot Stats */}
          <div className="glass-card p-6">
            <div className="section-title" style={{ marginBottom: '0.875rem' }}>Bot Performance (This Week)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              {[
                { label: 'Messages Handled', val: '1,248', color: 'var(--accent-primary)' },
                { label: 'Auto-Resolved', val: '81%', color: 'var(--success)' },
                { label: 'Leads Generated', val: '64', color: 'var(--whatsapp)' },
                { label: 'Avg. Response Time', val: '< 1s', color: 'var(--warning)' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center', padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color, fontFamily: 'Outfit, sans-serif' }}>{s.val}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chatbot;
