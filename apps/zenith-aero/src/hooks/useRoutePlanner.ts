import { useState, useEffect, useRef, useCallback } from 'react';
import { buildGPX, buildTCX, saveExportFile } from '../utils/export';
import { calculateRoute, fetchWindData, generateCorrectedRoutes } from '../utils/routing';
import {
  RoutePoint, RouteType, DirectionBias,
  WindData, GeneratedRoute, RouteOptions
} from '../types/route';

interface TrainingRouteParams {
  lat: number;
  lng: number;
  durationMinutes: number;
  options: {
    profile: 'road' | 'gravel' | 'mtb';
    workoutType: 'recovery' | 'endurance' | 'sweetspot' | 'threshold';
  };
}

export function useRoutePlanner(onSwitchToRoute?: () => void) {
  const [startPoint, setStartPoint] = useState<[number, number] | null>(null);
  const [endPoint, setEndPoint] = useState<[number, number] | null>(null);
  const [routes, setRoutes] = useState<GeneratedRoute[]>([]);
  const [activeRouteIndex, setActiveRouteIndex] = useState<number>(0);
  const [routeType, setRouteType] = useState<RouteType>('loop');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hoverPoint, setHoverPoint] = useState<RoutePoint | null>(null);
  const [windData, setWindData] = useState<WindData | null>(null);
  const [windSlot, setWindSlot] = useState<string>('now');
  const [isFetchingWind, setIsFetchingWind] = useState<boolean>(false);
  const [maxElevationGain, setMaxElevationGain] = useState<number>(0);
  const [exportMsg, setExportMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const exportTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (exportTimer.current) window.clearTimeout(exportTimer.current);
    };
  }, []);

  const showExportMsg = useCallback((text: string, ok: boolean) => {
    setExportMsg({ text, ok });
    if (exportTimer.current) {
      window.clearTimeout(exportTimer.current);
    }
    exportTimer.current = window.setTimeout(() => setExportMsg(null), 4000);
  }, []);

  useEffect(() => {
    if (!startPoint) {
      setWindData(null);
      return;
    }

    let cancelled = false;
    const debounceTimer = window.setTimeout(async () => {
      if (cancelled) return;
      setIsFetchingWind(true);
      try {
        const data = await fetchWindData(startPoint[0], startPoint[1], windSlot);
        if (!cancelled) setWindData(data);
      } catch (err) {
        console.error('Wind fetch failed:', err);
      } finally {
        if (!cancelled) setIsFetchingWind(false);
      }
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(debounceTimer);
    };
  }, [startPoint, windSlot]);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (isGenerating) return;

    if (routeType === 'loop') {
      setStartPoint([lat, lng]);
      setEndPoint(null);
    } else {
      if (!startPoint || endPoint) {
        setStartPoint([lat, lng]);
        setEndPoint(null);
      } else {
        setEndPoint([lat, lng]);
      }
    }
  }, [isGenerating, routeType, startPoint, endPoint]);

  const handleSetLocation = useCallback((lat: number, lng: number, type: 'start' | 'end') => {
    if (type === 'start') {
      setStartPoint([lat, lng]);
      setEndPoint(null);
    } else {
      setEndPoint([lat, lng]);
    }
  }, []);

  const handleGenerate = useCallback(async (params: {
    type: RouteType;
    distance: number;
    direction: DirectionBias;
    options: RouteOptions;
  }) => {
    if (!startPoint) return;
    setIsGenerating(true);
    setError(null);
    setHoverPoint(null);

    try {
      let generated: GeneratedRoute[];

      if (params.type === 'loop') {
        generated = await generateCorrectedRoutes(
          startPoint[0], startPoint[1],
          params.distance,
          params.direction,
          params.options,
          windData?.direction
        );
      } else {
        if (!endPoint) throw new Error('Select an endpoint on the map first.');
        const waypoints: [number, number][] = [
          [startPoint[1], startPoint[0]],
          [endPoint[1],   endPoint[0]],
        ];
        const results = await Promise.all([0, 1, 2].map(async (idx) => {
          try {
            return await calculateRoute(waypoints, params.options.profile, idx, params.options);
          } catch {
            return null;
          }
        }));
        generated = results.filter((r): r is GeneratedRoute => r !== null);
        if (!generated.length) throw new Error('Could not calculate a valid route between these points.');
      }

      setRoutes(generated);
      setActiveRouteIndex(0);
    } catch (err: any) {
      setError(err.message ?? 'Unknown error during route calculation.');
    } finally {
      setIsGenerating(false);
    }
  }, [startPoint, endPoint, windData?.direction]);

  const handleGenerateTrainingsroute = useCallback(async (params: TrainingRouteParams) => {
    setStartPoint([params.lat, params.lng]);
    setEndPoint(null);
    const distanceKm = Math.round((params.durationMinutes / 60) * 22);

    setIsGenerating(true);
    setError(null);
    setHoverPoint(null);
    onSwitchToRoute?.();

    try {
      const generated = await generateCorrectedRoutes(
        params.lat, params.lng,
        distanceKm,
        'wind',
        {
          profile: params.options.profile,
          surfacePreference: 'asphalt',
          preferCycleroutes: true,
          avoidHills: false,
          maxElevationGain: 0,
        },
        windData?.direction
      );

      setRoutes(generated);
      setActiveRouteIndex(0);
    } catch (err: any) {
      setError(err.message ?? 'Error calculating training route.');
    } finally {
      setIsGenerating(false);
    }
  }, [windData?.direction, onSwitchToRoute]);

  const handleDownloadGPX = useCallback(async () => {
    const route = routes[activeRouteIndex];
    if (!route) return;
    const name = `Aero_${route.stats.distance}km`;
    const speed = (route.stats.distance / route.stats.duration) * 3600;
    const result = await saveExportFile(buildGPX(route.points, name, speed), `${name}.gpx`, 'application/gpx+xml');
    if (result.path) showExportMsg(`✓ Saved: ${result.path}`, true);
    else if (!result.ok && result.error !== 'CANCELLED') showExportMsg(`✗ ${result.error}`, false);
    else if (result.ok) showExportMsg('✓ GPX downloaded', true);
  }, [activeRouteIndex, routes, showExportMsg]);

  const handleDownloadTCX = useCallback(async () => {
    const route = routes[activeRouteIndex];
    if (!route) return;
    const name = `Aero_${route.stats.distance}km`;
    const speed = (route.stats.distance / route.stats.duration) * 3600;
    const result = await saveExportFile(buildTCX(route.points, name, speed), `${name}.tcx`, 'application/vnd.garmin.tcx+xml');
    if (result.path) showExportMsg(`✓ Saved: ${result.path}`, true);
    else if (!result.ok && result.error !== 'CANCELLED') showExportMsg(`✗ ${result.error}`, false);
    else if (result.ok) showExportMsg('✓ TCX downloaded', true);
  }, [activeRouteIndex, routes, showExportMsg]);

  const activeRoute = routes[activeRouteIndex];
  const activeRoutePoints = activeRoute?.points ?? [];

  return {
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
    exportMsg,
    activeRoutePoints,
    handleMapClick,
    handleSetLocation,
    handleGenerate,
    handleGenerateTrainingsroute,
    handleDownloadGPX,
    handleDownloadTCX,
    setActiveRouteIndex,
    setWindSlot,
    setError,
    setHoverPoint,
  };
}
