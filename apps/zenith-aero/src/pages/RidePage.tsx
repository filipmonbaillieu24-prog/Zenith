import React, { useEffect, useState, useCallback } from 'react';
import '../workout.css';
import { getRide, updateRideMeta, getAllGear } from '../utils/db';
import { Ride, EFFORT_DURATIONS, POWER_ZONES, HR_ZONES, FitnessProfile, RidePoint, RIDE_LABELS, RideLabel, Gear, NeuralAnalysis } from '../types/workout';
import { estimateLTHR, estimatedMaxHR, getWeightForDate } from '../utils/rideMetrics';
import { recoveryAdvice } from '../utils/pmc';
import { fetchRideWeather, weatherIcon, windDirLabel, type RideWeather } from '../utils/weather';
import { MapContainer, TileLayer, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Coffee, Brain } from 'lucide-react';
import { calculateFuel } from '../utils/fueling';
import { analyzeNotesLocally, trainOnCorrection, predictRideLabel, trainLabelModel } from '../utils/localNeuralNet';
import { predictRideRpe, predictCadence } from '@zenith/shared';

// Import extracted modular components
import { StatCard } from '../components/workout/StatCard';
import { ZoneBreakdown } from '../components/workout/ZoneBreakdown';
import { PowerCurve } from '../components/workout/PowerCurve';
import { TimelineChart } from '../components/workout/TimelineChart';
import { PowerHistogram } from '../components/workout/PowerHistogram';
import { ClimbsSection } from '../components/workout/ClimbsSection';
import { SplitAnalysis } from '../components/workout/SplitAnalysis';
import { GradientMap, MapBoundsUpdater } from '../components/workout/GradientMap';
import { CompareOverlay } from '../components/workout/CompareOverlay';

interface Props {
  rideId:         string;
  onBack:         () => void;
  profile:        FitnessProfile;
  compareRideId?: string;
  onChange?:      () => void;
}

function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatRideDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}


// ─── Main page ─────────────────────────────────────────────

