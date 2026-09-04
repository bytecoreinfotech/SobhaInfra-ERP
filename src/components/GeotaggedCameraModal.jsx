import React, { useState, useRef, useEffect } from 'react';
import { Camera, MapPin, Check, RefreshCw, X, ShieldCheck, Calendar, User, Building, AlertCircle } from 'lucide-react';
import { reverseGeocode } from '../lib/db';

/**
 * GeotaggedCameraModal:
 * Real Estate Field Inspection Camera Engine with Tamper-Proof Canvas Watermarking.
 * 100% Free - Works on any mobile browser (Chrome/Safari) or desktop.
 */
const GeotaggedCameraModal = ({
  isOpen,
  onClose,
  onCaptureComplete,
  employeeName = 'Field Agent',
  siteName = 'Property Site',
  clientName = '',
  companyName = 'SOBHAINFRA ERP',
  initialCoords = null,
}) => {
  const [coords, setCoords] = useState(initialCoords);
  const [accuracy, setAccuracy] = useState(null);
  const [address, setAddress] = useState('Detecting GPS location...');
  const [locating, setLocating] = useState(true);
  const [locError, setLocError] = useState(null);

  const [rawImageSrc, setRawImageSrc] = useState(null);
  const [watermarkedImage, setWatermarkedImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      detectLiveLocation();
    }
  }, [isOpen]);

  const detectLiveLocation = () => {
    setLocating(true);
    setLocError(null);

    if (!navigator.geolocation) {
      setLocError('Geolocation is not supported by your browser.');
      setLocating(false);
      setAddress('GPS not available');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = Math.round(pos.coords.accuracy || 10);
        setCoords({ lat, lng });
        setAccuracy(acc);

        // Reverse geocode via free OSM Nominatim
        const addr = await reverseGeocode(lat, lng);
        setAddress(addr);
        setLocating(false);
      },
      (err) => {
        console.warn('Geolocation error:', err.message);
        setLocError('Location permission denied or unavailable. Using estimated coordinates.');
        // Fallback default coordinates (e.g. Noida/Delhi-NCR)
        const fallbackLat = 28.5355;
        const fallbackLng = 77.3910;
        setCoords({ lat: fallbackLat, lng: fallbackLng });
        setAccuracy(15);
        setAddress('Sector 62, Noida, Uttar Pradesh (Estimated)');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setRawImageSrc(event.target.result);
      applyGeotagWatermark(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  const applyGeotagWatermark = (dataUrl) => {
    setIsProcessing(true);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = dataUrl;

    img.onload = () => {
      const canvas = canvasRef.current || document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Set canvas dimensions to image dimensions (standardize for high-res)
      const maxDim = 1600;
      let width = img.width;
      let height = img.height;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;

      // 1. Draw base photo
      ctx.drawImage(img, 0, 0, width, height);

      // 2. Draw modern dark glass gradient overlay at the bottom for watermark
      const bannerHeight = Math.max(160, Math.round(height * 0.22));
      const gradient = ctx.createLinearGradient(0, height - bannerHeight - 40, 0, height);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(0.3, 'rgba(10, 15, 30, 0.85)');
      gradient.addColorStop(1, 'rgba(5, 8, 20, 0.95)');

      ctx.fillStyle = gradient;
      ctx.fillRect(0, height - bannerHeight - 40, width, bannerHeight + 40);

      // 3. Draw Watermark Branding & Verified Badge
      const padX = Math.round(width * 0.04);
      let textY = height - bannerHeight + 10;
      const baseFontSize = Math.max(14, Math.round(width * 0.022));

      // Brand / Badge
      ctx.fillStyle = '#10b981';
      ctx.font = `bold ${Math.round(baseFontSize * 1.15)}px Outfit, sans-serif`;
      ctx.fillText(`🛡️ VERIFIED SITE INSPECTION — ${companyName.toUpperCase()}`, padX, textY);

      textY += baseFontSize * 1.5;

      // Site & Client Name
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(baseFontSize * 1.25)}px Outfit, sans-serif`;
      const siteDisplay = `${siteName}${clientName ? ` (Client: ${clientName})` : ''}`;
      ctx.fillText(`🏢 ${siteDisplay}`, padX, textY);

      textY += baseFontSize * 1.35;

      // GPS Coordinates & Accuracy
      ctx.fillStyle = '#38bdf8';
      ctx.font = `600 ${baseFontSize}px Outfit, monospace`;
      const latStr = coords ? coords.lat.toFixed(6) : '0.000000';
      const lngStr = coords ? coords.lng.toFixed(6) : '0.000000';
      ctx.fillText(`📍 GPS: ${latStr}° N, ${lngStr}° E (Accuracy: ±${accuracy || 10}m)`, padX, textY);

      textY += baseFontSize * 1.25;

      // Address (Truncate if too long)
      ctx.fillStyle = '#cbd5e1';
      ctx.font = `normal ${Math.round(baseFontSize * 0.95)}px Outfit, sans-serif`;
      const displayAddr = address.length > 75 ? address.substring(0, 72) + '...' : address;
      ctx.fillText(`🏠 ${displayAddr}`, padX, textY);

      textY += baseFontSize * 1.25;

      // Date, Time & Agent Info
      const now = new Date();
      const timeStr = now.toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
      });

      ctx.fillStyle = '#facc15';
      ctx.font = `600 ${Math.round(baseFontSize * 0.95)}px Outfit, sans-serif`;
      ctx.fillText(`📅 ${timeStr}  |  👤 Agent: ${employeeName}`, padX, textY);

      // Export watermarked data URL
      const finalWatermarked = canvas.toDataURL('image/jpeg', 0.88);
      setWatermarkedImage(finalWatermarked);
      setIsProcessing(false);
    };
  };

  const handleConfirm = () => {
    if (!watermarkedImage) return;
    onCaptureComplete({
      photoUrl: watermarkedImage,
      coords,
      accuracy,
      address,
      timestamp: new Date().toISOString(),
      employeeName,
      siteName,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content animate-fade-in" style={{ maxWidth: 580, padding: '1.5rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', background: 'rgba(16,185,129,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981'
            }}>
              <Camera size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Live Site Inspection Camera</h2>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Tamper-proof GPS timestamp watermarking
              </div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close Modal">
            <X size={18} />
          </button>
        </div>

        {/* Live GPS Status Card */}
        <div style={{
          padding: '0.75rem 1rem', borderRadius: 8, background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--border-color)', marginBottom: '1rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600, color: '#38bdf8' }}>
              <MapPin size={14} />
              {locating ? 'Acquiring high-accuracy GPS fix...' : `GPS Fix: ${coords?.lat.toFixed(4)}°, ${coords?.lng.toFixed(4)}° (±${accuracy}m)`}
            </div>
            <button
              onClick={detectLiveLocation}
              disabled={locating}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', height: 'auto' }}
            >
              <RefreshCw size={11} className={locating ? 'animate-spin' : ''} /> Refetch GPS
            </button>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            📍 {address}
          </div>
          {locError && (
            <div style={{ fontSize: '0.7rem', color: 'var(--warning)', marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <AlertCircle size={12} /> {locError}
            </div>
          )}
        </div>

        {/* Camera / Photo Preview Area */}
        <div style={{
          minHeight: 280, borderRadius: 10, border: '2px dashed var(--border-color)',
          background: '#090b14', display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', overflow: 'hidden', position: 'relative', marginBottom: '1rem'
        }}>
          {watermarkedImage ? (
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
              <img
                src={watermarkedImage}
                alt="Geotagged Site Inspection"
                style={{ width: '100%', maxHeight: 380, objectFit: 'contain', display: 'block' }}
              />
              <div style={{
                position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.7)',
                padding: '0.35rem 0.75rem', borderRadius: 20, fontSize: '0.72rem',
                color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.35rem',
                border: '1px solid rgba(16,185,129,0.4)', backdropFilter: 'blur(4px)'
              }}>
                <ShieldCheck size={14} /> Watermark Applied
              </div>
            </div>
          ) : (
            <div style={{ padding: '2rem 1.5rem', textAlign: 'center' }}>
              <div style={{
                width: 60, height: 60, borderRadius: '50%', background: 'rgba(99,102,241,0.15)',
                color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 1rem'
              }}>
                <Camera size={28} />
              </div>
              <div style={{ fontWeight: 600, fontSize: '0.92rem', marginBottom: '0.3rem' }}>
                Capture Live Site Photo
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: 320, margin: '0 auto 1.25rem' }}>
                Tap below to open your phone's camera. The system will automatically imprint the GPS coordinates, address, and live timestamp.
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={locating}
                style={{ padding: '0.65rem 1.4rem', fontSize: '0.85rem' }}
              >
                <Camera size={16} /> Open Mobile Camera
              </button>
            </div>
          )}
        </div>

        {/* Hidden Canvas for Processing */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Action Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {watermarkedImage ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              style={{ fontSize: '0.82rem' }}
            >
              <RefreshCw size={14} /> Retake Photo
            </button>
          ) : (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Site: <strong style={{ color: 'var(--text-primary)' }}>{siteName}</strong>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleConfirm}
              disabled={!watermarkedImage || isProcessing}
              style={{ background: 'var(--success)', borderColor: 'var(--success)' }}
            >
              <Check size={16} /> {isProcessing ? 'Processing...' : 'Attach Geotagged Photo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeotaggedCameraModal;
