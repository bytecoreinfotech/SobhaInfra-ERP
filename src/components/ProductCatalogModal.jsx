import React, { useState, useEffect } from 'react';
import { X, Plus, Building2, Download, FileText, CheckCircle2, RefreshCw, IndianRupee } from 'lucide-react';
import { getProducts, createProduct } from '../lib/db';

const ProductCatalogModal = ({ isOpen, onClose }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'Residential', sku: '', unit_price: '', brochure_url: '', description: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) loadProducts();
  }, [isOpen]);

  const loadProducts = async () => {
    setLoading(true);
    const { data } = await getProducts();
    setProducts(data || []);
    setLoading(false);
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.unit_price) return;
    setSaving(true);
    const { data } = await createProduct({
      ...form,
      unit_price: Number(form.unit_price),
    });
    if (data) {
      setProducts(prev => [data, ...prev]);
      setShowAdd(false);
      setForm({ name: '', category: 'Residential', sku: '', unit_price: '', brochure_url: '', description: '' });
    }
    setSaving(false);
  };

  const fmtCurrency = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content modal-lg animate-fade-in" style={{ maxWidth: 840 }}>
        <button
          className="modal-close-btn"
          onClick={onClose}
          title="Close Modal (Esc)"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingRight: '2.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Building2 size={20} color="var(--accent-primary)" /> Product Master & Pricing Guardrails
            </h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
              Source of truth for sales quotations and OpenAI agent pricing tool (Section 19).
            </p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Add Product
          </button>
        </div>

        {showAdd && (
          <form onSubmit={handleCreateProduct} className="glass-card p-6" style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0 }}>Add New Product SKU</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Product Name *</label>
                <input type="text" className="input-field" placeholder="e.g. Premium Tile Adhesive 20kg" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Category</label>
                <select className="input-field" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                  {['Adhesives', 'Grouts & Sealants', 'Waterproofing', 'Mortars & Plasters', 'Primers', 'General Products'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>SKU Code</label>
                <input type="text" className="input-field" placeholder="PROD-ADH-001" value={form.sku} onChange={e => setForm(p => ({ ...p, sku: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Official Approved Price (₹) *</label>
                <input type="number" className="input-field" placeholder="850" value={form.unit_price} onChange={e => setForm(p => ({ ...p, unit_price: e.target.value }))} required />
              </div>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Brochure / Technical Spec PDF URL</label>
              <input type="url" className="input-field" placeholder="https://..." value={form.brochure_url} onChange={e => setForm(p => ({ ...p, brochure_url: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                {saving ? 'Saving...' : 'Save Product'}
              </button>
            </div>
          </form>
        )}

        <div className="table-container" style={{ maxHeight: 380, overflowY: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Product Name</th>
                <th>Category</th>
                <th>SKU</th>
                <th>Approved Unit Rate</th>
                <th>Brochure</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}><RefreshCw size={20} className="animate-spin" /></td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No products in master catalog.</td></tr>
              ) : (
                products.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.name}</div>
                      {p.description && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{p.description}</div>}
                    </td>
                    <td><span className="badge badge-neutral">{p.category || 'General'}</span></td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--accent-secondary)' }}>{p.sku || '—'}</td>
                    <td style={{ fontWeight: 700, color: 'var(--success)' }}>{fmtCurrency(p.unit_price)}</td>
                    <td>
                      {p.brochure_url ? (
                        <a href={p.brochure_url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}>
                          <Download size={12} /> PDF
                        </a>
                      ) : (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ProductCatalogModal;
