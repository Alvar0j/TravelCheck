import {
  CATEGORIES, TRANSPORTS, LODGINGS, TRIP_TYPES,
  buildPlan, mergePlan, tripDays, weatherFlags,
} from './rules.js';
import { geocode, fetchWeather, describeCode } from './weather.js';
import { today, addDays, diffDays, prettyDate, longDate } from './dates.js';

// ---------- Almacenamiento local ----------

const KEY = 'travelcheck:v1';
const WEATHER_TTL = 3 * 3600 * 1000;

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (data && Array.isArray(data.trips)) return { settings: {}, ...data };
  } catch { /* datos corruptos: empezamos de cero */ }
  return { trips: [], settings: { homeCountry: 'ES' } };
}

let db = load();

function save() {
  localStorage.setItem(KEY, JSON.stringify(db));
}

function getTrip(id) {
  return db.trips.find((t) => t.id === id);
}

function putTrip(trip) {
  const i = db.trips.findIndex((t) => t.id === trip.id);
  if (i >= 0) db.trips[i] = trip; else db.trips.push(trip);
  save();
}

function regenerate(trip) {
  return mergePlan(trip, buildPlan(trip, db.settings));
}

// ---------- Utilidades de UI ----------

const $app = document.getElementById('app');
const $title = document.getElementById('title');
const $back = document.getElementById('back');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function setHeader(title, backTo) {
  $title.textContent = title;
  $back.hidden = !backTo;
  $back.onclick = () => { location.hash = backTo; };
}

function pct(list) {
  if (!list.length) return 0;
  return Math.round((list.filter((x) => x.done).length / list.length) * 100);
}

function taskDue(trip, t) {
  return t.due || addDays(trip.startDate, t.offset || 0);
}

function status(trip) {
  const now = today();
  const until = diffDays(now, trip.startDate);
  if (now > trip.endDate) return { cls: 'muted', text: 'Terminado', past: true };
  if (now >= trip.startDate) return { cls: 'ok', text: 'En curso' };
  if (until === 1) return { cls: 'warn', text: 'Mañana' };
  if (until <= 7) return { cls: 'warn', text: `Faltan ${until} días` };
  return { cls: '', text: `Faltan ${until} días` };
}

function destLabel(d) {
  if (!d) return '';
  return [d.name, d.admin1 && d.admin1 !== d.name ? d.admin1 : '', d.country].filter(Boolean).join(', ');
}

// ---------- Tiempo ----------

async function refreshWeather(trip, { force = false } = {}) {
  if (!trip.destination?.lat) return trip;
  if (!navigator.onLine) return trip;
  if (today() > trip.endDate) return trip;
  const w = trip.weather;
  const stale = !w || Date.now() - w.fetchedAt > WEATHER_TTL || w.for !== `${trip.startDate}|${trip.endDate}|${trip.destination.lat}`;
  if (!force && !stale) return trip;
  try {
    const weather = await fetchWeather(trip.destination, trip.startDate, trip.endDate);
    weather.for = `${trip.startDate}|${trip.endDate}|${trip.destination.lat}`;
    const updated = regenerate({ ...trip, weather });
    putTrip(updated);
    return updated;
  } catch (e) {
    if (force) toast('No se pudo actualizar el tiempo');
    return trip;
  }
}

// ---------- Vistas ----------

function viewHome() {
  setHeader('TravelCheck');
  const trips = [...db.trips].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const now = today();
  const upcoming = trips.filter((t) => t.endDate >= now);
  const past = trips.filter((t) => t.endDate < now).reverse();

  const card = (t) => {
    const s = status(t);
    const p = pct([...t.items, ...t.tasks]);
    return `
      <a class="card trip-card" href="#/trip/${t.id}">
        <div class="row">
          <div class="dest">${esc(t.name)}</div>
          <div class="spacer"></div>
          <span class="badge ${s.cls}">${s.text}</span>
        </div>
        <div class="muted">${esc(destLabel(t.destination))}</div>
        <div class="muted">${prettyDate(t.startDate)} → ${prettyDate(t.endDate)} · ${tripDays(t)} días</div>
        <div class="progress"><div style="width:${p}%"></div></div>
        <div class="muted small">${p}% preparado</div>
      </a>`;
  };

  $app.innerHTML = `
    ${trips.length === 0 ? `
      <div class="empty">
        <div class="big">🧳</div>
        <p><strong>Ningún viaje todavía</strong></p>
        <p>Crea uno y TravelCheck preparará tu maleta, documentación y tareas según el destino, las fechas, el transporte y el tiempo.</p>
      </div>` : ''}
    ${upcoming.length ? `<h2>Próximos viajes</h2>${upcoming.map(card).join('')}` : ''}
    ${past.length ? `<h2>Viajes pasados</h2>${past.map(card).join('')}` : ''}
    <a class="btn fab" href="#/new">＋ Nuevo viaje</a>
  `;
}

