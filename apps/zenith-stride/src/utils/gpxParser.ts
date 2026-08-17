import { RouteCoordinate, KmSplit, RunActivity } from '../types/stride';

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function parseGpxFile(xmlString: string, filename: string): Partial<RunActivity> {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  
  const trkpts = xmlDoc.getElementsByTagName('trkpt');
  const coordinates: RouteCoordinate[] = [];
  
  let totalDistanceKm = 0;
  let totalElevationGain = 0;
  let heartRateSum = 0;
  let heartRateCount = 0;
  let maxHeartRate = 0;
  let startTime: Date | null = null;
  let endTime: Date | null = null;

  let currentKmIndex = 1;
  let currentKmStartDist = 0;
  let currentKmStartTime: Date | null = null;
  let currentKmStartEle = 0;
  let currentKmEleGain = 0;
  let currentKmHrSum = 0;
  let currentKmHrCount = 0;
  const splits: KmSplit[] = [];

  for (let i = 0; i < trkpts.length; i++) {
    const pt = trkpts[i];
    const lat = parseFloat(pt.getAttribute('lat') || '0');
    const lng = parseFloat(pt.getAttribute('lon') || '0');
    const eleNode = pt.getElementsByTagName('ele')[0];
    const timeNode = pt.getElementsByTagName('time')[0];
    const ele = eleNode ? parseFloat(eleNode.textContent || '0') : undefined;
    const timeStr = timeNode ? timeNode.textContent : null;
    const ptTime = timeStr ? new Date(timeStr) : null;

    // Heart rate extraction from extensions (garmin / strava GPX extension)
    let hr: number | undefined = undefined;
    const hrNode = pt.getElementsByTagName('hr')[0] || pt.getElementsByTagName('gpxtpx:hr')[0] || pt.getElementsByTagName('ns3:hr')[0];
    if (hrNode && hrNode.textContent) {
      hr = parseInt(hrNode.textContent, 10);
      if (!isNaN(hr) && hr > 0) {
        heartRateSum += hr;
        heartRateCount++;
        if (hr > maxHeartRate) maxHeartRate = hr;
      }
    }

    if (i === 0) {
      startTime = ptTime;
      currentKmStartTime = ptTime;
      if (ele !== undefined) currentKmStartEle = ele;
    }
    endTime = ptTime;

    if (i > 0) {
      const prevPt = coordinates[coordinates.length - 1];
      const dist = haversineDistance(prevPt.lat, prevPt.lng, lat, lng);
      totalDistanceKm += dist;

      if (ele !== undefined && prevPt.ele !== undefined && ele > prevPt.ele) {
        const diff = ele - prevPt.ele;
        totalElevationGain += diff;
        currentKmEleGain += diff;
      }
    }

    if (hr !== undefined) {
      currentKmHrSum += hr;
      currentKmHrCount++;
    }

    // Check if 1 km mark completed
    if (totalDistanceKm >= currentKmIndex) {
      const splitTimeSec = ptTime && currentKmStartTime ? (ptTime.getTime() - currentKmStartTime.getTime()) / 1000 : 300;
      const paceMinKm = splitTimeSec / 60;
      splits.push({
        km: currentKmIndex,
        paceMinKm: parseFloat(paceMinKm.toFixed(2)),
        hr: currentKmHrCount > 0 ? Math.round(currentKmHrSum / currentKmHrCount) : undefined,
        elevationGain: Math.round(currentKmEleGain)
      });
      currentKmIndex++;
      currentKmStartDist = totalDistanceKm;
      currentKmStartTime = ptTime;
      currentKmEleGain = 0;
      currentKmHrSum = 0;
      currentKmHrCount = 0;
    }

    coordinates.push({ lat, lng, ele, hr, time: timeStr || undefined });
  }

  const durationSec = startTime && endTime ? Math.max(1, (endTime.getTime() - startTime.getTime()) / 1000) : Math.round(totalDistanceKm * 330);
  const avgPaceMinKm = totalDistanceKm > 0 ? (durationSec / 60) / totalDistanceKm : 5.0;
  const avgHeartRate = heartRateCount > 0 ? Math.round(heartRateSum / heartRateCount) : undefined;
  
  const cleanTitle = filename.replace(/\.[^/.]+$/, "").replace(/_/g, " ");

  return {
    title: cleanTitle || 'GPX Hardloopsessie',
    date: startTime ? startTime.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    timeOfDay: startTime ? startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '10:00',
    type: 'easy',
    isTreadmill: false,
    distanceKm: parseFloat(totalDistanceKm.toFixed(2)),
    durationSec: Math.round(durationSec),
    avgPaceMinKm: parseFloat(avgPaceMinKm.toFixed(2)),
    elevationGainM: Math.round(totalElevationGain),
    avgHeartRate,
    maxHeartRate: maxHeartRate > 0 ? maxHeartRate : undefined,
    avgCadenceSpm: 172,
    calories: Math.round(totalDistanceKm * 65),
    source: 'gpx',
    routeCoordinates: coordinates,
    splits
  };
}
