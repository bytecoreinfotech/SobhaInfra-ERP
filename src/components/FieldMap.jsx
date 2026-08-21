import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { User, MapPin, Clock, Camera, MessageCircle, ExternalLink, Navigation } from 'lucide-react';

/**
 * FieldMap Component:
 * Interactive OpenStreetMap (100% Free Leaflet.js engine) showing real-time live field employees & site visits.
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
}) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Default center (Delhi NCR / India or first coordinate)
    const defaultLat = liveAgents[0]?.lat || visits[0]?.lat || 28.5355;
    const defaultLng = liveAgents[0]?.lng || visits[0]?.lng || 77.3910;

    if (!mapInstanceRef.current) {
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
    }

    const map = mapInstanceRef.current;

    // Clear existing markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const bounds = [];

    // ─────────────────────────────────────────────────────────────────────────
    // 1. RENDER LIVE EMPLOYEE GPS BROADCASTING PINS (Green Pulsating Radar)
    // ─────────────────────────────────────────────────────────────────────────
    liveAgents.forEach((agent) => {
      if (!agent.lat || !agent.lng) return;
      bounds.push([agent.lat, agent.lng]);

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

      const popupHtml = `
        <div style="font-family: Outfit, Inter, sans-serif; min-width: 230px; color: #1e293b; padding: 4px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <strong style="font-size: 13px; color: #0f172a;">👤 ${agent.employee_name}</strong>
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
            🎯 Exact GPS: ${agent.lat.toFixed(5)}° N, ${agent.lng.toFixed(5)}° E (±${agent.accuracy || 6}m)
          </div>

          <div style="font-size: 10px; color: #94a3b8;">
            ⏱️ Last Ping: ${agent.last_ping ? new Date(agent.last_ping).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Active'}
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      marker.on('click', () => onSelectAgent(agent));
      markersRef.current.push(marker);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. RENDER PROPERTY INSPECTION VISITS & REAL PHOTOS
    // ─────────────────────────────────────────────────────────────────────────
    visits.forEach((v) => {
      if (!v.lat || !v.lng) return;
      bounds.push([v.lat, v.lng]);

      const isCompleted = v.status === 'Completed';
      const markerColor = isCompleted ? '#3b82f6' : '#6366f1';

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

      const popupHtml = `
        <div style="font-family: Outfit, Inter, sans-serif; min-width: 230px; color: #1e293b; padding: 4px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px;">
            <strong style="font-size: 13px; color: #0f172a;">🏢 ${v.site_name}</strong>
            <span style="
              font-size: 9px;
              font-weight: 700;
              padding: 2px 6px;
              border-radius: 4px;
              background: ${isCompleted ? '#dbeafe' : '#fef3c7'};
              color: ${isCompleted ? '#1e40af' : '#92400e'};
            ">${v.status}</span>
          </div>

          <div style="font-size: 11px; color: #6366f1; font-weight: 600; margin-bottom: 2px;">
            👤 Agent: ${v.employee_name} ${v.client_name ? `· Client: ${v.client_name}` : ''}
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
              <a href="https://wa.me/${v.lead_phone.replace(/\\D/g, '')}" target="_blank" rel="noreferrer" style="
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

      marker.bindPopup(popupHtml);

      marker.on('popupopen', () => {
        const btn = document.getElementById(`view-details-btn-${v.id}`);
        if (btn) btn.onclick = () => onSelectVisit(v);

        const img = document.getElementById(`popup-img-${v.id}`);
        if (img && v.photo_url) img.onclick = () => onViewPhoto(v.photo_url);
      });

      markersRef.current.push(marker);
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [visits, liveAgents]);

  // Center on selected item
  useEffect(() => {
    const target = selectedVisit || selectedAgent;
    if (target && mapInstanceRef.current && target.lat && target.lng) {
      mapInstanceRef.current.setView([target.lat, target.lng], 16, { animate: true });
    }
  }, [selectedVisit, selectedAgent]);

  return (
    <div style={{ position: 'relative', width: '100%', height, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Floating Legend */}
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
