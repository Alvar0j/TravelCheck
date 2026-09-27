// Datos de países usados para documentación, enchufes y moneda.

// Unión Europea
export const EU = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
]);

// Espacio Económico Europeo + Suiza (tarjeta sanitaria europea válida)
export const EHIC = new Set([...EU, 'IS', 'LI', 'NO', 'CH']);

// Países donde un ciudadano español puede entrar solo con DNI
export const DNI_OK = new Set([...EHIC, 'AD', 'MC', 'SM', 'VA']);

// Países con euro
export const EURO = new Set([
  'AT', 'BE', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT', 'LU',
  'MT', 'NL', 'PT', 'SK', 'SI', 'ES', 'AD', 'MC', 'SM', 'VA', 'ME', 'XK', 'BG',
]);

// Roaming como en casa (UE + EEE)
export const ROAM_LIKE_HOME = new Set([...EU, 'IS', 'LI', 'NO']);

// Tipos de enchufe por país (fuente: IEC World Plugs). Si no está, se avisa de comprobarlo.
export const PLUGS = {
  ES: 'CF', PT: 'CF', FR: 'CE', DE: 'CF', IT: 'CFL', NL: 'CF', BE: 'CE', AT: 'CF',
  GR: 'CF', SE: 'CF', FI: 'CF', NO: 'CF', DK: 'CEFK', PL: 'CE', CZ: 'CE', SK: 'CE',
  HU: 'CF', RO: 'CF', BG: 'CF', HR: 'CF', SI: 'CF', LU: 'CF', IS: 'CF', EE: 'CF',
  LV: 'CF', LT: 'CF', AD: 'CF', MC: 'CEF', SM: 'CFL', VA: 'CFL', CH: 'CJ', LI: 'J',
  GB: 'G', IE: 'G', MT: 'G', CY: 'G', GI: 'G',
  US: 'AB', CA: 'AB', MX: 'AB', CU: 'ABCL', DO: 'AB', PR: 'AB', CO: 'AB', VE: 'AB',
  EC: 'AB', PE: 'ACI', BO: 'AC', CL: 'CL', AR: 'CI', UY: 'CFIL', PY: 'C', BR: 'CN',
  CR: 'AB', PA: 'AB', GT: 'AB', HN: 'AB', NI: 'AB', SV: 'AB',
  MA: 'CE', TN: 'CE', DZ: 'CF', EG: 'CF', ZA: 'CDMN', KE: 'G', TZ: 'DG', SN: 'CDEK',
  TR: 'CF', IL: 'CHM', JO: 'BCDFGJ', AE: 'CDG', QA: 'DG', SA: 'G',
  RU: 'CF', UA: 'CF', RS: 'CF', ME: 'CF', AL: 'CF', MK: 'CF', BA: 'CF', XK: 'CF',
  IN: 'CDM', CN: 'ACI', JP: 'AB', KR: 'CF', TH: 'ABCO', VN: 'ACF', ID: 'CF',
  MY: 'G', SG: 'G', PH: 'ABC', HK: 'G', TW: 'AB', LK: 'DG', NP: 'CDM', MV: 'CDG',
  AU: 'I', NZ: 'I', FJ: 'I',
};

// Moneda de países habituales fuera de la eurozona
export const CURRENCY = {
  GB: 'libra esterlina (GBP)', GI: 'libra de Gibraltar (GIP)', CH: 'franco suizo (CHF)',
  LI: 'franco suizo (CHF)', US: 'dólar estadounidense (USD)', CA: 'dólar canadiense (CAD)',
  MX: 'peso mexicano (MXN)', AR: 'peso argentino (ARS)', CL: 'peso chileno (CLP)',
  CO: 'peso colombiano (COP)', PE: 'sol (PEN)', BR: 'real (BRL)', UY: 'peso uruguayo (UYU)',
  CU: 'peso cubano (CUP)', DO: 'peso dominicano (DOP)', CR: 'colón (CRC)',
  MA: 'dírham marroquí (MAD)', TN: 'dinar tunecino (TND)', EG: 'libra egipcia (EGP)',
  TR: 'lira turca (TRY)', JP: 'yen (JPY)', CN: 'yuan (CNY)', KR: 'won (KRW)',
  TH: 'baht (THB)', VN: 'dong (VND)', IN: 'rupia india (INR)', ID: 'rupia indonesia (IDR)',
  AU: 'dólar australiano (AUD)', NZ: 'dólar neozelandés (NZD)', AE: 'dírham (AED)',
  NO: 'corona noruega (NOK)', SE: 'corona sueca (SEK)', DK: 'corona danesa (DKK)',
  IS: 'corona islandesa (ISK)', PL: 'zloty (PLN)', CZ: 'corona checa (CZK)',
  HU: 'forinto (HUF)', RO: 'leu rumano (RON)', IL: 'nuevo séquel (ILS)',
  SG: 'dólar de Singapur (SGD)', HK: 'dólar de Hong Kong (HKD)', ZA: 'rand (ZAR)',
};

// Enchufes en los que entra una clavija europea plana (tipo C)
const EUROPLUG_FITS = new Set('CEFJKLN');

// true = hace falta adaptador, false = no, null = no se sabe
export function needsAdapter(home, dest) {
  const h = PLUGS[home];
  const d = PLUGS[dest];
  if (!h || !d) return null;
  const homeSet = new Set(h);
  const compatible = [...d].some((p) => homeSet.has(p) || (homeSet.has('C') && EUROPLUG_FITS.has(p)));
  return !compatible;
}
