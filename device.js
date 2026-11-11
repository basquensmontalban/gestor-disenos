// Ajustes de ESTE aparato (cada aparato tiene los suyos). Se guardan en el aparato y en Drive.
import { kvGet, kvSet } from './db.js';
import { uid } from './store.js';

export const DEFAULTS = {
  name: '',
  person: null,               // quién usa este aparato (id de persona)
  theme: 'auto',              // auto | light | dark
  fontScale: 1,               // 1 | 1.1 | 1.2
  cardSize: 'm',              // s | m | l
  view: 'cards',              // cards | table (la tabla solo en pantalla ancha)
  sort: 'recent',             // recent | code | name
  typeTab: '',                // tipo elegido en las pestañas de arriba ('' = todos)
  filters: { mine: false, author: '', state: '', dest: '', sell: '', theme: '', collection: '', tag: '' },
  lastType: 'ilustracion',    // tipo marcado por defecto en el alta rápida
  lastOrigin: 'Digital',
  open: { general: true, tipo: false, variantes: true, fotos: true, archivos: false, calle: true, textos: false, notas: false },
  showProgress: true,         // indicador «7/15 campos»
  tabs: { samples: true, nums: true },   // pestañas que se ven (Diseños y Ajustes siempre)
  askButton: true,            // botón «＋1» de la calle en las tarjetas de la galería
  exportSnooze: 0,            // hasta cuándo no recordar la copia completa fuera de Google
};

export let D = null;
const listeners = new Set();
export const onDeviceChange = (fn) => listeners.add(fn);

function guessName() {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Este aparato';
}

// Completa con los valores por defecto (también dentro de los objetos anidados).
function withDefaults(o) {
  const out = { ...DEFAULTS, ...(o || {}) };
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = { ...v, ...((o || {})[k] || {}) };
  }
  return out;
}

export async function loadDevice() {
  D = withDefaults(await kvGet('device'));
  if (!D.id) {
    D.id = uid();
    D.name = D.name || guessName();
    D.u = Date.now();
    await kvSet('device', D);
  }
}

export function setDevice(patch, { quiet = false } = {}) {
  Object.assign(D, patch, { u: Date.now() });
  kvSet('device', D);
  if (!quiet) listeners.forEach((f) => f());
}

// Cambia una opción dentro de un objeto anidado, p. ej. setDeviceIn('filters', 'mine', true).
export function setDeviceIn(group, key, value, opts) {
  setDevice({ [group]: { ...D[group], [key]: value } }, opts);
}

// Aplica una configuración recuperada (se mantiene el identificador de este aparato).
export function applyDevice(settings) {
  const { id, u, ...rest } = settings || {};
  const keepName = D.name;
  setDevice({ ...withDefaults(rest), name: rest.name || keepName });
}

export function resetDevice() {
  const { id, name, person } = D;
  setDevice({ ...withDefaults({}), id, name, person });
}
