import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin, Camera, Navigation, User, Users, Building, Calendar,
  Clock, CheckCircle, Plus, Search, Filter, Download, RefreshCw,
  ExternalLink, MessageCircle, AlertCircle, Eye, ShieldCheck, Check,
  Radio, Power, ToggleLeft, ToggleRight, ArrowRight, X, Image as ImageIcon
} from 'lucide-react';
import { getSiteVisits, createSiteVisit, updateSiteVisit, getLeads, getTeamMembers } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import FieldMap from '../components/FieldMap';
import GeotaggedCameraModal from '../components/GeotaggedCameraModal';
import './Pages.css';

const FieldOps = () => {
  const { user, canPerformAction } = useAuth();
  const canCheckIn = canPerformAction('field:checkin');
  const canViewAll = canPerformAction('field:view_all');
  const canApprove = canPerformAction('field:approve');

  // Determine if current user is an Admin/Manager supervisor vs Field Employee
  const isSupervisor = canViewAll || canApprove || user?.role === 'Super Admin' || user?.role === 'Manager';

  const [visits, setVisits] = useState([]);
  const [leads, setLeads] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('map'); // 'map' | 'gallery' | 'logs'

  // Selected visit for map focus / drawer
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState(null);

  // Employee Live Location State
  const [liveLocationActive, setLiveLocationActive] = useState(true);
  const [currentGps, setCurrentGps] = useState({
    lat: 28.5355,
    lng: 77.3910,
    accuracy: 6,
    address: 'Sector 62, Noida, Uttar Pradesh',
    lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  });
  const [locatingGps, setLocatingGps] = useState(false);

  // Check-in Modal & Camera
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);

  // Form State
  const [checkInForm, setCheckInForm] = useState({
    employee_name: user?.name || 'Field Agent',
    employee_id: user?.id || 'usr-1',
    site_name: '',
    client_name: '',
    lead_phone: '',
    purpose: 'Client Site Visit & Walkthrough',
    notes: '',
    lat: 28.5355,
    lng: 77.3910,
    address: 'Sector 62, Noida, Uttar Pradesh',
    accuracy: 6,
    photo_url: null,
  });

  const [submitting, setSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    loadAllData();
    if (navigator.geolocation) {
      fetchCurrentGps();
    }
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

  const fetchCurrentGps = () => {
    setLocatingGps(true);
    if (!navigator.geolocation) {
      setLocatingGps(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newCoords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 8),
          address: `GPS: ${pos.coords.latitude.toFixed(4)}° N, ${pos.coords.longitude.toFixed(4)}° E`,
          lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        };
        setCurrentGps(newCoords);
        setCheckInForm(p => ({
          ...p,
          lat: newCoords.lat,
          lng: newCoords.lng,
          accuracy: newCoords.accuracy,
          address: newCoords.address,
        }));
        setLocatingGps(false);
      },
      (err) => {
        console.warn('GPS error:', err.message);
        setLocatingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleToggleLiveLocation = () => {
    const nextState = !liveLocationActive;
    setLiveLocationActive(nextState);
    if (nextState) {
      fetchCurrentGps();
      setFeedbackMsg({ type: 'success', text: 'Live location broadcasting enabled. Admin can now track your on-field presence.' });
    } else {
      setFeedbackMsg({ type: 'info', text: 'Live location broadcasting paused.' });
    }
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const handleOpenCheckIn = () => {
    fetchCurrentGps();
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
    if (!checkInForm.site_name) {
      setFeedbackMsg({ type: 'error', text: 'Please enter the site / property name.' });
      return;
    }

    setSubmitting(true);
    const submissionData = {
      ...checkInForm,
      employee_name: user?.name || 'Field Agent',
      employee_id: user?.id || 'usr-1',
    };

    const { data } = await createSiteVisit(submissionData);
    if (data) {
      setVisits(prev => [data, ...prev]);
      setShowCheckInModal(false);
      setCheckInForm({
        employee_name: user?.name || '',
        employee_id: user?.id || '',
        site_name: '',
        client_name: '',
        lead_phone: '',
        purpose: 'Client Site Visit & Walkthrough',
        notes: '',
        lat: currentGps.lat,
        lng: currentGps.lng,
        address: currentGps.address,
        accuracy: currentGps.accuracy,
        photo_url: null,
      });
      setFeedbackMsg({ type: 'success', text: 'Site inspection check-in submitted successfully with live GPS & photo proof!' });
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
    setSubmitting(false);
  };

  const handleMarkCompleted = async (visitId) => {
    if (!canApprove) return;
    const { data } = await updateSiteVisit(visitId, { status: 'Completed' });
    if (data) {
      setVisits(prev => prev.map(v => v.id === visitId ? { ...v, status: 'Completed' } : v));
      if (selectedVisit?.id === visitId) {
        setSelectedVisit(p => ({ ...p, status: 'Completed' }));
      }
      setFeedbackMsg({ type: 'success', text: 'Site inspection verified and marked as Completed!' });
      setTimeout(() => setFeedbackMsg(null), 3000);
    }
  };

  // Filtered visits for supervisor or own visits for field agent
  const userVisits = visits.filter(v => {
    if (!isSupervisor) {
      return (v.employee_name || '').toLowerCase() === (user?.name || '').toLowerCase();
    }
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

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* VIEW A: FIELD EMPLOYEE PORTAL (Live GPS Toggle + Live Camera Check-in) */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {!isSupervisor ? (
        <div>
          {/* Header */}
          <div className="page-header">
            <div className="page-title-group">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h1 className="page-title">My Field Attendance & Live GPS Tracking</h1>
                <span className={`badge ${liveLocationActive ? 'badge-success' : 'badge-neutral'}`} style={{ fontSize: '0.7rem' }}>
                  {liveLocationActive ? '● GPS BROADCASTING ACTIVE' : '○ GPS SHARING PAUSED'}
                </span>
              </div>
              <p className="page-subtitle">
                Welcome, <strong>{user?.name || 'Field Agent'}</strong>. Manage your live site location broadcast and capture live camera inspection proofs.
              </p>
            </div>
            <div className="page-actions">
              <button className="btn btn-primary" onClick={handleOpenCheckIn} style={{ background: '#10b981', borderColor: '#10b981' }}>
                <Camera size={15} /> Site Check-In & Camera Proof
              </button>
            </div>
          </div>

          {/* Grid Layout: Location Card + Quick Camera Card */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
            
            {/* Card 1: Live Location Broadcasting Switch */}
            <div className="glass-card" style={{ padding: '1.25rem', borderLeft: `4px solid ${liveLocationActive ? '#10b981' : 'var(--border-color)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: liveLocationActive ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: liveLocationActive ? '#10b981' : 'var(--text-muted)'
                  }}>
                    <Navigation size={18} className={liveLocationActive ? 'animate-pulse' : ''} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>Live Location Sharing</h3>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {liveLocationActive ? 'Broadcasting live to Admin Supervisor map' : 'Location sharing currently paused'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleToggleLiveLocation}
                  className="btn"
                  style={{
                    padding: '0.4rem 0.85rem', fontSize: '0.78rem', fontWeight: 700,
                    background: liveLocationActive ? 'rgba(16,185,129,0.2)' : 'var(--bg-tertiary)',
                    color: liveLocationActive ? '#10b981' : 'var(--text-muted)',
                    border: `1px solid ${liveLocationActive ? '#10b981' : 'var(--border-color)'}`
                  }}
                >
                  <Power size={14} /> {liveLocationActive ? 'Turn GPS OFF' : 'Turn GPS ON'}
                </button>
              </div>

              {liveLocationActive ? (
                <div style={{ padding: '0.75rem', borderRadius: 8, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#10b981' }}>
                      📍 Live GPS Coordinates
                    </span>
                    <button
                      onClick={fetchCurrentGps}
                      disabled={locatingGps}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', height: 'auto' }}
                    >
                      <RefreshCw size={11} className={locatingGps ? 'animate-spin' : ''} /> Refresh GPS
                    </button>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.2rem' }}>
                    {currentGps.lat.toFixed(5)}° N, {currentGps.lng.toFixed(5)}° E (±{currentGps.accuracy}m Accuracy)
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {currentGps.address} • Last Sync: {currentGps.lastUpdated}
                  </div>
                </div>
              ) : (
                <div style={{ padding: '0.75rem', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  GPS sharing is stopped. Turn ON when you reach your client site or assigned property inspection.
                </div>
              )}
            </div>

            {/* Card 2: Live Camera Security Notice */}
            <div className="glass-card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ShieldCheck size={16} />
                </div>
                <div>
                  <h3 style={{ fontSize: '0.92rem', fontWeight: 700, margin: 0 }}>Mobile Camera Proof Only</h3>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Tamper-proof anti-fraud site verification</span>
                </div>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4, margin: '0 0 0.75rem 0' }}>
                Gallery image uploads are blocked to ensure genuine site presence. All photos must be taken directly via live camera with unalterable GPS and timestamp watermark.
              </p>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowCameraModal(true)}
                style={{ width: '100%', justifyContent: 'center', gap: '0.4rem', borderStyle: 'dashed' }}
              >
                <Camera size={14} /> Open Live Camera & Test Geotag Watermark
              </button>
            </div>
          </div>

          {/* My Site Inspection Visits History */}
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>My Submitted Site Inspection Logs ({userVisits.length})</h3>
              <button className="btn btn-secondary btn-sm" onClick={loadAllData}><RefreshCw size={13} /></button>
            </div>

            {userVisits.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                <Building size={36} style={{ marginBottom: '0.5rem', opacity: 0.3 }} />
                <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>No site check-ins logged yet</div>
                <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>Click "Site Check-In & Camera Proof" above to log your first property visit today.</div>
              </div>
            ) : (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Property / Site</th>
                      <th>Client</th>
                      <th>GPS Coordinates</th>
                      <th>Time</th>
                      <th>Photo Proof</th>
                      <th>Supervisor Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userVisits.map(v => (
                      <tr key={v.id}>
                        <td style={{ fontWeight: 600 }}>{v.site_name}</td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{v.client_name || '—'}</td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{v.address}</td>
                        <td style={{ fontSize: '0.78rem' }}>
                          {new Date(v.check_in_time || v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td>
                          {v.photo_url ? (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => setPreviewPhotoUrl(v.photo_url)}
                              style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
                            >
                              <Camera size={12} /> View Watermark
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>No photo</span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${v.status === 'Completed' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.68rem' }}>
                            {v.status === 'Completed' ? 'Verified & Approved ✅' : 'Under Supervisor Review ⏳'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (

        /* ═══════════════════════════════════════════════════════════════════ */
        /* VIEW B: SUPERVISOR & SUPER ADMIN CENTER (Map + Gallery + Approvals) */
        /* ═══════════════════════════════════════════════════════════════════ */
        <div>
          {/* Header */}
          <div className="page-header">
            <div className="page-title-group">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h1 className="page-title">Field Operations & Live GPS Tracking</h1>
                <span style={{
                  background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)',
                  padding: '0.2rem 0.6rem', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700
                }}>
                  Supervisor Live Center
                </span>
              </div>
              <p className="page-subtitle">
                Real-time employee GPS tracking, live inspection verification, and geotagged site photo review.
              </p>
            </div>
            <div className="page-actions">
              <button className="btn btn-secondary" onClick={loadAllData}>
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh Map
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

          {/* Sub Navigation Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '1.25rem' }}>
            {[
              { id: 'map', label: 'Live Field Map & Tracking', icon: <MapPin size={15} /> },
              { id: 'gallery', label: `Geotagged Photo Gallery (${photosSnappedCount})`, icon: <Camera size={15} /> },
              { id: 'logs', label: `Inspection Logs & Approval (${visits.length})`, icon: <CheckCircle size={15} /> },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="btn"
                style={{
                  borderRadius: 0, background: 'transparent',
                  borderBottom: activeTab === tab.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  color: activeTab === tab.id ? 'var(--accent-primary)' : 'var(--text-muted)',
                  padding: '0.75rem 1.25rem', fontWeight: activeTab === tab.id ? 600 : 400,
                  transition: 'all 0.2s ease', marginBottom: -1, display: 'flex', alignItems: 'center', gap: '0.4rem'
                }}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* TAB 1: Live Field Map */}
          {activeTab === 'map' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.25rem', alignItems: 'start' }}>
              <div className="glass-card" style={{ padding: '1rem', minHeight: 480 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Navigation size={15} color="var(--accent-primary)" />
                    Live Real-Time Agent Location Pins
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Powered by OpenStreetMap & Leaflet</span>
                </div>
                <FieldMap visits={visits} selectedVisit={selectedVisit} />
              </div>

              {/* Sidebar: Agents Activity */}
              <div className="glass-card" style={{ padding: '1rem', maxHeight: 540, overflowY: 'auto' }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.25rem' }}>
                  Field Agents Activity
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
                  Click any agent to locate on map
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {visits.map(v => {
                    const isSelected = selectedVisit?.id === v.id;
                    const isCompleted = v.status === 'Completed';

                    return (
                      <div
                        key={v.id}
                        onClick={() => setSelectedVisit(v)}
                        style={{
                          padding: '0.75rem', borderRadius: 8,
                          background: isSelected ? 'rgba(99,102,241,0.12)' : 'var(--bg-secondary)',
                          border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                          cursor: 'pointer', transition: 'all 0.2s ease',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                            👤 {v.employee_name}
                          </div>
                          <span className={`badge ${isCompleted ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.62rem' }}>
                            {v.status}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 500, marginBottom: '0.2rem' }}>
                          🏢 {v.site_name}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.35rem', lineHeight: 1.3 }}>
                          📍 {v.address}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                          <span>⏱️ {new Date(v.check_in_time || v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {v.photo_url && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={(e) => { e.stopPropagation(); setPreviewPhotoUrl(v.photo_url); }}
                              style={{ fontSize: '0.62rem', padding: '0.1rem 0.4rem', height: 'auto' }}
                            >
                              <Camera size={11} /> Photo Proof
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
                <div style={{ display: 'flex', gap: '0.5rem', flex: 1, maxWidth: 360 }}>
                  <div className="input-group" style={{ width: '100%' }}>
                    <Search size={14} className="input-icon" />
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Search property, agent, or client..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {visits.filter(v => Boolean(v.photo_url)).length === 0 ? (
                <div className="glass-card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  <Camera size={36} style={{ marginBottom: '0.5rem', opacity: 0.3 }} />
                  <div style={{ fontWeight: 600 }}>No site inspection photos captured yet</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                  {visits.filter(v => Boolean(v.photo_url)).map(v => (
                    <div key={v.id} className="glass-card" style={{ padding: '0.75rem', overflow: 'hidden' }}>
                      <div
                        style={{ position: 'relative', height: 180, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', marginBottom: '0.65rem' }}
                        onClick={() => setPreviewPhotoUrl(v.photo_url)}
                      >
                        <img src={v.photo_url} alt={v.site_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.7)', color: 'white', padding: '0.2rem 0.5rem', borderRadius: 4, fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Eye size={11} /> Zoom Proof
                        </div>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.2rem' }}>{v.site_name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', marginBottom: '0.2rem' }}>👤 {v.employee_name}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>📍 {v.address}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Inspection Logs & Verification */}
          {activeTab === 'logs' && (
            <div className="glass-card table-container">
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
                    <th>Supervisor Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visits.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>No site inspection logs found.</td></tr>
                  ) : (
                    visits.map(v => (
                      <tr key={v.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <div className="mini-avatar" style={{ width: 28, height: 28, fontSize: '0.68rem' }}>
                              {(v.employee_name || 'A').slice(0, 2).toUpperCase()}
                            </div>
                            <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{v.employee_name}</span>
                          </div>
                        </td>
                        <td style={{ fontWeight: 600 }}>{v.site_name}</td>
                        <td style={{ fontSize: '0.8rem' }}>{v.client_name || '—'}</td>
                        <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)', maxWidth: 180 }}>{v.address}</td>
                        <td style={{ fontSize: '0.75rem' }}>
                          {new Date(v.check_in_time || v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td>
                          {v.photo_url ? (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => setPreviewPhotoUrl(v.photo_url)}
                              style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
                            >
                              <Camera size={12} /> View Photo
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>No photo</span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${v.status === 'Completed' ? 'badge-success' : 'badge-warning'}`}>
                            {v.status}
                          </span>
                        </td>
                        <td>
                          {v.status !== 'Completed' && canApprove && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleMarkCompleted(v.id)}
                              style={{ fontSize: '0.72rem', color: 'var(--success)' }}
                            >
                              <Check size={12} /> Approve & Complete
                            </button>
                          )}
                          {v.status === 'Completed' && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--success)', fontWeight: 600 }}>✓ Verified</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* FIELD CHECK-IN MODAL (Employee Site Visit Submission) */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
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
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Logged by: {user?.name || 'Field Agent'}</div>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setShowCheckInModal(false)}>✕</button>
            </div>

            <form onSubmit={handleCheckInSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Site / Property Name *</label>
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
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Client / Buyer Name (Optional)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Vikram Malhotra"
                  value={checkInForm.client_name}
                  onChange={e => setCheckInForm(p => ({ ...p, client_name: e.target.value }))}
                />
              </div>

              {/* Live GPS Coordinates Banner */}
              <div style={{ padding: '0.75rem', borderRadius: 8, background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.25)', fontSize: '0.78rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <span style={{ fontWeight: 600, color: '#38bdf8' }}>📍 Live GPS Coordinates</span>
                  <button
                    type="button"
                    onClick={fetchCurrentGps}
                    disabled={locatingGps}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', height: 'auto' }}
                  >
                    <RefreshCw size={11} className={locatingGps ? 'animate-spin' : ''} /> Refetch GPS
                  </button>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                  {checkInForm.lat ? `${checkInForm.lat.toFixed(5)}° N, ${checkInForm.lng.toFixed(5)}° E (±${checkInForm.accuracy}m accuracy)` : 'Click refetch to detect GPS'}
                </div>
              </div>

              {/* Geotagged Live Photo Proof */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                  Live Camera Photo Proof (With Geotag Watermark)
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
                    <Camera size={16} /> Open Live Camera & Snap Watermarked Photo
                  </button>
                )}
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Inspection Notes</label>
                <textarea
                  className="input-field textarea-field"
                  rows={2}
                  placeholder="Notes on client interest, site condition, or inspection milestone..."
                  value={checkInForm.notes}
                  onChange={e => setCheckInForm(p => ({ ...p, notes: e.target.value }))}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCheckInModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting} style={{ background: '#10b981', borderColor: '#10b981' }}>
                  {submitting ? 'Submitting...' : 'Submit Site Check-In'}
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
          employeeName={user?.name || 'Field Agent'}
          siteName={checkInForm.site_name || 'Assigned Site'}
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

      {/* Fixed Floating Toast (Zero Layout Shift) */}
      {feedbackMsg && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 99999,
          background: 'rgba(15, 23, 42, 0.96)',
          border: `1px solid ${feedbackMsg.type === 'success' ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)'}`,
          boxShadow: '0 15px 35px rgba(0,0,0,0.55), 0 0 20px rgba(16,185,129,0.15)',
          backdropFilter: 'blur(12px)', padding: '0.75rem 1.25rem', borderRadius: 10,
          color: feedbackMsg.type === 'success' ? 'var(--success)' : 'var(--danger)',
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          fontSize: '0.85rem', fontWeight: 600, animation: 'slideUp 0.25s ease'
        }}>
          {feedbackMsg.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          <span>{feedbackMsg.text}</span>
          <button
            onClick={() => setFeedbackMsg(null)}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 0 0 0.4rem', display: 'flex' }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

export default FieldOps;
