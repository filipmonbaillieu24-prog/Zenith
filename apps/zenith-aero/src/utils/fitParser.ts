import FitParser from 'fit-file-parser';
import { RidePoint } from '../types/workout';

/**
 * Parses a binary FIT file (ArrayBuffer) into RidePoint[].
 *
 * The FIT format (used by Garmin, Wahoo, etc.) stores all sensor data
 * at 1-second resolution. This parser extracts:
 *   - GPS: position_lat, position_long
 *   - Elevation: altitude or enhanced_altitude
 *   - Power: power
 *   - Heart rate: heart_rate
 *   - Cadence: cadence
 *   - Speed: speed or enhanced_speed
 *   - Distance: distance
 *   - Timestamp: timestamp
 */
export async function parseFIT(buffer: ArrayBuffer): Promise<RidePoint[]> {
  return new Promise((resolve, reject) => {
    const parser = new FitParser({
      force:           true,
      // No speedUnit override — raw FIT speed is m/s, same as GPX.
      // rideMetrics.ts multiplies by 3.6 for both file types.
      lengthUnit:      'm',
      temperatureUnit: 'celsius',
      elapsedRecordField: false,
      mode: 'cascade',
    });

    parser.parse(buffer, (error: any, data: any) => {
      if (error) {
        reject(new Error(`FIT parse error: ${error.message}`));
        return;
      }

      try {
        // Robust extraction of records from various FIT structures
        let records: any[] = [];
        if (data?.records && Array.isArray(data.records) && data.records.length > 0) {
          records = data.records;
        } else if (data?.activity?.sessions) {
          records = data.activity.sessions.flatMap((s: any) => 
            s.laps?.flatMap((l: any) => l.records ?? []) ?? s.records ?? []
          );
        } else if (data?.laps) {
          records = data.laps.flatMap((l: any) => l.records ?? []);
        }

        if (!records || !records.length) {
          reject(new Error('No data records found in FIT file.'));
          return;
        }

        const points: RidePoint[] = records
          .filter(r => r.timestamp)
          .map(r => {
            // Check all possible field names for latitude/longitude
            const rawLat = r.position_lat ?? r.lat ?? r.latitude ?? r.position_latitude;
            const rawLng = r.position_long ?? r.lng ?? r.longitude ?? r.position_longitude;

            let lat: number | undefined;
            let lng: number | undefined;

            if (rawLat != null) {
              // If the value is already within normal degree bounds (-90 to 90), don't convert
              lat = Math.abs(rawLat) <= 90 ? rawLat : semiCirclesToDeg(rawLat);
            }
            if (rawLng != null) {
              // If the value is already within normal degree bounds (-180 to 180), don't convert
              lng = Math.abs(rawLng) <= 180 ? rawLng : semiCirclesToDeg(rawLng);
            }

            return {
              time:     new Date(r.timestamp).getTime(),
              lat,
              lng,
              ele:      r.enhanced_altitude ?? r.altitude ?? r.ele ?? r.elevation,
              distance: r.distance,
              speed:    r.enhanced_speed ?? r.speed,   // m/s — rideMetrics converts to km/h
              power:    r.power,
              hr:       r.heart_rate ?? r.hr,
              cadence:  r.cadence ?? r.cad,
            } as RidePoint;
          });

        resolve(points);
      } catch (e: any) {
        reject(new Error(`FIT processing error: ${e.message}`));
      }
    });
  });
}

/** FIT stores latitude/longitude in semicircles (integer). Convert to degrees. */
function semiCirclesToDeg(sc: number): number {
  return sc * (180 / 2 ** 31);
}

/** Detect file type from magic bytes or extension. */
export function isFITFile(filename: string, buffer?: ArrayBuffer): boolean {
  if (filename.toLowerCase().endsWith('.fit')) return true;
  // FIT files start with header: bytes 8-11 = ".FIT"
  if (buffer && buffer.byteLength > 12) {
    const bytes = new Uint8Array(buffer, 8, 4);
    return String.fromCharCode(...bytes) === '.FIT';
  }
  return false;
}