function chipGroup(name, options, selected, multi) {
  return `<div class="chips" data-group="${name}" data-multi="${multi ? 1 : 0}">
    ${options.map(([v, l]) => `<button type="button" class="chip" data-value="${v}" aria-pressed="${selected.includes(v)}">${l}</button>`).join('')}
  </div>`;
}

function stepper(name, label, hint, value) {
  return `<div class="stepper">
    <div><div>${label}</div><div class="muted small">${hint}</div></div>
    <div class="ctrl">
      <button type="button" data-step="${name}" data-d="-1" aria-label="Menos">−</button>
      <output data-out="${name}">${value}</output>
      <button type="button" data-step="${name}" data-d="1" aria-label="Más">+</button>
    </div>
  </div>`;
}

function viewForm(id) {
  const existing = id ? getTrip(id) : null;
  if (id && !existing) { location.hash = '#/'; return; }
  setHeader(existing ? 'Editar viaje' : 'Nuevo viaje', existing ? `#/trip/${id}` : '#/');

  const start = addDays(today(), 7);
  const f = existing ? structuredClone(existing) : {
    name: '',
    destination: null,
    startDate: start,
    endDate: addDays(start, 4),
    transport: [],
    lodging: 'hotel',
    types: [],
    travelers: { adults: 1, kids: 0, babies: 0, pets: 0 },
    options: { carryOnOnly: false, laundry: false, petStaysHome: false },
  };
  f.options = { carryOnOnly: false, laundry: false, petStaysHome: false, ...f.options };

  $app.innerHTML = `
    <form id="trip-form" autocomplete="off">
      <div class="card">
        <label class="field"><span>Destino</span>
          <input type="search" id="dest-q" placeholder="Busca una ciudad o lugar…" value="">
        </label>
        <div id="dest-results" class="results"></div>
        <div id="dest-selected"></div>
        <label class="field" style="margin-top:14px"><span>Nombre del viaje (opcional)</span>
          <input type="text" id="name" placeholder="Ej. Vacaciones de verano" value="${esc(f.name)}">
        </label>
        <div class="two">
          <label class="field"><span>Ida</span><input type="date" id="start" value="${f.startDate}" required></label>
          <label class="field"><span>Vuelta</span><input type="date" id="end" value="${f.endDate}" required></label>
        </div>
        <div class="muted" id="days-info"></div>
      </div>

      <h2>Transporte</h2>
      ${chipGroup('transport', TRANSPORTS, f.transport, true)}
      <div id="plane-opts" style="margin-top:8px" ${f.transport.includes('plane') ? '' : 'hidden'}>
        <label class="toggle"><input type="checkbox" id="carryOnOnly" ${f.options.carryOnOnly ? 'checked' : ''}> Solo equipaje de mano</label>
      </div>

      <h2>Alojamiento</h2>
      ${chipGroup('lodging', LODGINGS, [f.lodging], false)}

      <h2>Tipo de viaje</h2>
      ${chipGroup('types', TRIP_TYPES, f.types, true)}

      <h2>Quién viaja</h2>
      <div class="card">
        ${stepper('adults', 'Adultos', 'Desde 13 años', f.travelers.adults)}
        ${stepper('kids', 'Niños', '3 a 12 años', f.travelers.kids)}
        ${stepper('babies', 'Bebés', '0 a 2 años', f.travelers.babies)}
        ${stepper('pets', 'Mascotas', 'Que viajan contigo', f.travelers.pets)}
      </div>

      <h2>Otros detalles</h2>
      <div class="card">
        <label class="toggle"><input type="checkbox" id="laundry" ${f.options.laundry ? 'checked' : ''}> Podré lavar ropa en el destino</label>
        <label class="toggle"><input type="checkbox" id="petStaysHome" ${f.options.petStaysHome ? 'checked' : ''}> Dejo una mascota en casa</label>
      </div>

      <button class="btn block" type="submit" id="save">${existing ? 'Guardar cambios' : 'Crear viaje y generar lista'}</button>
      ${existing ? '<button class="btn danger block" type="button" id="delete" style="margin-top:10px">Eliminar viaje</button>' : ''}
    </form>
  `;

  const $q = document.getElementById('dest-q');
  const $results = document.getElementById('dest-results');
  const $sel = document.getElementById('dest-selected');
  const $start = document.getElementById('start');
  const $end = document.getElementById('end');

  const renderDest = () => {
    $sel.innerHTML = f.destination
      ? `<div class="selected-dest">📍 <strong>${esc(f.destination.name)}</strong> <span class="muted">${esc([f.destination.admin1, f.destination.country].filter(Boolean).join(', '))}</span></div>`
      : '';
  };
  renderDest();

  const renderDays = () => {
    const ok = $start.value && $end.value && $end.value >= $start.value;
    document.getElementById('days-info').textContent = ok
      ? `${diffDays($start.value, $end.value) + 1} días · ${diffDays($start.value, $end.value)} noches`
      : 'La fecha de vuelta debe ser posterior a la de ida';
  };
  renderDays();
  $start.addEventListener('change', () => {
    if ($end.value < $start.value) $end.value = $start.value;
    renderDays();
  });
  $end.addEventListener('change', renderDays);

  let searchTimer;
  let lastResults = [];
  $q.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = $q.value.trim();
    if (q.length < 2) { $results.innerHTML = ''; return; }
    searchTimer = setTimeout(async () => {
      try {
        lastResults = await geocode(q);
        $results.innerHTML = lastResults.length
          ? lastResults.map((r, i) => `<button type="button" data-i="${i}"><strong>${esc(r.name)}</strong> <span class="muted">${esc([r.admin1, r.country].filter(Boolean).join(', '))}</span></button>`).join('')
          : '<div class="muted">Sin resultados</div>';
      } catch {
        $results.innerHTML = '<div class="muted">Sin conexión: no se puede buscar el destino</div>';
      }
    }, 300);
  });
  $results.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    f.destination = lastResults[Number(b.dataset.i)];
    $results.innerHTML = '';
    $q.value = '';
    renderDest();
  });

  $app.querySelectorAll('.chips').forEach((group) => {
    group.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const name = group.dataset.group;
      const v = chip.dataset.value;
      if (group.dataset.multi === '1') {
        const list = f[name];
        const i = list.indexOf(v);
        if (i >= 0) list.splice(i, 1); else list.push(v);
        chip.setAttribute('aria-pressed', i < 0);
      } else {
        f[name] = v;
        group.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', c === chip));
      }
      document.getElementById('plane-opts').hidden = !f.transport.includes('plane');
    });
  });

  $app.querySelectorAll('[data-step]').forEach((b) => {
    b.addEventListener('click', () => {
      const k = b.dataset.step;
      const min = k === 'adults' ? 1 : 0;
      f.travelers[k] = Math.max(min, Math.min(20, f.travelers[k] + Number(b.dataset.d)));
      $app.querySelector(`[data-out="${k}"]`).textContent = f.travelers[k];
    });
  });

  document.getElementById('delete')?.addEventListener('click', () => {
    if (!confirm('¿Eliminar este viaje y su lista?')) return;
    db.trips = db.trips.filter((t) => t.id !== id);
    save();
    location.hash = '#/';
  });

  document.getElementById('trip-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!f.destination) { toast('Elige un destino de la lista'); $q.focus(); return; }
    if ($end.value < $start.value) { toast('Revisa las fechas'); return; }
    if (!f.transport.length) { toast('Elige al menos un medio de transporte'); return; }
    f.startDate = $start.value;
    f.endDate = $end.value;
    f.name = document.getElementById('name').value.trim() || f.destination.name;
    for (const k of ['carryOnOnly', 'laundry', 'petStaysHome']) f.options[k] = document.getElementById(k).checked;

    const btn = document.getElementById('save');
    btn.disabled = true;
    btn.textContent = 'Consultando el tiempo…';

    let trip = existing
      ? { ...existing, ...f }
      : { ...f, id: uid(), createdAt: Date.now(), items: [], tasks: [], hidden: [] };
    trip = regenerate(trip);
    putTrip(trip);
    await refreshWeather(trip, { force: true });
    location.hash = `#/trip/${trip.id}`;
  });
}

