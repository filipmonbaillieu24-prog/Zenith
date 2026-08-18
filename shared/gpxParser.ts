import { RidePoint } from './types';

/**
 * Parses a GPX or TCX file (string content) into an array of RidePoints.
 */
export function parseGPX(content: string): RidePoint[] {
  const parser = new DOMParser();
  const doc    = parser.parseFromString(content, 'application/xml');
  const points: RidePoint[] = [];

  // ── GPX format ────────────────────────────────────────────────────────────
  const trkpts = doc.querySelectorAll('trkpt');
  if (trkpts.length > 0) {
    let cumDist = 0;
    let prev: RidePoint | null = null;

    trkpts.forEach(pt => {
      const lat  = parseFloat(pt.getAttribute('lat') ?? 'NaN');
      const lng  = parseFloat(pt.getAttribute('lon') ?? 'NaN');
      const ele  = parseFloat(pt.querySelector('ele')?.textContent ?? 'NaN');
      const timeStr = pt.querySelector('time')?.textContent ?? '';
      const time = timeStr ? new Date(timeStr).getTime() : Date.now();

      // Garmin extension fields
      const ext    = pt.querySelector('extensions');
      const power  = parseOptional(ext?.querySelector('power')?.textContent);
      const hr     = parseOptional(ext?.querySelector('hr, heartrate')?.textContent);
      const cad    = parseOptional(ext?.querySelector('cad, cadence')?.textContent);

      const rp: RidePoint = {
        time,
        lat:     isNaN(lat) ? undefined : lat,
        lng:     isNaN(lng) ? undefined : lng,
        ele:     isNaN(ele) ? undefined : ele,
        power,
        hr,
        cadence: cad,
      };

      if (prev && rp.lat != null && prev.lat != null) {
        const segDist = haversine(prev.lat, prev.lng!, rp.lat, rp.lng!);
        cumDist += segDist;
        rp.speed    = segDist / ((rp.time - prev.time) / 1000) || 0;
        rp.distance = cumDist;
      } else if (!prev) {
        rp.distance = 0;
      }

      points.push(rp);
      prev = rp;
    });

    return points;
  }

  // ── TCX format ────────────────────────────────────────────────────────────
  const trackPoints = doc.querySelectorAll('Trackpoint');
  if (trackPoints.length > 0) {
    let cumDist = 0;
    let prev: RidePoint | null = null;

    trackPoints.forEach(pt => {
      const timeStr = pt.querySelector('Time')?.textContent ?? '';
      const time    = timeStr ? new Date(timeStr).getTime() : Date.now();
      const lat     = parseOptional(pt.querySelector('LatitudeDegrees')?.textContent);
      const lng     = parseOptional(pt.querySelector('LongitudeDegrees')?.textContent);
      const ele     = parseOptional(pt.querySelector('AltitudeMeters')?.textContent);
      const hr      = parseOptional(pt.querySelector('HeartRateBpm Value')?.textContent);
      const cad     = parseOptional(pt.querySelector('Cadence')?.textContent);
      // Garmin TCX power extension
      const power   = parseOptional(pt.querySelector('Watts')?.textContent);

      const rp: RidePoint = { time, lat, lng, ele, hr, cadence: cad, power };

      if (prev && rp.lat != null && prev.lat != null) {
        const segDist = haversine(prev.lat, prev.lng!, rp.lat, rp.lng!);
        cumDist += segDist;
        rp.speed    = segDist / ((rp.time - prev.time) / 1000) || 0;
        rp.distance = cumDist;
      } else if (!prev) {
        rp.distance = 0;
      }

      points.push(rp);
      prev = rp;
    });

    return points;
  }

  throw new Error('No valid GPX or TCX data found in the file.');
}

function parseOptional(s: string | null | undefined): number | undefined {
  if (!s) return undefined;
  const n = parseFloat(s.trim());
  return isNaN(n) ? undefined : n;
}

const EARTH_R = 6371000;
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export { parseGPX as parseGpxFile };
