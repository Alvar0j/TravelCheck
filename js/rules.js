// Motor de reglas: a partir de los datos del viaje genera la lista de equipaje
// y las tareas previas. Es lógica pura (sin DOM) para poder testearla.

import { diffDays } from './dates.js';
import { EU, EHIC, DNI_OK, EURO, ROAM_LIKE_HOME, CURRENCY, needsAdapter } from './countries.js';

export const CATEGORIES = [
  ['docs', '📄 Documentación'],
  ['money', '💳 Dinero'],
  ['clothes', '👕 Ropa'],
  ['shoes', '👟 Calzado'],
  ['toiletry', '🧴 Aseo'],
  ['health', '💊 Salud'],
  ['tech', '🔌 Electrónica'],
  ['transport', '🚗 Transporte'],
  ['activity', '🎒 Actividades'],
  ['kids', '🧸 Niños'],
  ['pets', '🐾 Mascotas'],
  ['misc', '📦 Varios'],
];

export const TRANSPORTS = [
  ['plane', '✈️ Avión'],
  ['car', '🚗 Coche'],
  ['train', '🚆 Tren'],
  ['bus', '🚌 Autobús'],
  ['boat', '⛴️ Barco'],
  ['motorbike', '🏍️ Moto'],
  ['campervan', '🚐 Autocaravana'],
];

export const LODGINGS = [
  ['hotel', '🏨 Hotel'],
  ['apartment', '🏠 Apartamento'],
  ['hostel', '🛏️ Albergue'],
  ['family', '👪 Casa de familia/amigos'],
  ['camping', '⛺ Camping'],
  ['campervan', '🚐 Autocaravana'],
  ['cruise', '🚢 Crucero'],
];

export const TRIP_TYPES = [
  ['city', '🏙️ Ciudad'],
  ['beach', '🏖️ Playa'],
  ['mountain', '🥾 Montaña / senderismo'],
  ['ski', '⛷️ Esquí / nieve'],
  ['business', '💼 Trabajo'],
  ['event', '💍 Boda / evento'],
  ['rural', '🌳 Rural'],
  ['sport', '🏃 Deporte'],
];

// ---------- Tiempo ----------

export function weatherFlags(weather) {
  if (!weather || !weather.days || weather.days.length === 0) return null;
  const days = weather.days;
  const tmax = Math.max(...days.map((d) => d.tmax));
  const tmin = Math.min(...days.map((d) => d.tmin));
  const rainyDays = days.filter((d) => d.precip >= 1 || (d.precipProb ?? 0) >= 50).length;
  const snowDays = days.filter((d) => [71, 73, 75, 77, 85, 86].includes(d.code)).length;
  const windy = days.some((d) => (d.wind ?? 0) >= 40);
  const sunny = days.some((d) => [0, 1].includes(d.code)) || tmax >= 25 || days.some((d) => (d.uv ?? 0) >= 6);
  const storm = days.some((d) => [95, 96, 99].includes(d.code));
  return {
    tmax,
    tmin,
    hot: tmax >= 27,
    warm: tmax >= 22,
    cool: tmin <= 14,
    cold: tmin <= 8,
    freezing: tmin <= 0,
    rain: rainyDays > 0,
    rainyDays,
    snow: snowDays > 0,
    windy,
    sunny,
    storm,
  };
}

// ---------- Generación ----------

export function tripDays(trip) {
  return diffDays(trip.startDate, trip.endDate) + 1;
}

