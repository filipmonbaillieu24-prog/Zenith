// ─── Historical weather fetching via Open-Meteo (free, no API key) ───────────

export interface RideWeather {
  tempC:         number;   // average temperature °C
  windKmh:       number;   // max wind speed km/h
  windDir:       number;   // dominant wind direction degrees
  precipitation: number;   // total precipitation mm
  weatherCode:   number;   // WMO weather code
  description:   string;
}

const WMO: Record<number, string> = {
  0: 'Helder', 1: 'Overwegend helder', 2: 'Gedeeltelijk bewolkt', 3: 'Bewolkt',
  45: 'Mist', 48: 'IJsmist',
  51: 'Lichte motregen', 53: 'Motregen', 55: 'Zware motregen',
  61: 'Lichte regen', 63: 'Regen', 65: 'Zware regen',
  71: 'Lichte sneeuw', 73: 'Sneeuw', 75: 'Zware sneeuw',
  80: 'Regenbuien', 81: 'Regenbuien', 82: 'Zware buien',
  95: 'Onweer', 96: 'Onweer with hagel', 99: 'Zwaar onweer',
};

export async function fetchRideWeather(
  lat: number, lng: number, dateMs: number
): Promise<RideWeather | null> {
  const date = new Date(dateMs).toISOString().slice(0, 10);
  // Can't fetch data less than 5 days old from archive
  if (Date.now() - dateMs < 5 * 86400000) return null;
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&start_date=${date}&end_date=${date}&daily=temperature_2m_mean,windspeed_10m_max,winddirection_10m_dominant,precipitation_sum,weathercode&timezone=auto&windspeed_unit=kmh`;
  try {
    const res  = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const d    = data.daily;
    if (!d?.temperature_2m_mean?.[0]) return null;
    const code = d.weathercode?.[0] ?? 0;
    return {
      tempC:         Math.round(d.temperature_2m_mean[0] ?? 0),
      windKmh:       Math.round(d.windspeed_10m_max?.[0] ?? 0),
      windDir:       Math.round(d.winddirection_10m_dominant?.[0] ?? 0),
      precipitation: Math.round((d.precipitation_sum?.[0] ?? 0) * 10) / 10,
      weatherCode:   code,
      description:   WMO[code] ?? 'Onbekend',
    };
  } catch {
    return null;
  }
}

export function weatherIcon(code: number): string {
  if (code === 0)  return '☀️';
  if (code <= 2)   return '🌤️';
  if (code === 3)  return '☁️';
  if (code <= 48)  return '🌫️';
  if (code <= 65)  return '🌧️';
  if (code <= 77)  return '❄️';
  if (code <= 82)  return '🌦️';
  return '⛈️';
}

export function windDirLabel(deg: number): string {
  const dirs = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}