const RidePage: React.FC<Props> = ({ rideId, onBack, profile, compareRideId, onChange }) => {
  const [ride,        setRide]        = useState<Ride | null>(null);
  const [compareRide, setCompareRide] = useState<Ride | null>(null);
  const [weather,     setWeather]     = useState<RideWeather | null>(null);
  const [notes,       setNotes]       = useState('');
  const [label,       setLabel]       = useState<RideLabel | undefined>(undefined);
  const [rpe,         setRpe]         = useState<number | undefined>(undefined);
  const [hoveredPoint, setHoveredPoint] = useState<RidePoint | null>(null);
  const [gears,       setGears]       = useState<Gear[]>([]);
  const [selectedGearId, setSelectedGearId] = useState<string | undefined>(undefined);
  const [activeDetailTab, setActiveDetailTab] = useState<'summary' | 'zones' | 'charts'>('summary');

  const [aiScores, setAiScores] = useState<NeuralAnalysis | null>(null);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [customFatigue, setCustomFatigue] = useState(0.5);
  const [customRecovery, setCustomRecovery] = useState(0.5);
  const [customIllness, setCustomIllness] = useState(0.0);
  const [showSuccessMsg, setShowSuccessMsg] = useState(false);

  useEffect(() => {
    if (ride && ride.aiAnalysis && notes === (ride.notes ?? '')) {
      setAiScores(ride.aiAnalysis);
    } else {
      setAiScores(analyzeNotesLocally(notes));
    }
  }, [notes, ride]);


  const [aiPredictedRpe, setAiPredictedRpe] = useState<number | null>(null);
  const [aiPredictedLabel, setAiPredictedLabel] = useState<RideLabel | null>(null);

  useEffect(() => {
    getRide(rideId).then(r => {
      if (!r) return;
      setRide(r);
      setNotes(r.notes ?? '');
      setLabel(r.label);
      setRpe(r.rpe);
      setSelectedGearId(r.gearId);

      // Perform offline AI predictions if values are missing
      const vi = (r.normPower && r.avgPower) ? (r.normPower / r.avgPower) : 1.0;
      const ifVal = (r.normPower ?? r.avgPower ?? 0) / (profile.ftp ?? 220);

      if (r.rpe === undefined) {
        // Intensity and duration, which is what session RPE is built from. The old
        // model took six inputs and returned 9 or 10 for every ride it ever saw.
        const predRpe = predictRideRpe(ifVal, r.duration);
        setAiPredictedRpe(predRpe);
      } else {
        setAiPredictedRpe(null);
      }

      if (r.label === undefined) {
        const predLabel = predictRideLabel(ifVal, vi, r.duration, r.elevGain, r.hasPower, r.avgHR ?? 0);
        setAiPredictedLabel(predLabel as RideLabel);
      } else {
        setAiPredictedLabel(null);
      }
    });
    getAllGear().then(setGears);
  }, [rideId, profile.ftp]);

  // Load comparison ride when compareRideId changes
  useEffect(() => {
    if (!compareRideId) { setCompareRide(null); return; }
    getRide(compareRideId).then(r => setCompareRide(r ?? null));
  }, [compareRideId]);

  // The cadence model used to be trained here on every ride view, from the ride's own
  // average cadence - teaching it to predict what the rider already does, which is a
  // definition rather than a prediction. It is now a stated reference (cadence rises
  // modestly with watts per kilogram) and this loop has nothing useful to add to it.

  // Auto-save notes after 1s of inactivity
  const saveNotes = useCallback((val: string) => {
    setNotes(val);
    updateRideMeta(rideId, { notes: val || undefined }).then(() => {
      onChange?.();
    });
  }, [rideId, onChange]);

  const saveLabel = useCallback((val: RideLabel | undefined) => {
    setLabel(val);
    updateRideMeta(rideId, { label: val }).then(() => {
      onChange?.();
    });

    if (val && ride) {
      const vi = (ride.normPower && ride.avgPower) ? (ride.normPower / ride.avgPower) : 1.0;
      const ifVal = (ride.normPower ?? ride.avgPower ?? 0) / (profile.ftp ?? 220);
      trainLabelModel(ifVal, vi, ride.duration, ride.elevGain, ride.hasPower, ride.avgHR ?? 0, val);
      setAiPredictedLabel(null);
    }
  }, [rideId, ride, profile.ftp, onChange]);

  const saveGearId = useCallback((val: string | undefined) => {
    setSelectedGearId(val);
    updateRideMeta(rideId, { gearId: val }).then(() => {
      // Update local ride state so the calculation displays it immediately
      setRide(prev => prev ? { ...prev, gearId: val } : null);
      onChange?.();
    });
  }, [rideId, onChange]);

  const saveRpe = useCallback((val: number | undefined) => {
    setRpe(val);
    updateRideMeta(rideId, { rpe: val }).then(() => {
      setRide(prev => prev ? { ...prev, rpe: val } : null);
      onChange?.();
    });

    // Once the athlete has given their own RPE, the estimate steps aside.
    if (val && ride) setAiPredictedRpe(null);
  }, [rideId, ride, profile.ftp, onChange]);

  // Fetch historical weather lazily (free API, no key needed)
  useEffect(() => {
    if (!ride) return;
    const gps = ride.points.find(p => p.lat != null && p.lng != null);
    if (!gps) return;
    fetchRideWeather(gps.lat!, gps.lng!, ride.date).then(w => {
      if (w) setWeather(w);
    });
  }, [ride?.id]);

  const profileAge = profile.birthDate
    ? Math.floor((Date.now() - new Date(profile.birthDate).getTime()) / (365.25 * 24 * 3600 * 1000))
    : undefined;

  const ftp   = profile.ftp  ?? ride?.eFTP;
  const lthr  = profile.lthr ?? (ride?.hasHR ? estimateLTHR(ride.points) : undefined);
  const maxHR = profile.maxHR ?? (profileAge ? estimatedMaxHR(profileAge) : undefined);



  // ── Polar-style Training Effect & Coach ride summary ────────────────────
  const trainingBenefit = React.useMemo(() => {
    try {
      if (!ride) return null;

      const durationMins = ride.duration / 60;
      const hasPower = ride.hasPower;
      const hasHR = ride.hasHR;
      
      // Determine intensity factor or estimated severity
      const intensity = ride.intensityFactor ?? (ride.avgHR && maxHR ? (ride.avgHR / maxHR) : 0.65);
      const activeCategory = label ?? aiPredictedLabel;
      const activeRpe = rpe ?? aiPredictedRpe;

      let title = "Endurance Training";
      let desc = "A relaxed ride that helps strengthen your aerobic base system and stimulate fat oxidation.";
      let category = "Aerobic Fitness";
      let color = "#38bdf8"; // Cyan

      // Prioritize activeCategory (user selected or AI predicted)
      if (activeCategory === 'herstel' || (activeRpe != null && activeRpe <= 3 && activeCategory !== 'interval' && activeCategory !== 'wedstrijd')) {
        title = "Active Recovery";
        desc = "Light recovery ride. Perfect to clear waste products from your muscles and promote active recovery without building extra fatigue.";
        category = "Recovery";
        color = "#a29bfe"; // Lilac
      } else if (activeCategory === 'berg') {
        title = "Climbing Workout";
        desc = "Targeted training on hills. Perfect for improving climbing strength and endurance.";
        category = "Climbing Power";
        color = "#fd79a8"; // Pink
      } else if (activeCategory === 'interval') {
        title = "Interval Training";
        desc = "Intense intervals with variable paces. Ideal for increasing max oxygen uptake (VO2max) and anaerobic capacity.";
        category = "Interval / VO2max";
        color = "#a29bfe"; // Lilac
      } else if (activeCategory === 'wedstrijd') {
        title = "Race / Intensive";
        desc = "Very intensive ride or race simulation at or above threshold. Causes deep fatigue and trains maximal effort.";
        category = "Race";
        color = "#ff7675"; // Red
      } else if (activeCategory === 'groepsride') {
        title = "Group Ride";
        desc = "Riding in a peloton or group. Great for training drafting, bike handling, and changing paces.";
        category = "Endurance";
        color = "#00b894"; // Green
      } else if (activeCategory === 'pendel') {
        title = "Commute Ride / Commuting";
        desc = "Commuting ride. Useful for building weekly training volume and baseline fitness.";
        category = "Base Fitness";
        color = "#ffeaa7"; // Yellow
      } else {
        // Fallback to intensity & duration (classical zones)
        if (durationMins < 45) {
          if (intensity < 0.60) {
            title = "Active Recovery";
            desc = "Short, very light ride. Perfect to flush muscles and promote recovery after heavy efforts.";
            category = "Recovery";
            color = "#a29bfe";
          } else {
            title = "Short Quality Stimulus";
            desc = "A short ride with some intensity. Great to wake up the legs without building deep fatigue.";
            category = "Tempo";
            color = "#fdcb6e";
          }
        } else {
          if (intensity >= 0.85) {
            title = "Threshold Training (FTP)";
            desc = "Very heavy training around your anaerobic threshold. This increases your ability to sustain a high pace.";
            category = "Threshold / FTP";
            color = "#ff7675";
          } else if (intensity >= 0.75) {
            title = "Tempo & Pacework";
            desc = "A solid tempo ride. This trains your ability to maintain pressure on the pedals for extended periods and improves aerobic endurance.";
            category = "Tempo";
            color = "#fdcb6e";
          } else {
            title = "Endurance Training (Fat Oxidation)";
            desc = "A classic endurance ride. Improves muscular efficiency and promotes fat oxidation for long distances.";
            category = "Endurance";
            color = "#00b894";
          }
        }
      }

      const points: string[] = [];
      if (hasHR && ride.decoupling != null) {
        const dec = ride.decoupling;
        if (Math.abs(dec) <= 5) {
          points.push(`Your heart rate remained very stable throughout the ride (drift of only ${dec.toFixed(1)}%). This shows an excellent aerobic base.`);
        } else if (dec > 5) {
          points.push(`Your heart rate rose by ${dec.toFixed(1)}% in the second half of the ride at equal intensity. Indicates cardiac drift. accumulating aerobic fatigue.`);
        } else if (dec < -5) {
          points.push(`Your heart rate dropped by ${Math.abs(dec).toFixed(1)}% in the second half of the ride, reflecting reduced intensity.`);
        }
      }

      if (hasPower && (ride as any).variabilityIndex) {
        const vi = (ride as any).variabilityIndex;
        if (vi < 1.05) {
          points.push(`With a Variability Index of ${vi} you paced extremely steadily. Ideal for efficient energy expenditure.`);
        } else if (vi > 1.10) {
          points.push(`Your power output was highly variable (VI: ${vi}). Indicates surges or hilly terrain, putting extra stress on your muscles.`);
        }
      }

      if (hasHR && (ride as any).hrRecovery60) {
        const hrr = (ride as any).hrRecovery60;
        if (hrr >= 30) {
          points.push(`Your heart rate recovered by an impressive ${hrr} bpm in the first minute after your peak. Sign of strong cardiovascular recovery.`);
        }
      }

      return { title, desc, category, color, points };
    } catch (e) {
      console.error("Error calculating training benefit:", e);
      return null;
    }
  }, [ride, maxHR, label, rpe, aiPredictedLabel, aiPredictedRpe]);

  if (!ride) return <div className="rp-loading"><span className="wd-spinner" /> Loading ride…</div>;

  const gpsPts      = ride.points.filter(p => p.lat != null && p.lng != null);
  const mapPositions: [number, number][] = gpsPts.map(p => [p.lat!, p.lng!]);
  const mapCenter: [number, number]      = gpsPts.length > 0
    ? [gpsPts[Math.floor(gpsPts.length / 2)].lat!, gpsPts[Math.floor(gpsPts.length / 2)].lng!]
    : [51.0, 4.5];

  const tss     = ride.tss ?? ride.hrTSS ?? 0;
  const recover = tss > 0 ? recoveryAdvice(tss) : null;

  return (
    <div className="rp-root">
      {/* Header */}
      <div className="rp-header">
        <button className="rp-back-btn" onClick={onBack}>← Back</button>
        <div>
          <h2>{ride.name}</h2>
          <p className="rp-date">{fmtDate(ride.date)}</p>
        </div>
        <div className="rp-header-badges">
          {label && (() => {
            const l = RIDE_LABELS.find(x => x.key === label);
            return l ? (
              <span className="badge" style={{ background: l.color + '22', color: l.color, border: `1px solid ${l.color}55` }}>
                {l.icon} {l.label}
              </span>
            ) : null;
          })()}
          {ride.hasPower && <span className="badge badge--power">⚡ Power</span>}
          {ride.hasHR    && <span className="badge badge--hr">❤️ HR</span>}
          {!ride.hasPower && !ride.hasHR && <span className="badge badge--gps">📍 GPS</span>}
          {recover && (
            <span className="badge" style={{ background: `${recover.color}22`, color: recover.color, border: `1px solid ${recover.color}55` }}>
              😴 Recovery {recover.hours}
            </span>
          )}
        </div>
      </div>

      {/* Full-screen Background Map */}
      <div className="rp-map-bg-container">
        {gpsPts.length > 10 ? (
          <GradientMap ride={ride} weight={getWeightForDate(profile, ride.date)} hoveredPoint={hoveredPoint} />
        ) : mapPositions.length > 2 && (
          <div className="rp-map-wrap rp-map-wrap--bg">
            <MapContainer center={mapCenter} zoom={12} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution="© OpenStreetMap © CARTO" />
              <MapBoundsUpdater positions={mapPositions} />
              <Polyline positions={mapPositions} color="#94a3b8" weight={3} opacity={0.85} />
            </MapContainer>
          </div>
        )}
      </div>

      {/* Floating HUD Dashboard Overlays Body */}
      <div className="rp-body rp-body--floating">
        {/* Column 1: Statistics & Info */}
        <div className="rp-panel-left">
          <div className="rp-stats-grid">
            <StatCard label="Distance"      value={ride.distance}         unit="km"   typeClass="rp-stat-card--gps" />
            <StatCard label="Time"         value={formatRideDuration(ride.duration)}         typeClass="rp-stat-card--gps" />
            <StatCard label="Elevation Gain" value={ride.elevGain}         unit="m"    typeClass="rp-stat-card--gps" />
            <StatCard label="Avg. Speed" value={ride.avgSpeed}        unit="km/h" typeClass="rp-stat-card--gps" />
            {ride.calories    && <StatCard label="Calories"     value={ride.calories}    unit="kcal" color="#fdcb6e"
              sub={ride.hasPower ? (ride.isEstimatedPower ? 'HR estimate (Keytel)' : 'Power measurement') : ride.hasHR ? 'HR estimate (Keytel)' : 'MET estimate'} />}
            {ride.avgPower    && <StatCard label="Avg. Power" value={ride.avgPower}    unit="W"    color="#a29bfe" typeClass="rp-stat-card--power"
              sub={ride.isEstimatedPower ? 'Calculated (Physics/HR)' : undefined} />}
            {ride.normPower   && <StatCard label="NP"            value={ride.normPower}   unit="W"    color="var(--color-primary,#cbd5e1)" typeClass="rp-stat-card--power"
              sub={ride.isEstimatedPower ? 'Calculated NP' : (ftp ? `IF ${ride.intensityFactor?.toFixed(2)}` : undefined)} />}
            {ride.tss         && <StatCard label="TSS"           value={ride.tss}                     color="#ff7675" typeClass="rp-stat-card--power"
              sub={ride.isEstimatedPower ? 'Calculated TSS' : recover?.tip} />}
            {ride.eFTP        && <StatCard label="eFTP"          value={ride.eFTP}        unit="W"    color="var(--color-primary,#cbd5e1)" typeClass="rp-stat-card--power"
              sub={ride.isEstimatedPower ? 'Calculated eFTP' : (profile.weight ? `${(ride.eFTP / profile.weight).toFixed(1)} W/kg` : undefined)} />}
            {ride.avgHR       && <StatCard label="Avg. Heart Rate" value={ride.avgHR}       unit="bpm"  color="#ff7675" typeClass="rp-stat-card--hr" />}
            {ride.maxHR       && <StatCard label="Max Heart Rate"  value={ride.maxHR}       unit="bpm"  typeClass="rp-stat-card--hr"
              sub={maxHR ? `${Math.round((ride.maxHR / maxHR) * 100)}% max HR` : undefined} />}
            {ride.hrTSS       && <StatCard label="hrTSS"         value={ride.hrTSS}                   color="#ff7675" typeClass="rp-stat-card--hr"
              sub={recover?.tip} />}
            {ride.efficiencyFactor && <StatCard label="Efficiency Factor" value={ride.efficiencyFactor}
              sub={ride.hasPower ? 'NP/HR' : 'Speed/HR'} color="var(--color-accent,#39ff14)" />}
            {ride.decoupling != null && (
              <StatCard label="Cardiac drift" value={`${ride.decoupling}%`}
                color={Math.abs(ride.decoupling) < 5 ? '#00b894' : '#fdcb6e'} typeClass="rp-stat-card--hr"
                sub={Math.abs(ride.decoupling) < 5 ? 'Good aerobic base' : 'Light fatigue'} />
            )}
            {ride.vam              && <StatCard label="VAM"             value={ride.vam}              unit="m/h" sub="Climb speed" typeClass="rp-stat-card--gps" />}
            {ride.avgCadence       && <StatCard label="Avg. Cadence"     value={ride.avgCadence}       unit="rpm" typeClass="rp-stat-card--power" sub={(() => {
              // Needs a weight: cadence advice scales with watts per kilogram, and the
              // old model gave 96 rpm to a rider at 100 W because it had neither.
              const rpm = predictCadence(ride.avgPower ?? 0, getWeightForDate(profile, ride.date) ?? 0);
              return rpm === null ? undefined : `Typical at this power: ${rpm} rpm`;
            })()} />}
            {(ride as any).variabilityIndex && <StatCard
              label="Variability Index"
              value={(ride as any).variabilityIndex}
              color={(ride as any).variabilityIndex < 1.05 ? '#00b894' : (ride as any).variabilityIndex < 1.10 ? '#fdcb6e' : '#ff7675'}
              sub={(ride as any).variabilityIndex < 1.05 ? 'Consistently paced' : 'Variable power'}
              typeClass="rp-stat-card--power"
            />}
            {(ride as any).hrRecovery60 && <StatCard
              label="HR Recovery (60s)"
              value={`-${(ride as any).hrRecovery60} bpm`}
              color={(ride as any).hrRecovery60 >= 30 ? '#55efc4' : (ride as any).hrRecovery60 >= 20 ? '#00b894' : '#fdcb6e'}
              sub={(ride as any).hrRecovery60 >= 30 ? 'Excellent' : (ride as any).hrRecovery60 >= 20 ? 'Good' : 'Fair'}
              typeClass="rp-stat-card--hr"
            />}
            {weather && <>
              <StatCard
                label={`${weatherIcon(weather.weatherCode)} Weather`}
                value={`${weather.tempC}°C`}
                sub={weather.description}
                color="var(--color-primary,#cbd5e1)"
              />
              <StatCard
                label="💨 Wind"
                value={`${weather.windKmh} km/h`}
                sub={windDirLabel(weather.windDir)}
                color={weather.windKmh > 30 ? '#fdcb6e' : undefined}
              />
              {weather.precipitation > 0 && (
                <StatCard
                  label="🌧️ Precipitation"
                  value={`${weather.precipitation} mm`}
                  color="#74b9ff"
                />
              )}
            </>}
          </div>

          {/* Label + Notes */}
          <div className="rp-witha-card">
            <div className="rp-witha-card__row">
              <span className="rp-witha-card__label">Category</span>
              <div className="rp-label-picker">
                {RIDE_LABELS.map(l => {
                  const isPredicted = label === undefined && aiPredictedLabel === l.key;
                  return (
                    <button
                      key={l.key}
                      className={`rp-label-btn ${label === l.key ? 'rp-label-btn--active' : ''}`}
                      style={
                        label === l.key 
                          ? { background: l.color + '25', borderColor: l.color, color: l.color } 
                          : isPredicted 
                            ? { border: '1px dashed #cbd5e1', boxShadow: '0 0 8px rgba(203, 213, 225, 0.2)', color: '#cbd5e1', background: 'rgba(203, 213, 225, 0.03)' } 
                            : {}
                      }
                      onClick={() => saveLabel(label === l.key ? undefined : l.key)}
                      title={isPredicted ? `${l.label} (AI Suggestion - Click to accept)` : l.label}
                    >
                      {l.icon} {l.label} {isPredicted && ' 🤖'}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="rp-witha-card__row" style={{ marginTop: 10 }}>
              <span className="rp-witha-card__label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Effort (RPE)</span>
                {rpe != null ? (
                  <span style={{ fontSize: 10, fontWeight: 800, color: rpe <= 3 ? '#00b894' : rpe <= 6 ? '#fdcb6e' : rpe <= 8 ? '#ff7675' : '#d63031' }}>
                    {rpe}/10 ({
                      rpe <= 3 ? 'Very light' :
                      rpe <= 6 ? 'Moderate / Brisk' :
                      rpe <= 8 ? 'Heavy' : 'Maximum'
                    })
                  </span>
                ) : aiPredictedRpe != null ? (
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#cbd5e1' }}>
                    Estimate: {aiPredictedRpe}/10 🤖
                  </span>
                ) : null}
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 3, marginTop: 6 }}>
                {[1,2,3,4,5,6,7,8,9,10].map(n => {
                  const isPredicted = rpe === undefined && aiPredictedRpe === n;
                  return (
                    <button
                      key={n}
                      onClick={() => saveRpe(rpe === n ? undefined : n)}
                      style={{
                        padding: '6px 0',
                        borderRadius: 6,
                        border: isPredicted ? '1px dashed #cbd5e1' : 'none',
                        boxShadow: isPredicted ? '0 0 6px rgba(203, 213, 225, 0.15)' : 'none',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        background: rpe === n
                          ? n <= 3 ? '#00b894' : n <= 6 ? '#fdcb6e' : n <= 8 ? '#ff7675' : '#d63031'
                          : 'rgba(255,255,255,0.03)',
                        color: rpe === n ? '#09090b' : isPredicted ? '#cbd5e1' : '#cbd5e1',
                        fontSize: 10,
                        fontWeight: 800,
                        transition: 'all 0.15s',
                      }}
                      title={isPredicted ? `AI Estimate: ${n}/10 (Click to accept)` : undefined}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              {rpe === undefined && aiPredictedRpe != null && (
                <div 
                  onClick={() => saveRpe(aiPredictedRpe)}
                  style={{ 
                    marginTop: 8, 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 6, 
                    color: '#cbd5e1', 
                    fontSize: 10, 
                    cursor: 'pointer',
                    padding: '6px 8px',
                    background: 'rgba(203, 213, 225, 0.03)',
                    border: '1px solid rgba(203, 213, 225, 0.08)',
                    borderRadius: 6,
                    width: 'fit-content'
                  }}
                >
                  <Brain size={12} />
                  <span>AI suggests <strong>{aiPredictedRpe}/10</strong> proposed. Click here to accept.</span>
                </div>
              )}
            </div>
            <div className="rp-witha-card__row" style={{ marginTop: 10 }}>
              <span className="rp-witha-card__label">Bike / Gear</span>
              <select
                className="select-input"
                style={{ width: '100%', padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', color: '#f8fafc', borderRadius: 8, outline: 'none' }}
                value={selectedGearId ?? ''}
                onChange={e => saveGearId(e.target.value || undefined)}
              >
                <option value="" style={{ background: '#121216', color: '#f8fafc' }}>-- No bike linked --</option>
                {gears.map(g => (
                  <option key={g.id} value={g.id} style={{ background: '#121216', color: '#f8fafc' }}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="rp-witha-card__row" style={{ marginTop: 10 }}>
              <span className="rp-witha-card__label">Notes</span>
              <textarea
                className="rp-notes"
                placeholder="Add a note... (e.g. 'Legs felt heavy', 'Tested new route')"
                value={notes}
                onChange={e => saveNotes(e.target.value)}
                rows={3}
              />

              {/* AI Analysis & Feedback Widget */}
              {notes.trim().length > 0 && aiScores && (
                <div style={{
                  marginTop: 12,
                  padding: '12px 14px',
                  background: 'rgba(203, 213, 225, 0.02)',
                  border: '1px solid rgba(203, 213, 225, 0.08)',
                  borderRadius: 10,
                  fontSize: 11
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: '#cbd5e1', fontWeight: 800, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.6px' }}>
                    <Brain size={14} />
                    <span>Offline AI Note Analysis</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Fatigue */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, color: '#94a3b8' }}>
                        <span>Muscle Tension / Fatigue</span>
                        <span style={{ color: aiScores.fatigue > 0.6 ? '#ff7675' : '#cbd5e1', fontWeight: 700 }}>{Math.round(aiScores.fatigue * 100)}%</span>
                      </div>
                      <div style={{ height: 5, background: 'rgba(255,255,255,0.03)', borderRadius: 2.5, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${aiScores.fatigue * 100}%`, background: '#ff7675', borderRadius: 2.5, transition: 'width 0.3s' }} />
                      </div>
                    </div>

                    {/* Recovery */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, color: '#94a3b8' }}>
                        <span>Recovery / Freshness</span>
                        <span style={{ color: aiScores.recovery > 0.6 ? '#00b894' : '#cbd5e1', fontWeight: 700 }}>{Math.round(aiScores.recovery * 100)}%</span>
                      </div>
                      <div style={{ height: 5, background: 'rgba(255,255,255,0.03)', borderRadius: 2.5, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${aiScores.recovery * 100}%`, background: '#00b894', borderRadius: 2.5, transition: 'width 0.3s' }} />
                      </div>
                    </div>

                    {/* Illness / Pain */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, color: '#94a3b8' }}>
                        <span>Illness / Pain</span>
                        <span style={{ color: aiScores.illness > 0.3 ? '#d63031' : '#cbd5e1', fontWeight: 700 }}>{Math.round(aiScores.illness * 100)}%</span>
                      </div>
                      <div style={{ height: 5, background: 'rgba(255,255,255,0.03)', borderRadius: 2.5, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${aiScores.illness * 100}%`, background: '#d63031', borderRadius: 2.5, transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  </div>

                  {/* Feedback Controls */}
                  {!isCorrecting ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                      <span style={{ color: '#64748b', fontSize: 10 }}>Is this analysis correct?</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => {
                            updateRideMeta(rideId, { aiAnalysis: aiScores }).then(() => {
                              setShowSuccessMsg(true);
                              setTimeout(() => setShowSuccessMsg(false), 2000);
                              onChange?.();
                            });
                          }}
                          style={{
                            background: 'rgba(0, 184, 148, 0.1)',
                            border: '1px solid rgba(0, 184, 148, 0.2)',
                            color: '#00b894',
                            padding: '3px 8px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontSize: 10,
                            fontWeight: 700
                          }}
                        >
                          ✓ Yes
                        </button>
                        <button
                          onClick={() => {
                            setCustomFatigue(aiScores.fatigue);
                            setCustomRecovery(aiScores.recovery);
                            setCustomIllness(aiScores.illness);
                            setIsCorrecting(true);
                          }}
                          style={{
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            color: '#cbd5e1',
                            padding: '3px 8px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontSize: 10,
                            fontWeight: 700
                          }}
                        >
                          ✎ Adjust
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(203, 213, 225, 0.15)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span style={{ color: '#cbd5e1', fontWeight: 700, fontSize: 10 }}>Set correct scores:</span>
                      
                      {/* Fatigue */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#94a3b8', marginBottom: 2 }}>
                          <span>Fatigue:</span>
                          <span>{Math.round(customFatigue * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={customFatigue}
                          onChange={e => setCustomFatigue(parseFloat(e.target.value))}
                          style={{ width: '100%', height: 3, accentColor: '#ff7675', cursor: 'pointer' }}
                        />
                      </div>

                      {/* Recovery */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#94a3b8', marginBottom: 2 }}>
                          <span>Recovery / Freshness:</span>
                          <span>{Math.round(customRecovery * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={customRecovery}
                          onChange={e => setCustomRecovery(parseFloat(e.target.value))}
                          style={{ width: '100%', height: 3, accentColor: '#00b894', cursor: 'pointer' }}
                        />
                      </div>

                      {/* Illness */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#94a3b8', marginBottom: 2 }}>
                          <span>Illness / Pain:</span>
                          <span>{Math.round(customIllness * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={customIllness}
                          onChange={e => setCustomIllness(parseFloat(e.target.value))}
                          style={{ width: '100%', height: 3, accentColor: '#d63031', cursor: 'pointer' }}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
                        <button
                          onClick={() => setIsCorrecting(false)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#64748b',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontSize: 10,
                            fontWeight: 700
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            const corrected: NeuralAnalysis = {
                              fatigue: customFatigue,
                              recovery: customRecovery,
                              illness: customIllness
                            };
                            const trainedScores = trainOnCorrection(notes, corrected);
                            updateRideMeta(rideId, { aiAnalysis: corrected }).then(() => {
                              setAiScores(trainedScores);
                              setIsCorrecting(false);
                              setShowSuccessMsg(true);
                              setTimeout(() => setShowSuccessMsg(false), 2000);
                              onChange?.();
                            });
                          }}
                          style={{
                            background: 'rgba(203, 213, 225, 0.08)',
                            border: '1px solid #cbd5e1',
                            color: '#cbd5e1',
                            padding: '4px 10px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontSize: 10,
                            fontWeight: 700
                          }}
                        >
                          AI Train & Save
                        </button>
                      </div>
                    </div>
                  )}

                  {showSuccessMsg && (
                    <div style={{ marginTop: 8, textAlign: 'center', color: '#00b894', fontSize: 10, fontWeight: 700 }}>
                      ✓ Local AI successfully trained!
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Ride comparison overlay */}
          {compareRide && (
            <CompareOverlay rideA={ride} rideB={compareRide} />
          )}
        </div>

        {/* Column 2: Open Map Area (Spacer) */}
        <div className="rp-panel-center-spacer" />

        {/* Column 3: Training Effect, Zones & Climbs */}
        <div className="rp-panel-right">
          {/* Sub-Tab Navigation inside Right Panel */}
          <div style={{
            display: 'flex', gap: 6, background: 'rgba(255,255,255,0.02)', padding: 3, borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.04)', marginBottom: 12, width: '100%'
          }}>
            <button
              onClick={() => setActiveDetailTab('summary')}
              style={{
                flex: 1, padding: '6px 8px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700,
                background: activeDetailTab === 'summary' ? 'rgba(203, 213, 225, 0.1)' : 'transparent',
                color: activeDetailTab === 'summary' ? '#cbd5e1' : '#94a3b8',
                transition: 'all 0.15s', fontFamily: 'inherit'
              }}
            >
              Coach & Climbs
            </button>
            <button
              onClick={() => setActiveDetailTab('zones')}
              style={{
                flex: 1, padding: '6px 8px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700,
                background: activeDetailTab === 'zones' ? 'rgba(203, 213, 225, 0.1)' : 'transparent',
                color: activeDetailTab === 'zones' ? '#cbd5e1' : '#94a3b8',
                transition: 'all 0.15s', fontFamily: 'inherit'
              }}
            >
              Zones & Splits
            </button>
            <button
              onClick={() => setActiveDetailTab('charts')}
              style={{
                flex: 1, padding: '6px 8px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700,
                background: activeDetailTab === 'charts' ? 'rgba(203, 213, 225, 0.1)' : 'transparent',
                color: activeDetailTab === 'charts' ? '#cbd5e1' : '#94a3b8',
                transition: 'all 0.15s', fontFamily: 'inherit'
              }}
            >
              Charts
            </button>
          </div>

          {/* TAB 1: SUMMARY & COACH */}
          {activeDetailTab === 'summary' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Polar-style Training Benefit Card */}
              {trainingBenefit && (
                <div className="rp-chart-card rp-benefit-card animate-slide-up" style={{ borderLeft: `4px solid ${trainingBenefit.color}`, margin: 0 }}>
                  <div className="rp-benefit-card__head">
                    <span className="rp-benefit-card__title">🎓 Ride Summary: {trainingBenefit.title}</span>
                    <span className="rp-benefit-card__category" style={{ background: `${trainingBenefit.color}15`, color: trainingBenefit.color, border: `1px solid ${trainingBenefit.color}35` }}>
                      {trainingBenefit.category}
                    </span>
                  </div>
                  <p className="rp-benefit-card__desc">{trainingBenefit.desc}</p>
                  
                  {trainingBenefit.points.length > 0 && (
                    <div className="rp-benefit-card__insights" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: 10 }}>
                      {trainingBenefit.points.map((pt, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: 8, fontSize: 11, lineHeight: 1.4, color: '#cbd5e1' }}>
                          <span style={{ color: '#fdcb6e' }}>💡</span>
                          <span>{pt}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}



              {/* Climbs (Automatic Climb Detection) */}
              <ClimbsSection points={ride.points} ftp={ftp} weight={profile.weight} bodyFatPct={profile.bodyFat} />

              {/* Fuel & Nutrition Report */}
              {(() => {
                const ifVal = ride.intensityFactor ?? (ride.avgHR && maxHR ? (ride.avgHR / maxHR) : 0.65);
                let zone = 2;
                if (ifVal < 0.60) zone = 1;
                else if (ifVal < 0.75) zone = 2;
                else if (ifVal < 0.90) zone = 3;
                else if (ifVal < 1.05) zone = 4;
                else zone = 5;

                const tempC = weather?.tempC ?? 20;
                const fuelPlan = calculateFuel(
                  ride.duration,
                  zone,
                  profile.weight ?? 75,
                  ftp ?? 220,
                  tempC
                );

                return (
                  <div className="rp-chart-card animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: 0 }}>
                    <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Coffee size={15} strokeWidth={1.6} style={{ color: '#cbd5e1' }} /> Fuel & Nutrition Report
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11, color: '#cbd5e1' }}>
                      <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 8, padding: 8 }}>
                        <span style={{ display: 'block', fontSize: 9, color: '#94a3b8', marginBottom: 2 }}>Energy Burned</span>
                        <strong style={{ color: '#f8fafc', fontSize: 12 }}>{ride.calories ?? fuelPlan.totalCalories} kcal</strong>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 8, padding: 8 }}>
                        <span style={{ display: 'block', fontSize: 9, color: '#94a3b8', marginBottom: 2 }}>Carbs Used</span>
                        <strong style={{ color: '#39ff14', fontSize: 12 }}>{fuelPlan.totalCarbs}g ({fuelPlan.carbsPerHour}g/h)</strong>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 8, padding: 8 }}>
                        <span style={{ display: 'block', fontSize: 9, color: '#94a3b8', marginBottom: 2 }}>Fluid Intake Advice</span>
                        <strong style={{ color: '#cbd5e1', fontSize: 12 }}>{(fuelPlan.totalFluid / 1000).toFixed(1)} L ({fuelPlan.fluidPerHour}ml/h)</strong>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 8, padding: 8 }}>
                        <span style={{ display: 'block', fontSize: 9, color: '#94a3b8', marginBottom: 2 }}>Sodium Supplementation</span>
                        <strong style={{ color: '#ff9f43', fontSize: 12 }}>{fuelPlan.totalSodium} mg</strong>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 10, marginTop: 4 }}>
                      <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#f8fafc', marginBottom: 6 }}>Ideal Intake Plan:</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#cbd5e1' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>🍼 Sports Drink Bottles (500ml):</span>
                          <strong>{fuelPlan.bottles}x</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>🍫 Energy Bars:</span>
                          <strong>{fuelPlan.bars}x</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>⚡ Energy Gels:</span>
                          <strong>{fuelPlan.gels}x</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB 2: ZONES & SPLITS */}
          {activeDetailTab === 'zones' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Zone Breakdown */}
              {(ride.powerZoneTime || ride.hrZoneTime) && (
                <div className="rp-chart-card" style={{ margin: 0 }}>
                  <h3>{ride.hasPower ? '⚡ Power Zones' : '❤️ Heart Rate Zones'}</h3>
                  <ZoneBreakdown
                    times={ride.hasPower ? (ride.powerZoneTime ?? []) : (ride.hrZoneTime ?? [])}
                    zones={ride.hasPower ? POWER_ZONES : HR_ZONES}
                  />
                </div>
              )}

              {/* Best efforts */}
              <div className="rp-chart-card" style={{ margin: 0 }}>
                <h3>🏅 Best Efforts</h3>
                <div className="rp-efforts-grid">
                  {ride.hasPower && EFFORT_DURATIONS.map(({ key, label }) => {
                    const val  = (ride.bestEfforts as any)[key];
                    if (!val) return null;
                    const pct  = ftp ? Math.round(val / ftp * 100) : null;
                    const zone = ftp ? POWER_ZONES.find(z => pct! >= z.minPct && pct! <= z.maxPct) : null;
                    return (
                      <div className="rp-effort-row" key={key} style={{ borderLeft: `3px solid ${zone?.color ?? '#555'}` }}>
                        <span className="rp-effort-dur">{label}</span>
                        <span className="rp-effort-val">{val}W</span>
                        {pct && <span className="rp-effort-pct" style={{ color: zone?.color }}>{pct}% FTP</span>}
                        {zone && <span className="rp-effort-zone">{zone.name}</span>}
                        {profile.weight && <span className="rp-effort-wkg">{(val / profile.weight).toFixed(1)} W/kg</span>}
                      </div>
                    );
                  })}
                  {!ride.hasPower && Object.entries(ride.bestSpeedEfforts ?? {}).map(([key, val]) => (
                    <div className="rp-effort-row" key={key}>
                      <span className="rp-effort-dur">{EFFORT_DURATIONS.find(d => d.key === key)?.label ?? key}</span>
                      <span className="rp-effort-val">{(val as number).toFixed(1)} km/h</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Split Analysis */}
              <SplitAnalysis ride={ride} />
            </div>
          )}

          {/* TAB 3: CHARTS */}
          {activeDetailTab === 'charts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Power curve and histogram */}
              {ride.hasPower && <PowerCurve ride={ride} ftp={ftp} />}
              {ride.hasPower && <PowerHistogram points={ride.points} ftp={ftp} />}
              {!ride.hasPower && (
                <div className="rp-chart-card" style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 11, margin: 0 }}>
                  Power charts only available for rides recorded with a power meter.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom bar: Timeline chart */}
        <div className="rp-panel-bottom">
          <TimelineChart ride={ride} ftp={ftp} lthr={lthr} onHoverPoint={setHoveredPoint} />
        </div>
      </div>
    </div>
  );
};

export default RidePage;