function weatherCard(trip) {
  const w = trip.weather;
  if (!w || !w.days?.length) {
    return `<div class="card"><strong>🌡️ Tiempo</strong>
      <p class="muted">Aún no hay datos del tiempo${navigator.onLine ? '' : ' (sin conexión)'}. La lista se ajustará automáticamente cuando los haya.</p>
      <button class="btn secondary small" data-action="weather">Actualizar tiempo</button></div>`;
  }
  const fl = weatherFlags(w);
  const src = {
    forecast: 'Previsión real',
    historical: 'Estimación con datos del año pasado (aún no hay previsión)',
    mixed: 'Previsión real + estimación para los días lejanos',
  }[w.source];
  const hints = [];
  if (fl.hot) hints.push(['🥵', `Calor: hasta ${Math.round(fl.tmax)}°C. Ropa ligera, protector solar y agua.`]);
  if (fl.cold) hints.push(['🥶', `Frío: mínimas de ${Math.round(fl.tmin)}°C. Lleva abrigo.`]);
  if (fl.rain) hints.push(['☔', `Lluvia ${fl.rainyDays} día(s). Paraguas o chubasquero.`]);
  if (fl.snow) hints.push(['❄️', 'Posible nieve. Calzado adecuado.']);
  if (fl.storm) hints.push(['⛈️', 'Posibles tormentas.']);
  if (fl.windy) hints.push(['💨', 'Viento fuerte algún día.']);
  if (!hints.length) hints.push(['👌', `Temperaturas suaves: entre ${Math.round(fl.tmin)}°C y ${Math.round(fl.tmax)}°C.`]);

  return `<div class="card">
    <div class="row"><strong>🌡️ Tiempo en ${esc(trip.destination.name)}</strong><div class="spacer"></div>
      <button class="btn secondary small" data-action="weather" aria-label="Actualizar tiempo">↻</button></div>
    <div class="muted small" style="margin:4px 0 10px">${src} · actualizado ${new Date(w.fetchedAt).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
    <div class="weather-days">
      ${w.days.map((d) => {
        const [ico, txt] = describeCode(d.code);
        return `<div class="wday ${d.estimated ? 'est' : ''}" title="${esc(txt)}">
          <div class="p">${prettyDate(d.date)}</div>
          <div class="ico">${ico}</div>
          <div class="t">${Math.round(d.tmax)}° / ${Math.round(d.tmin)}°</div>
          <div class="p">${d.precip >= 0.5 ? `💧 ${d.precip.toFixed(1)} mm` : d.precipProb != null ? `💧 ${d.precipProb}%` : '&nbsp;'}</div>
        </div>`;
      }).join('')}
    </div>
    <div style="margin-top:10px">${hints.map(([i, t]) => `<div class="hint"><span>${i}</span><span>${t}</span></div>`).join('')}</div>
  </div>`;
}

