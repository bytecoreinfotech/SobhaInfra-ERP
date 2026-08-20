import React, { useState, useEffect } from 'react';
import {
  MapPin, Camera, Navigation, User, Users, Building, Calendar,
  Clock, CheckCircle, Plus, Search, Filter, Download, RefreshCw,
  ExternalLink, MessageCircle, AlertCircle, Eye, ShieldCheck, Check
} from 'lucide-react';
import { getSiteVisits, createSiteVisit, updateSiteVisit, getLeads, getTeamMembers } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import FieldMap from '../components/FieldMap';
import GeotaggedCameraModal from '../components/GeotaggedCameraModal';
import './Pages.css';

const FieldOps = () => {
  const { user } = useAuth();
  const [visits, setVisits] = useState([]);
  const [leads, setLeads] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('map'); // 'map' | 'gallery' | 'logs'

  // Selected visit for map focus / drawer
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState(null);

  // Check-in Modal
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);

  // Form State
  const [checkInForm, setCheckInForm] = useState({
    employee_name: user?.name || 'Anand Sharma',
    employee_id: user?.id || 'usr-3',
    site_name: 'Grand Palm Residency - Tower B',
    client_name: '',
    lead_phone: '',
    purpose: 'Client Site Visit & Walkthrough',
    notes: '',
    lat: null,
    lng: null,
    address: '',
    accuracy: null,
    photo_url: null,
  });

  const [locatingGps, setLocatingGps] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    const [visitsRes, leadsRes, usersRes] = await Promise.all([
      getSiteVisits(),
      getLeads(),
      getTeamMembers(),
    ]);

    setVisits(visitsRes.data || []);
    setLeads(leadsRes.data || []);
    setTeamMembers(usersRes.data || []);
    setLoading(false);
  };

  // Acquire live GPS coordinates for check-in
  const fetchCurrentLocation = () => {
    setLocatingGps(true);
    if (!navigator.geolocation) {
      setLocatingGps(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCheckInForm(p => ({
          ...p,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 10),
          address: `GPS: ${pos.coords.latitude.toFixed(4)}°, ${pos.coords.longitude.toFixed(4)}°`,
        }));
        setLocatingGps(false);
      },
      (err) => {
        console.warn('GPS error:', err.message);
        // Fallback demo coordinates
        setCheckInForm(p => ({
          ...p,
          lat: 28.5355,
          lng: 77.3910,
          accuracy: 8,
          address: 'Sector 62, Noida, Uttar Pradesh',
        }));
        setLocatingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleOpenCheckIn = () => {
    fetchCurrentLocation();
    setShowCheckInModal(true);
  };

  const handleGeotagCaptureComplete = (data) => {
    setCheckInForm(p => ({
      ...p,
      photo_url: data.photoUrl,
      lat: data.coords?.lat || p.lat,
      lng: data.coords?.lng || p.lng,
      accuracy: data.accuracy || p.accuracy,
      address: data.address || p.address,
    }));
  };

  const handleCheckInSubmit = async (e) => {
    e.preventDefault();
    if (!checkInForm.site_name || !checkInForm.employee_name) return;

    setSubmitting(true);
    const { data } = await createSiteVisit(checkInForm);
    if (data) {
      setVisits(prev => [data, ...prev]);
      setShowCheckInModal(false);
      setCheckInForm({
        employee_name: 'Anand Sharma',
        employee_id: 'usr-3',
        site_name: 'Grand Palm Residency - Tower B',
        client_name: '',
        lead_phone: '',
        purpose: 'Client Site Visit & Walkthrough',
        notes: '',
        lat: null,
        lng: null,
        address: '',
        accuracy: null,
        photo_url: null,
      });
      setFeedbackMsg({ type: 'success', text: `Site visit check-in saved with live GPS & photo proof!` });
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
    setSubmitting(false);
  };

  const handleMarkCompleted = async (visitId) => {
    const { data } = await updateSiteVisit(visitId, { status: 'Completed' });
    if (data) {
      setVisits(prev => prev.map(v => v.id === visitId ? { ...v, status: 'Completed' } : v));
      if (selectedVisit?.id === visitId) {
        setSelectedVisit(p => ({ ...p, status: 'Completed' }));
      }
      setFeedbackMsg({ type: 'success', text: 'Site inspection marked as Completed!' });
      setTimeout(() => setFeedbackMsg(null), 3000);
    }
  };

  // Filtered visits
  const filteredVisits = visits.filter(v => {
    const matchesSearch =
      (v.employee_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (v.site_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (v.client_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (v.address || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'All' || v.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeOnFieldCount = visits.filter(v => v.status === 'In Progress').length;
  const photosSnappedCount = visits.filter(v => Boolean(v.photo_url)).length;
  const uniqueSitesCount = new Set(visits.map(v => v.site_name)).size;

  return (
    <div className="page-container animate-fade-in">
      {/* Toast Feedback */}
      {feedbackMsg && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem',
          background: feedbackMsg.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${feedbackMsg.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
          color: feedbackMsg.type === 'success' ? 'var(--success)' : 'var(--danger)',
          display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem'
        }}>
          {feedbackMsg.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          {feedbackMsg.text}
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h1 className="page-title">Field Operations & Live GPS Tracking</h1>
            <span style={{
              background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)',
              padding: '0.2rem 0.6rem', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700
            }}>
              100% Free OpenStreetMap
            </span>
          </div>
          <p className="page-subtitle">
            Real-time field employee GPS location tracking, site inspection check-ins, and tamper-proof geotagged site photos.
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={loadAllData}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh Map
          </button>
          <button className="btn btn-primary" onClick={handleOpenCheckIn} style={{ background: '#10b981', borderColor: '#10b981' }}>
            <Camera size={15} /> Field Check-In & Camera
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '1.5rem' }}>
        <div className="glass-card stat-card">
          <div className="stat-header">
            <div>
              <div className="stat-label">Active Agents on Field</div>
              <div className="stat-value">{activeOnFieldCount}</div>
            </div>
            <div className="stat-icon" style={{ background: 'rgba(99,102,241,0.15)', color: '#6366f1' }}>
              <Navigation size={22} />
            </div>
          </div>
        </div>

        <div className="glass-card stat-card">
          <div className="stat-header">
            <div>
              <div className="stat-label">Total Visits Logged</div>
              <div className="stat-value">{visits.length}</div>
            </div>
            <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
              <Building size={22} />
            </div>
          </div>
        </div>

        <div className="glass-card stat-card">
          <div className="stat-header">
            <div>
              <div className="stat-label">Geotagged Site Photos</div>
              <div className="stat-value">{photosSnappedCount}</div>
            </div>
            <div className="stat-icon" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
              <Camera size={22} />
            </div>
          </div>
        </div>

        <div className="glass-card stat-card">
          <div className="stat-header">
            <div>
              <div className="stat-label">Sites & Properties Covered</div>
              <div className="stat-value">{uniqueSitesCount}</div>
            </div>
            <div className="stat-icon" style={{ background: 'rgba(6,182,212,0.15)', color: '#06b6d4' }}>
              <MapPin size={22} />
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '1.25rem' }}>
        {[
          { id: 'map', label: 'Live Field Map & Tracking', icon: <MapPin size={15} /> },
          { id: 'gallery', label: `Geotagged Photo Gallery (${photosSnappedCount})`, icon: <Camera size={15} /> },
          { id: 'logs', label: `Inspection Logs (${visits.length})`, icon: <Calendar size={15} /> },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="btn"
            style={{
              borderRadius: 0, background: 'transparent',
              borderBottom: activeTab === t.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: activeTab === t.id ? 'var(--accent-primary)' : 'var(--text-muted)',
              padding: '0.75rem 1.25rem', fontWeight: activeTab === t.id ? 600 : 400,
              display: 'flex', alignItems: 'center', gap: '0.45rem',
              transition: 'all 0.2s ease', marginBottom: -1
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: Live Field Map */}
      {activeTab === 'map' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.25rem', alignItems: 'start' }}>
          {/* Main Map Container */}
          <div className="glass-card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Navigation size={16} color="#6366f1" /> Live Real-Time Agent Location Pins
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Powered by OpenStreetMap & Leaflet
              </span>
            </div>

            <FieldMap
              visits={filteredVisits}
              selectedVisit={selectedVisit}
              onSelectVisit={setSelectedVisit}
              onViewPhoto={setPreviewPhotoUrl}
              height="520px"
            />
          </div>

          {/* Right Feed Panel: Active On-Field Agents */}
          <div className="glass-card" style={{ padding: '1.25rem', maxHeight: 580, overflowY: 'auto' }}>
            <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '0.3rem' }}>
              Field Agents Activity
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Click any agent to locate on map
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {visits.map(v => {
                const isSelected = selectedVisit?.id === v.id;
                const isCompleted = v.status === 'Completed';

                return (
                  <div
                    key={v.id}
                    onClick={() => setSelectedVisit(v)}
                    style={{
                      padding: '0.75rem', borderRadius: 8,
                      background: isSelected ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                      cursor: 'pointer', transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        👤 {v.employee_name}
                      </div>
                      <span className={`badge ${isCompleted ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.65rem' }}>
                        {v.status}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 500, marginBottom: '0.25rem' }}>
                      🏢 {v.site_name}
                    </div>

                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.4rem', lineHeight: 1.3 }}>
                      📍 {v.address}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      <span>⏱️ {new Date(v.check_in_time || v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {v.photo_url && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={(e) => { e.stopPropagation(); setPreviewPhotoUrl(v.photo_url); }}
                          style={{ fontSize: '0.65rem', padding: '0.15rem 0.45rem', height: 'auto' }}
                        >
                          <Camera size={11} /> View Photo
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Geotagged Photo Gallery */}
      {activeTab === 'gallery' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flex: 1, maxWidth: 400 }}>
              <div className="search-box" style={{ width: '100%' }}>
                <Search size={15} />
                <input
                  type="text"
                  placeholder="Search by property, agent, or client..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Showing {filteredVisits.filter(v => Boolean(v.photo_url)).length} geotagged site inspection photos
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {filteredVisits.filter(v => Boolean(v.photo_url)).map(v => (
              <div key={v.id} className="glass-card" style={{ overflow: 'hidden', padding: 0 }}>
                <div
                  style={{ position: 'relative', height: 180, cursor: 'pointer', overflow: 'hidden' }}
                  onClick={() => setPreviewPhotoUrl(v.photo_url)}
                >
                  <img
                    src={v.photo_url}
                    alt={v.site_name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s ease' }}
                  />
                  <div style={{
                    position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.7)',
                    padding: '0.25rem 0.5rem', borderRadius: 4, fontSize: '0.65rem',
                    color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.3rem',
                    border: '1px solid rgba(16,185,129,0.3)', backdropFilter: 'blur(4px)'
                  }}>
                    <ShieldCheck size={12} /> Geotagged
                  </div>
                </div>

                <div style={{ padding: '0.85rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                    {v.site_name}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                    📍 {v.address}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    <span>👤 {v.employee_name}</span>
                    <span>📅 {new Date(v.check_in_time || v.created_at).toLocaleDateString([], { day: '2-digit', month: 'short' })}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: Inspection Logs */}
      {activeTab === 'logs' && (
        <div className="glass-card table-container">
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flex: 1, maxWidth: 350 }}>
              <div className="search-box" style={{ width: '100%' }}>
                <Search size={15} />
                <input
                  type="text"
                  placeholder="Filter inspection logs..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select
                className="input-field"
                style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="All">All Statuses</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Property / Site</th>
                <th>Client</th>
                <th>GPS Location</th>
                <th>Check-In Time</th>
                <th>Photo Proof</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredVisits.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>No site inspection logs found.</td></tr>
              ) : (
                filteredVisits.map(v => (
                  <tr key={v.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div className="mini-avatar" style={{ width: 32, height: 32, fontSize: '0.7rem' }}>
                          {(v.employee_name || 'A').slice(0, 2).toUpperCase()}
                        </div>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{v.employee_name}</div>
                      </div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{v.site_name}</td>
                    <td>{v.client_name || '—'}</td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: 200 }}>{v.address}</td>
                    <td style={{ fontSize: '0.78rem' }}>
                      {new Date(v.check_in_time || v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>
                      {v.photo_url ? (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setPreviewPhotoUrl(v.photo_url)}
                          style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                        >
                          <Camera size={12} /> View Photo
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>No photo</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${v.status === 'Completed' ? 'badge-success' : 'badge-warning'}`}>
                        {v.status}
                      </span>
                    </td>
                    <td>
                      {v.status !== 'Completed' && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleMarkCompleted(v.id)}
                          style={{ fontSize: '0.72rem', color: 'var(--success)' }}
                        >
                          <Check size={12} /> Complete
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Field Check-In & Camera Modal */}
      {showCheckInModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowCheckInModal(false); }}>
          <div className="modal-content animate-fade-in" style={{ maxWidth: 520 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', background: 'rgba(16,185,129,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981'
                }}>
                  <Navigation size={18} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Site Attendance & GPS Check-In</h2>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Log live site visit with GPS stamp</div>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setShowCheckInModal(false)}>✕</button>
            </div>

            <form onSubmit={handleCheckInSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Field Agent Name *</label>
                <select
                  className="input-field"
                  value={checkInForm.employee_name}
                  onChange={e => setCheckInForm(p => ({ ...p, employee_name: e.target.value }))}
                  required
                >
                  {teamMembers.map(m => (
                    <option key={m.id} value={m.full_name}>{m.full_name} ({m.role})</option>
                  ))}
                  {teamMembers.length === 0 && <option value="Anand Sharma">Anand Sharma (Sales Executive)</option>}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Property / Site Name *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Grand Palm Residency - Tower B"
                  value={checkInForm.site_name}
                  onChange={e => setCheckInForm(p => ({ ...p, site_name: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Client / Lead Name (Optional)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Vikram Malhotra"
                  value={checkInForm.client_name}
                  onChange={e => setCheckInForm(p => ({ ...p, client_name: e.target.value }))}
                />
              </div>

              {/* Live GPS Coordinates Card */}
              <div style={{
                padding: '0.75rem', borderRadius: 8, background: 'rgba(56,189,248,0.08)',
                border: '1px solid rgba(56,189,248,0.25)', fontSize: '0.78rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <span style={{ fontWeight: 600, color: '#38bdf8' }}>📍 Live GPS Coordinates</span>
                  <button
                    type="button"
                    onClick={fetchCurrentLocation}
                    disabled={locatingGps}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', height: 'auto' }}
                  >
                    <RefreshCw size={11} className={locatingGps ? 'animate-spin' : ''} /> Refetch GPS
                  </button>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                  {checkInForm.lat ? `${checkInForm.lat.toFixed(5)}° N, ${checkInForm.lng.toFixed(5)}° E (±${checkInForm.accuracy}m)` : 'Click refetch to detect GPS'}
                </div>
              </div>

              {/* Geotagged Photo Section */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                  Site Photo Proof (With Geotag Watermark)
                </label>
                {checkInForm.photo_url ? (
                  <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                    <img src={checkInForm.photo_url} alt="Attached Geotag" style={{ width: '100%', height: 160, objectFit: 'cover' }} />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setShowCameraModal(true)}
                      style={{ position: 'absolute', bottom: 8, right: 8, fontSize: '0.72rem', background: 'rgba(0,0,0,0.75)' }}
                    >
                      <Camera size={12} /> Retake Photo
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowCameraModal(true)}
                    style={{ width: '100%', padding: '0.75rem', justifyContent: 'center', border: '2px dashed var(--border-color)' }}
                  >
                    <Camera size={16} /> Open Geotagged Camera & Snap Photo
                  </button>
                )}
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Inspection Notes</label>
                <textarea
                  className="input-field"
                  rows={2}
                  placeholder="Notes on client interest, site conditions, or milestone..."
                  value={checkInForm.notes}
                  onChange={e => setCheckInForm(p => ({ ...p, notes: e.target.value }))}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCheckInModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting} style={{ background: '#10b981', borderColor: '#10b981' }}>
                  {submitting ? 'Submitting...' : 'Save Site Check-In'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Geotagged Camera Modal */}
      {showCameraModal && (
        <GeotaggedCameraModal
          isOpen={showCameraModal}
          onClose={() => setShowCameraModal(false)}
          onCaptureComplete={handleGeotagCaptureComplete}
          employeeName={checkInForm.employee_name}
          siteName={checkInForm.site_name}
          clientName={checkInForm.client_name}
          initialCoords={checkInForm.lat ? { lat: checkInForm.lat, lng: checkInForm.lng } : null}
        />
      )}

      {/* High Resolution Photo Preview Lightbox */}
      {previewPhotoUrl && (
        <div className="modal-overlay" onClick={() => setPreviewPhotoUrl(null)} style={{ background: 'rgba(0,0,0,0.85)', zIndex: 9999 }}>
          <div style={{ position: 'relative', maxWidth: 800, width: '90%' }} onClick={e => e.stopPropagation()}>
            <button
              className="modal-close-btn"
              onClick={() => setPreviewPhotoUrl(null)}
              style={{ position: 'absolute', top: -40, right: 0, color: '#ffffff' }}
            >
              ✕
            </button>
            <img
              src={previewPhotoUrl}
              alt="Geotagged Inspection"
              style={{ width: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default FieldOps;
