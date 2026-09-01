import React, { useState, useEffect, useMemo } from 'react';
import 'leaflet/dist/leaflet.css';
import './GradientMap.css';
import { MapContainer, TileLayer, Polyline, useMap, Marker, Tooltip as LeafletTooltip } from 'react-leaflet';
import { DARK_BASEMAP_URL, DARK_BASEMAP_LABELS_URL, DARK_BASEMAP_ATTRIBUTION } from '../../utils/basemap';
import L from 'leaflet';
import { Ride, RidePoint } from '../../types/workout';
import { detectClimbs } from '../../utils/climbDetector';

interface GradientMapProps {
  ride: Ride;
  weight?: number;
  hoveredPoint: RidePoint | null;
}

export const MapBoundsUpdater: React.FC<{ positions: [number, number][] }> = ({ positions }) => {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 2) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, {
        paddingTopLeft: [350, 40],     // Keeps 350px clear on the left for stats panel
        paddingBottomRight: [370, 160], // Keeps 370px clear on the right for zones panel, 160px at the bottom for timeline chart
        maxZoom: 15 
      });
    }
  }, [positions, map]);
  return null;
};

const rideHoverIcon = L.divIcon({
  className: 'poi-marker-hover',
  html: `<div style="
    background-color: #cbd5e1; 
    width: 16px; 
    height: 16px; 
    border-radius: 50%; 
    border: 2px solid #ffffff; 
    box-shadow: 0 0 15px #cbd5e1, 0 0 5px rgba(0, 0, 0, 0.8);
    animation: marker-pulse 1.5s infinite ease-out;
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

export const GradientMap: React.FC<GradientMapProps> = ({ ride, weight, hoveredPoint }) => {
  const gpsPts = ride.points.filter(p => p.lat != null && p.lng != null);

  // State to switch coloring mode interactively
  const [metric, setMetric] = useState<'power' | 'hr' | 'speed' | 'wkg'>(() => {
    if (ride.hasPower && weight) return 'wkg';
    if (ride.hasPower) return 'power';
    if (ride.hasHR) return 'hr';
    return 'speed';
  });

  // 3. Retrieve climbs
  const climbs = useMemo(() => detectClimbs(ride.points), [ride.points]);

  // Every hook is above this line. It used to sit at the top, which meant a ride
  // without GPS rendered zero hooks and a ride with GPS rendered two - so opening a
  // recorded ride after an indoor one crashed the panel.
  if (gpsPts.length < 10) return null;

  const values = gpsPts.map(p => {
    if (metric === 'wkg') return weight && p.power != null ? (p.power / weight) : 0;
    if (metric === 'power') return p.power ?? 0;
    if (metric === 'hr') return p.hr ?? 0;
    return (p.speed ?? 0) * 3.6;
  });

  const minV = Math.min(...values.filter(v => v > 0));
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;

  function segColor(val: number): string {
    const t = Math.max(0, Math.min(1, (val - minV) / range));
    if (t < 0.25) return '#74b9ff'; // Zone 1/Recovery (Blue)
    if (t < 0.50) return '#00b894'; // Zone 2 (Green)
    if (t < 0.75) return '#fdcb6e'; // Zone 3/4 (Yellow)
    return '#d63031';              // Zone 5+ (Red)
  }

  // Build segments of ~10 points each
  const segSize = Math.max(5, Math.floor(gpsPts.length / 60));
  const segments: { positions: [number,number][]; color: string }[] = [];
  for (let i = 0; i < gpsPts.length - segSize; i += segSize) {
    const seg     = gpsPts.slice(i, i + segSize + 1);
    const avgVal  = seg.reduce((s, p) => {
      if (metric === 'wkg') return s + (weight && p.power != null ? (p.power / weight) : 0);
      return s + (metric === 'power' ? (p.power ?? 0) : metric === 'hr' ? (p.hr ?? 0) : (p.speed ?? 0) * 3.6);
    }, 0) / seg.length;
    segments.push({
      positions: seg.map(p => [p.lat!, p.lng!]),
      color:     segColor(avgVal),
    });
  }

  const center: [number,number] = [
    gpsPts[Math.floor(gpsPts.length / 2)].lat!,
    gpsPts[Math.floor(gpsPts.length / 2)].lng!,
  ];

  // Start and end coordinates for markers
  const startPt: [number, number] = [gpsPts[0].lat!, gpsPts[0].lng!];
  const endPt: [number, number] = [gpsPts[gpsPts.length - 1].lat!, gpsPts[gpsPts.length - 1].lng!];

  // ── Points of Interest (POI) search along the route ────────────────────────────

  // 1. Find max power index (only gps points with power)
  let maxPwrPt: RidePoint | null = null;
  if (ride.hasPower) {
    const validPwrPts = gpsPts.filter(p => p.power != null);
    if (validPwrPts.length > 0) {
      maxPwrPt = validPwrPts.reduce((max, p) => (p.power! > (max.power ?? 0) ? p : max), validPwrPts[0]);
    }
  }

  // 2. Find max heart rate index (if there is no power, or as an extra POI)
  let maxHRPt: RidePoint | null = null;
  if (ride.hasHR) {
    const validHRPts = gpsPts.filter(p => p.hr != null);
    if (validHRPts.length > 0) {
      maxHRPt = validHRPts.reduce((max, p) => (p.hr! > (max.hr ?? 0) ? p : max), validHRPts[0]);
    }
  }

  return (
    <div className="rp-map-wrap">
      <div style={{
        position: 'absolute',
        top: 80,
        right: 20,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        background: 'rgba(9, 9, 11, 0.85)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 12,
        padding: '10px 14px',
        backdropFilter: 'blur(16px)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        pointerEvents: 'auto'
      }}>
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
          <span style={{ fontSize:10, fontWeight:700, color:'#aaa', textTransform:'uppercase', marginBottom:2 }}>Map coloring</span>
          <div style={{ display:'flex', gap:4 }}>
            {ride.hasPower && weight && (
              <button className={`wd-sort-btn ${metric === 'wkg' ? 'wd-sort-btn--active' : ''}`} style={{ fontSize:10, padding:'4px 8px' }} onClick={() => setMetric('wkg')}>W/kg</button>
            )}
            {ride.hasPower && (
              <button className={`wd-sort-btn ${metric === 'power' ? 'wd-sort-btn--active' : ''}`} style={{ fontSize:10, padding:'4px 8px' }} onClick={() => setMetric('power')}>Watt</button>
            )}
            {ride.hasHR && (
              <button className={`wd-sort-btn ${metric === 'hr' ? 'wd-sort-btn--active' : ''}`} style={{ fontSize:10, padding:'4px 8px' }} onClick={() => setMetric('hr')}>HR</button>
            )}
            <button className={`wd-sort-btn ${metric === 'speed' ? 'wd-sort-btn--active' : ''}`} style={{ fontSize:10, padding:'4px 8px' }} onClick={() => setMetric('speed')}>km/h</button>
          </div>
        </div>
        
        <div style={{ display:'flex', gap:8, borderTop:'1px solid rgba(255, 255, 255, 0.06)', paddingTop:6, justifyContent:'space-between' }}>
          {['Low','Moderate','High','Peak'].map((l, i) => (
            <span key={i} style={{ display:'flex', alignItems:'center', gap:3, fontSize:10, color:'#888' }}>
              <span style={{ width:8, height:8, borderRadius:2, background:['#74b9ff','#00b894','#fdcb6e','#d63031'][i], display:'inline-block' }} />
              {l}
            </span>
          ))}
        </div>
      </div>

      <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }} zoomControl={false}>
        <TileLayer url={DARK_BASEMAP_URL} attribution={DARK_BASEMAP_ATTRIBUTION} className="zenith-basemap-dark" />
        <TileLayer url={DARK_BASEMAP_LABELS_URL} />
        <MapBoundsUpdater positions={gpsPts.map(p => [p.lat!, p.lng!])} />
        
        {/* Glow & Core polyline segments */}
        {segments.map((seg, i) => (
          <React.Fragment key={i}>
            {/* Glow Layer */}
            <Polyline positions={seg.positions} color={seg.color} weight={7} opacity={0.3} lineCap="round" lineJoin="round" />
            {/* Core Layer */}
            <Polyline positions={seg.positions} color={seg.color} weight={3.5} opacity={0.9} lineCap="round" lineJoin="round" />
          </React.Fragment>
        ))}

        {/* Start Marker */}
        <Marker position={startPt} icon={L.divIcon({
          className: 'custom-marker-start',
          html: `<div style="background-color:#cbd5e1; width:12px; height:12px; border-radius:50%; border:2px solid #fff; box-shadow:0 0 10px #cbd5e1;"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6]
        })}>
          <LeafletTooltip direction="top" offset={[0, -6]} opacity={0.9}>
            <span>⚪ Start of ride</span>
          </LeafletTooltip>
        </Marker>

        {/* End Marker */}
        <Marker position={endPt} icon={L.divIcon({
          className: 'custom-marker-end',
          html: `<div style="background-color:#ff3366; width:12px; height:12px; border-radius:50%; border:2px solid #fff; box-shadow:0 0 10px #ff3366;"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6]
        })}>
          <LeafletTooltip direction="top" offset={[0, -6]} opacity={0.9}>
            <span>🔴 Finish of ride</span>
          </LeafletTooltip>
        </Marker>

        {/* POI: Max Power Marker */}
        {maxPwrPt && maxPwrPt.lat != null && maxPwrPt.lng != null && (
          <Marker position={[maxPwrPt.lat!, maxPwrPt.lng!]} icon={L.divIcon({
            className: 'poi-marker-power',
            html: `<div style="background-color:#a29bfe; width:22px; height:22px; border-radius:50%; border:2px solid #fff; display:flex; align-items:center; justify-content:center; box-shadow:0 0 12px #a29bfe; font-size:12px;">⚡</div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11]
          })}>
            <LeafletTooltip direction="top" offset={[0, -11]} opacity={0.9}>
              <span>⚡ Peak power: <strong>{maxPwrPt.power}W</strong></span>
            </LeafletTooltip>
          </Marker>
        )}

        {/* POI: Max HR Marker */}
        {!ride.hasPower && maxHRPt && maxHRPt.lat != null && maxHRPt.lng != null && (
          <Marker position={[maxHRPt.lat!, maxHRPt.lng!]} icon={L.divIcon({
            className: 'poi-marker-hr',
            html: `<div style="background-color:#ff7675; width:22px; height:22px; border-radius:50%; border:2px solid #fff; display:flex; align-items:center; justify-content:center; box-shadow:0 0 12px #ff7675; font-size:12px;">❤️</div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11]
          })}>
            <LeafletTooltip direction="top" offset={[0, -11]} opacity={0.9}>
              <span>❤️ Max Heart Rate: <strong>{maxHRPt.hr} bpm</strong></span>
            </LeafletTooltip>
          </Marker>
        )}

        {/* POI: Climbs Start Markers */}
        {climbs.map((climb: any, i: number) => {
          const pt = ride.points[climb.startIndex];
          if (pt.lat == null || pt.lng == null) return null;
          return (
            <Marker key={i} position={[pt.lat!, pt.lng!]} icon={L.divIcon({
              className: 'poi-marker-climb',
              html: `<div style="background-color:#00b894; width:22px; height:22px; border-radius:50%; border:2px solid #fff; display:flex; align-items:center; justify-content:center; box-shadow:0 0 12px #00b894; font-size:11px;">⛰️</div>`,
              iconSize: [22, 22],
              iconAnchor: [11, 11]
            })}>
              <LeafletTooltip direction="top" offset={[0, -11]} opacity={0.9}>
                <span>⛰️ Climb {i + 1}: <strong>{climb.category}</strong> ({climb.lengthMeters >= 1000 ? `${(climb.lengthMeters / 1000).toFixed(1)}km` : `${climb.lengthMeters}m`} @ {climb.avgGrade}%)</span>
              </LeafletTooltip>
            </Marker>
          );
        })}

        {/* Hovered Point Marker */}
        {hoveredPoint && hoveredPoint.lat != null && hoveredPoint.lng != null && (
          <Marker position={[hoveredPoint.lat, hoveredPoint.lng]} icon={rideHoverIcon}>
            <LeafletTooltip direction="top" offset={[0, -8]} opacity={0.9} permanent>
              <div style={{ fontSize: '11px', lineHeight: '1.4', textAlign: 'left' }}>
                <strong>⏱️ {fmtDuration(Math.round((hoveredPoint.time - ride.points[0].time)/1000))}</strong><br/>
                {hoveredPoint.power != null && <span>⚡ {hoveredPoint.power}W<br/></span>}
                {hoveredPoint.hr != null && <span>❤️ {hoveredPoint.hr} bpm<br/></span>}
                {hoveredPoint.speed != null && <span>🚴 {(hoveredPoint.speed * 3.6).toFixed(1)} km/h</span>}
              </div>
            </LeafletTooltip>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
};
export { fmtDuration };
