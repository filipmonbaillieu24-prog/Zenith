import { RoutePoint } from '../types/route';
import { invoke } from '@tauri-apps/api/core';

// ── Google Drive instellingen (localStorage keys) ─────────────────────────────
export const GDRIVE_PATH_KEY        = 'cyclo_gdrive_path';
export const GDRIVE_ROUTES_AUTO_KEY = 'cyclo_gdrive_routes_auto';
export const GDRIVE_RIDES_AUTO_KEY  = 'cyclo_gdrive_rides_auto';

/** Submapnamen in de Google Drive root */
export const GDRIVE_ROUTES_FOLDER = 'Gegenereerde routes';
export const GDRIVE_RIDES_FOLDER  = 'Afgelegde rideten';

/** Bouw pad naar een subfolder (werkt zowel met / als \ als separator). */
export function gdriveSubPath(root: string, sub: string): string {
  const sep = root.includes('/') ? '/' : '\\';
  return `${root.replace(/[/\\]+$/, '')}${sep}${sub}`;
}

/** Formats a Date object into an XML schema-compliant ISO string (YYYY-MM-DDTHH:MM:SSZ). */
function formatXMLTime(date: Date): string {
  return date.toISOString().split('.')[0] + 'Z';
}

/**
 * Downloads een bestand via de browser (fallback).
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Sla een route-export op:
 *  - Google Drive map ingesteld → opslaan in subfolder 'Gegenereerde routes'
 *  - Anders → browser-download
 * Geeft { ok, path?, error? } terug.
 */
export async function saveExportFile(
  content: string,
  filename: string,
  mimeType: string
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const root = localStorage.getItem(GDRIVE_PATH_KEY)?.trim();

  if (root) {
    const folder   = gdriveSubPath(root, GDRIVE_ROUTES_FOLDER);
    const sep      = root.includes('/') ? '/' : '\\';
    const fullPath = `${folder}${sep}${filename}`;
    try {
      await invoke('ensure_dir', { path: folder });
      await invoke('save_file',  { path: fullPath, content });
      return { ok: true, path: fullPath };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  } else {
    // 1. Try showSaveFilePicker first (standard web browser / WebView2 native dialog)
    if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: 'GPX Route File',
            accept: { [mimeType]: ['.gpx'] }
          }]
        });
        const wrideable = await handle.createWrideable();
        const blob = new Blob([content], { type: mimeType });
        await wrideable.wridee(blob);
        await wrideable.close();
        return { ok: true, path: filename };
      } catch (err: any) {
        if (err && err.name === 'AbortError') {
          return { ok: false, error: 'CANCELLED' };
        }
        console.warn("showSaveFilePicker failed, falling back to Tauri invoke:", err);
      }
    }

    // 2. Fallback to Tauri save_file_dialog if available
    try {
      const savedPath = await invoke<string | null>('save_file_dialog', { filename, content });
      if (savedPath) {
        return { ok: true, path: savedPath };
      } else {
        return { ok: false, error: 'CANCELLED' };
      }
    } catch (err) {
      console.error("Native save file dialog failed, falling back to browser download link:", err);
      downloadFile(content, filename, mimeType);
      return { ok: true };
    }
  }
}

/**
 * Auto-sla een ride-GPX op in 'Afgelegde rideten' (als auto aan staat).
 * Faalt stil — mag de import niet onderbreken.
 */
export async function autoSaveRideToGDrive(
  ridePoints: { lat?: number; lng?: number; ele?: number; time: number }[],
  rideName: string,
): Promise<void> {
  const root = localStorage.getItem(GDRIVE_PATH_KEY)?.trim();
  const auto = localStorage.getItem(GDRIVE_RIDES_AUTO_KEY) === 'true';
  if (!root || !auto) return;

  const pts = ridePoints.filter(p => p.lat != null && p.lng != null);
  if (pts.length < 2) return;

  const folder   = gdriveSubPath(root, GDRIVE_RIDES_FOLDER);
  const sep      = root.includes('/') ? '/' : '\\';
  const safeName = rideName.replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
  const fullPath = `${folder}${sep}${safeName}.gpx`;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<gpx version="1.1" creator="Zenith" xmlns="http://www.topografix.com/GPX/1/1">\n`;
  xml += `  <metadata><name>${escapeXmlSimple(rideName)}</name></metadata>\n`;
  xml += `  <trk><name>${escapeXmlSimple(rideName)}</name><type>Cycling</type><trkseg>\n`;
  for (const p of pts) {
    const t = new Date(p.time).toISOString().split('.')[0] + 'Z';
    xml += `    <trkpt lat="${p.lat!.toFixed(6)}" lon="${p.lng!.toFixed(6)}">\n`;
    if (p.ele != null) xml += `      <ele>${p.ele.toFixed(1)}</ele>\n`;
    xml += `      <time>${t}</time>\n    </trkpt>\n`;
  }
  xml += `  </trkseg></trk>\n</gpx>\n`;

  try {
    await invoke('ensure_dir', { path: folder });
    await invoke('save_file',  { path: fullPath, content: xml });
  } catch {
    // stil falen
  }
}

function escapeXmlSimple(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Builds a GPX XML string from a list of route points.
 * Generates mock timestamps to make it fully compatible with Strava and Garmin.
 */
export function buildGPX(
  points: RoutePoint[],
  routeName: string,
  averageSpeedKmh: number = 25
): string {
  const speedMps = (averageSpeedKmh * 1000) / 3600;
  const startTime = new Date();
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<gpx version="1.1" creator="Zenith" \n`;
  xml += `  xmlns="http://www.topografix.com/GPX/1/1" \n`;
  xml += `  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" \n`;
  xml += `  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">\n`;
  
  xml += `  <metadata>\n`;
  xml += `    <name>${escapeXml(routeName)}</name>\n`;
  xml += `    <time>${formatXMLTime(startTime)}</time>\n`;
  xml += `  </metadata>\n`;
  
  xml += `  <trk>\n`;
  xml += `    <name>${escapeXml(routeName)}</name>\n`;
  xml += `    <type>Cycling</type>\n`;
  xml += `    <trkseg>\n`;

  points.forEach((pt) => {
    // Calculate mock time for this point based on distance and speed
    const pointTime = new Date(startTime.getTime() + (pt.distance / speedMps) * 1000);
    
    xml += `      <trkpt lat="${pt.lat.toFixed(6)}" lon="${pt.lng.toFixed(6)}">\n`;
    xml += `        <ele>${pt.ele.toFixed(1)}</ele>\n`;
    xml += `        <time>${formatXMLTime(pointTime)}</time>\n`;
    xml += `      </trkpt>\n`;
  });

  xml += `    </trkseg>\n`;
  xml += `  </trk>\n`;
  xml += `</gpx>\n`;

  return xml;
}

