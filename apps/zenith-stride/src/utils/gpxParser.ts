import { parseGPX, RidePoint } from '@zenith/shared';
import { RunActivity } from '../types/stride';

export function parseGpxFile(content: string, filename?: string): Partial<RunActivity> {
  const points: RidePoint[] = parseGPX(content);
  if (points.length === 0) throw new Error('No GPS points found');

  const startMs = points[0].time;
  const endMs = points[points.length - 1].time;
  const durationSec = Math.max(1, Math.round((endMs - startMs) / 1000));
  const lastPoint = points[points.length - 1];
  const distanceKm = lastPoint.distance ? parseFloat((lastPoint.distance / 1000).toFixed(2)) : 0;
  const avgPaceMinKm = distanceKm > 0 ? parseFloat(((durationSec / 60) / distanceKm).toFixed(2)) : 0;

  const validPts = points.filter(p => p.lat != null && p.lng != null);
  const routeCoordinates = validPts.map(p => ({ lat: p.lat!, lng: p.lng!, ele: p.ele }));

  const hrs = points.map(p => p.hr).filter((h): h is number => h != null && h > 0);
  const avgHeartRate = hrs.length > 0 ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : undefined;
  const maxHeartRate = hrs.length > 0 ? Math.max(...hrs) : undefined;

  const cads = points.map(p => p.cadence).filter((c): c is number => c != null && c > 0);
  const avgCadenceSpm = cads.length > 0 ? Math.round(cads.reduce((a, b) => a + b, 0) / cads.length) : 170;

  let elevationGainM = 0;
  for (let i = 1; i < points.length; i++) {
    const prevEle = points[i - 1].ele;
    const ele = points[i].ele;
    if (prevEle != null && ele != null && ele > prevEle) {
      elevationGainM += ele - prevEle;
    }
  }

  return {
    title: filename ? filename.replace(/\.(gpx|xml|tcx)$/i, '') : 'Geïmporteerde Loop',
    date: new Date(startMs).toISOString().slice(0, 10),
    distanceKm,
    durationSec,
    avgPaceMinKm,
    elevationGainM: Math.round(elevationGainM),
    avgHeartRate,
    maxHeartRate,
    avgCadenceSpm,
    routeCoordinates,
  };
}

export { parseGPX };
