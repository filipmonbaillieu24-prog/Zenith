import { useState } from 'react';
import { Sidebar } from '../Sidebar';
import { MapView } from '../MapView';
import { ElevationChart } from '../ElevationChart';
import { Loader } from '../Loader';
import { AlertTriangle, X } from 'lucide-react';
import { FitnessProfile } from '../../types/workout';
import {
  RoutePoint, RouteType, DirectionBias,
  WindData, GeneratedRoute, RouteOptions, SavedLocation
} from '../../types/route';

export interface RoutePageProps {
  fitnessProfile: FitnessProfile;
  savedLocations: SavedLocation[];
  onSaveLocation: (name: string, lat: number, lng: number) => void;
  onDeleteLocation: (id: string) => void;
  onRenameLocation: (id: string, name: string) => void;
  startPoint: [number, number] | null;
  endPoint: [number, number] | null;
  routes: GeneratedRoute[];
  activeRouteIndex: number;
  routeType: RouteType;
  setRouteType: (type: RouteType) => void;
  isGenerating: boolean;
  error: string | null;
  hoverPoint: RoutePoint | null;
  windData: WindData | null;
  windSlot: string;
  isFetchingWind: boolean;
  maxElevationGain: number;
  setMaxElevationGain: (value: number) => void;
  activeRoutePoints: RoutePoint[];
  onSetLocation: (lat: number, lng: number, type: 'start' | 'end') => void;
  onGenerate: (params: {
    type: RouteType;
    distance: number;
    direction: DirectionBias;
    options: RouteOptions;
  }) => Promise<void>;
  onDownloadGPX: () => Promise<void>;
  onDownloadTCX: () => Promise<void>;
  onMapClick: (lat: number, lng: number) => void;
  onSelectRoute: (index: number) => void;
  setWindSlot: (slot: string) => void;
  onCloseError: () => void;
  onHoverPoint: (point: RoutePoint | null) => void;
  activeWorkout: any | null;
  onPlanWorkout?: (date: string, route: GeneratedRoute) => Promise<void>;
  isPro?: boolean;
  onRequestProModal?: (featureName: string, desc: string) => void;
}

