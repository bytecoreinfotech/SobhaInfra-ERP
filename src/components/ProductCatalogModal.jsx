import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, Plus, Package, Download, FileText, CheckCircle2, 
  RefreshCw, IndianRupee, Trash2, Edit2, Search, Filter, Tag 
} from 'lucide-react';
import { getProducts, createProduct, updateProduct, deleteProduct } from '../lib/db';

const ProductCatalogModal = ({ isOpen, onClose }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL');
  
  const [form, setForm] = useState({ 
    name: '', 
    category: 'General', 
    sku: '', 
    unit_price: '', 
    brochure_url: '', 
    description: '' 
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadProducts();
    }
  }, [isOpen]);

  const loadProducts = async () => {
    setLoading(true);
    const { data } = await getProducts();
    setProducts(data || []);
    setLoading(false);
  };

  // Dynamic unique categories extracted from live products + fallback general categories
  const dynamicCategories = useMemo(() => {
    const fromProducts = (products || [])
      .map(p => (p.category || '').trim())
      .filter(Boolean);
    const defaults = ['General', 'Products', 'Services', 'Raw Materials', 'Finished Goods'];
    return Array.from(new Set([...fromProducts, ...defaults]));
  }, [products]);

  const handleOpenAdd = () => {
    setEditingId(null);
    setForm({ 
      name: '', 
      category: dynamicCategories[0] || 'General', 
      sku: '', 
      unit_price: '', 
      brochure_url: '', 
      description: '' 
    });
    setShowAdd(true);
  };

  const handleOpenEdit = (p) => {
    setEditingId(p.id);
    setForm({
      name: p.name || '',
      category: p.category || 'General',
      sku: p.sku || '',
      unit_price: p.unit_price || '',
      brochure_url: p.brochure_url || '',
      description: p.description || ''
    });
    setShowAdd(true);
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.unit_price) return;
    setSaving(true);

    const payload = {
      name: form.name.trim(),
      category: (form.category || 'General').trim(),
      sku: (form.sku || '').trim(),
      unit_price: Number(form.unit_price),
      brochure_url: (form.brochure_url || '').trim(),
      description: (form.description || '').trim()
    };

    if (editingId) {
      const { data, error } = await updateProduct(editingId, payload);
      if (data || !error) {
        setProducts(prev => prev.map(item => item.id === editingId ? { ...item, ...payload } : item));
        setShowAdd(false);
        setEditingId(null);
      }
    } else {
      const { data } = await createProduct(payload);
      if (data) {
        setProducts(prev => [data, ...prev]);
        setShowAdd(false);
        setForm({ name: '', category: 'General', sku: '', unit_price: '', brochure_url: '', description: '' });
      }
    }
    setSaving(false);
  };

  const handleDeleteProduct = async (id, name) => {
    if (!window.confirm(`Are you sure you want to remove "${name}" from the catalog?`)) return;
    await deleteProduct(id);
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  const fmtCurrency = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

  // Filtered list
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = 
        !searchQuery.trim() ||
        (p.name && p.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.category && p.category.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesCategory = 
        selectedCategoryFilter === 'ALL' || 
        (p.category || 'General').toLowerCase() === selectedCategoryFilter.toLowerCase();

      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategoryFilter]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content modal-lg animate-fade-in" style={{ maxWidth: 880, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <button
          className="modal-close-btn"
          onClick={onClose}
          title="Close Modal (Esc)"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingRight: '2.5rem', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Package size={20} color="var(--accent-primary)" /> Product Catalog &amp; Master Pricing
            </h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
              Central repository for product SKUs, customizable categories, quotation guardrails &amp; AI CRM campaigns.
            </p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleOpenAdd}>
            <Plus size={14} /> Add Product
          </button>
        </div>

        {/* Add / Edit Form */}
        {showAdd && (
          <form onSubmit={handleSaveProduct} className="glass-card p-6" style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem', flexShrink: 0, border: '1px solid var(--accent-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Tag size={15} /> {editingId ? 'Edit Product SKU' : 'Add New Product SKU'}
              </h3>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>* Required fields</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Product / Item Name *</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="e.g. Product / Item / Service Name" 
                  value={form.name} 
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))} 
                  required 
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                  Category (Select or Type Any Custom Category) *
                </label>
                {/* Dynamic Category with Datalist allowing both selection & free-text input */}
                <input 
                  type="text"
                  list="dynamic-category-options"
                  className="input-field" 
                  placeholder="Type any custom category..." 
                  value={form.category} 
                  onChange={e => setForm(p => ({ ...p, category: e.target.value }))} 
                  required
                />
                <datalist id="dynamic-category-options">
                  {dynamicCategories.map(cat => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  💡 Enter any new category freely or select from suggestions.
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>SKU / Item Code</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="e.g. SKU-001, PROD-101" 
                  value={form.sku} 
                  onChange={e => setForm(p => ({ ...p, sku: e.target.value }))} 
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Approved Unit Rate (₹) *</label>
                <input 
                  type="number" 
                  step="any"
                  className="input-field" 
                  placeholder="e.g. 1500" 
                  value={form.unit_price} 
                  onChange={e => setForm(p => ({ ...p, unit_price: e.target.value }))} 
                  required 
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Brochure / Spec PDF URL (Optional)</label>
              <input 
                type="url" 
                className="input-field" 
                placeholder="https://..." 
                value={form.brochure_url} 
                onChange={e => setForm(p => ({ ...p, brochure_url: e.target.value }))} 
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Product Description / Details (Optional)</label>
              <input 
                type="text" 
                className="input-field" 
                placeholder="Brief specifications, packing size, or application guidelines..." 
                value={form.description} 
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))} 
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
              <button 
                type="button" 
                className="btn btn-secondary btn-sm" 
                onClick={() => { setShowAdd(false); setEditingId(null); }}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update Product' : 'Save Product'}
              </button>
            </div>
          </form>
        )}

        {/* Filter & Search Bar */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', flexShrink: 0 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input-field"
              placeholder="Search by product name, SKU, or category..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '2rem', fontSize: '0.78rem', height: 34 }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Filter size={14} color="var(--text-muted)" />
            <select
              className="input-field"
              value={selectedCategoryFilter}
              onChange={e => setSelectedCategoryFilter(e.target.value)}
              style={{ fontSize: '0.78rem', height: 34, padding: '0 0.6rem', minWidth: 140 }}
            >
              <option value="ALL">All Categories ({products.length})</option>
              {dynamicCategories.map(cat => {
                const count = products.filter(p => (p.category || 'General').toLowerCase() === cat.toLowerCase()).length;
                return (
                  <option key={cat} value={cat}>{cat} ({count})</option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Product Table */}
        <div className="table-container" style={{ flex: 1, overflowY: 'auto', maxHeight: 380, border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Product Name &amp; Spec</th>
                <th>Category</th>
                <th>SKU</th>
                <th>Approved Unit Rate</th>
                <th>Brochure</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    <RefreshCw size={22} className="animate-spin" style={{ margin: '0 auto 0.5rem auto', display: 'block' }} />
                    Loading catalog items...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    <Package size={28} style={{ opacity: 0.35, margin: '0 auto 0.5rem auto', display: 'block' }} />
                    {searchQuery || selectedCategoryFilter !== 'ALL' ? 'No products match your search or filter.' : 'No products in catalog yet. Click "+ Add Product" above to add your first item.'}
                  </td>
                </tr>
              ) : (
                filteredProducts.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.name}</div>
                      {p.description && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{p.description}</div>}
                    </td>
                    <td>
                      <span className="badge badge-neutral" style={{ fontWeight: 600 }}>
                        {p.category || 'General'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--accent-secondary)' }}>
                      {p.sku || '—'}
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--success)' }}>
                      {fmtCurrency(p.unit_price)}
                    </td>
                    <td>
                      {p.brochure_url ? (
                        <a 
                          href={p.brochure_url} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="btn btn-secondary btn-sm" 
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                        >
                          <Download size={12} /> PDF
                        </a>
                      ) : (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                        <button 
                          className="btn btn-secondary btn-sm" 
                          onClick={() => handleOpenEdit(p)}
                          title="Edit product"
                          style={{ padding: '0.25rem 0.45rem' }}
                        >
                          <Edit2 size={13} />
                        </button>
                        <button 
                          className="btn btn-danger btn-sm" 
                          onClick={() => handleDeleteProduct(p.id, p.name)}
                          title="Delete product"
                          style={{ padding: '0.25rem 0.45rem' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Summary */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>
          <div>
            Showing <strong>{filteredProducts.length}</strong> of <strong>{products.length}</strong> items
          </div>
          <div>
            Categories: <strong>{dynamicCategories.length}</strong> defined
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductCatalogModal;