/**
 * Builds a TCX XML string from a list of route points.
 * TCX is Garmin's native training course format and requires cumulative distances.
 */
export function buildTCX(
  points: RoutePoint[],
  routeName: string,
  averageSpeedKmh: number = 25
): string {
  if (points.length === 0) return '';
  
  const speedMps = (averageSpeedKmh * 1000) / 3600;
  const startTime = new Date();
  const totalDistance = points[points.length - 1].distance;
  const totalTimeSeconds = totalDistance / speedMps;
  
  const startPt = points[0];
  const endPt = points[points.length - 1];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<TrainingCenterDatabase \n`;
  xml += `  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" \n`;
  xml += `  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" \n`;
  xml += `  xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">\n`;
  
  xml += `  <Folders>\n`;
  xml += `    <Courses>\n`;
  xml += `      <CourseFolder Name="Zenith">\n`;
  xml += `        <CourseNameRef Id="${escapeXml(routeName)}"/>\n`;
  xml += `      </CourseFolder>\n`;
  xml += `    </Courses>\n`;
  xml += `  </Folders>\n`;
  
  xml += `  <Courses>\n`;
  xml += `    <Course>\n`;
  xml += `      <Name>${escapeXml(routeName.substring(0, 15))}</Name>\n`; // Garmin has a 15-character limit for Course names
  xml += `      <Lap>\n`;
  xml += `        <TotalTimeSeconds>${Math.round(totalTimeSeconds)}</TotalTimeSeconds>\n`;
  xml += `        <DistanceMeters>${totalDistance.toFixed(1)}</DistanceMeters>\n`;
  xml += `        <BeginPosition>\n`;
  xml += `          <LatitudeDegrees>${startPt.lat.toFixed(6)}</LatitudeDegrees>\n`;
  xml += `          <LongitudeDegrees>${startPt.lng.toFixed(6)}</LongitudeDegrees>\n`;
  xml += `        </BeginPosition>\n`;
  xml += `        <EndPosition>\n`;
  xml += `          <LatitudeDegrees>${endPt.lat.toFixed(6)}</LatitudeDegrees>\n`;
  xml += `          <LongitudeDegrees>${endPt.lng.toFixed(6)}</LongitudeDegrees>\n`;
  xml += `        </EndPosition>\n`;
  xml += `        <Intensity>Active</Intensity>\n`;
  xml += `      </Lap>\n`;
  
  xml += `      <Track>\n`;

  points.forEach((pt) => {
    const pointTime = new Date(startTime.getTime() + (pt.distance / speedMps) * 1000);
    
    xml += `        <Trackpoint>\n`;
    xml += `          <Time>${formatXMLTime(pointTime)}</Time>\n`;
    xml += `          <Position>\n`;
    xml += `            <LatitudeDegrees>${pt.lat.toFixed(6)}</LatitudeDegrees>\n`;
    xml += `            <LongitudeDegrees>${pt.lng.toFixed(6)}</LongitudeDegrees>\n`;
    xml += `          </Position>\n`;
    xml += `          <AltitudeMeters>${pt.ele.toFixed(1)}</AltitudeMeters>\n`;
    xml += `          <DistanceMeters>${pt.distance.toFixed(1)}</DistanceMeters>\n`;
    xml += `        </Trackpoint>\n`;
  });

  xml += `      </Track>\n`;
  xml += `    </Course>\n`;
  xml += `  </Courses>\n`;
  xml += `</TrainingCenterDatabase>\n`;

  return xml;
}

/**
 * Escapes special characters for XML templates.
 */
function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}