export function RoutePage({
  fitnessProfile,
  savedLocations,
  onSaveLocation,
  onDeleteLocation,
  onRenameLocation,
  startPoint,
  endPoint,
  routes,
  activeRouteIndex,
  routeType,
  setRouteType,
  isGenerating,
  error,
  hoverPoint,
  windData,
  windSlot,
  isFetchingWind,
  maxElevationGain,
  setMaxElevationGain,
  activeRoutePoints,
  onSetLocation,
  onGenerate,
  onDownloadGPX,
  onDownloadTCX,
  onMapClick,
  onSelectRoute,
  setWindSlot,
  onCloseError,
  onHoverPoint,
  activeWorkout,
  onPlanWorkout,
  isPro = false,
  onRequestProModal,
}: RoutePageProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const activeRoute = routes[activeRouteIndex];

  return (
    <>
      <Sidebar
        fitnessProfile={fitnessProfile}
        routes={routes}
        activeRouteIndex={activeRouteIndex}
        onSelectRoute={onSelectRoute}
        routeType={routeType}
        setRouteType={setRouteType}
        onGenerate={onGenerate}
        onDownloadGPX={onDownloadGPX}
        onDownloadTCX={onDownloadTCX}
        startPoint={startPoint}
        endPoint={endPoint}
        onSetLocation={onSetLocation}
        isGenerating={isGenerating}
        windData={windData}
        windSlot={windSlot}
        setWindSlot={setWindSlot}
        isFetchingWind={isFetchingWind}
        maxElevationGain={maxElevationGain}
        setMaxElevationGain={setMaxElevationGain}
        savedLocations={savedLocations}
        onSaveLocation={onSaveLocation}
        onDeleteLocation={onDeleteLocation}
        onRenameLocation={onRenameLocation}
        isPro={isPro}
        onRequestProModal={onRequestProModal}
      />

      <main className="main-content" style={{ position: 'relative' }}>
        <div className="map-wrapper">
          <MapView
            startPoint={startPoint}
            endPoint={endPoint}
            routes={routes}
            activeRouteIndex={activeRouteIndex}
            hoverPoint={hoverPoint}
            onMapClick={onMapClick}
            activeWorkout={activeWorkout}
          />
          {activeRoutePoints.length > 0 && (
            <ElevationChart points={activeRoutePoints} onHoverPoint={onHoverPoint} activeWorkout={activeWorkout} />
          )}
        </div>

        {/* FLOATING ACTION PANEL FOR LINKED TRAINING */}
        {activeWorkout && activeRoute && (
          <div style={{
            position: 'absolute', top: 20, right: 20, zIndex: 1000,
            background: '#1c1c23', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12, padding: 16, width: 300,
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
          }}>
            <h4 style={{ margin: '0 0 4px', fontSize: 10, color: '#cbd5e1', textTransform: 'uppercase', fontWeight: 800 }}>Gekoppelde Training</h4>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginBottom: 2 }}>{activeWorkout.title}</div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 12 }}>{activeWorkout.description}</div>
            
            <button 
              onClick={() => setShowConfirmDialog(true)}
              style={{
                width: '100%', background: 'linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%)',
                border: 'none', borderRadius: 8, color: '#09090b', fontSize: 11, fontWeight: 800,
                padding: '8px 0', cursor: 'pointer', fontFamily: 'inherit'
              }}
            >
              Opslaan & Plan in kalender
            </button>
          </div>
        )}
      </main>

      {/* CONFIRMATION DIALOG MODAL */}
      {showConfirmDialog && activeRoute && onPlanWorkout && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(9, 9, 11, 0.85)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 2000
        }}>
          <div style={{
            background: '#1c1c23', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16, padding: 24, width: 380, color: '#f8fafc',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 800, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Workout & Route Bevestigen
            </h3>
            
            {/* Route Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20, background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 8 }}>
              <div>
                <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Afstand</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#cbd5e1' }}>{activeRoute.stats.distance} km</div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Hoogtemeters</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#cbd5e1' }}>{activeRoute.stats.elevationGain} m</div>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Geschatte Duur</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#cbd5e1' }}>
                  {Math.round(activeRoute.stats.duration / 60)} min
                </div>
              </div>
            </div>

            {/* Date Selector */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 10, color: '#94a3b8', marginBottom: 6, fontWeight: 700 }}>PLAN DATUM</label>
              <input 
                type="date" 
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                style={{
                  width: '100%', background: '#09090b', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, padding: '8px 12px', color: '#f8fafc', fontSize: 12, fontFamily: 'inherit',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button 
                disabled={isSaving}
                onClick={() => setShowConfirmDialog(false)}
                style={{
                  flex: 1, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, padding: '10px 0', color: '#94a3b8', cursor: 'pointer',
                  fontSize: 11, fontWeight: 700, fontFamily: 'inherit'
                }}
              >
                Annuleren
              </button>
              <button 
                disabled={isSaving}
                onClick={async () => {
                  setIsSaving(true);
                  try {
                    await onPlanWorkout(selectedDate, activeRoute);
                    setSaveSuccess(true);
                    setTimeout(() => {
                      setSaveSuccess(false);
                      setShowConfirmDialog(false);
                    }, 1500);
                  } catch (err) {
                    console.error("Opslaan mislukt:", err);
                  } finally {
                    setIsSaving(false);
                  }
                }}
                style={{
                  flex: 1, background: 'linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%)',
                  border: 'none', borderRadius: 8, padding: '10px 0', color: '#09090b',
                  cursor: 'pointer', fontSize: 11, fontWeight: 800, fontFamily: 'inherit'
                }}
              >
                {isSaving ? 'Opslaan...' : saveSuccess ? '✓ Opgeslagen' : 'Bevestig & Plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isGenerating && <Loader />}

      {error && (
        <div className="error-toast animate-slide-up">
          <AlertTriangle className="error-toast-icon" />
          <div className="error-toast-body">
            <h4>Foutmelding</h4>
            <p>{error}</p>
          </div>
          <button className="error-toast-close" onClick={onCloseError}><X size={16} /></button>
        </div>
      )}
    </>
  );
}
