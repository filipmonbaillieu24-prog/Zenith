import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet';
import { getAllRidesFull } from '../utils/db';
import type { LatLngBoundsLiteral } from 'leaflet';
import './HeatmapView.css';

interface Track {
  id:    string;
  name:  string;
  date:  number;
  track: [number, number][];
}

// Auto-fit map to all tracks
const FitBounds: React.FC<{ tracks: Track[] }> = ({ tracks }) => {
  const map = useMap();
  useEffect(() => {
    const pts = tracks.flatMap(t => t.track);
    if (pts.length < 2) return;
    const lats = pts.map(p => p[0]);
    const lngs = pts.map(p => p[1]);
    const bounds: LatLngBoundsLiteral = [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ];
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [tracks.length, map]);
  return null;
};

function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Colour based on ride index (recent = bright cyan, older = dim)
function trackColor(idx: number, total: number, hovered: boolean): string {
  if (hovered) return '#cbd5e1';
  const age = idx / Math.max(total - 1, 1); // 0 = newest, 1 = oldest
  const opacity = Math.max(0.25, 1 - age * 0.65);
  return `rgba(203, 213, 225,${opacity.toFixed(2)})`;
}

interface HeatmapViewProps {
  isPro?: boolean;
  onRequestProModal?: (featureName: string, desc: string) => void;
}

const HeatmapView: React.FC<HeatmapViewProps> = ({ isPro = false, onRequestProModal }) => {
  const [tracks,    setTracks]    = useState<Track[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    getAllRidesFull().then(rides => {
      const cutoff = isPro ? 0 : Date.now() - 30 * 24 * 3600 * 1000;
      const t = rides
        .filter(r => r.points?.some(p => p.lat != null) && (isPro || r.date >= cutoff))
        .sort((a, b) => b.date - a.date)
        .map(r => ({
          id:    r.id,
          name:  r.name,
          date:  r.date,
          track: r.points
            .filter(p => p.lat != null && p.lng != null)
            .map(p => [p.lat!, p.lng!] as [number, number]),
        }));
      setTracks(t);
      setLoading(false);
    });
  }, [isPro]);

  if (loading) {
    return (
      <div className="wd-section-card" style={{ textAlign: 'center', padding: 48, color: '#3a3a4a' }}>
        <div className="wd-spinner" style={{ margin: '0 auto 12px' }} />
        Laden…
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="wd-section-card" style={{ textAlign: 'center', padding: 48, color: '#3a3a4a' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🗺️</div>
        <p>Upload rides with GPS data to view heatmap.</p>
      </div>
    );
  }

  const hovered = tracks.find(t => t.id === hoveredId);
  const center: [number, number] = [51.05, 3.71]; // fallback: Gent

  return (
    <div className="wd-section-card wd-heatmap-card">
      <div className="wd-heatmap-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="wd-section-card__title">
          🗺️ {isPro ? `Alle routes (${tracks.length})` : `Routes afgelopen 30d (${tracks.length})`}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!isPro && (
            <button
              onClick={() => onRequestProModal && onRequestProModal('All-Time Heatmap', 'Upgrade naar Zenith Pro om al je gereden wegen ooit samen te voegen op 1 glowing kaart.')}
              style={{
                background: 'linear-gradient(135deg, #cbd5e1 0%, #64748b 100%)',
                border: 'none', borderRadius: 6, color: '#09090b', fontSize: 10, fontWeight: 900,
                padding: '3px 8px', cursor: 'pointer'
              }}
            >
              🔒 Unlock All-Time Heatmap (PRO)
            </button>
          )}
          <span style={{ fontSize: 11, color: '#94a3b8' }}>
            Blauwer = recenter · Hover voor naam
          </span>
        </div>
      </div>
      <div className="wd-heatmap-map">
        <MapContainer
          center={center}
          zoom={10}
          style={{ height: '100%', width: '100%' }}
          zoomControl
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution="© OpenStreetMap © CARTO"
          />
          <FitBounds tracks={tracks} />
          {tracks.map((t, idx) => (
            <Polyline
              key={t.id}
              positions={t.track}
              weight={hoveredId === t.id ? 5 : 2}
              opacity={1}
              color={trackColor(idx, tracks.length, hoveredId === t.id)}
              eventHandlers={{
                mouseover: () => setHoveredId(t.id),
                mouseout:  () => setHoveredId(null),
              }}
            />
          ))}
        </MapContainer>
      </div>
      <div className="wd-heatmap-footer">
        {hovered ? (
          <>
            <strong style={{ color: 'var(--color-primary,#cbd5e1)' }}>{hovered.name}</strong>
            <span style={{ color: '#3a3a4a' }}>·</span>
            <span>{fmtDate(hovered.date)}</span>
          </>
        ) : (
          <span style={{ color: '#3a3a4a' }}>Beweeg over een route om details te zien</span>
        )}
      </div>
    </div>
  );
};

export default HeatmapView;
