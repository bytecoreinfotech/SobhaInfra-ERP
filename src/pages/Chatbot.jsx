import React, { useState, useEffect, useRef } from 'react';
import {
  Bot, Send, Plus, Trash2, Edit2, CheckCircle2, AlertTriangle,
  Zap, RefreshCw, Database, Terminal, Shield, Sparkles, Activity,
  ChevronRight, ArrowRight, IndianRupee, Layers, HelpCircle
} from 'lucide-react';
import {
  getAiKnowledge, createAiKnowledge, deleteAiKnowledge,
  getAiRuns, runAiSalesAgent
} from '../lib/db';
import './Pages.css';

const SCORING_RULES = [
  { trigger: 'Explicit Buying Intent ("Ready to book")', delta: '+30 pts', type: 'positive' },
  { trigger: 'Formal Quotation Requested', delta: '+20 pts', type: 'positive' },
  { trigger: 'Human Salesperson Requested', delta: '+20 pts', type: 'positive' },
  { trigger: 'Specific Quantity / Unit Provided', delta: '+10 pts', type: 'positive' },
  { trigger: 'Rate Chart / Pricing Requested', delta: '+10 pts', type: 'positive' },
  { trigger: 'Downloadable Brochure Requested', delta: '+5 pts', type: 'positive' },
  { trigger: 'Price Objection ("Too expensive / Rate kam karo")', delta: '-10 pts', type: 'negative' },
  { trigger: 'Not Interested / Postponed', delta: '-40 pts', type: 'negative' },
  { trigger: 'Opt-Out Request ("STOP / UNSUBSCRIBE")', delta: '-100 pts', type: 'critical' },
];

