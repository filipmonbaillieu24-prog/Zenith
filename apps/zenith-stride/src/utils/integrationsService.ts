import { RunActivity } from '../types/stride';

export interface ExternalSession {
  id: string;
  source: 'polar' | 'strava';
  title: string;
  date: string;
  distanceKm: number;
  durationSec: number;
  avgPaceMinKm: number;
  elevationGainM: number;
  avgHeartRate?: number;
  isTreadmill: boolean;
  imported: boolean;
}

export function getMockExternalSessions(): ExternalSession[] {
  return [
    {
      id: 'polar-8841',
      source: 'polar',
      title: 'Polar Running Index Test (Zondagduur)',
      date: '2026-08-14',
      distanceKm: 14.2,
      durationSec: 4140, // 1h 09m -> ~4:51 min/km
      avgPaceMinKm: 4.86,
      elevationGainM: 112,
      avgHeartRate: 148,
      isTreadmill: false,
      imported: false
    },
    {
      id: 'polar-8842',
      source: 'polar',
      title: 'Polar Loopband Incline 2% Session',
      date: '2026-08-12',
      distanceKm: 8.0,
      durationSec: 2300, // ~4:47 min/km
      avgPaceMinKm: 4.79,
      elevationGainM: 0,
      avgHeartRate: 156,
      isTreadmill: true,
      imported: false
    },
    {
      id: 'strava-9921',
      source: 'strava',
      title: 'Strava 5x1000m Vo2Max Intervallen',
      date: '2026-08-10',
      distanceKm: 10.5,
      durationSec: 2820, // ~4:28 min/km
      avgPaceMinKm: 4.47,
      elevationGainM: 45,
      avgHeartRate: 168,
      isTreadmill: false,
      imported: false
    },
    {
      id: 'strava-9922',
      source: 'strava',
      title: 'Strava Trail Run Veluwe Zoom',
      date: '2026-08-08',
      distanceKm: 18.6,
      durationSec: 5800, // ~5:11 min/km
      avgPaceMinKm: 5.19,
      elevationGainM: 320,
      avgHeartRate: 152,
      isTreadmill: false,
      imported: false
    }
  ];
}

export function convertExternalToRunActivity(session: ExternalSession): RunActivity {
  return {
    id: `imp-${session.source}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    title: session.title,
    date: session.date,
    timeOfDay: '10:15',
    type: session.isTreadmill ? 'treadmill' : (session.distanceKm > 14 ? 'long_run' : 'easy'),
    isTreadmill: session.isTreadmill,
    inclinePercent: session.isTreadmill ? 1.5 : 0,
    distanceKm: session.distanceKm,
    durationSec: session.durationSec,
    avgPaceMinKm: session.avgPaceMinKm,
    elevationGainM: session.elevationGainM,
    avgHeartRate: session.avgHeartRate,
    avgCadenceSpm: session.isTreadmill ? 176 : 170,
    calories: Math.round(session.distanceKm * 68),
    source: session.source,
    notes: `Geïmporteerd vanuit ${session.source === 'polar' ? 'Polar Flow' : 'Strava'}`
  };
}