export function buildPlan(trip, settings = {}) {
  const home = settings.homeCountry || 'ES';
  const items = [];
  const tasks = [];
  const has = (list, v) => (list || []).includes(v);
  const T = trip.transport || [];
  const types = trip.types || [];
  const lodging = trip.lodging || 'hotel';
  const tr = { adults: 1, kids: 0, babies: 0, pets: 0, ...(trip.travelers || {}) };
  const people = tr.adults + tr.kids;
  const opt = trip.options || {};
  const days = Math.max(1, tripDays(trip));
  const nights = days - 1;
  const w = weatherFlags(trip.weather);
  const cc = trip.destination?.countryCode || home;
  const abroad = cc !== home;
  const outsideEU = abroad && !EU.has(cc);
  const flying = has(T, 'plane');
  const driving = has(T, 'car') || has(T, 'campervan') || has(T, 'motorbike');
  const camping = lodging === 'camping' || has(types, 'camping');
  const perPerson = people > 1 ? ' (por persona)' : '';

  const add = (cat, key, text, reason, qty = null) => items.push({ key, cat, text, reason, qty });
  const task = (key, text, offset, reason) => tasks.push({ key, text, offset, reason });

  // Días de ropa: con lavadora basta con una semana
  const clothDays = opt.laundry ? Math.min(days, 7) : days;

  // ----- Documentación -----
  if (abroad && !DNI_OK.has(cc)) {
    add('docs', 'passport', 'Pasaporte', 'Destino fuera de la zona en la que basta el DNI');
    task('passport-check', 'Comprobar que el pasaporte tiene al menos 6 meses de validez', -60, 'Viaje fuera de la UE');
    task('visa', 'Revisar requisitos de entrada / visado (ESTA, eVisa...) en exteriores.gob.es', -45, 'Viaje fuera de la UE');
  } else {
    add('docs', 'id', 'DNI', abroad ? 'Válido para viajar a este país' : 'Identificación');
    if (abroad) task('id-check', 'Comprobar que el DNI no caduca durante el viaje', -30, 'Viaje al extranjero');
  }
  if (tr.kids + tr.babies > 0 && abroad) {
    add('docs', 'kids-docs', 'Documentación de los niños (DNI/pasaporte + libro de familia)', 'Viajas con menores');
  }
  if (abroad && EHIC.has(cc)) {
    add('docs', 'ehic', 'Tarjeta Sanitaria Europea', 'Cobertura sanitaria en la UE/EEE/Suiza');
    task('ehic-check', 'Comprobar la caducidad de la Tarjeta Sanitaria Europea (o pedirla)', -20, 'Viaje por Europa');
  } else if (abroad) {
    add('docs', 'insurance', 'Póliza del seguro de viaje (teléfono de asistencia)', 'La sanidad pública no te cubre fuera de Europa');
    task('insurance', 'Contratar seguro de viaje con cobertura médica', -21, 'Viaje fuera de Europa');
  } else {
    add('docs', 'health-card', 'Tarjeta sanitaria', 'Por si necesitas atención médica');
  }
  if (flying) {
    add('docs', 'boarding', 'Tarjetas de embarque (en el móvil o impresas)', 'Viajas en avión');
    task('checkin', 'Hacer el check-in online del vuelo', -1, 'Viajas en avión');
    task('flight-rules', 'Revisar medidas y peso permitido del equipaje de la aerolínea', -3, 'Viajas en avión');
  }
  if (has(T, 'train') || has(T, 'bus') || has(T, 'boat')) {
    add('docs', 'tickets', 'Billetes de tren/autobús/barco', 'Transporte con billete');
  }
  if (lodging !== 'family') {
    add('docs', 'booking', 'Confirmación de la reserva del alojamiento', 'Alojamiento reservado');
    task('booking-check', 'Confirmar la reserva del alojamiento y la hora de check-in', -3, 'Alojamiento reservado');
  }
  if (driving) {
    add('docs', 'license', 'Carné de conducir', 'Vas a conducir');
    add('docs', 'car-docs', 'Permiso de circulación, ficha técnica (ITV) y seguro del vehículo', 'Vas a conducir');
    if (outsideEU) {
      add('docs', 'intl-license', 'Permiso internacional de conducir', 'Conducir fuera de la UE');
      task('intl-license', 'Solicitar el permiso internacional de conducir en la DGT', -30, 'Conducir fuera de la UE');
      add('docs', 'green-card', 'Carta verde del seguro', 'Conducir fuera de la UE');
    }
  }
  if (types.includes('business')) add('docs', 'work-docs', 'Documentación y agenda de reuniones', 'Viaje de trabajo');
  if (types.includes('event')) add('docs', 'invitation', 'Invitación / entradas del evento', 'Boda o evento');
  if (types.includes('ski')) add('docs', 'forfait', 'Forfait y seguro de esquí', 'Viaje de esquí');

  // ----- Dinero -----
  add('money', 'cards', 'Tarjeta de crédito/débito', 'Siempre');
  add('money', 'cash', 'Algo de efectivo', 'Por si no aceptan tarjeta');
  if (abroad && !EURO.has(cc)) {
    const cur = CURRENCY[cc] ? `: ${CURRENCY[cc]}` : '';
    add('money', 'currency', `Moneda local${cur}`, 'El destino no usa euros');
    task('bank', 'Avisar al banco del viaje y revisar comisiones por pagar en otra moneda', -7, 'Viaje fuera de la eurozona');
  }

  // ----- Ropa -----
  add('clothes', 'underwear', 'Ropa interior', `${clothDays} días + 1 de repuesto${perPerson}`, clothDays + 1);
  add('clothes', 'socks', 'Calcetines', `${clothDays} días + 1 de repuesto${perPerson}`, clothDays + 1);
  add('clothes', 'tshirts', 'Camisetas', `Una por día${perPerson}`, clothDays);
  const hot = w?.hot || (!w && types.includes('beach'));
  if (hot || w?.warm) {
    add('clothes', 'shorts', 'Pantalones cortos / faldas', `Hace calor (máx. ${w ? Math.round(w.tmax) + '°C' : 'previsto'})`, Math.max(1, Math.ceil(clothDays / 2)));
  }
  if (!w || w.cool || !w.hot) {
    add('clothes', 'trousers', 'Pantalones largos', perPerson ? `Uno cada 3 días${perPerson}` : 'Uno cada 3 días', Math.max(1, Math.ceil(clothDays / 3)));
  }
  add('clothes', 'pyjamas', 'Pijama', nights > 0 ? `${nights} noches` : 'Por si acaso', days > 7 && !opt.laundry ? 2 : 1);
  if (w?.cool || !w) add('clothes', 'sweater', 'Sudadera o jersey', w ? `Mínima de ${Math.round(w.tmin)}°C` : 'Por si refresca', Math.max(1, Math.ceil(clothDays / 4)));
  if (w?.cold) add('clothes', 'coat', 'Abrigo', `Frío: mínima de ${Math.round(w.tmin)}°C`);
  else if (w?.cool || !w) add('clothes', 'jacket', 'Chaqueta ligera', 'Para las noches');
  if (w?.freezing || types.includes('ski')) {
    add('clothes', 'thermal', 'Ropa térmica', w?.freezing ? `Temperaturas bajo cero (${Math.round(w.tmin)}°C)` : 'Nieve');
    add('clothes', 'gloves', 'Guantes, gorro y bufanda', w?.freezing ? 'Bajo cero' : 'Nieve');
  }
  if (w?.rain) add('clothes', 'raincoat', 'Chubasquero o impermeable', `Lluvia prevista ${w.rainyDays} día(s)`);
  if (w?.sunny || types.includes('beach')) add('clothes', 'cap', 'Gorra o sombrero', 'Sol');
  if (types.includes('beach') || (w?.hot && lodging === 'hotel')) {
    add('clothes', 'swimsuit', 'Bañador', types.includes('beach') ? 'Viaje de playa' : 'Calor: piscina', days > 3 ? 2 : 1);
  }
  if (types.includes('business')) add('clothes', 'formal', 'Ropa de trabajo (traje/camisas)', 'Viaje de trabajo', Math.max(1, Math.min(days, 5)));
  if (types.includes('event')) add('clothes', 'party', 'Traje o vestido para el evento', 'Boda o evento');
  if (types.includes('ski')) add('clothes', 'ski-clothes', 'Chaqueta y pantalón de esquí', 'Viaje de esquí');
  if (types.includes('mountain')) add('clothes', 'tech-clothes', 'Ropa técnica / transpirable', 'Montaña');
  if (types.includes('sport')) add('clothes', 'sportswear', 'Ropa de deporte', 'Deporte', Math.max(1, Math.ceil(days / 2)));
  if (days > 4 && !opt.laundry) add('clothes', 'laundry-bag', 'Bolsa para la ropa sucia', 'Viaje largo');

  // ----- Calzado -----
  add('shoes', 'walking', 'Calzado cómodo para caminar', 'Siempre');
  if (types.includes('beach') || lodging === 'hostel' || camping || w?.hot) add('shoes', 'flipflops', 'Chanclas', lodging === 'hostel' ? 'Duchas compartidas' : 'Playa/piscina/calor');
  if (types.includes('mountain')) add('shoes', 'boots', 'Botas de montaña', 'Montaña');
  if (types.includes('business') || types.includes('event')) add('shoes', 'formal-shoes', 'Zapatos de vestir', types.includes('event') ? 'Evento' : 'Trabajo');
  if (types.includes('sport')) add('shoes', 'sneakers', 'Zapatillas de deporte', 'Deporte');
  if (w?.snow || types.includes('ski')) add('shoes', 'snow-boots', 'Botas de nieve', 'Nieve');

  // ----- Aseo -----
  const liquidsRule = flying && opt.carryOnOnly;
  add('toiletry', 'toiletry-bag', liquidsRule ? 'Neceser con líquidos ≤100 ml en bolsa transparente' : 'Neceser', liquidsRule ? 'Solo equipaje de mano en avión' : 'Siempre');
  add('toiletry', 'toothbrush', 'Cepillo y pasta de dientes', 'Siempre');
  add('toiletry', 'deodorant', 'Desodorante', 'Siempre');
  if (lodging !== 'hotel' && lodging !== 'cruise') add('toiletry', 'shampoo', 'Champú y gel', 'El alojamiento puede no tenerlo');
  add('toiletry', 'comb', 'Peine / cepillo', 'Siempre');
  if (w?.sunny || types.includes('beach') || types.includes('ski') || types.includes('mountain')) add('toiletry', 'sunscreen', 'Protector solar', types.includes('ski') ? 'El sol en la nieve quema' : 'Sol');
  if (types.includes('ski') || w?.freezing || w?.windy) add('toiletry', 'lipbalm', 'Cacao de labios', 'Frío/viento');
  if (lodging === 'hostel' || camping || lodging === 'campervan') add('toiletry', 'towel', 'Toalla de ducha (microfibra)', 'El alojamiento no suele incluirla');
  if (types.includes('beach')) add('toiletry', 'beach-towel', 'Toalla de playa', 'Playa');
  if (days > 7) add('toiletry', 'nail', 'Cortaúñas', 'Viaje largo');

  // ----- Salud -----
  add('health', 'meds', 'Medicación habitual', `Para ${days} días + 2 de margen`);
  add('health', 'painkillers', 'Analgésicos / antiinflamatorios', 'Botiquín básico');
  if (types.includes('mountain') || camping || days > 5 || tr.kids + tr.babies > 0) add('health', 'first-aid', 'Botiquín (tiritas, antiséptico)', types.includes('mountain') ? 'Montaña' : 'Por si acaso');
  if (has(T, 'boat') || lodging === 'cruise' || (driving && tr.kids > 0)) add('health', 'motion', 'Pastillas para el mareo', 'Barco o curvas');
  if (w?.hot && (camping || types.includes('rural') || types.includes('mountain'))) add('health', 'repellent', 'Repelente de mosquitos', 'Calor y naturaleza');
  if (outsideEU) task('vaccines', 'Consultar vacunas recomendadas (Sanidad Exterior)', -45, 'Viaje fuera de Europa');
  if (flying) add('health', 'earplugs', 'Tapones / antifaz para dormir', 'Vuelo');

  // ----- Electrónica -----
  add('tech', 'phone-charger', 'Cargador del móvil', 'Siempre');
  if (days > 1 || flying) add('tech', 'powerbank', flying ? 'Batería externa (siempre en cabina)' : 'Batería externa', flying ? 'No puede ir facturada' : 'Para salidas largas');
  add('tech', 'headphones', 'Auriculares', 'Trayectos');
  if (types.includes('business')) add('tech', 'laptop', 'Portátil y cargador', 'Viaje de trabajo');
  if (abroad) {
    const adapter = needsAdapter(home, cc);
    if (adapter === true) add('tech', 'adapter', 'Adaptador de enchufe', 'Los enchufes del destino son distintos');
    else if (adapter === null) add('tech', 'adapter', 'Adaptador de enchufe (compruébalo)', 'No conocemos los enchufes del destino');
    if (!ROAM_LIKE_HOME.has(cc)) task('roaming', 'Revisar tarifas de roaming o comprar una eSIM de datos', -5, 'Fuera de la zona de roaming de la UE');
  }
  if (camping || types.includes('mountain')) add('tech', 'headlamp', 'Linterna frontal', camping ? 'Camping' : 'Montaña');
  if (types.includes('city') || days > 2) task('offline-maps', 'Descargar mapas sin conexión del destino', -1, 'Por si no tienes datos');
  task('charge', 'Cargar móvil, batería externa y dispositivos', -1, 'Salir con todo al 100%');

  // ----- Transporte -----
  if (flying) {
    if (!opt.carryOnOnly) add('transport', 'luggage-tag', 'Etiqueta con tus datos en la maleta facturada', 'Maleta facturada');
    add('transport', 'pillow', 'Cojín de viaje', 'Vuelo');
    if (!opt.carryOnOnly) task('weigh', 'Pesar la maleta facturada', -1, 'Evitar sobrecoste');
  }
  if (driving) {
    add('transport', 'v16', 'Baliza V16 y chaleco reflectante', 'Obligatorio en carretera');
    add('transport', 'car-charger', 'Cargador del móvil para el coche / soporte', 'Vas a conducir');
    if (has(T, 'motorbike')) add('transport', 'helmet', 'Casco, guantes y chaqueta de moto', 'Viajas en moto');
    task('car-check', 'Revisar presión de neumáticos, aceite y líquidos del vehículo', -2, 'Vas a conducir');
    task('route', 'Planificar la ruta, peajes y paradas', -1, 'Vas a conducir');
    if (abroad && outsideEU === false) task('vignette', 'Comprobar si hace falta viñeta / pegatina de emisiones en el destino', -7, 'Conducir en el extranjero');
  }
  if (has(T, 'train') || has(T, 'bus')) add('transport', 'snacks', 'Agua y algo de comer para el trayecto', 'Trayecto largo');
  add('transport', 'keys', 'Llaves de casa', 'Para volver');

  // ----- Actividades -----
  if (types.includes('beach')) {
    add('activity', 'sunglasses', 'Gafas de sol', 'Playa');
    add('activity', 'beach-bag', 'Bolsa de playa', 'Playa');
  } else if (w?.sunny || types.includes('ski')) {
    add('activity', 'sunglasses', types.includes('ski') ? 'Gafas de sol y de ventisca' : 'Gafas de sol', 'Sol');
  }
  if (types.includes('mountain')) {
    add('activity', 'backpack', 'Mochila de día', 'Montaña');
    add('activity', 'bottle', 'Botella / cantimplora', 'Montaña');
    task('mountain-weather', 'Revisar la ruta y el parte de montaña', -1, 'Montaña');
  }
  if (types.includes('city')) add('activity', 'daypack', 'Mochila pequeña o bandolera', 'Visitar la ciudad');
  if (types.includes('city')) task('tickets-museums', 'Reservar entradas de museos o visitas', -7, 'Viaje a ciudad');
  if (types.includes('event')) add('activity', 'gift', 'Regalo para los novios / anfitriones', 'Evento');
  if (lodging === 'family') add('activity', 'host-gift', 'Detalle para los anfitriones', 'Te alojas en casa de alguien');
  if (types.includes('ski')) {
    add('activity', 'ski-gear', 'Esquís/tabla, botas y casco (o reserva de alquiler)', 'Esquí');
    task('ski-rent', 'Reservar alquiler de material y forfait', -7, 'Esquí');
  }
  if (camping) {
    add('activity', 'tent', 'Tienda de campaña', 'Camping');
    add('activity', 'sleeping-bag', w?.cold ? 'Saco de dormir de invierno' : 'Saco de dormir', w ? `Mínima de ${Math.round(w.tmin)}°C` : 'Camping');
    add('activity', 'mat', 'Esterilla o colchón hinchable', 'Camping');
    add('activity', 'stove', 'Hornillo, gas y mechero', 'Camping');
    add('activity', 'cutlery', 'Cubiertos, vaso y plato', 'Camping');
  }
  if (w?.rain) add('activity', 'umbrella', 'Paraguas', `Lluvia prevista ${w.rainyDays} día(s)`);
  add('activity', 'book', 'Libro / entretenimiento', 'Para los ratos muertos');

  // ----- Niños -----
  if (tr.babies > 0) {
    const diapers = tr.babies * days * 6;
    add('kids', 'diapers', 'Pañales', `≈6 al día × ${days} días`, diapers);
    add('kids', 'wipes', 'Toallitas', 'Bebé');
    add('kids', 'baby-food', 'Leche, biberón y comida del bebé', 'Bebé');
    add('kids', 'stroller', 'Carrito o mochila portabebés', 'Bebé');
    add('kids', 'baby-clothes', 'Ropa del bebé', `2 mudas por día`, tr.babies * days * 2);
    if (lodging !== 'family') task('crib', 'Pedir cuna al alojamiento', -7, 'Viajas con bebé');
  }
  if (tr.kids > 0) {
    add('kids', 'kids-clothes', 'Ropa de los niños', `Una muda por día + 2 extra`, tr.kids * (clothDays + 2));
    add('kids', 'toys', 'Juguetes / entretenimiento para el trayecto', 'Niños');
    add('kids', 'kids-snacks', 'Meriendas y agua', 'Niños');
    add('kids', 'kids-meds', 'Termómetro y medicina infantil (paracetamol/ibuprofeno)', 'Niños');
  }
  if (tr.kids + tr.babies > 0 && driving) add('kids', 'car-seat', 'Sillita del coche', 'Obligatoria en coche');

  // ----- Mascotas -----
  if (tr.pets > 0) {
    add('pets', 'pet-food', 'Comida y comedero/bebedero', `${days} días`);
    add('pets', 'leash', 'Correa, collar y bolsas', 'Mascota');
    add('pets', 'pet-bed', 'Cama o manta', 'Mascota');
    add('pets', 'pet-docs', abroad ? 'Pasaporte europeo de la mascota' : 'Cartilla veterinaria', 'Mascota');
    if (flying || has(T, 'train') || has(T, 'bus')) add('pets', 'carrier', 'Transportín homologado', 'Transporte público con mascota');
    task('pet-lodging', 'Confirmar que el alojamiento admite mascotas', -14, 'Viajas con mascota');
    if (abroad) task('vet', 'Visita al veterinario (vacuna de rabia, desparasitación)', -21, 'Mascota al extranjero');
  }

  // ----- Varios -----
  if (days > 3) add('misc', 'bags', 'Bolsas de plástico / organizadores', 'Separar ropa');
  if (lodging === 'apartment' || lodging === 'campervan') add('misc', 'kitchen', 'Básicos de cocina (café, aceite, sal)', 'Tendrás cocina');
  if (lodging === 'hostel') add('misc', 'padlock', 'Candado para la taquilla', 'Albergue');

  // ----- Tareas del hogar antes de salir -----
  task('plants', 'Organizar el riego de las plantas', -2, 'Estarás fuera');
  if (days > 3) task('mail', 'Pedir a alguien que recoja el correo', -3, 'Viaje de varios días');
  task('fridge', 'Vaciar la nevera de productos perecederos', -1, 'Estarás fuera');
  task('trash', 'Sacar la basura', 0, 'Día de salida');
  task('home-off', 'Cerrar gas y agua, desenchufar aparatos y bajar persianas', 0, 'Día de salida');
  task('windows', 'Cerrar ventanas y echar la llave', 0, 'Día de salida');
  if (w) task('weather-recheck', 'Volver a mirar la previsión del tiempo', -1, 'La previsión cambia');
  if (tr.pets > 0 && opt.petStaysHome) task('pet-sitter', 'Organizar quién cuida de la mascota', -14, 'La mascota se queda');

  return { items, tasks };
}

// Fusiona el plan recién generado con el estado guardado (marcados, borrados,
// cantidades editadas y elementos personalizados).
export function mergePlan(trip, plan) {
  const hidden = new Set(trip.hidden || []);
  const prevItems = new Map((trip.items || []).map((i) => [i.key, i]));
  const prevTasks = new Map((trip.tasks || []).map((t) => [t.key, t]));

  const items = plan.items
    .filter((g) => !hidden.has(g.key))
    .map((g) => {
      const p = prevItems.get(g.key);
      return {
        ...g,
        done: p?.done || false,
        qty: p?.qtyEdited ? p.qty : g.qty,
        qtyEdited: p?.qtyEdited || false,
      };
    });
  for (const p of trip.items || []) if (p.custom) items.push(p);

  const tasks = plan.tasks
    .filter((g) => !hidden.has('task:' + g.key))
    .map((g) => ({ ...g, done: prevTasks.get(g.key)?.done || false }));
  for (const p of trip.tasks || []) if (p.custom) tasks.push(p);

  return { ...trip, items, tasks };
}