const Chatbot = () => {
  const [activeTab, setActiveTab] = useState('simulator'); // 'simulator' | 'knowledge' | 'rules' | 'logs'
  
  // Simulator State
  const [messages, setMessages] = useState([
    { id: 1, sender: 'bot', text: '👋 Hello! I am your Bounded AI Sales Assistant for ERPPro Real Estate. How can I help you with our properties today?', toolCalls: [] }
  ]);
  const [userInput, setUserInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeInspectorTool, setActiveInspectorTool] = useState(null);
  const [lastObservability, setLastObservability] = useState(null);

  // Knowledge Base State
  const [knowledgeList, setKnowledgeList] = useState([]);
  const [loadingKB, setLoadingKB] = useState(true);
  const [showAddKB, setShowAddKB] = useState(false);
  const [kbForm, setKbForm] = useState({ category: 'Pricing', title: '', content: '' });
  const [savingKB, setSavingKB] = useState(false);

  // Logs State
  const [aiRuns, setAiRuns] = useState([]);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadKB();
    loadRuns();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadKB = async () => {
    setLoadingKB(true);
    const { data } = await getAiKnowledge();
    setKnowledgeList(data || []);
    setLoadingKB(false);
  };

  const loadRuns = async () => {
    const { data } = await getAiRuns();
    setAiRuns(data || []);
  };

  const handleSendSimulator = async (e) => {
    e.preventDefault();
    if (!userInput.trim() || isProcessing) return;

    const userText = userInput;
    setUserInput('');
    const userMsg = { id: Date.now(), sender: 'user', text: userText, toolCalls: [] };
    setMessages(prev => [...prev, userMsg]);
    setIsProcessing(true);

    const result = await runAiSalesAgent({
      messageText: userText,
      history: messages.map(m => ({ sender_type: m.sender === 'user' ? 'customer' : 'ai', body: m.text })),
    });

    const botMsg = {
      id: Date.now() + 1,
      sender: 'bot',
      text: result.responseText || 'Our sales executive will contact you shortly.',
      toolCalls: result.toolCalls || [],
    };

    setMessages(prev => [...prev, botMsg]);
    if (result.toolCalls && result.toolCalls.length > 0) {
      setActiveInspectorTool(result.toolCalls[0]);
    }
    setLastObservability(result.observability || null);
    setIsProcessing(false);
    loadRuns();
  };

  const handleCreateKB = async (e) => {
    e.preventDefault();
    if (!kbForm.title.trim() || !kbForm.content.trim()) return;
    setSavingKB(true);
    const { data } = await createAiKnowledge(kbForm);
    if (data) {
      setKnowledgeList(prev => [data, ...prev]);
      setShowAddKB(false);
      setKbForm({ category: 'Pricing', title: '', content: '' });
    }
    setSavingKB(false);
  };

  const handleDeleteKB = async (id) => {
    await deleteAiKnowledge(id);
    setKnowledgeList(prev => prev.filter(k => k.id !== id));
  };

  return (
    <div className="page-container animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">AI Sales Assistant</h1>
          <p className="page-subtitle">Bounded conversational qualification, tool registry, and pricing guardrail rules.</p>
        </div>

        {/* Tab Navigation */}
        <div className="page-actions">
          <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <button
              className="btn"
              onClick={() => setActiveTab('simulator')}
              style={{
                borderRadius: 0,
                background: activeTab === 'simulator' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: activeTab === 'simulator' ? 'white' : 'var(--text-secondary)',
                padding: '0.45rem 1rem',
              }}
            >
              <Terminal size={14} /> Agent Simulator
            </button>
            <button
              className="btn"
              onClick={() => setActiveTab('knowledge')}
              style={{
                borderRadius: 0,
                background: activeTab === 'knowledge' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: activeTab === 'knowledge' ? 'white' : 'var(--text-secondary)',
                padding: '0.45rem 1rem',
              }}
            >
              <Database size={14} /> Knowledge Base ({knowledgeList.length})
            </button>
            <button
              className="btn"
              onClick={() => setActiveTab('rules')}
              style={{
                borderRadius: 0,
                background: activeTab === 'rules' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: activeTab === 'rules' ? 'white' : 'var(--text-secondary)',
                padding: '0.45rem 1rem',
              }}
            >
              <Shield size={14} /> Scoring & Guardrails
            </button>
            <button
              className="btn"
              onClick={() => setActiveTab('logs')}
              style={{
                borderRadius: 0,
                background: activeTab === 'logs' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: activeTab === 'logs' ? 'white' : 'var(--text-secondary)',
                padding: '0.45rem 1rem',
              }}
            >
              <Activity size={14} /> Observability Logs
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          TAB 1: AGENT SIMULATOR & TOOL CALL INSPECTOR
         ========================================================================= */}
      {activeTab === 'simulator' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem', height: '620px' }}>
          
          {/* Chat Simulator Console */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Bot size={18} color="var(--accent-primary)" />
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>OpenAI GPT-4o Bounded Simulator</span>
              </div>
              <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Pricing Guardrails ON</span>
            </div>

            {/* Quick Test Prompts */}
            <div style={{ padding: '0.5rem 1rem', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {[
                'What is the price of 3BHK Andheri?',
                'Rate thoda kam hoga kya?',
                'Send me brochure PDF',
                'What time is the site office open?',
              ].map(q => (
                <button
                  key={q}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.68rem', padding: '0.2rem 0.5rem' }}
                  onClick={() => setUserInput(q)}
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Message Feed */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {messages.map(m => (
                <div
                  key={m.id}
                  style={{
                    alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '82%',
                    padding: '0.85rem 1rem',
                    borderRadius: 12,
                    background: m.sender === 'user' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: m.sender === 'user' ? 'white' : 'var(--text-primary)',
                    fontSize: '0.84rem',
                    lineHeight: 1.4,
                  }}
                >
                  <div style={{ fontSize: '0.65rem', opacity: 0.8, marginBottom: '0.25rem' }}>
                    {m.sender === 'user' ? '👤 Customer Inquiry' : '🤖 AI Sales Agent'}
                  </div>
                  <div>{m.text}</div>
                  {m.toolCalls && m.toolCalls.length > 0 && (
                    <div style={{ marginTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '0.4rem', display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                      {m.toolCalls.map((tc, i) => (
                        <button
                          key={i}
                          onClick={() => setActiveInspectorTool(tc)}
                          style={{
                            background: 'rgba(99,102,241,0.25)',
                            border: '1px solid var(--accent-secondary)',
                            borderRadius: 4,
                            color: 'var(--text-primary)',
                            fontSize: '0.65rem',
                            padding: '0.15rem 0.4rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}
                        >
                          <Zap size={10} color="var(--warning)" /> {tc.toolName}()
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {isProcessing && (
                <div style={{ alignSelf: 'flex-start', color: 'var(--text-muted)', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <RefreshCw size={13} className="animate-spin" /> Calling OpenAI tools...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input form */}
            <form onSubmit={handleSendSimulator} style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border-color)', background: 'var(--bg-secondary)', display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                className="input-field"
                placeholder="Ask about properties, pricing, discounts, brochures..."
                value={userInput}
                onChange={e => setUserInput(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={isProcessing || !userInput.trim()}>
                <Send size={15} /> Send
              </button>
            </form>
          </div>

          {/* Real-time Tool Call Inspector & Observability Pane */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
            
            {/* Tool Call Inspector */}
            <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Zap size={15} color="var(--warning)" /> Tool Call Inspector
                </span>
                {activeInspectorTool && <span className="badge badge-neutral">{activeInspectorTool.toolName}</span>}
              </div>

              <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', background: '#0b0f19', color: '#10b981', fontFamily: 'monospace', fontSize: '0.75rem', lineHeight: 1.5 }}>
                {activeInspectorTool ? (
                  <div>
                    <div style={{ color: '#6366f1', marginBottom: '0.5rem' }}>// Tool Invocation Payload</div>
                    <div style={{ color: '#e2e8f0', marginBottom: '0.75rem' }}>
                      <strong>Function:</strong> {activeInspectorTool.toolName}
                    </div>
                    <div style={{ color: '#94a3b8', marginBottom: '0.25rem' }}>// Arguments:</div>
                    <pre style={{ background: '#05070d', padding: '0.5rem', borderRadius: 6, color: '#f59e0b', overflowX: 'auto' }}>
                      {JSON.stringify(activeInspectorTool.args, null, 2)}
                    </pre>
                    <div style={{ color: '#94a3b8', margin: '0.75rem 0 0.25rem 0' }}>// Returned Output (Ground Truth):</div>
                    <pre style={{ background: '#05070d', padding: '0.5rem', borderRadius: 6, color: '#10b981', overflowX: 'auto' }}>
                      {JSON.stringify(activeInspectorTool.output, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div style={{ color: '#64748b', textAlign: 'center', marginTop: '3rem' }}>
                    Trigger a message in the simulator to inspect executed tool calls.
                  </div>
                )}
              </div>
            </div>

            {/* Observability & Cost Metric Card */}
            <div className="glass-card" style={{ padding: '1rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Activity size={14} color="var(--success)" /> Live Run Observability
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
                <div style={{ background: 'var(--bg-tertiary)', padding: '0.5rem', borderRadius: 6 }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Model</div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{lastObservability?.model || 'gpt-4o'}</div>
                </div>
                <div style={{ background: 'var(--bg-tertiary)', padding: '0.5rem', borderRadius: 6 }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Latency</div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent-secondary)' }}>{lastObservability?.latencyMs ? `${lastObservability.latencyMs}ms` : '320ms'}</div>
                </div>
                <div style={{ background: 'var(--bg-tertiary)', padding: '0.5rem', borderRadius: 6 }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Est. Cost</div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--success)' }}>${lastObservability?.estimatedCostUsd || '0.00045'}</div>
                </div>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* =========================================================================
          TAB 2: KNOWLEDGE BASE MASTER
         ========================================================================= */}
      {activeTab === 'knowledge' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Ground-Truth Knowledge Base (Section 17)</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                The AI can only reference active, verified knowledge articles.
              </p>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddKB(true)}>
              <Plus size={14} /> Add Knowledge Article
            </button>
          </div>

          {showAddKB && (
            <form onSubmit={handleCreateKB} className="glass-card p-6" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0 }}>New Knowledge Base Entry</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Category</label>
                  <select className="input-field" value={kbForm.category} onChange={e => setKbForm(p => ({ ...p, category: e.target.value }))}>
                    {['Pricing', 'FAQ', 'Policy', 'Script', 'Catalog'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Title *</label>
                  <input type="text" className="input-field" placeholder="e.g. Possession Timelines for Andheri Tower" value={kbForm.title} onChange={e => setKbForm(p => ({ ...p, title: e.target.value }))} required />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Verified Content *</label>
                <textarea className="input-field textarea-field" rows={3} placeholder="Exact verified facts for AI context..." value={kbForm.content} onChange={e => setKbForm(p => ({ ...p, content: e.target.value }))} required />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddKB(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={savingKB}>{savingKB ? 'Saving...' : 'Save Knowledge'}</button>
              </div>
            </form>
          )}

          <div className="glass-card table-container">
            <table className="data-table">
              <thead>
                <tr><th>Category</th><th>Title</th><th>Content / Facts</th><th>Version</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {loadingKB ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}><RefreshCw size={20} className="animate-spin" /></td></tr>
                ) : knowledgeList.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No knowledge base items added yet.</td></tr>
                ) : (
                  knowledgeList.map(k => (
                    <tr key={k.id}>
                      <td><span className="badge badge-neutral">{k.category}</span></td>
                      <td style={{ fontWeight: 700, fontSize: '0.85rem' }}>{k.title}</td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: 350 }}>{k.content}</td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--accent-secondary)' }}>v{k.version || 1}</td>
                      <td><span className="badge badge-success">Active</span></td>
                      <td>
                        <button className="btn-icon" onClick={() => handleDeleteKB(k.id)} title="Delete">
                          <Trash2 size={14} color="var(--danger)" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: SCORING & GUARDRAILS RULES
         ========================================================================= */}
      {activeTab === 'rules' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          
          {/* Section 22 Lead Scoring Rules */}
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Zap size={18} color="var(--warning)" /> Lead Scoring Weights (Section 22)
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Dynamic point system calculated during automated discovery and qualification.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {SCORING_RULES.map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.65rem 0.85rem',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 8,
                    fontSize: '0.78rem',
                  }}
                >
                  <span>{r.trigger}</span>
                  <span
                    style={{
                      fontWeight: 800,
                      color: r.type === 'positive' ? 'var(--success)' : r.type === 'negative' ? 'var(--warning)' : 'var(--danger)',
                    }}
                  >
                    {r.delta}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Section 19 Pricing Guardrails */}
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Shield size={18} color="var(--accent-primary)" /> Pricing Guardrails (Section 19)
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Strict safety parameters preventing hallucinations or unapproved commitments.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8rem' }}>
              <div style={{ padding: '0.85rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8 }}>
                <strong style={{ color: 'var(--danger)', display: 'block', marginBottom: '0.25rem' }}>🚫 Zero Price Invention Policy</strong>
                AI must never invent rates, discounts, credit terms, taxes, or delivery dates. All pricing must come directly from <code>get_product_price()</code>.
              </div>
              <div style={{ padding: '0.85rem', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8 }}>
                <strong style={{ color: 'var(--accent-primary)', display: 'block', marginBottom: '0.25rem' }}>👤 Mandatory Negotiation Escalation</strong>
                Any customer request for discounts ("Rate kam karo") automatically logs a price objection and triggers <code>request_human_handoff()</code>.
              </div>
              <div style={{ padding: '0.85rem', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 8 }}>
                <strong style={{ color: 'var(--success)', display: 'block', marginBottom: '0.25rem' }}>🔒 Prompt Injection Resistance</strong>
                AI rejects attempts to reveal internal system instructions, export other customer leads, or execute unauthorized transactions.
              </div>
            </div>
          </div>

        </div>
      )}

      {/* =========================================================================
          TAB 4: OBSERVABILITY & RUN LOGS
         ========================================================================= */}
      {activeTab === 'logs' && (
        <div className="glass-card table-container">
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="section-title">AI Execution & Latency Audit Logs</span>
            <button className="btn btn-secondary btn-sm" onClick={loadRuns}><RefreshCw size={13} /> Refresh</button>
          </div>
          <table className="data-table">
            <thead>
              <tr><th>Run ID</th><th>Model</th><th>Latency</th><th>Estimated Cost</th><th>Status</th><th>Timestamp</th></tr>
            </thead>
            <tbody>
              {aiRuns.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No execution runs recorded yet.</td></tr>
              ) : (
                aiRuns.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{r.id}</td>
                    <td><span className="badge badge-neutral">{r.model_name}</span></td>
                    <td style={{ color: 'var(--accent-secondary)' }}>{r.latency_ms}ms</td>
                    <td style={{ color: 'var(--success)' }}>${Number(r.total_cost || 0).toFixed(5)}</td>
                    <td><span className="badge badge-success">{r.status}</span></td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(r.created_at).toLocaleTimeString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
};

export default Chatbot;
