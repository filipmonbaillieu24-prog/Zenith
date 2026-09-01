import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents, LayersControl } from 'react-leaflet';
import { DARK_BASEMAP_URL, DARK_BASEMAP_ATTRIBUTION, OSM_TILE_URL, OSM_ATTRIBUTION, SATELLITE_TILE_URL, SATELLITE_ATTRIBUTION } from '../utils/basemap';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { RoutePoint, GeneratedRoute } from '../types/route';

// Custom markers
const createStartIcon = () => L.divIcon({
  className: 'custom-marker-start',
  html: `<div style="
    background-color: #cbd5e1; 
    width: 14px; 
    height: 14px; 
    border-radius: 50%; 
    border: 2px solid #ffffff; 
    box-shadow: 0 0 12px #cbd5e1, 0 0 3px rgba(0, 0, 0, 0.5);
  "></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

const createEndIcon = () => L.divIcon({
  className: 'custom-marker-end',
  html: `<div style="
    background-color: #ff3366; 
    width: 14px; 
    height: 14px; 
    border-radius: 50%; 
    border: 2px solid #ffffff; 
    box-shadow: 0 0 12px #ff3366, 0 0 3px rgba(0, 0, 0, 0.5);
  "></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

const createHoverIcon = () => L.divIcon({
  className: 'custom-marker-hover',
  html: `<div style="
    background-color: #00f0ff; 
    width: 16px; 
    height: 16px; 
    border-radius: 50%; 
    border: 2px solid #ffffff; 
    box-shadow: 0 0 15px #00f0ff, 0 0 5px rgba(0, 0, 0, 0.8);
    animation: marker-pulse 1.5s infinite ease-out;
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

// Map Events Click Handler
const MapEventsHandler: React.FC<{
  onMapClick: (lat: number, lng: number) => void;
}> = ({ onMapClick }) => {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
};

// Map Viewport Updater
const MapViewUpdater: React.FC<{
  startPoint: [number, number] | null;
  activeRoutePoints: RoutePoint[];
}> = ({ startPoint, activeRoutePoints }) => {
  const map = useMap();

  useEffect(() => {
    if (activeRoutePoints.length > 0) {
      // Fit to active route bounds
      const bounds = L.latLngBounds(activeRoutePoints.map(pt => [pt.lat, pt.lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    } else if (startPoint) {
      // Center on start location
      map.setView([startPoint[0], startPoint[1]], 13);
    }
  }, [startPoint, activeRoutePoints, map]);

  return null;
};

interface MapViewProps {
  startPoint: [number, number] | null;
  endPoint: [number, number] | null;
  routes: GeneratedRoute[];
  activeRouteIndex: number;
  hoverPoint: RoutePoint | null;
  onMapClick: (lat: number, lng: number) => void;
  activeWorkout?: any | null;
}

export const MapView: React.FC<MapViewProps> = ({
  startPoint,
  endPoint,
  routes,
  activeRouteIndex,
  hoverPoint,
  onMapClick,
  activeWorkout
}) => {
  const defaultCenter: [number, number] = [52.090737, 5.12142]; // Utrecht
  const defaultZoom = 8;

  const activeRoute = routes[activeRouteIndex];
  const activeRoutePoints = activeRoute ? activeRoute.points : [];

  return (
    <div className="map-view-wrapper">
      <MapContainer
        center={startPoint || defaultCenter}
        zoom={startPoint ? 13 : defaultZoom}
        className="map-container"
        zoomControl={false}
      >
        <LayersControl position="topright">
          {/* Layer names in English, like the rest of the app. "Lichte Kaart" and
              "Satelliet / Hybride" sat in an otherwise English control. */}
          <LayersControl.BaseLayer checked name="Dark">
            <TileLayer url={DARK_BASEMAP_URL} attribution={DARK_BASEMAP_ATTRIBUTION} className="zenith-basemap-dark" />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Light">
            <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite">
            <TileLayer url={SATELLITE_TILE_URL} attribution={SATELLITE_ATTRIBUTION} />
          </LayersControl.BaseLayer>
        </LayersControl>

        {/* Map Click Events */}
        <MapEventsHandler onMapClick={onMapClick} />

        {/* Map View Updater */}
        <MapViewUpdater startPoint={startPoint} activeRoutePoints={activeRoutePoints} />

        {/* Start Point Marker */}
        {startPoint && (
          <Marker position={startPoint} icon={createStartIcon()} />
        )}

        {/* End Point Marker */}
        {endPoint && (
          <Marker position={endPoint} icon={createEndIcon()} />
        )}

        {/* Hover Point Pulse Marker */}
        {hoverPoint && (
          <Marker position={[hoverPoint.lat, hoverPoint.lng]} icon={createHoverIcon()} />
        )}

        {/* Render routes */}
        {routes.map((rt, idx) => {
          const isActive = idx === activeRouteIndex;
          const positions = rt.points.map(pt => [pt.lat, pt.lng] as [number, number]);

          if (positions.length === 0) return null;

          if (isActive) {
            if (activeWorkout && activeWorkout.blocks && activeRoutePoints.length > 0) {
              const totalRouteDistance = activeRoutePoints[activeRoutePoints.length - 1]?.distance ?? 0;
              const totalWorkoutSeconds = activeWorkout.blocks.reduce((s: number, b: any) => s + b.duration, 0);
              let currSec = 0;
              
              return (
                <React.Fragment key={idx}>
                  {activeWorkout.blocks.map((block: any, bIdx: number) => {
                    const startPct = currSec / totalWorkoutSeconds;
                    const endPct = (currSec + block.duration) / totalWorkoutSeconds;
                    const startDist = startPct * totalRouteDistance;
                    const endDist = endPct * totalRouteDistance;
                    currSec += block.duration;

                    const segmentPoints = activeRoutePoints.filter(pt => 
                      pt.distance >= startDist - 30 && pt.distance <= endDist + 30
                    );

                    if (segmentPoints.length < 2) return null;
                    const segmentCoords = segmentPoints.map(pt => [pt.lat, pt.lng] as [number, number]);

                    return (
                      <React.Fragment key={bIdx}>
                        <Polyline
                          positions={segmentCoords}
                          pathOptions={{
                            color: block.color,
                            weight: 7,
                            opacity: 0.3,
                            lineCap: 'round',
                            lineJoin: 'round',
                            pane: 'overlayPane'
                          }}
                        />
                        <Polyline
                          positions={segmentCoords}
                          pathOptions={{
                            color: block.color,
                            weight: 4,
                            opacity: 0.95,
                            lineCap: 'round',
                            lineJoin: 'round',
                            pane: 'overlayPane'
                          }}
                        />
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            }

            // Render active route in glowing cyan (default fallback)
            return (
              <React.Fragment key={idx}>
                {/* Glow layer */}
                <Polyline
                  positions={positions}
                  pathOptions={{
                    color: 'var(--color-primary)',
                    weight: 6,
                    opacity: 0.35,
                    lineCap: 'round',
                    lineJoin: 'round',
                    pane: 'overlayPane'
                  }}
                />
                {/* Core layer */}
                <Polyline
                  positions={positions}
                  pathOptions={{
                    color: 'var(--color-primary-bright)',
                    weight: 3.5,
                    opacity: 0.9,
                    lineCap: 'round',
                    lineJoin: 'round',
                    pane: 'overlayPane'
                  }}
                />
              </React.Fragment>
            );
          } else {
            // Render inactive alternative in subtle transparent grey/blue
            return (
              <Polyline
                key={idx}
                positions={positions}
                pathOptions={{
                  color: '#475569',
                  weight: 4,
                  opacity: 0.45,
                  lineCap: 'round',
                  lineJoin: 'round',
                  pane: 'shadowPane' // render behind active overlayPane
                }}
              />
            );
          }
        })}
      </MapContainer>

      {/* Map Guidelines Overlay */}
      {routes.length === 0 && (
        <div className="map-instructions-card">
          <h3>Designing Route</h3>
          <p>
            {startPoint 
              ? (endPoint ? 'Calculating...' : 'Click on the map to set destination, or generate a loop.') 
              : 'Click anywhere on the map to mark your starting point and begin designing.'
            }
          </p>
        </div>
      )}
    </div>
  );
};
