import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, Settings, Zap, CheckCircle2, Plus, X } from 'lucide-react';
import './Pages.css';

const botResponses = {
  'hello': 'Hello! 👋 Welcome to ERPPro support. How can I assist you today?\n\n1️⃣ Product Information\n2️⃣ Pricing & Plans\n3️⃣ Technical Support\n4️⃣ Schedule a Demo',
  'pricing': 'Our pricing starts at ₹2,999/month for the Starter plan.\n\n💼 Starter – ₹2,999/mo\n🚀 Professional – ₹7,999/mo\n🏢 Enterprise – Custom pricing\n\nWould you like to schedule a demo?',
  'demo': 'Great! I\'ll connect you with our sales team to schedule a personalized demo. 📅\n\nPlease share your preferred date and time.',
  'support': 'I\'m connecting you to our technical support team. ⚙️\n\nMeanwhile, you can also check our documentation at docs.erppro.in',
  '1': 'ERPPro is an all-in-one business management platform with:\n✅ WhatsApp CRM\n✅ Task Management\n✅ Tally Integration\n✅ Payment Automation\n\nWould you like to know more?',
  '2': 'Our pricing starts at ₹2,999/month. Would you like to see a full comparison?',
  'default': 'Thanks for your message! 😊 Our team will get back to you shortly.\n\nFor immediate assistance, call us at +91 98765 43210.'
};

const getBotReply = (msg) => {
  const lower = msg.toLowerCase().trim();
  for (const key of Object.keys(botResponses)) {
    if (lower.includes(key)) return botResponses[key];
  }
  return botResponses['default'];
};

const flowNodes = [
  { id: 1, label: 'User sends message', type: 'trigger', color: 'var(--whatsapp)' },
  { id: 2, label: 'Keyword Detection', type: 'process', color: 'var(--accent-primary)' },
  { id: 3, label: 'Send Auto-Reply', type: 'action', color: 'var(--success)' },
  { id: 4, label: 'Lead Created in CRM', type: 'action', color: 'var(--info)' },
  { id: 5, label: 'Notify Sales Agent', type: 'action', color: 'var(--warning)' },
];

const Chatbot = () => {
  const [messages, setMessages] = useState([
    { id: 1, type: 'bot', text: 'Hi! 👋 I\'m ERPBot — your 24/7 WhatsApp assistant.\n\nHow can I help you today?\n\n1️⃣ Product Information\n2️⃣ Pricing & Plans\n3️⃣ Technical Support\n4️⃣ Schedule a Demo', time: '10:30 AM' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim()) return;

    const userMsg = { id: Date.now(), type: 'user', text: input, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      const botReply = getBotReply(input);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'bot',
        text: botReply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
      setIsTyping(false);
    }, 1200);
  };

  return (
    <div className="page-container animate-fade-in">
      {/* Demo Banner */}
      <div className="demo-banner">
        <span className="demo-badge">DEMO</span>
        Live chatbot preview below. In production, replies are sent via WhatsApp Business API with NLP/keyword routing.
      </div>

      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Chatbot & Auto-Reply</h1>
          <p className="page-subtitle">Configure automated responses and chatbot flow for WhatsApp.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary"><Settings size={15} /> Configure</button>
          <button className="btn btn-primary"><Zap size={15} /> Publish Bot</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>

        {/* Chat Simulator */}
        <div>
          <div className="section-header" style={{ marginBottom: '0.75rem' }}>
            <span className="section-title">Live Preview – ERPBot</span>
            <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span className="status-dot online" /> Active
            </span>
          </div>
          <div className="chat-window">
            {/* Chat Header */}
            <div className="chat-header">
              <div className="chat-avatar"><Bot size={18} /></div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>ERPBot</div>
                <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>🟢 Online · 24/7 Active</div>
              </div>
              <span className="badge badge-whatsapp" style={{ marginLeft: 'auto', fontSize: '0.65rem' }}>WhatsApp</span>
            </div>

            {/* Messages */}
            <div className="chat-messages">
              {messages.map(msg => (
                <div key={msg.id} className={`chat-msg ${msg.type}`}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                  <div className="chat-msg-time">{msg.time}</div>
                </div>
              ))}
              {isTyping && (
                <div className="chat-msg bot" style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '0.65rem 0.875rem' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--text-muted)', animation: 'pulse-dot 1s ease infinite', animationDelay: '0s' }} />
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--text-muted)', animation: 'pulse-dot 1s ease infinite', animationDelay: '0.2s' }} />
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--text-muted)', animation: 'pulse-dot 1s ease infinite', animationDelay: '0.4s' }} />
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="chat-input-area">
              <input
                type="text"
                className="chat-input"
                placeholder="Type a message to test the bot..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
              />
              <button className="chat-send-btn" onClick={sendMessage}>
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Config Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Bot Flow */}
          <div className="glass-card p-6">
            <div className="section-title" style={{ marginBottom: '1rem' }}>Automation Flow</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {flowNodes.map((node, i) => (
                <div key={node.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: node.color + '22',
                      border: `2px solid ${node.color}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: node.color, fontWeight: 700, fontSize: '0.75rem', flexShrink: 0
                    }}>
                      {node.id}
                    </div>
                    {i < flowNodes.length - 1 && (
                      <div style={{ width: 2, height: 24, background: 'var(--border-color)' }} />
                    )}
                  </div>
                  <div style={{
                    flex: 1, padding: '0.6rem 0.875rem',
                    background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)', fontSize: '0.82rem',
                    color: 'var(--text-primary)', marginBottom: i < flowNodes.length - 1 ? '0' : '0'
                  }}>
                    <span style={{ fontSize: '0.65rem', color: node.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>{node.type}</span>
                    {node.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Keyword Rules */}
          <div className="glass-card p-6">
            <div className="section-header" style={{ marginBottom: '0.875rem' }}>
              <span className="section-title">Keyword Rules</span>
              <button className="btn btn-secondary btn-sm"><Plus size={13} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[
                { kw: 'hello, hi, hey', reply: 'Welcome message', active: true },
                { kw: 'price, pricing, cost', reply: 'Pricing template', active: true },
                { kw: 'demo, schedule', reply: 'Demo booking flow', active: true },
                { kw: 'support, help, issue', reply: 'Support escalation', active: false },
              ].map((rule, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.65rem 0.875rem', background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent-secondary)', fontFamily: 'monospace' }}>{rule.kw}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>→ {rule.reply}</div>
                  </div>
                  <span className={`badge ${rule.active ? 'badge-success' : 'badge-neutral'}`}>{rule.active ? 'Active' : 'Off'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stats */}
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
