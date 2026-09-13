import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin, Camera, Navigation, User, Users, Building, Calendar,
  Clock, CheckCircle, Plus, Search, Filter, Download, RefreshCw,
  ExternalLink, MessageCircle, AlertCircle, Eye, ShieldCheck, Check,
  Radio, Power, ToggleLeft, ToggleRight, ArrowRight, X, Image as ImageIcon,
  Activity, Signal, Share2, Copy
} from 'lucide-react';
import { getSiteVisits, createSiteVisit, updateSiteVisit, getLeads, getTeamMembers, updateEmployeeLivePing, getEmployeeLivePings, getAllEmployeeLiveLocations, reverseGeocode } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';
import FieldMap from '../components/FieldMap';
import GeotaggedCameraModal from '../components/GeotaggedCameraModal';
import './Pages.css';

const FieldOps = () => {
  const { user, canPerformAction } = useAuth();
  const { activeCompany } = useCompany();
  const canCheckIn = canPerformAction('field:checkin');
  const canViewAll = canPerformAction('field:view_all');
  const canApprove = canPerformAction('field:approve');

  // Determine if current user is an Admin/Manager supervisor vs Field Employee
  const isSupervisor = canViewAll || canApprove || user?.role === 'Super Admin' || user?.role === 'Manager';

  const [visits, setVisits] = useState([]);
  const [liveAgents, setLiveAgents] = useState([]);
  const [allAgents, setAllAgents] = useState([]);
  const [leads, setLeads] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('map'); // 'map' | 'gallery' | 'logs'

  // Selected visit / agent for map focus
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState(null);
  const [previewVisit, setPreviewVisit] = useState(null);
  const [fitAllTrigger, setFitAllTrigger] = useState(0);

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

  const handleSelectAgent = (agent) => {
    setSelectedVisit(null);
    setSelectedAgent({ ...agent, _clickTime: Date.now() });
  };

  const handleSelectVisit = (visit) => {
    setSelectedAgent(null);
    setSelectedVisit({ ...visit, _clickTime: Date.now() });
  };

  useEffect(() => {
    loadAllData();

    // If supervisor, set up periodic polling for real-time live map updates
    let pollInterval = null;
    if (isSupervisor) {
      pollInterval = setInterval(async () => {
        const [liveRes, allRes, visitsRes] = await Promise.all([
          getEmployeeLivePings(),
          getAllEmployeeLiveLocations(),
          getSiteVisits()
        ]);
        if (liveRes.data) setLiveAgents(liveRes.data);
        if (allRes.data) setAllAgents(allRes.data);
        if (visitsRes.data) setVisits(visitsRes.data);
      }, 10000);
    }

    // If field employee, acquire real-time GPS and send live ping
    let pingTimer = null;
    if (!isSupervisor && navigator.geolocation) {
      fetchCurrentGps();
      pingTimer = setInterval(() => {
        if (liveLocationActive) fetchCurrentGps();
      }, 15000);
    }

    // Broadcast offline status if employee leaves or closes browser
    const handleUnload = () => {
      if (!isSupervisor && user && liveLocationActive) {
        updateEmployeeLivePing({
          employee_id: String(user.id || user.email || 'usr-3'),
          employee_name: user.name || 'Field Agent',
          is_live: false,
        });
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      if (pingTimer) clearInterval(pingTimer);
      if (pollInterval) clearInterval(pollInterval);
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, [isSupervisor, liveLocationActive]);

  const loadAllData = async () => {
    setLoading(true);
    const [visitsRes, liveRes, allRes, leadsRes, usersRes] = await Promise.all([
      getSiteVisits(),
      getEmployeeLivePings(),
      getAllEmployeeLiveLocations(),
      getLeads(),
      getTeamMembers(),
    ]);

    setVisits(visitsRes.data || []);
    setLiveAgents(liveRes.data || []);
    setAllAgents(allRes.data || []);
    setLeads(leadsRes.data || []);
    setTeamMembers(usersRes.data || []);
    setLoading(false);
  };

  // Acquire real device GPS and broadcast live ping to Supabase
  const fetchCurrentGps = () => {
    setLocatingGps(true);
    if (!navigator.geolocation) {
      setLocatingGps(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy || 6);

        // Reverse geocode to exact real street address
        const realAddress = await reverseGeocode(lat, lng);

        const newCoords = {
          lat,
          lng,
          accuracy,
          address: realAddress,
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

        // Broadcast live GPS ping to Supabase
        if (user && liveLocationActive) {
          await updateEmployeeLivePing({
            employee_id: String(user.id || user.email || 'usr-3'),
            employee_name: user.name || 'Field Agent',
            role: user.role || 'Sales Executive',
            lat,
            lng,
            accuracy,
            address: realAddress,
            is_live: true
          });
        }
      },
      async (err) => {
        console.warn('GPS position acquire notice / GPS disabled:', err.message);
        setLocatingGps(false);
        // If device GPS is disabled or permission revoked, automatically update state & server to offline
        if (liveLocationActive) {
          setLiveLocationActive(false);
          setFeedbackMsg({
            type: 'warning',
            text: 'Device location / GPS was turned off or unavailable. Live broadcasting paused on Admin dashboard.'
          });
          if (user) {
            await updateEmployeeLivePing({
              employee_id: String(user.id || user.email || 'usr-3'),
              employee_name: user.name || 'Field Agent',
              is_live: false,
              lat: currentGps.lat,
              lng: currentGps.lng,
              address: currentGps.address
            });
          }
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleToggleLiveLocation = async () => {
    const nextState = !liveLocationActive;
    setLiveLocationActive(nextState);

    if (nextState) {
      fetchCurrentGps();
      setFeedbackMsg({ type: 'success', text: 'Live location broadcasting enabled. Exact GPS coordinates are now streaming to Super Admin.' });
    } else {
      if (user) {
        await updateEmployeeLivePing({
          employee_id: String(user.id || user.email || 'usr-3'),
          employee_name: user.name || 'Field Agent',
          is_live: false,
          lat: currentGps.lat,
          lng: currentGps.lng,
          address: currentGps.address
        });
      }
      setFeedbackMsg({ type: 'info', text: 'Live location broadcasting paused. Status marked as offline on Admin map.' });
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
    setShowCheckInModal(true);
  };

  const handleShareVisitWhatsApp = (v) => {
    if (!v) return;
    const latStr = Number(v.lat || 0).toFixed(5);
    const lngStr = Number(v.lng || 0).toFixed(5);
    const timeStr = new Date(v.check_in_time || v.created_at || Date.now()).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });

    let msg = `*🛡️ REAL ESTATE SITE INSPECTION PROOF*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🏢 *Property / Site:* ${v.site_name || 'Site Inspection'}\n`;
    if (v.client_name) msg += `👤 *Client:* ${v.client_name}\n`;
    msg += `👷 *Field Agent:* ${v.employee_name || 'Staff'}\n`;
    msg += `📅 *Timestamp:* ${timeStr}\n`;
    msg += `📍 *Location:* ${v.address || 'Site Location'}\n`;
    msg += `🎯 *GPS Coordinates:* ${latStr}° N, ${lngStr}° E (±${v.accuracy || 10}m)\n`;
    msg += `📊 *Verification:* ${v.status || 'Verified'}\n`;
    if (v.photo_url) {
      msg += `\n📸 *View Tamper-Proof Geotag Photo:*\n${v.photo_url}\n`;
    }
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `*${activeCompany?.company_name || 'SOBHAINFRA ERP'}* — Verified Site Inspection`;

    const targetPhone = v.lead_phone ? String(v.lead_phone).replace(/\D/g, '') : '';
    const waUrl = targetPhone ? `https://wa.me/${targetPhone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadVisitPhoto = (v) => {
    if (!v?.photo_url) return;
    const link = document.createElement('a');
    link.href = v.photo_url;
    link.target = '_blank';
    link.download = `Inspection_${(v.site_name || 'Site').replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyVisitLink = async (v) => {
    if (!v?.photo_url) return;
    try {
      await navigator.clipboard.writeText(v.photo_url);
      setFeedbackMsg({ type: 'success', text: 'Public photo proof link copied to clipboard!' });
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch {
      prompt('Copy photo link:', v.photo_url);
    }
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
      employee_id: String(user?.id || user?.email || 'usr-1'),
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
      setFeedbackMsg({ type: 'success', text: 'Site inspection check-in submitted successfully with real-time GPS & live photo proof!' });
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

  const activeOnFieldCount = liveAgents.length || visits.filter(v => v.status === 'In Progress').length;
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
                      {liveLocationActive ? 'Broadcasting live GPS to Admin Supervisor Map' : 'Location sharing currently paused'}
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
                      📍 Exact Real-Time GPS Coordinates
                    </span>
                    <button
                      onClick={fetchCurrentGps}
                      disabled={locatingGps}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', height: 'auto' }}
                    >
                      <RefreshCw size={11} className={locatingGps ? 'animate-spin' : ''} /> Refetch GPS Fix
                    </button>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 700, marginBottom: '0.2rem' }}>
                    {currentGps.lat.toFixed(6)}° N, {currentGps.lng.toFixed(6)}° E (±{currentGps.accuracy}m Accuracy)
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    🏠 {currentGps.address} • Last Sync: {currentGps.lastUpdated}
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
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh Live Data
              </button>
            </div>
          </div>

          {/* KPI Stats */}
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '1.5rem' }}>
            <div className="glass-card stat-card">
              <div className="stat-header">
                <div>
                  <div className="stat-label">Active Agents Broadcasting GPS</div>
                  <div className="stat-value">{liveAgents.length}</div>
                </div>
                <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
                  <Navigation size={22} className="animate-pulse" />
                </div>
              </div>
            </div>

            <div className="glass-card stat-card">
              <div className="stat-header">
                <div>
                  <div className="stat-label">Total Visits Logged</div>
                  <div className="stat-value">{visits.length}</div>
                </div>
                <div className="stat-icon" style={{ background: 'rgba(99,102,241,0.15)', color: '#6366f1' }}>
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
              { id: 'map', label: `Live Field Map (${liveAgents.length} Active)`, icon: <MapPin size={15} /> },
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1.25rem', alignItems: 'start' }}>
              <div className="glass-card" style={{ padding: '1rem', minHeight: 520 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Navigation size={15} color="#10b981" className="animate-pulse" />
                    Live Employee GPS Pins & Site Inspections
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setFitAllTrigger(t => t + 1)}
                      style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600 }}
                      title="Fit map view to show all active employees and site inspections"
                    >
                      <span>🎯 Fit All</span>
                    </button>
                    <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 600 }}>● Auto-refreshing every 10s</span>
                  </div>
                </div>
                <FieldMap
                  visits={visits}
                  liveAgents={liveAgents}
                  selectedVisit={selectedVisit}
                  selectedAgent={selectedAgent}
                  onSelectVisit={handleSelectVisit}
                  onSelectAgent={handleSelectAgent}
                  onViewPhoto={(url, v) => {
                    setPreviewPhotoUrl(url);
                    setPreviewVisit(v || visits.find(item => item.photo_url === url) || null);
                  }}
                  fitAllTrigger={fitAllTrigger}
                />
              </div>

              {/* Sidebar: Active Agents Roster & Visits */}
              <div className="glass-card" style={{ padding: '1rem', maxHeight: 560, overflowY: 'auto' }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.2rem' }}>
                  Active Field Agents ({liveAgents.length})
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
                  Click to zoom closely on exact live coordinates
                </div>

                {liveAgents.length === 0 ? (
                  <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: 8, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '1rem' }}>
                    No agents broadcasting GPS right now. Tell staff to turn on "Live Location" in their field portal.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                    {liveAgents.map(a => {
                      const isSelected = selectedAgent?.employee_id === a.employee_id;
                      return (
                        <div
                          key={a.employee_id}
                          onClick={() => handleSelectAgent(a)}
                          style={{
                            padding: '0.65rem 0.85rem', borderRadius: 8,
                            background: isSelected ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.05)',
                            border: `1px solid ${isSelected ? '#10b981' : 'rgba(16,185,129,0.25)'}`,
                            cursor: 'pointer', transition: 'all 0.2s ease'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#10b981' }}>
                              🟢 {a.employee_name}
                            </span>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                              {a.last_ping ? new Date(a.last_ping).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-primary)', marginBottom: '0.15rem' }}>
                            📍 {a.address || `${a.lat.toFixed(5)}°, ${a.lng.toFixed(5)}°`}
                          </div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            🎯 GPS Accuracy: ±{a.accuracy || 6}m · {a.role}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Offline / GPS Inactive Agents */}
                {(() => {
                  const inactiveAgents = allAgents.filter(a => !liveAgents.some(la => la.employee_id === a.employee_id));
                  if (inactiveAgents.length === 0) return null;
                  return (
                    <div style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                        ⚪ GPS Inactive / Offline Staff ({inactiveAgents.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {inactiveAgents.map(a => {
                          const isSelected = selectedAgent?.employee_id === a.employee_id;
                          return (
                            <div
                              key={a.employee_id}
                              onClick={() => handleSelectAgent(a)}
                              style={{
                                padding: '0.55rem 0.75rem', borderRadius: 8,
                                background: isSelected ? 'rgba(148,163,184,0.15)' : 'var(--bg-secondary)',
                                border: `1px solid ${isSelected ? 'var(--text-muted)' : 'var(--border-color)'}`,
                                cursor: 'pointer', transition: 'all 0.2s ease', opacity: 0.8
                              }}
                              title="Click to view last known coordinates"
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.15rem' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                  ⚪ {a.employee_name}
                                </span>
                                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 4 }}>
                                  GPS Off
                                </span>
                              </div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                📍 {a.address || `${Number(a.lat || 0).toFixed(4)}°, ${Number(a.lng || 0).toFixed(4)}°`}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Submitted Inspections List */}
                <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.4rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                  Latest Inspection Logs ({visits.length})
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {visits.map(v => {
                    const isSelected = selectedVisit?.id === v.id;
                    const isCompleted = v.status === 'Completed';

                    return (
                      <div
                        key={v.id}
                        onClick={() => handleSelectVisit(v)}
                        style={{
                          padding: '0.65rem 0.85rem', borderRadius: 8,
                          background: isSelected ? 'rgba(99,102,241,0.12)' : 'var(--bg-secondary)',
                          border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                          cursor: 'pointer', transition: 'all 0.2s ease',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.2rem' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>
                            🏢 {v.site_name}
                          </div>
                          <span className={`badge ${isCompleted ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.6rem' }}>
                            {v.status}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                          👤 {v.employee_name} · 📍 {v.address}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                          <span>⏱️ {new Date(v.check_in_time || v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {v.photo_url && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={(e) => { e.stopPropagation(); setPreviewPhotoUrl(v.photo_url); setPreviewVisit(v); }}
                              style={{ fontSize: '0.62rem', padding: '0.1rem 0.4rem', height: 'auto', color: '#10b981' }}
                            >
                              <Camera size={11} /> Real Photo
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
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Showing <strong style={{ color: 'var(--text-primary)' }}>{visits.filter(v => Boolean(v.photo_url)).length}</strong> Geotagged Site Inspection Proofs
                </div>
              </div>

              {(() => {
                const photoVisits = visits.filter(v => Boolean(v.photo_url)).filter(v => {
                  if (!searchQuery) return true;
                  const q = searchQuery.toLowerCase();
                  return (v.site_name || '').toLowerCase().includes(q) ||
                         (v.employee_name || '').toLowerCase().includes(q) ||
                         (v.client_name || '').toLowerCase().includes(q) ||
                         (v.address || '').toLowerCase().includes(q);
                });

                if (photoVisits.length === 0) {
                  return (
                    <div className="glass-card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: 'var(--text-muted)' }}>
                      <Camera size={42} style={{ marginBottom: '0.75rem', opacity: 0.35 }} />
                      <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>No site inspection photos found</div>
                      <div style={{ fontSize: '0.8rem', marginTop: '0.35rem', maxWidth: 420, margin: '0.35rem auto 0' }}>
                        Field inspection photos snapped by mobile agents automatically watermark GPS coordinates and appear here in real-time.
                      </div>
                    </div>
                  );
                }

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '1.25rem' }}>
                    {photoVisits.map(v => (
                      <div key={v.id} className="glass-card" style={{ padding: '0.85rem', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        {/* Image Preview Container */}
                        <div
                          style={{ position: 'relative', height: 195, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', marginBottom: '0.75rem', background: '#020617' }}
                          onClick={() => { setPreviewPhotoUrl(v.photo_url); setPreviewVisit(v); }}
                        >
                          <img
                            src={v.photo_url}
                            alt={v.site_name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s ease' }}
                            onMouseOver={e => e.currentTarget.style.transform = 'scale(1.03)'}
                            onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                          />
                          <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.8)', color: '#10b981', padding: '0.2rem 0.5rem', borderRadius: 4, fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '0.3rem', border: '1px solid rgba(16,185,129,0.3)', backdropFilter: 'blur(4px)' }}>
                            <ShieldCheck size={12} /> Geotag Verified
                          </div>
                          <div style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,0.7)', color: '#ffffff', padding: '0.15rem 0.45rem', borderRadius: 4, fontSize: '0.62rem' }}>
                            {new Date(v.check_in_time || v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>

                        {/* Card Info */}
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.3rem' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                              🏢 {v.site_name}
                            </div>
                            <span className={`badge ${v.status === 'Completed' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.62rem' }}>
                              {v.status || 'In Progress'}
                            </span>
                          </div>

                          <div style={{ fontSize: '0.76rem', color: '#6366f1', fontWeight: 600, marginBottom: '0.25rem' }}>
                            👤 Agent: {v.employee_name} {v.client_name ? `· Client: ${v.client_name}` : ''}
                          </div>

                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.85rem', lineHeight: 1.35 }}>
                            📍 {v.address}
                          </div>
                        </div>

                        {/* Action Toolbar */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '0.4rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.65rem' }}>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => handleShareVisitWhatsApp(v)}
                            style={{ background: '#25D366', color: '#ffffff', borderColor: '#25D366', fontSize: '0.72rem', padding: '0.3rem 0.5rem', justifyContent: 'center', gap: '0.3rem', fontWeight: 600 }}
                            title="Share on WhatsApp with prefilled inspection details"
                          >
                            <MessageCircle size={13} /> WhatsApp
                          </button>

                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleDownloadVisitPhoto(v)}
                            style={{ fontSize: '0.72rem', padding: '0.3rem 0.5rem', justifyContent: 'center', gap: '0.3rem' }}
                            title="Download watermarked JPG"
                          >
                            <Download size={13} /> Download
                          </button>

                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleCopyVisitLink(v)}
                            style={{ fontSize: '0.72rem', padding: '0.3rem 0.5rem', justifyContent: 'center', gap: '0.3rem' }}
                            title="Copy public photo link"
                          >
                            <Share2 size={13} /> Copy
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                              <img
                                src={v.photo_url}
                                alt="Proof"
                                style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--border-color)', cursor: 'pointer' }}
                                onClick={() => { setPreviewPhotoUrl(v.photo_url); setPreviewVisit(v); }}
                                title="Click to inspect photo"
                              />
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => { setPreviewPhotoUrl(v.photo_url); setPreviewVisit(v); }}
                                style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                              >
                                <Camera size={12} /> View & Share
                              </button>
                            </div>
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
                  <span style={{ fontWeight: 600, color: '#38bdf8' }}>📍 Exact Real-Time GPS Coordinates</span>
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
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.75rem', marginBottom: '0.2rem' }}>
                  {checkInForm.lat ? `${checkInForm.lat.toFixed(6)}° N, ${checkInForm.lng.toFixed(6)}° E (±${checkInForm.accuracy}m accuracy)` : 'Click refetch to detect GPS'}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                  🏠 {checkInForm.address}
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
          companyName={activeCompany?.company_name || 'Sobhainfra Tech Private Limited'}
          initialCoords={checkInForm.lat ? { lat: checkInForm.lat, lng: checkInForm.lng } : null}
        />
      )}

      {/* High Resolution Inspection Photo Proof & Sharing Lightbox */}
      {(previewPhotoUrl || previewVisit) && (
        <div
          className="modal-overlay"
          onClick={() => { setPreviewPhotoUrl(null); setPreviewVisit(null); }}
          style={{ background: 'rgba(0,0,0,0.88)', zIndex: 9999, backdropFilter: 'blur(6px)' }}
        >
          <div
            className="animate-fade-in"
            style={{
              position: 'relative', maxWidth: 760, width: '92%',
              background: '#0f172a', borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.15)', overflow: 'hidden',
              boxShadow: '0 25px 50px rgba(0,0,0,0.6)'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              padding: '0.9rem 1.25rem', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.02)'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '1rem', color: '#ffffff' }}>
                    🏢 {previewVisit?.site_name || 'Site Inspection Proof'}
                  </span>
                  {previewVisit?.status && (
                    <span className={`badge ${previewVisit.status === 'Completed' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.65rem' }}>
                      {previewVisit.status}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  👤 {previewVisit?.employee_name || 'Field Agent'} {previewVisit?.client_name ? `· Client: ${previewVisit.client_name}` : ''} · 📍 {previewVisit?.address || 'Site Location'}
                </div>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => { setPreviewPhotoUrl(null); setPreviewVisit(null); }}
                style={{
                  color: '#ffffff', background: 'rgba(255,255,255,0.1)', border: 'none',
                  borderRadius: '50%', width: 32, height: 32, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            {/* Photo Display */}
            <div style={{
              position: 'relative', background: '#020617', textAlign: 'center',
              maxHeight: '65vh', overflow: 'hidden', display: 'flex',
              alignItems: 'center', justifyContent: 'center'
            }}>
              <img
                src={previewVisit?.photo_url || previewPhotoUrl}
                alt="Geotagged Inspection Proof"
                style={{ maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain', display: 'block' }}
              />
              <div style={{
                position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,0.75)',
                padding: '0.35rem 0.75rem', borderRadius: 20, fontSize: '0.72rem',
                color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.35rem',
                border: '1px solid rgba(16,185,129,0.4)', backdropFilter: 'blur(4px)'
              }}>
                <ShieldCheck size={14} /> Tamper-Proof Geotag Verified
              </div>
            </div>

            {/* Action Bar */}
            <div style={{
              padding: '0.85rem 1.25rem', background: 'rgba(15,23,42,0.98)',
              borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex',
              justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem'
            }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                {previewVisit?.lat ? `GPS: ${Number(previewVisit.lat).toFixed(5)}° N, ${Number(previewVisit.lng).toFixed(5)}° E (±${previewVisit.accuracy || 10}m)` : 'GPS Verified'}
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => handleShareVisitWhatsApp(previewVisit || { site_name: 'Site Inspection', photo_url: previewPhotoUrl })}
                  style={{
                    background: '#25D366', color: '#ffffff', borderColor: '#25D366',
                    fontWeight: 600, fontSize: '0.8rem', padding: '0.45rem 0.9rem',
                    gap: '0.4rem', boxShadow: '0 2px 10px rgba(37,211,102,0.3)'
                  }}
                >
                  <MessageCircle size={15} /> Share to WhatsApp
                </button>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleDownloadVisitPhoto(previewVisit || { photo_url: previewPhotoUrl, site_name: 'Inspection' })}
                  style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem', gap: '0.4rem' }}
                >
                  <Download size={15} /> Download JPG
                </button>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleCopyVisitLink(previewVisit || { photo_url: previewPhotoUrl })}
                  style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem', gap: '0.4rem' }}
                >
                  <Share2 size={15} /> Copy Link
                </button>

                {previewVisit && previewVisit.status !== 'Completed' && canApprove && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      handleMarkCompleted(previewVisit.id);
                      setPreviewVisit(p => ({ ...p, status: 'Completed' }));
                    }}
                    style={{ background: '#10b981', borderColor: '#10b981', fontSize: '0.8rem', padding: '0.45rem 0.85rem', gap: '0.4rem' }}
                  >
                    <Check size={15} /> Mark Verified
                  </button>
                )}
              </div>
            </div>
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
