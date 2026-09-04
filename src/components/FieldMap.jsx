import React, { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * FieldMap Component:
 * Interactive OpenStreetMap (Leaflet.js engine) showing real-time live field employees & site visits.
 * 
 * Features:
 * - Persistent marker instances: coordinates update smoothly without destroying open popups.
 * - Map auto-zoom fix: fitBounds runs only on initial load, NOT on 10s polling cycles.
 * - User manual zoom & pan positions are preserved without snapping back.
 * - Explicit click zoom: smoothly centers and opens popup on employee/visit click.
 * - Quick-access "🎯 Fit All" control button.
 */
const FieldMap = ({
  visits = [],
  liveAgents = [],
  selectedVisit = null,
  selectedAgent = null,
  onSelectVisit = () => {},
  onSelectAgent = () => {},
  onViewPhoto = () => {},
  height = '480px',
  fitAllTrigger = null,
}) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);

  // Persistent marker maps (key -> L.Marker) to prevent destroying markers and popups on poll
  const agentMarkersRef = useRef(new Map());
  const visitMarkersRef = useRef(new Map());

  // Flags & Click tracking
  const initialFitDoneRef = useRef(false);
  const lastClickTimeRef = useRef(0);
  const lastTargetIdRef = useRef(null);

  // Callback refs to avoid stale closures in event handlers
  const onSelectAgentRef = useRef(onSelectAgent);
  const onSelectVisitRef = useRef(onSelectVisit);
  const onViewPhotoRef = useRef(onViewPhoto);

  useEffect(() => {
    onSelectAgentRef.current = onSelectAgent;
    onSelectVisitRef.current = onSelectVisit;
    onViewPhotoRef.current = onViewPhoto;
  });

  // 1. Initialize Leaflet Map Instance Once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const defaultLat = liveAgents[0]?.lat || visits[0]?.lat || 28.5355;
    const defaultLng = liveAgents[0]?.lng || visits[0]?.lng || 77.3910;

    const map = L.map(mapContainerRef.current, {
      center: [defaultLat, defaultLng],
      zoom: 12,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;

    // Handle container resize to prevent grey tiles
    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      agentMarkersRef.current.forEach(m => m.remove());
      agentMarkersRef.current.clear();
      visitMarkersRef.current.forEach(m => m.remove());
      visitMarkersRef.current.clear();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Popup HTML Builders
  const buildAgentPopupHtml = (agent) => `
    <div style="font-family: Outfit, Inter, sans-serif; min-width: 230px; color: #1e293b; padding: 4px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
        <strong style="font-size: 13px; color: #0f172a;">👤 ${agent.employee_name || 'Agent'}</strong>
        <span style="
          font-size: 9px;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 20px;
          background: #dcfce7;
          color: #166534;
          display: flex;
          align-items: center;
          gap: 3px;
        ">● LIVE GPS</span>
      </div>

      <div style="font-size: 11px; color: #0284c7; font-weight: 600; margin-bottom: 3px;">
        🏢 Role: ${agent.role || 'Field Staff'}
      </div>

      <div style="font-size: 11px; color: #475569; margin-bottom: 5px; line-height: 1.3;">
        📍 ${agent.address || 'Broadcasting Live Coordinates'}
      </div>

      <div style="font-size: 10px; color: #0284c7; background: #f0f9ff; padding: 4px 6px; border-radius: 4px; margin-bottom: 6px;">
        🎯 Exact GPS: ${Number(agent.lat).toFixed(5)}° N, ${Number(agent.lng).toFixed(5)}° E (±${agent.accuracy || 6}m)
      </div>

      <div style="font-size: 10px; color: #94a3b8;">
        ⏱️ Last Ping: ${agent.last_ping ? new Date(agent.last_ping).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Active'}
      </div>
    </div>
  `;

  const buildVisitPopupHtml = (v) => {
    const isCompleted = v.status === 'Completed';
    return `
      <div style="font-family: Outfit, Inter, sans-serif; min-width: 230px; color: #1e293b; padding: 4px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px;">
          <strong style="font-size: 13px; color: #0f172a;">🏢 ${v.site_name || 'Site'}</strong>
          <span style="
            font-size: 9px;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 4px;
            background: ${isCompleted ? '#dbeafe' : '#fef3c7'};
            color: ${isCompleted ? '#1e40af' : '#92400e'};
          ">${v.status || 'Pending'}</span>
        </div>

        <div style="font-size: 11px; color: #6366f1; font-weight: 600; margin-bottom: 2px;">
          👤 Agent: ${v.employee_name || 'Staff'} ${v.client_name ? `· Client: ${v.client_name}` : ''}
        </div>

        <div style="font-size: 11px; color: #64748b; margin-bottom: 5px; line-height: 1.3;">
          📍 ${v.address || 'Site Location'}
        </div>

        <div style="font-size: 10px; color: #94a3b8; margin-bottom: 6px;">
          ⏱️ ${new Date(v.check_in_time || v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (Accuracy: ±${v.accuracy || 8}m)
        </div>

        ${v.photo_url ? `
          <div style="margin-bottom: 6px; position: relative;">
            <img src="${v.photo_url}" alt="Site Photo" style="width: 100%; height: 110px; object-fit: cover; border-radius: 6px; border: 1px solid #cbd5e1; cursor: pointer;" id="popup-img-${v.id}" />
            <div style="position: absolute; bottom: 4px; right: 4px; background: rgba(0,0,0,0.7); color: #10b981; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 700;">
              🛡️ Watermarked Photo
            </div>
          </div>
        ` : ''}

        <div style="display: flex; gap: 4px;">
          ${v.lead_phone ? `
            <a href="https://wa.me/${String(v.lead_phone).replace(/\D/g, '')}" target="_blank" rel="noreferrer" style="
              flex: 1;
              text-align: center;
              background: #25D366;
              color: #ffffff;
              text-decoration: none;
              font-size: 10px;
              font-weight: 600;
              padding: 4px;
              border-radius: 4px;
            ">
              💬 WhatsApp
            </a>
          ` : ''}
          <button id="view-details-btn-${v.id}" style="
            flex: 1;
            background: #6366f1;
            color: #ffffff;
            border: none;
            font-size: 10px;
            font-weight: 600;
            padding: 4px;
            border-radius: 4px;
            cursor: pointer;
          ">
            View Inspection
          </button>
        </div>
      </div>
    `;
  };

  // 2. Incremental Marker Updates (Preserves Popups and User Pan/Zoom across 10s Polls)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const bounds = [];

    // --- Update Live Agent Markers ---
    const currentAgentKeys = new Set();
    liveAgents.forEach((agent) => {
      if (!agent.lat || !agent.lng) return;
      const key = String(agent.employee_id || agent.id || agent.employee_name);
      currentAgentKeys.add(key);
      bounds.push([agent.lat, agent.lng]);

      const popupHtml = buildAgentPopupHtml(agent);

      if (agentMarkersRef.current.has(key)) {
        // Marker exists: update coordinates & content without destroying popup
        const marker = agentMarkersRef.current.get(key);
        const currentLatLng = marker.getLatLng();
        if (currentLatLng.lat !== agent.lat || currentLatLng.lng !== agent.lng) {
          marker.setLatLng([agent.lat, agent.lng]);
        }
        marker.setPopupContent(popupHtml);
      } else {
        // Marker is new: create and add to map
        const liveIcon = L.divIcon({
          className: 'custom-live-agent-pin',
          html: `
            <div style="
              position: relative;
              display: flex;
              align-items: center;
              justify-content: center;
              width: 40px;
              height: 40px;
              border-radius: 50%;
              background: linear-gradient(135deg, #10b981, #059669);
              color: #ffffff;
              font-weight: 800;
              font-size: 12px;
              box-shadow: 0 0 20px rgba(16,185,129,0.8), 0 4px 12px rgba(0,0,0,0.5);
              border: 2.5px solid #ffffff;
              cursor: pointer;
            ">
              <span>${(agent.employee_name || 'A').slice(0, 2).toUpperCase()}</span>
              <div style="
                position: absolute;
                top: -6px;
                right: -6px;
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: #22c55e;
                border: 2px solid #ffffff;
                box-shadow: 0 0 10px #22c55e;
              "></div>
            </div>
          `,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
          popupAnchor: [0, -22],
        });

        const marker = L.marker([agent.lat, agent.lng], { icon: liveIcon, zIndexOffset: 1000 }).addTo(map);
        marker.bindPopup(popupHtml);
        marker.on('click', () => {
          onSelectAgentRef.current({ ...agent, _clickTime: Date.now() });
        });
        agentMarkersRef.current.set(key, marker);
      }
    });

    // Remove obsolete agent markers
    agentMarkersRef.current.forEach((marker, key) => {
      if (!currentAgentKeys.has(key)) {
        marker.remove();
        agentMarkersRef.current.delete(key);
      }
    });

    // --- Update Visit Markers ---
    const currentVisitKeys = new Set();
    visits.forEach((v) => {
      if (!v.lat || !v.lng) return;
      const key = String(v.id);
      currentVisitKeys.add(key);
      bounds.push([v.lat, v.lng]);

      const isCompleted = v.status === 'Completed';
      const markerColor = isCompleted ? '#3b82f6' : '#6366f1';
      const popupHtml = buildVisitPopupHtml(v);

      const attachVisitPopupListeners = () => {
        setTimeout(() => {
          const btn = document.getElementById(`view-details-btn-${v.id}`);
          if (btn) btn.onclick = () => onSelectVisitRef.current(v);

          const img = document.getElementById(`popup-img-${v.id}`);
          if (img && v.photo_url) img.onclick = () => onViewPhotoRef.current(v.photo_url);
        }, 30);
      };

      if (visitMarkersRef.current.has(key)) {
        // Marker exists: update coordinates & content
        const marker = visitMarkersRef.current.get(key);
        const currentLatLng = marker.getLatLng();
        if (currentLatLng.lat !== v.lat || currentLatLng.lng !== v.lng) {
          marker.setLatLng([v.lat, v.lng]);
        }
        marker.setPopupContent(popupHtml);
        if (marker.isPopupOpen()) {
          attachVisitPopupListeners();
        }
      } else {
        // Marker is new: create and add to map
        const customIcon = L.divIcon({
          className: 'custom-field-pin',
          html: `
            <div style="
              position: relative;
              display: flex;
              align-items: center;
              justify-content: center;
              width: 34px;
              height: 34px;
              border-radius: 50%;
              background: ${markerColor};
              color: #ffffff;
              font-weight: 700;
              font-size: 11px;
              box-shadow: 0 0 12px ${markerColor}99, 0 3px 8px rgba(0,0,0,0.4);
              border: 2px solid #ffffff;
              cursor: pointer;
            ">
              <span>🏢</span>
            </div>
          `,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
          popupAnchor: [0, -18],
        });

        const marker = L.marker([v.lat, v.lng], { icon: customIcon }).addTo(map);
        marker.bindPopup(popupHtml);
        marker.on('popupopen', attachVisitPopupListeners);
        marker.on('click', () => {
          onSelectVisitRef.current({ ...v, _clickTime: Date.now() });
        });
        visitMarkersRef.current.set(key, marker);
      }
    });

    // Remove obsolete visit markers
    visitMarkersRef.current.forEach((marker, key) => {
      if (!currentVisitKeys.has(key)) {
        marker.remove();
        visitMarkersRef.current.delete(key);
      }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // ONLY CALL fitBounds ON INITIAL LOAD!
    // Never auto-zoom or snap back during 10-second polling cycles!
    // ─────────────────────────────────────────────────────────────────────────
    if (!initialFitDoneRef.current && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      initialFitDoneRef.current = true;
    }
  }, [visits, liveAgents]);

  // 3. Focus/Zoom on selected item ONLY when explicitly clicked
  useEffect(() => {
    const target = selectedVisit || selectedAgent;
    if (!target || !mapInstanceRef.current || !target.lat || !target.lng) return;

    const targetId = String(target.employee_id || target.id || '');
    const clickTime = target._clickTime || 0;

    const isNewClick = clickTime > 0 && clickTime !== lastClickTimeRef.current;
    const isNewTarget = targetId && targetId !== lastTargetIdRef.current;

    // Only zoom if user explicitly clicked or selection actually changed
    if (isNewClick || isNewTarget) {
      lastClickTimeRef.current = clickTime;
      lastTargetIdRef.current = targetId;

      mapInstanceRef.current.setView([target.lat, target.lng], 16, { animate: true });

      // Open popup on focused marker
      const marker = target.employee_id
        ? agentMarkersRef.current.get(String(target.employee_id))
        : visitMarkersRef.current.get(String(target.id));

      if (marker && !marker.isPopupOpen()) {
        marker.openPopup();
      }
    }
  }, [selectedVisit, selectedAgent]);

  // 4. Quick-Access "🎯 Fit All" Handler
  const handleFitAll = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const bounds = [];
    liveAgents.forEach(a => {
      if (a.lat && a.lng) bounds.push([a.lat, a.lng]);
    });
    visits.forEach(v => {
      if (v.lat && v.lng) bounds.push([v.lat, v.lng]);
    });

    if (bounds.length === 1) {
      map.setView(bounds[0], 15, { animate: true });
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [liveAgents, visits]);

  // Support external fitAllTrigger prop
  useEffect(() => {
    if (fitAllTrigger) {
      handleFitAll();
    }
  }, [fitAllTrigger, handleFitAll]);

  return (
    <div style={{ position: 'relative', width: '100%', height, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Floating Quick-Access "🎯 Fit All" Map Control */}
      <button
        type="button"
        onClick={handleFitAll}
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 1000,
          background: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(8px)',
          color: '#ffffff',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
          borderRadius: 8,
          padding: '0.42rem 0.8rem',
          fontSize: '0.78rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'rgba(30, 41, 59, 0.98)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.35)';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'rgba(15, 23, 42, 0.9)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
        title="Fit map view to encompass all active employees and site inspections"
      >
        <span>🎯 Fit All</span>
      </button>

      {/* Floating Map Legend */}
      <div style={{
        position: 'absolute', bottom: 12, right: 12, zIndex: 1000,
        background: 'rgba(11, 13, 26, 0.92)', backdropFilter: 'blur(8px)',
        padding: '0.45rem 0.75rem', borderRadius: 8, border: '1px solid var(--border-color)',
        fontSize: '0.72rem', display: 'flex', gap: '0.85rem', color: 'var(--text-secondary)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
          <span style={{ fontWeight: 600, color: '#10b981' }}>Live Active Agent</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1' }} />
          <span>Site Inspection</span>
        </div>
      </div>
    </div>
  );
};

export default FieldMap;
