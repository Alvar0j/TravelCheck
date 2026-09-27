// Geocodificación y tiempo con Open-Meteo (gratis, sin clave).
// - Hasta 15 días vista: previsión real.
// - Más allá: estimación con los datos del mismo periodo del año anterior.

import { today, addDays, eachDay } from './dates.js';

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const FORECAST_DAYS = 15;

export async function geocode(query) {
  const url = `${GEO_URL}?name=${encodeURIComponent(query)}&count=6&language=es&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('No se pudo buscar el destino');
  const data = await res.json();
  return (data.results || []).map((r) => ({
    name: r.name,
    admin1: r.admin1 || '',
    country: r.country || '',
    countryCode: r.country_code || '',
    lat: r.latitude,
    lon: r.longitude,
  }));
}

function toDays(daily, dateMap = (d) => d) {
  if (!daily || !daily.time) return [];
  return daily.time.map((t, i) => ({
    date: dateMap(t),
    tmax: daily.temperature_2m_max[i],
    tmin: daily.temperature_2m_min[i],
    precip: daily.precipitation_sum?.[i] ?? 0,
    precipProb: daily.precipitation_probability_max?.[i] ?? null,
    code: daily.weather_code?.[i] ?? null,
    wind: daily.wind_speed_10m_max?.[i] ?? null,
    uv: daily.uv_index_max?.[i] ?? null,
  })).filter((d) => d.tmax != null && d.tmin != null);
}

function shiftYear(s, n) {
  const [y, m, d] = s.split('-');
  // 29 de febrero -> 28 si el año destino no es bisiesto
  const ty = Number(y) + n;
  const leap = (ty % 4 === 0 && ty % 100 !== 0) || ty % 400 === 0;
  const day = m === '02' && d === '29' && !leap ? '28' : d;
  return `${ty}-${m}-${day}`;
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Error al consultar el tiempo');
  return res.json();
}

export async function fetchWeather(dest, startDate, endDate) {
  const now = today();
  const lastForecast = addDays(now, FORECAST_DAYS);
  const firstForecast = addDays(now, -60);
  const base = `latitude=${dest.lat}&longitude=${dest.lon}&timezone=auto`;
  const days = [];
  let usedForecast = false;
  let usedHistory = false;

  // Tramo con previsión
  const fStart = startDate > firstForecast ? startDate : firstForecast;
  const fEnd = endDate < lastForecast ? endDate : lastForecast;
  if (fStart <= fEnd) {
    const vars = 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code,wind_speed_10m_max,uv_index_max';
    const data = await getJSON(`${FORECAST_URL}?${base}&daily=${vars}&start_date=${fStart}&end_date=${fEnd}`);
    days.push(...toDays(data.daily));
    usedForecast = true;
  }

  // Tramo lejano: mismo periodo del año pasado
  const hStart = startDate > lastForecast ? startDate : addDays(lastForecast, 1);
  if (hStart <= endDate) {
    const vars = 'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,wind_speed_10m_max';
    // Retrocedemos los años necesarios para que el periodo ya esté en el histórico
    let n = -1;
    while (shiftYear(endDate, n) > addDays(now, -7)) n--;
    const hs = shiftYear(hStart, n);
    const he = shiftYear(endDate, n);
    const data = await getJSON(`${ARCHIVE_URL}?${base}&daily=${vars}&start_date=${hs}&end_date=${he}`);
    const wanted = eachDay(hStart, endDate);
    const hist = toDays(data.daily);
    // Reasignamos las fechas del año pasado a las del viaje
    hist.forEach((d, i) => { if (wanted[i]) days.push({ ...d, date: wanted[i], estimated: true }); });
    usedHistory = true;
  }

  return {
    source: usedForecast && usedHistory ? 'mixed' : usedForecast ? 'forecast' : 'historical',
    fetchedAt: Date.now(),
    days,
  };
}

const CODES = {
  0: ['☀️', 'Despejado'], 1: ['🌤️', 'Casi despejado'], 2: ['⛅', 'Parcialmente nuboso'],
  3: ['☁️', 'Nublado'], 45: ['🌫️', 'Niebla'], 48: ['🌫️', 'Niebla helada'],
  51: ['🌦️', 'Llovizna'], 53: ['🌦️', 'Llovizna'], 55: ['🌦️', 'Llovizna intensa'],
  56: ['🌧️', 'Llovizna helada'], 57: ['🌧️', 'Llovizna helada'],
  61: ['🌧️', 'Lluvia débil'], 63: ['🌧️', 'Lluvia'], 65: ['🌧️', 'Lluvia fuerte'],
  66: ['🌧️', 'Lluvia helada'], 67: ['🌧️', 'Lluvia helada'],
  71: ['🌨️', 'Nieve débil'], 73: ['🌨️', 'Nieve'], 75: ['❄️', 'Nieve fuerte'], 77: ['🌨️', 'Granizo fino'],
  80: ['🌦️', 'Chubascos'], 81: ['🌧️', 'Chubascos'], 82: ['⛈️', 'Chubascos fuertes'],
  85: ['🌨️', 'Chubascos de nieve'], 86: ['🌨️', 'Chubascos de nieve'],
  95: ['⛈️', 'Tormenta'], 96: ['⛈️', 'Tormenta con granizo'], 99: ['⛈️', 'Tormenta con granizo'],
};

export function describeCode(code) {
  return CODES[code] || ['🌡️', 'Sin datos'];
}
