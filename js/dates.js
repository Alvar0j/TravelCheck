// Utilidades de fechas en formato local YYYY-MM-DD (sin problemas de zona horaria).

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function today() {
  return formatISO(new Date());
}

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return formatISO(d);
}

export function diffDays(a, b) {
  // b - a en días
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

export function eachDay(start, end) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

const fmt = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtLong = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

export function prettyDate(s) {
  return fmt.format(parseDate(s));
}

export function longDate(s) {
  return fmtLong.format(parseDate(s));
}