function tabs(trip, active) {
  const pending = trip.tasks.filter((t) => !t.done).length;
  const left = trip.items.filter((t) => !t.done).length;
  return `<nav class="tabs">
    <a href="#/trip/${trip.id}" class="${active === 'summary' ? 'active' : ''}">Resumen</a>
    <a href="#/trip/${trip.id}/pack" class="${active === 'pack' ? 'active' : ''}">Maleta (${left})</a>
    <a href="#/trip/${trip.id}/tasks" class="${active === 'tasks' ? 'active' : ''}">Tareas (${pending})</a>
  </nav>`;
}

function taskRow(trip, t) {
  const due = taskDue(trip, t);
  const d = diffDays(today(), due);
  let badge;
  if (t.done) badge = '<span class="badge ok">Hecho</span>';
  else if (d < 0) badge = '<span class="badge danger">Hazlo ya</span>';
  else if (d === 0) badge = '<span class="badge warn">Hoy</span>';
  else if (d === 1) badge = '<span class="badge warn">Mañana</span>';
  else badge = `<span class="badge">En ${d} días</span>`;
  return `<div class="item ${t.done ? 'done' : ''}" data-kind="task" data-key="${esc(t.key)}">
    <input type="checkbox" ${t.done ? 'checked' : ''} aria-label="Hecho">
    <div class="txt"><span class="label">${esc(t.text)}</span>
      <span class="reason">${prettyDate(due)}${t.reason ? ' · ' + esc(t.reason) : ''}</span></div>
    ${badge}
    <button class="del" data-action="del" aria-label="Eliminar">✕</button>
  </div>`;
}

