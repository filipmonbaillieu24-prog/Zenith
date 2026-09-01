import React, { useState } from 'react';
import {
  MapPin, Compass, Sliders, Download, Search,
  ChevronRight, Wind, Mountain, Route, Layers,
  Star, Trash2, Check, Pencil, X, Coffee, ChevronDown, ChevronUp, Crown,
  Road, Leaf, Bot, Lock, CupSoda, Cookie, Zap
} from 'lucide-react';
import {
  RouteProfile, RouteType, DirectionBias,
  SurfacePreference, WindData, RouteStats, ClimbCategory, RouteOptions,
  SavedLocation
} from '../types/route';
import { searchAddress } from '../utils/routing';
import { FitnessProfile } from '../types/workout';
import { calculateFuel } from '../utils/fueling';
import { predictRouteDurationSeconds } from '@zenith/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SidebarProps {
  fitnessProfile: FitnessProfile;
  routes: { stats: RouteStats }[];
  activeRouteIndex: number;
  onSelectRoute: (idx: number) => void;
  routeType: RouteType;
  setRouteType: (type: RouteType) => void;
  onGenerate: (params: {
    type: RouteType;
    distance: number;
    direction: DirectionBias;
    options: RouteOptions;
  }) => void;
  onDownloadGPX: () => void;
  onDownloadTCX: () => void;
  startPoint: [number, number] | null;
  endPoint: [number, number] | null;
  onSetLocation: (lat: number, lng: number, type: 'start' | 'end') => void;
  isGenerating: boolean;
  windData: WindData | null;
  windSlot: string;
  setWindSlot: (slot: string) => void;
  isFetchingWind: boolean;
  maxElevationGain: number;
  setMaxElevationGain: (v: number) => void;
  savedLocations: SavedLocation[];
  onSaveLocation: (name: string, lat: number, lng: number) => void;
  onDeleteLocation: (id: string) => void;
  onRenameLocation: (id: string, name: string) => void;
  isPro?: boolean;
  onRequestProModal?: (featureName: string, desc: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const climbLabels: Record<ClimbCategory, { label: string; color: string }> = {
  flat:         { label: 'Flat',          color: '#94a3b8' },
  rolling:      { label: 'Slightly hilly', color: '#cbd5e1' },
  hilly:        { label: 'Hilly',   color: '#ff9f43' },
  mountainous:  { label: 'Mountainous',     color: '#ff3366' },
};

function formatDuration(seconds: number): string {
  const mins  = Math.round(seconds / 60);
  const h     = Math.floor(mins / 60);
  const m     = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function getWindArrow(deg: number): string {
  const blowTo = (deg + 180) % 360;
  if (blowTo >= 337.5 || blowTo <  22.5) return '↑';
  if (blowTo >=  22.5 && blowTo <  67.5) return '↗';
  if (blowTo >=  67.5 && blowTo < 112.5) return '→';
  if (blowTo >= 112.5 && blowTo < 157.5) return '↘';
  if (blowTo >= 157.5 && blowTo < 202.5) return '↓';
  if (blowTo >= 202.5 && blowTo < 247.5) return '↙';
  if (blowTo >= 247.5 && blowTo < 292.5) return '←';
  return '↖';
}

// ─── Component ────────────────────────────────────────────────────────────────

export const Sidebar: React.FC<SidebarProps> = ({
  fitnessProfile,
  routes, activeRouteIndex, onSelectRoute,
  routeType, setRouteType, onGenerate,
  onDownloadGPX, onDownloadTCX,
  startPoint, endPoint, onSetLocation,
  isGenerating, windData, windSlot, setWindSlot, isFetchingWind,
  maxElevationGain, setMaxElevationGain,
  savedLocations, onSaveLocation, onDeleteLocation, onRenameLocation,
  isPro = false, onRequestProModal,
}) => {
  // Filter state
  const [distance, setDistance]               = useState<number>(50);
  const [profile, setProfile]                 = useState<RouteProfile>('road');
  const [direction, setDirection]             = useState<DirectionBias>('wind');
  const [surfacePreference, setSurface]       = useState<SurfacePreference>('asphalt');
  const [preferCycleroutes, setCycleroutes]   = useState<boolean>(false);
  const [avoidHills, setAvoidHills]           = useState<boolean>(false);

  const [fuelPanelOpen, setFuelPanelOpen] = useState(false);

  // Address search state
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState<{ name: string; lat: number; lng: number }[]>([]);
  const [isSearching, setIsSearching]     = useState(false);

  // Save location state
  const [isSaving, setIsSaving]         = useState(false);
  const [saveNameInput, setSaveNameInput] = useState('');
  const [editingId, setEditingId]        = useState<string | null>(null);
  const [editNameInput, setEditNameInput] = useState('');

  const handleConfirmSave = () => {
    if (!startPoint) return;
    onSaveLocation(saveNameInput, startPoint[0], startPoint[1]);
    setIsSaving(false);
    setSaveNameInput('');
  };

  const handleConfirmRename = (id: string) => {
    onRenameLocation(id, editNameInput);
    setEditingId(null);
    setEditNameInput('');
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim().length < 3) return;
    setIsSearching(true);
    try {
      setSearchResults(await searchAddress(searchQuery));
    } finally {
      setIsSearching(false);
    }
  };

  const handleGenerate = () => {
    if (!isPro) {
      if (onRequestProModal) {
        onRequestProModal('AI Route Generator', 'Upgrade to Zenith Pro to generate automatic custom GPX routes with elevation and wind profiles.');
      }
      return;
    }
    onGenerate({
      type: routeType,
      distance,
      direction,
      options: { profile, surfacePreference, preferCycleroutes, avoidHills, maxElevationGain },
    });
  };

  const activeRoute = routes[activeRouteIndex];

  return (
    <aside className="sidebar">


      <div className="sidebar-content">
        {!isPro && (
          <div 
            onClick={() => onRequestProModal && onRequestProModal('AI Route Generator', 'Upgrade to Zenith Pro to generate automatic custom GPX routes with elevation and wind profiles.')}
            style={{
              background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(9, 9, 11, 0.9) 100%)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              borderRadius: '12px',
              padding: '14px',
              marginBottom: '16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', color: '#a855f7', letterSpacing: '0.8px' }}>
                ZENITH PRO FEATURE
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginTop: 2 }}>
                Route Generator is locked
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                Click here to upgrade to Pro
              </div>
            </div>
            <Crown size={22} color="#a855f7" />
          </div>
        )}

        {/* ── 1. Start Location ─────────────────────────── */}
        <section className="sidebar-section">
          <h2><MapPin className="section-icon" strokeWidth={1.6} /> 1. Start Location</h2>

          <form onSubmit={handleSearch} className="search-form">
            <input
              type="text" placeholder="Search place or address..."
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            <button type="submit" className="search-button" disabled={isSearching}>
              <Search size={16} strokeWidth={1.6} />
            </button>
          </form>

          {searchResults.length > 0 && (
            <ul className="search-results">
              {searchResults.map((res, idx) => (
                <li key={idx} onClick={() => { onSetLocation(res.lat, res.lng, 'start'); setSearchResults([]); setSearchQuery(''); }}
                  className="search-result-item">
                  <ChevronRight size={14} className="result-arrow" strokeWidth={1.6} />
                  <span>{res.name}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="location-status">
            {startPoint
              ? <p className="status-configured"><span className="dot dot-green" /> Start point placed</p>
              : <p className="status-pending">Click on the map or search a location to start.</p>
            }
            {routeType === 'point-to-point' && (
              endPoint
                ? <p className="status-configured"><span className="dot dot-red" /> Destination set</p>
                : <p className="status-pending">Click again to set destination.</p>
            )}
          </div>

          {/* Save current start point */}
          {startPoint && (
            <div className="save-location-bar">
              {isSaving ? (
                <div className="save-location-input-row">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Name (e.g. Home, Work...)"
                    value={saveNameInput}
                    onChange={(e) => setSaveNameInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmSave(); if (e.key === 'Escape') setIsSaving(false); }}
                    className="save-name-input"
                    maxLength={30}
                  />
                  <button className="icon-btn icon-btn-confirm" onClick={handleConfirmSave} title="Save">
                    <Check size={14} />
                  </button>
                  <button className="icon-btn icon-btn-cancel" onClick={() => setIsSaving(false)} title="Cancel">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button className="save-location-btn" onClick={() => setIsSaving(true)}>
                  <Star size={13} strokeWidth={1.6} />
                  Save Start Location
                </button>
              )}
            </div>
          )}

          {/* Saved Locations List */}
          {savedLocations.length > 0 && (
            <div className="saved-locations-list">
              {savedLocations.map((loc) => (
                <div key={loc.id} className="saved-location-item">
                  {editingId === loc.id ? (
                    <div className="save-location-input-row">
                      <input
                        autoFocus
                        type="text"
                        value={editNameInput}
                        onChange={(e) => setEditNameInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmRename(loc.id); if (e.key === 'Escape') setEditingId(null); }}
                        className="save-name-input"
                        maxLength={30}
                      />
                      <button className="icon-btn icon-btn-confirm" onClick={() => handleConfirmRename(loc.id)} title="Confirm">
                        <Check size={13} />
                      </button>
                      <button className="icon-btn icon-btn-cancel" onClick={() => setEditingId(null)} title="Cancel">
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        className="saved-loc-load"
                        onClick={() => onSetLocation(loc.lat, loc.lng, 'start')}
                        title={`Load: ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`}
                      >
                        <Star size={12} className="saved-loc-star" />
                        <span className="saved-loc-name">{loc.name}</span>
                      </button>
                      <div className="saved-loc-actions">
                        <button className="icon-btn" onClick={() => { setEditingId(loc.id); setEditNameInput(loc.name); }} title="Rename">
                          <Pencil size={12} strokeWidth={1.6} />
                        </button>
                        <button className="icon-btn icon-btn-danger" onClick={() => onDeleteLocation(loc.id)} title="Delete">
                          <Trash2 size={12} strokeWidth={1.6} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── 2. Route & Distance ──────────────────────── */}
        <section className="sidebar-section">
          <h2><Sliders className="section-icon" strokeWidth={1.6} /> 2. Route Type & Distance</h2>

          <div className="tab-container">
            <button className={`tab-button ${routeType === 'loop' ? 'active' : ''}`} onClick={() => setRouteType('loop')}>
              Loop Route
            </button>
            <button className={`tab-button ${routeType === 'point-to-point' ? 'active' : ''}`} onClick={() => setRouteType('point-to-point')}>
              Point A to B
            </button>
          </div>

          <div className="form-group">
            <label>Ride Type</label>
            <select value={profile} onChange={(e) => setProfile(e.target.value as RouteProfile)} className="select-input">
              <option value="road">Road Bike (Asphalt)</option>
              <option value="gravel">Gravel Bike (Mix)</option>
              <option value="trekking">Recreational (Trekking)</option>
              <option value="mtb">Mountain Bike (Off-road)</option>
            </select>
          </div>

          <div className="form-group">
            <div className="label-with-value">
              <label>Distance</label>
              <span className="value-display">{distance} km</span>
            </div>
            <input type="range" min="10" max="200" step="5" value={distance}
              onChange={(e) => setDistance(parseInt(e.target.value))} className="range-input" />
          </div>

          {routeType === 'loop' && (
            <div className="form-group">
              <label>Direction / Loop Orientation</label>
              <select value={direction} onChange={(e) => setDirection(e.target.value as DirectionBias)} className="select-input">
                <option value="wind">Wind-optimal (Headwind out)</option>
                <option value="random">Random</option>
                <option value="N">North (N)</option>
                <option value="E">East (E)</option>
                <option value="S">South (S)</option>
                <option value="W">West (W)</option>
              </select>
            </div>
          )}
        </section>

        {/* ── 3. Route Optimization ───────────────────── */}
        <section className="sidebar-section">
          <h2><Layers className="section-icon" strokeWidth={1.6} /> 3. Route Optimization</h2>

          {/* Surface preference */}
          <div className="form-group">
            <label>Surface</label>
            <div className="surface-toggle">
              {(['asphalt', 'mixed', 'unpaved'] as SurfacePreference[]).map((s) => (
                <button
                  key={s}
                  className={`surface-btn ${surfacePreference === s ? 'active' : ''}`}
                  onClick={() => setSurface(s)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                >
                  {s === 'asphalt' ? <Road size={13} strokeWidth={1.8} /> : s === 'mixed' ? <Leaf size={13} strokeWidth={1.8} /> : <Mountain size={13} strokeWidth={1.8} />}
                  {s === 'asphalt' ? 'Asphalt only' : s === 'mixed' ? 'Mix' : 'Unpaved OK'}
                </button>
              ))}
            </div>
          </div>

          {/* Prefer cycle routes */}
          <div className="form-group">
            <div className="toggle-row">
              <div className="toggle-info">
                <Route size={15} className="toggle-icon" strokeWidth={1.6} />
                <div>
                  <span className="toggle-label">Cycling routes & junctions</span>
                  <span className="toggle-desc">Follow official cycling networks</span>
                </div>
              </div>
              <button
                className={`toggle-switch ${preferCycleroutes ? 'on' : ''}`}
                onClick={() => setCycleroutes(!preferCycleroutes)}
                aria-label="Cycle routes on/off"
              >
                <span className="toggle-thumb" />
              </button>
            </div>
          </div>

          {/* Avoid hills */}
          <div className="form-group">
            <div className="toggle-row">
              <div className="toggle-info">
                <Mountain size={15} className="toggle-icon" strokeWidth={1.6} />
                <div>
                  <span className="toggle-label">Avoid steep hills</span>
                  <span className="toggle-desc">Higher hill cost penalty</span>
                </div>
              </div>
              <button
                className={`toggle-switch ${avoidHills ? 'on' : ''}`}
                onClick={() => setAvoidHills(!avoidHills)}
                aria-label="Avoid steep hills on/off"
              >
                <span className="toggle-thumb" />
              </button>
            </div>
          </div>

          {/* Max elevation gain */}
          <div className="form-group">
            <div className="label-with-value">
              <label>Max Elevation (m)</label>
              <span className="value-display">
                {maxElevationGain === 0 ? 'No limit' : `${maxElevationGain} m`}
              </span>
            </div>
            <input
              type="range" min="0" max="3000" step="50"
              value={maxElevationGain}
              onChange={(e) => setMaxElevationGain(parseInt(e.target.value))}
              className="range-input"
            />
          </div>
        </section>

        {/* ── 4. Wind Planner ──────────────────────────── */}
        {startPoint && (
          <section className="sidebar-section animate-fade-in">
            <h2><Wind className="section-icon" strokeWidth={1.6} /> 4. Wind Planner</h2>

            <div className="form-group">
              <label>Ride Departure Time</label>
              <select value={windSlot} onChange={(e) => setWindSlot(e.target.value)}
                className="select-input" disabled={isFetchingWind}>
                <option value="now">Now (Current Wind)</option>
                <option value="today_afternoon">Today Afternoon (14:00)</option>
                <option value="today_evening">Today Evening (19:00)</option>
                <option value="tomorrow_morning">Tomorrow Morning (09:00)</option>
                <option value="tomorrow_afternoon">Tomorrow Afternoon (14:00)</option>
                <option value="day_after_tomorrow_morning">Day After Tomorrow Morning (09:00)</option>
                <option value="day_after_tomorrow_afternoon">Day After Tomorrow Afternoon (14:00)</option>
              </select>
            </div>

            {isFetchingWind ? (
              <p className="wind-loading">Loading wind data...</p>
            ) : windData ? (
              <div className="wind-report-card">
                <div className="wind-icon-box">
                  <Wind size={20} className="wind-glow" strokeWidth={1.6} />
                  <span className="wind-direction-arrow">{getWindArrow(windData.direction)}</span>
                </div>
                <div className="wind-text-box">
                  <h4>{windData.speed} km/h</h4>
                  <p>wind from {windData.cardinal} ({windData.direction}°)</p>
                </div>
              </div>
            ) : (
              <p className="wind-error">Could not load wind data.</p>
            )}
          </section>
        )}

        {/* Generate Button */}
        <button
          onClick={() => {
            if (!isPro && onRequestProModal) {
              onRequestProModal('AI Route Generator', 'Upgrade to Zenith Pro to generate automatic custom GPX routes with elevation and wind profiles.');
              return;
            }
            handleGenerate();
          }}
          className="generate-button"
          disabled={isGenerating || !startPoint || (routeType === 'point-to-point' && !endPoint)}
          style={{ position: 'relative' }}
        >
          {isGenerating ? 'Route Generating...' : 'Generate Route'}
          {!isPro && (
            <span style={{ 
              position: 'absolute', right: 12, top: 12, 
              background: 'linear-gradient(135deg, #cbd5e1 0%, #64748b 100%)', 
              color: '#09090b', fontSize: 9, fontWeight: 900, 
              padding: '2px 6px', borderRadius: 4 
            }}>
              PRO
            </span>
          )}
        </button>

        {/* ── 5. Route Alternatives ───────────────────── */}
        {routes.length > 0 && (
          <section className="sidebar-section alternatives-section animate-fade-in">
            <h2><Compass className="section-icon" strokeWidth={1.6} /> 5. Choose Route</h2>

            <div className="alternatives-list">
              {routes.map((rt, idx) => {
                const isActive      = idx === activeRouteIndex;
                const climb         = climbLabels[rt.stats.climbCategory];
                const overLimit     = maxElevationGain > 0 && rt.stats.elevationGain > maxElevationGain;
                const hasBacktrack  = rt.stats.hasBacktrack;

                return (
                  <div key={idx} onClick={() => onSelectRoute(idx)}
                    className={`alternative-card ${isActive ? 'active' : ''} ${overLimit ? 'over-limit' : ''}`}>
                    <div className="alt-card-header">
                      <h3>Route {idx + 1}</h3>
                      <div className="alt-card-badges">
                        {overLimit    && <span className="badge badge-warn">↑ Limit</span>}
                        {hasBacktrack && <span className="badge badge-backtrack" title="Route may contain back-and-forth segments">↩ Backtrack</span>}
                        <span className="badge" style={{ color: climb.color, borderColor: climb.color }}>
                          {climb.label}
                        </span>
                      </div>
                    </div>

                    <div className="alt-card-stats">
                      <span>{rt.stats.distance} km</span>
                      <span>{rt.stats.elevationGain} m ↑</span>
                      <span>max {rt.stats.maxGradient}%</span>
                      {(() => {
                        // Wind was computed here and handed to a route-duration model that was
                        // saturated regardless of it. The replacement predicts speed from the
                        // rider's own watts per kilogram and the route's climbing, and does not
                        // claim to model wind at all.
                        const aiDur = predictRouteDurationSeconds(
                          rt.stats.distance,
                          rt.stats.elevationGain,
                          fitnessProfile.ftp ?? 220,
                          fitnessProfile.weight ?? 75
                        );
                        return (
                          <span style={{ color: '#cbd5e1', display: 'inline-flex', alignItems: 'center', gap: 3 }} title="AI Estimated Ride Duration (incl. wind effect)">
                            <Bot size={12} strokeWidth={1.8} /> {formatDuration(aiDur)}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>

            {activeRoute && (
              <div className="download-container">
                <button 
                  onClick={() => {
                    if (!isPro && onRequestProModal) {
                      onRequestProModal('GPX Route Export', 'Upgrade to Zenith Pro to download GPX and TCX files for your bike computer (Garmin, Wahoo).');
                      return;
                    }
                    onDownloadGPX();
                  }} 
                  className="download-button gpx"
                >
                  <Download size={16} strokeWidth={1.6} /> GPX Download {!isPro && <Lock size={12} strokeWidth={1.8} />}
                </button>
                <button 
                  onClick={() => {
                    if (!isPro && onRequestProModal) {
                      onRequestProModal('TCX Route Export', 'Upgrade to Zenith Pro to download GPX and TCX files for your bike computer (Garmin, Wahoo).');
                      return;
                    }
                    onDownloadTCX();
                  }} 
                  className="download-button tcx"
                >
                  <Download size={16} strokeWidth={1.6} /> TCX Download {!isPro && <Lock size={12} strokeWidth={1.8} />}
                </button>
              </div>
            )}

            {activeRoute && (() => {
              // Wind was computed here and handed to a route-duration model that was
              // saturated regardless of it. The replacement predicts speed from the
              // rider's own watts per kilogram and the route's climbing, and does not
              // claim to model wind at all.
              const activeAIDurationSec = predictRouteDurationSeconds(
                activeRoute.stats.distance,
                activeRoute.stats.elevationGain,
                fitnessProfile.ftp ?? 220,
                fitnessProfile.weight ?? 75
              );
              const fuelPlan = calculateFuel(
                activeAIDurationSec,
                2, // Zone 2 (Endurance ride)
                fitnessProfile.weight ?? 75,
                fitnessProfile.ftp ?? 220,
                20
              );
              return (
                <div className="fuel-plan-panel" style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12 }}>
                  <button
                    className="fuel-plan-toggle"
                    onClick={() => setFuelPanelOpen(!fuelPanelOpen)}
                    style={{
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      color: '#cbd5e1',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: '4px 0'
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Coffee size={14} strokeWidth={1.6} /> Fuel & Nutrition Plan (AI Estimate)
                    </span>
                    {fuelPanelOpen ? <ChevronUp size={14} strokeWidth={1.6} /> : <ChevronDown size={14} strokeWidth={1.6} />}
                  </button>
                  
                  {fuelPanelOpen && (
                    <div className="fuel-plan-details" style={{ marginTop: 8, background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, color: '#cbd5e1' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Estimated energy consumption:</span>
                        <strong style={{ color: '#f8fafc' }}>{fuelPlan.totalCalories} kcal</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Carbohydrate needs:</span>
                        <strong style={{ color: '#cbd5e1' }}>{fuelPlan.totalCarbs}g ({fuelPlan.carbsPerHour}g/h)</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Fluid needs:</span>
                        <strong style={{ color: '#cbd5e1' }}>{(fuelPlan.totalFluid / 1000).toFixed(1)}L ({fuelPlan.fluidPerHour}ml/h)</strong>
                      </div>
                      {fuelPlan.totalSodium > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Sodium needs:</span>
                          <strong style={{ color: '#ff9f43' }}>{fuelPlan.totalSodium} mg ({fuelPlan.sodiumPerHour}mg/h)</strong>
                        </div>
                      )}

                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', marginTop: 4, paddingTop: 8 }}>
                        <span style={{ fontWeight: 700, color: '#f8fafc', display: 'block', marginBottom: 6 }}>Intake Shopping List:</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><CupSoda size={12} strokeWidth={1.8} /> Sports Drink Bottles (500ml):</span>
                            <strong>{fuelPlan.bottles}x</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Cookie size={12} strokeWidth={1.8} /> Energy Bars:</span>
                            <strong>{fuelPlan.bars}x</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Zap size={12} strokeWidth={1.8} /> Energy Gels:</span>
                            <strong>{fuelPlan.gels}x</strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </section>
        )}
      </div>
    </aside>
  );
};
