import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { User, MapPin, Clock, Camera, MessageCircle, ExternalLink } from 'lucide-react';

/**
 * FieldMap Component:
 * Interactive OpenStreetMap (100% Free Leaflet.js engine) showing live field employees & site visits.
 */
const FieldMap = ({
  visits = [],
  selectedVisit = null,
  onSelectVisit = () => {},
  onViewPhoto = () => {},
  height = '480px',
}) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Default center (India / Delhi NCR or first visit location)
    const defaultLat = visits[0]?.lat || 28.5355;
    const defaultLng = visits[0]?.lng || 77.3910;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [defaultLat, defaultLng],
        zoom: 12,
        zoomControl: true,
      });

      // Free OpenStreetMap CartoDB Dark/Voyager or standard OSM Tiles
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

    visits.forEach((v) => {
      if (!v.lat || !v.lng) return;

      bounds.push([v.lat, v.lng]);

      const isCompleted = v.status === 'Completed';
      const markerColor = isCompleted ? '#10b981' : '#6366f1';

      // Custom animated HTML pin
      const customIcon = L.divIcon({
        className: 'custom-field-pin',
        html: `
          <div style="
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: ${markerColor};
            color: #ffffff;
            font-weight: 700;
            font-size: 11px;
            box-shadow: 0 0 15px ${markerColor}aa, 0 4px 10px rgba(0,0,0,0.5);
            border: 2px solid #ffffff;
            cursor: pointer;
          ">
            <span>${(v.employee_name || 'A').slice(0, 2).toUpperCase()}</span>
            ${!isCompleted ? `<div style="
              position: absolute;
              top: -3px;
              right: -3px;
              width: 10px;
              height: 10px;
              border-radius: 50%;
              background: #22c55e;
              border: 1.5px solid #ffffff;
              animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
            "></div>` : ''}
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -20],
      });

      const marker = L.marker([v.lat, v.lng], { icon: customIcon }).addTo(map);

      // Popup Content Card
      const popupHtml = `
        <div style="font-family: Outfit, sans-serif; min-width: 220px; color: #1e293b; padding: 2px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <strong style="font-size: 13px; color: #0f172a;">👤 ${v.employee_name}</strong>
            <span style="
              font-size: 10px;
              font-weight: 700;
              padding: 2px 6px;
              border-radius: 4px;
              background: ${isCompleted ? '#dcfce7' : '#e0e7ff'};
              color: ${isCompleted ? '#166534' : '#3730a3'};
            ">${v.status}</span>
          </div>

          <div style="font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 3px;">
            🏢 ${v.site_name}
          </div>

          <div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">
            📍 ${v.address || 'Field Location'}
          </div>

          <div style="font-size: 10px; color: #94a3b8; margin-bottom: 8px;">
            ⏱️ Check-In: ${new Date(v.check_in_time || v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (Accuracy: ±${v.accuracy || 10}m)
          </div>

          ${v.photo_url ? `
            <div style="margin-bottom: 8px;">
              <img src="${v.photo_url}" alt="Site Photo" style="width: 100%; height: 95px; object-fit: cover; border-radius: 6px; border: 1px solid #e2e8f0; cursor: pointer;" id="popup-img-${v.id}" />
            </div>
          ` : ''}

          <div style="display: flex; gap: 6px;">
            ${v.lead_phone ? `
              <a href="https://wa.me/${v.lead_phone.replace(/\\D/g, '')}" target="_blank" rel="noreferrer" style="
                flex: 1;
                text-align: center;
                background: #25D366;
                color: #ffffff;
                text-decoration: none;
                font-size: 11px;
                font-weight: 600;
                padding: 4px 6px;
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
              font-size: 11px;
              font-weight: 600;
              padding: 4px 6px;
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
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }

    return () => {
      // Cleanup on unmount
    };
  }, [visits]);

  // Center on selected visit if changed
  useEffect(() => {
    if (selectedVisit && mapInstanceRef.current && selectedVisit.lat && selectedVisit.lng) {
      mapInstanceRef.current.setView([selectedVisit.lat, selectedVisit.lng], 15, { animate: true });
    }
  }, [selectedVisit]);

  return (
    <div style={{ position: 'relative', width: '100%', height, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Floating Legend */}
      <div style={{
        position: 'absolute', bottom: 12, right: 12, zIndex: 1000,
        background: 'rgba(11, 13, 26, 0.88)', backdropFilter: 'blur(8px)',
        padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--border-color)',
        fontSize: '0.72rem', display: 'flex', gap: '0.85rem', color: 'var(--text-secondary)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1' }} />
          <span>Active On-Site</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
          <span>Completed Visit</span>
        </div>
      </div>
    </div>
  );
};

export default FieldMap;