function viewSummary(trip) {
  const s = status(trip);
  const itemsPct = pct(trip.items);
  const tasksPct = pct(trip.tasks);
  const next = trip.tasks.filter((t) => !t.done).sort((a, b) => taskDue(trip, a).localeCompare(taskDue(trip, b))).slice(0, 4);
  const T = TRANSPORTS.filter(([v]) => trip.transport.includes(v)).map(([, l]) => l).join(' · ');
  const L = LODGINGS.find(([v]) => v === trip.lodging)?.[1] || '';
  const Y = TRIP_TYPES.filter(([v]) => trip.types.includes(v)).map(([, l]) => l).join(' · ');
  const tr = trip.travelers;
  const who = [
    `${tr.adults} adulto${tr.adults > 1 ? 's' : ''}`,
    tr.kids ? `${tr.kids} niño${tr.kids > 1 ? 's' : ''}` : '',
    tr.babies ? `${tr.babies} bebé${tr.babies > 1 ? 's' : ''}` : '',
    tr.pets ? `${tr.pets} mascota${tr.pets > 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(', ');

  return `
    <div class="card">
      <div class="row"><strong>📍 ${esc(destLabel(trip.destination))}</strong></div>
      <div class="muted">${longDate(trip.startDate)} → ${longDate(trip.endDate)}</div>
      <div style="margin-top:8px"><span class="badge ${s.cls}">${s.text}</span></div>
      <div class="stats" style="margin-top:14px">
        <div><div class="n">${tripDays(trip)}</div><div class="muted small">días</div></div>
        <div><div class="n">${itemsPct}%</div><div class="muted small">maleta</div></div>
        <div><div class="n">${tasksPct}%</div><div class="muted small">tareas</div></div>
      </div>
      <div class="muted small" style="margin-top:12px">${T}<br>${L}${Y ? ' · ' + Y : ''}<br>${who}</div>
      <a class="btn secondary small" href="#/edit/${trip.id}" style="margin-top:10px">✏️ Editar viaje</a>
    </div>
    ${weatherCard(trip)}
    <h2>Próximas tareas</h2>
    ${next.length ? `<div class="card list">${next.map((t) => taskRow(trip, t)).join('')}</div>` : '<p class="muted">¡Todo hecho! 🎉</p>'}
  `;
}

function viewPack(trip, ui) {
  const groups = CATEGORIES.map(([cat, label]) => {
    let items = trip.items.filter((i) => i.cat === cat);
    const total = items.length;
    if (!total) return '';
    const done = items.filter((i) => i.done).length;
    if (ui.hideDone) items = items.filter((i) => !i.done);
    return `<div class="group">
      <div class="group-head"><span>${label}</span><span class="muted small">${done}/${total}</span></div>
      ${items.length ? `<div class="card list">${items.map((i) => `
        <div class="item ${i.done ? 'done' : ''}" data-kind="item" data-key="${esc(i.key)}">
          <input type="checkbox" ${i.done ? 'checked' : ''} aria-label="Guardado">
          <div class="txt"><span class="label">${esc(i.text)}</span>${i.reason ? `<span class="reason">${esc(i.reason)}</span>` : ''}</div>
          ${i.qty != null ? `<button class="qty" data-action="qty" aria-label="Cambiar cantidad">×${i.qty}</button>` : ''}
          <button class="del" data-action="del" aria-label="Eliminar">✕</button>
        </div>`).join('')}</div>` : ''}
    </div>`;
  }).join('');

  return `
    <div class="row" style="margin-bottom:6px">
      <label class="toggle"><input type="checkbox" id="hide-done" ${ui.hideDone ? 'checked' : ''}> Ocultar lo ya guardado</label>
    </div>
    <div class="progress"><div style="width:${pct(trip.items)}%"></div></div>
    ${groups}
    <h2>Añadir algo</h2>
    <form class="add-form" id="add-item">
      <input type="text" id="new-item" placeholder="Ej. Gafas de natación" required>
      <select id="new-cat" aria-label="Categoría">${CATEGORIES.map(([v, l]) => `<option value="${v}" ${v === 'misc' ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="btn small" type="submit">＋</button>
    </form>
    <div class="row" style="margin-top:18px; flex-wrap:wrap">
      ${trip.hidden.some((k) => !k.startsWith('task:')) ? '<button class="btn secondary small" data-action="restore">Restaurar eliminados</button>' : ''}
      <button class="btn secondary small" data-action="uncheck">Desmarcar todo</button>
    </div>
  `;
}

function viewTasks(trip) {
  const list = [...trip.tasks].sort((a, b) => (a.done - b.done) || taskDue(trip, a).localeCompare(taskDue(trip, b)));
  return `
    <p class="muted">Cosas que hacer antes de salir, ordenadas por fecha.</p>
    <div class="progress"><div style="width:${pct(trip.tasks)}%"></div></div>
    <div class="card list" style="margin-top:12px">${list.map((t) => taskRow(trip, t)).join('') || '<div class="item muted">No hay tareas</div>'}</div>
    <h2>Añadir tarea</h2>
    <form class="add-form" id="add-task">
      <input type="text" id="new-task" placeholder="Ej. Dejar llaves al vecino" required>
      <input type="date" id="new-due" value="${trip.startDate > today() ? addDays(trip.startDate, -1) : today()}" aria-label="Fecha">
      <button class="btn small" type="submit">＋</button>
    </form>
    ${trip.hidden.some((k) => k.startsWith('task:')) ? '<button class="btn secondary small" data-action="restore-tasks" style="margin-top:18px">Restaurar tareas eliminadas</button>' : ''}
  `;
}

const packUI = { hideDone: false };

function viewTrip(id, tab = 'summary') {
  let trip = getTrip(id);
  if (!trip) { location.hash = '#/'; return; }
  setHeader(trip.name, '#/');

  const render = () => {
    trip = getTrip(id);
    const body = tab === 'pack' ? viewPack(trip, packUI) : tab === 'tasks' ? viewTasks(trip) : viewSummary(trip);
    const y = window.scrollY;
    $app.innerHTML = tabs(trip, tab) + body;
    window.scrollTo(0, y);
  };
  render();

  const update = (fn) => {
    const t = structuredClone(getTrip(id));
    fn(t);
    putTrip(t);
    render();
  };

  $app.onchange = (e) => {
    if (e.target.id === 'hide-done') { packUI.hideDone = e.target.checked; render(); return; }
    const row = e.target.closest('.item[data-key]');
    if (!row || e.target.type !== 'checkbox') return;
    const list = row.dataset.kind === 'task' ? 'tasks' : 'items';
    update((t) => { const x = t[list].find((i) => i.key === row.dataset.key); if (x) x.done = e.target.checked; });
  };

  $app.onclick = async (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const row = b.closest('.item[data-key]');
    const action = b.dataset.action;
    if (action === 'weather') {
      b.disabled = true;
      await refreshWeather(getTrip(id), { force: true });
      render();
      toast('Tiempo actualizado y lista ajustada');
    } else if (action === 'del' && row) {
      const isTask = row.dataset.kind === 'task';
      const key = row.dataset.key;
      update((t) => {
        const list = isTask ? 'tasks' : 'items';
        const x = t[list].find((i) => i.key === key);
        t[list] = t[list].filter((i) => i.key !== key);
        if (x && !x.custom) t.hidden.push(isTask ? 'task:' + key : key);
      });
    } else if (action === 'qty' && row) {
      const cur = getTrip(id).items.find((i) => i.key === row.dataset.key);
      const v = prompt(`Cantidad de "${cur.text}"`, cur.qty);
      const n = parseInt(v, 10);
      if (!Number.isFinite(n) || n < 0) return;
      update((t) => { const x = t.items.find((i) => i.key === row.dataset.key); x.qty = n; x.qtyEdited = true; });
    } else if (action === 'restore') {
      const t = getTrip(id);
      putTrip(regenerate({ ...t, hidden: t.hidden.filter((k) => k.startsWith('task:')) }));
      render();
    } else if (action === 'restore-tasks') {
      const t = getTrip(id);
      putTrip(regenerate({ ...t, hidden: t.hidden.filter((k) => !k.startsWith('task:')) }));
      render();
    } else if (action === 'uncheck') {
      if (!confirm('¿Desmarcar todos los elementos de la maleta? (útil para la vuelta)')) return;
      update((t) => t.items.forEach((i) => { i.done = false; }));
    }
  };

  $app.onsubmit = (e) => {
    e.preventDefault();
    if (e.target.id === 'add-item') {
      const text = document.getElementById('new-item').value.trim();
      const cat = document.getElementById('new-cat').value;
      if (!text) return;
      update((t) => t.items.push({ key: 'c-' + uid(), cat, text, reason: 'Añadido por ti', qty: null, done: false, custom: true }));
      toast('Añadido');
    } else if (e.target.id === 'add-task') {
      const text = document.getElementById('new-task').value.trim();
      const due = document.getElementById('new-due').value || today();
      if (!text) return;
      update((t) => t.tasks.push({ key: 'c-' + uid(), text, due, reason: 'Añadida por ti', done: false, custom: true }));
      toast('Tarea añadida');
    }
  };

  // Actualiza el tiempo en segundo plano si está desactualizado
  refreshWeather(trip).then((t) => { if (t !== trip && location.hash.startsWith(`#/trip/${id}`)) render(); });
}

const HOME_COUNTRIES = [
  ['ES', 'España'], ['PT', 'Portugal'], ['FR', 'Francia'], ['IT', 'Italia'], ['DE', 'Alemania'],
  ['GB', 'Reino Unido'], ['IE', 'Irlanda'], ['NL', 'Países Bajos'], ['BE', 'Bélgica'],
  ['CH', 'Suiza'], ['US', 'Estados Unidos'], ['MX', 'México'], ['AR', 'Argentina'],
  ['CO', 'Colombia'], ['CL', 'Chile'], ['PE', 'Perú'],
];

function viewSettings() {
  setHeader('Ajustes', '#/');
  const home = db.settings.homeCountry || 'ES';
  $app.innerHTML = `
    <div class="card">
      <label class="field"><span>País de residencia</span>
        <select id="home">${HOME_COUNTRIES.map(([c, n]) => `<option value="${c}" ${c === home ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </label>
      <p class="muted small">Se usa para saber si un viaje es al extranjero (documentación, enchufes, moneda, roaming). Las reglas de documentación están pensadas para ciudadanos españoles.</p>
    </div>
    <h2>Copia de seguridad</h2>
    <div class="card">
      <p class="muted">Tus viajes se guardan solo en este dispositivo. Exporta una copia de vez en cuando por si cambias de móvil.</p>
      <div class="row" style="flex-wrap:wrap">
        <button class="btn secondary small" id="export">⬇️ Exportar</button>
        <label class="btn secondary small">⬆️ Importar<input type="file" id="import" accept="application/json" hidden></label>
      </div>
    </div>
    <h2>Datos</h2>
    <div class="card">
      <p class="muted small">El tiempo y la búsqueda de destinos usan <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>. No se envía ningún dato personal.</p>
      <button class="btn danger small" id="wipe">Borrar todos los datos</button>
    </div>
  `;

  document.getElementById('home').onchange = (e) => {
    db.settings.homeCountry = e.target.value;
    db.trips = db.trips.map(regenerate);
    save();
    toast('Guardado. Listas actualizadas');
  };
  document.getElementById('export').onclick = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `travelcheck-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  document.getElementById('import').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.trips)) throw new Error();
      if (!confirm(`¿Reemplazar tus datos por la copia (${data.trips.length} viajes)?`)) return;
      db = { settings: { homeCountry: 'ES' }, ...data };
      save();
      toast('Copia importada');
      location.hash = '#/';
    } catch {
      toast('El archivo no es una copia válida');
    }
  };
  document.getElementById('wipe').onclick = () => {
    if (!confirm('¿Borrar todos los viajes? No se puede deshacer.')) return;
    db = { trips: [], settings: db.settings };
    save();
    location.hash = '#/';
  };
}

// ---------- Router ----------

function route() {
  $app.onclick = $app.onchange = $app.onsubmit = null;
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const [view, id, tab] = parts;
  if (view === 'new') viewForm();
  else if (view === 'edit') viewForm(id);
  else if (view === 'trip') viewTrip(id, tab || 'summary');
  else if (view === 'settings') viewSettings();
  else viewHome();
}

document.getElementById('settings-btn').onclick = () => { location.hash = '#/settings'; };
window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });
route();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
