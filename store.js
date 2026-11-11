// Estado de la app, cambios, fusión entre aparatos, historial, papelera y cálculos derivados.
import { kvGet, kvSet, kvSetMany } from './db.js';
import { mergeRecord, merge3, eq } from './merge3.js';
import { BUILTIN_TYPES, METHODS, DEFAULT_CHANNELS, DEFAULT_TAGS } from './types.js';

export const SCHEMA = 1;
// Colecciones de registros con «id» y fecha de cambio «u». Las del resto del Taller (técnicas, bitácora,
// recursos, reflexiones) se añadirán aquí sin tocar las que ya existen.
const COLLECTIONS = ['works', 'variants', 'files', 'inbox', 'people', 'types', 'log', 'samples', 'asks'];
// Textos largos: si los dos los cambian a la vez, no se descarta ninguna versión.
export const LONG_FIELDS = ['descInt', 'descEs', 'descCa', 'notes'];

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
// Marca de tiempo de cada cambio. Nunca va hacia atrás respecto a lo que ya se ha visto (aunque el reloj
// del otro aparato vaya adelantado), para que un cambio nuevo siempre cuente como posterior al anterior.
let maxU = 0;
const now = () => (maxU = Math.max(Date.now(), maxU + 1));
export const stamp = now;
const seen = (data) => {
  if (!data) return;
  for (const k of COLLECTIONS) for (const r of Object.values(data[k] || {})) if (+r.u > maxU) maxU = +r.u;
  if (+data.settings?.u > maxU) maxU = +data.settings.u;
};
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const norm = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const ymd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const DEFAULT_SETTINGS = {
  u: 0,
  backupEveryDays: 1,   // copia automática en Drive cada X días
  backupKeep: 30,       // copias automáticas que se guardan (más la primera de cada mes)
  photoMax: 1600,       // lado largo de las fotos al subir (px)
  photoQ: 0.8,          // calidad JPEG
  rename: true,         // renombrar los archivos al subir: código_nombre_rol_versión
  priceWithVat: true,   // los precios se escriben con IVA incluido
  hourRate: null,       // tarifa por hora de mano de obra (€)
  reserve: 5,           // reserva para cambios y devoluciones (% del precio sin IVA)
  marginGood: 30,       // margen en verde a partir de este %
  marginMid: 10,        // en naranja a partir de este %; por debajo, rojo
  channelCfg: {},       // por canal: { pct: comisión %, fixed: € por venta, ship: € de envío a vuestro cargo }
  channels: DEFAULT_CHANNELS,
  tags: DEFAULT_TAGS,
};

function emptyState() {
  return {
    v: SCHEMA,
    works: {}, variants: {}, files: {}, inbox: {}, people: {}, types: {}, log: {}, samples: {}, asks: {},
    counters: {},
    settings: { ...DEFAULT_SETTINGS },
    backupInfo: { last: 0, by: '', u: 0 },
  };
}

export let S = null;      // estado común (va a Drive)
export let meta = {};     // datos técnicos solo de este aparato
// Última versión de Drive que este aparato ya tiene incorporada: sirve para saber qué ha cambiado
// cada uno desde entonces y juntar los dos cambios en vez de quedarse solo con uno.
let base = null;
// La versión de Drive de la que partió la última subida de este aparato. Si el otro aparato subió a la vez
// partiendo de esa misma versión, es ella (y no lo que subió este aparato) la que tienen los dos en común.
let parentBase = null;
export const getBase = () => base;
export const getParentBase = () => parentBase;
export async function setBase(data, md5, { parent } = {}) {
  base = data ? (typeof data === 'string' ? JSON.parse(data) : clone(data)) : null;
  meta.baseMd5 = base ? md5 || null : null;
  if (parent !== undefined) parentBase = parent ? clone(parent) : null;
  await kvSetMany({ state: S, meta, base, parentBase });
}
// ¿De qué versión común partir para juntar «remote» con lo de aquí?
//  · Lo normal: el otro aparato partió de lo último que subió este (remote.parentId === base.syncId).
//  · Si subieron a la vez, los dos partieron de la misma versión anterior: esa es la común.
export function baseFor(remote) {
  if (remote?.parentId && parentBase?.syncId && remote.parentId === parentBase.syncId && remote.parentId !== base?.syncId) return parentBase;
  return base;
}
const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);

// Quién está usando este aparato (lo fija app.js a partir de los ajustes del aparato).
let actor = null;
export const setActor = (id) => { actor = id || null; };
export const me = () => actor;

export async function load() {
  S = (await kvGet('state')) || emptyState();
  meta = (await kvGet('meta')) || {};
  base = (await kvGet('base')) || null;
  parentBase = (await kvGet('parentBase')) || null;
  if (!base) meta.baseMd5 = null;
  ensure();
  seen(S);
  await kvSet('state', S);
  await saveMeta();
  await localSnapshot();
}

function ensure() {
  for (const k of COLLECTIONS) S[k] = S[k] || {};
  S.counters = S.counters || {};
  S.settings = { ...DEFAULT_SETTINGS, ...(S.settings || {}) };
  S.backupInfo = S.backupInfo || { last: 0, by: '', u: 0 };
  S.v = SCHEMA;
  fixCodes();
}

export const saveMeta = () => kvSet('meta', meta);
// Espera a que todo quede escrito en el aparato (antes de salir de la página).
export async function flush() { await kvSet('state', S); await saveMeta(); }

// Guarda y avisa a la interfaz. local=true marca que hay cambios por subir.
export function commit({ local = true } = {}) {
  if (local) meta.dirty = true;
  kvSet('state', S);
  saveMeta();
  listeners.forEach((f) => f({ local }));
}

// Sustituye todo por una copia. Lo que no esté en la copia se marca como borrado
// para que no reaparezca al sincronizar con el otro aparato.
export function replaceAll(data) {
  const t = now();
  const fresh = { ...emptyState(), ...clone(data) };
  for (const k of COLLECTIONS) {
    fresh[k] = fresh[k] || {};
    for (const id of Object.keys(S[k] || {})) if (!fresh[k][id]) fresh[k][id] = { id, del: true };
    for (const r of Object.values(fresh[k])) r.u = t;
  }
  const counters = { ...(fresh.counters || {}) };
  for (const [k, n] of Object.entries(S.counters || {})) counters[k] = Math.max(counters[k] || 0, n);
  fresh.counters = counters;
  fresh.settings = { ...DEFAULT_SETTINGS, ...(fresh.settings || {}), u: t };
  fresh.backupInfo = S.backupInfo;
  S = fresh;
  ensure();
  commit();
}

// Copias en el propio aparato (las 7 últimas, como mucho una al día).
export async function localSnapshot(force = false) {
  const arr = (await kvGet('localBackups')) || [];
  if (!force && arr[0] && Date.now() - arr[0].ts < 20 * 3600e3) return;
  if (!force && !Object.keys(S.works).length && !Object.keys(S.inbox).length) return;
  arr.unshift({ ts: Date.now(), data: clone(S) });
  await kvSet('localBackups', arr.slice(0, 7));
}
export const localBackups = async () => (await kvGet('localBackups')) || [];

// ── Lecturas básicas ───────────────────────────────────────
export const alive = (o) => Object.values(o || {}).filter((x) => !x.del);
export const round = (n) => Math.round((+n || 0) * 100) / 100;
export const fmtNum = (n) => String(round(n)).replace('.', ',');
export const fmtMoney = (n) => (n === null || n === undefined || n === '' || isNaN(+n) ? '' : (+n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');

export function putSettings(patch) {
  S.settings = { ...S.settings, ...patch, u: now() };
  commit();
}

// ── Personas ───────────────────────────────────────────────
export const PERSON_COLORS = ['#2f7d5b', '#3f6fb5', '#8a4fa8', '#b08a00', '#b3372b', '#5a6772'];
const hash = (s) => {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return (x >>> 0).toString(36);
};
export const people = () => alive(S.people).sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name, 'es'));
export const person = (id) => (id && S.people[id] && !S.people[id].del ? S.people[id] : null);
// El identificador sale del nombre: si los dos aparatos crean a la misma persona sin conexión, no se duplica.
export function addPerson(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  const id = 'p-' + hash(norm(n));
  const cur = S.people[id];
  if (cur && !cur.del) return cur;
  const used = new Set(people().map((p) => p.color));
  const color = PERSON_COLORS.find((c) => !used.has(c)) || PERSON_COLORS[0];
  S.people[id] = { id, name: n, color, order: people().length, titular: false, publico: false, u: now() };
  commit();
  return S.people[id];
}
export function putPerson(id, patch) {
  const p = person(id);
  if (!p) return;
  const t = now();
  // Solo puede haber un titular de la tienda.
  if (patch.titular) for (const o of people()) if (o.id !== id && o.titular) { o.titular = false; o.u = t; }
  Object.assign(p, patch, { u: t });
  commit();
}
export function deletePerson(id) {
  S.people[id] = { id, del: true, u: now() };
  commit();
}
export const titular = () => people().find((p) => p.titular) || null;
export const personNames = (ids) => (ids || []).map((id) => person(id)?.name).filter(Boolean).join(' y ');

// ── Tipos (paquetes) ───────────────────────────────────────
// Los de partida viven en el código; los importados o personalizados, en los datos compartidos.
export const getType = (id) => (id && S.types[id] && !S.types[id].del ? S.types[id] : BUILTIN_TYPES[id] || null);
export function types() {
  const map = { ...BUILTIN_TYPES };
  for (const t of alive(S.types)) map[t.id] = t;
  return Object.values(map);
}
// Guarda un tipo importado o editado (los de partida quedan como «personalizados»).
export function putType(def) {
  const t = now();
  const prev = S.types[def.id];
  S.types[def.id] = { ...clone(def), c: prev && !prev.del ? prev.c || t : t, u: t };
  commit();
}
// Quita la versión guardada: un tipo de partida vuelve al de fábrica; uno importado desaparece.
export function resetType(id) { S.types[id] = { id, del: true, u: now() }; commit(); }
// Campos visibles en la ficha: los ocultos («retirados») solo se ven si tienen algún valor.
export const shownFields = (list, values) => (list || []).filter((f) => !f.hidden || (values?.[f.id] !== undefined && values?.[f.id] !== '' && values?.[f.id] !== null));
export const supportOf = (type, code) => (type?.supports || []).find((s) => s.code === code) || null;

// ── Códigos ────────────────────────────────────────────────
export function letterFor(typeId, fields) {
  const t = getType(typeId);
  if (!t) return null;
  if (t.letterBy) return t.letterBy.map[(fields || {})[t.letterBy.field]] || t.letter;
  return t.letter;
}
const codeNum = (code) => +String(code || '').replace(/^[A-Z]+/, '').split('-')[0] || 0;
const codeLetter = (code) => (String(code || '').match(/^[A-Z]+/) || [''])[0];
function nextCode(letter) {
  let max = S.counters[letter] || 0;
  for (const w of Object.values(S.works)) if (w.code && codeLetter(w.code) === letter) max = Math.max(max, codeNum(w.code));
  S.counters[letter] = max + 1;
  return letter + String(max + 1).padStart(3, '0');
}
function recodeVariants(w, t) {
  const used = new Set();
  for (const v of variantsOf(w.id)) {
    let code = `${w.code}-${v.support || 'VAR'}`;
    let n = 2;
    while (used.has(code)) code = `${w.code}-${v.support || 'VAR'}${n++}`;
    used.add(code);
    if (v.code !== code) { v.code = code; v.u = t; }
  }
}
// Si dos aparatos sin conexión dieron el mismo código a dos obras, la más nueva recibe el siguiente número.
// Es determinista: los dos aparatos llegan al mismo resultado.
function fixCodes() {
  const by = new Map();
  for (const w of alive(S.works)) {
    if (!w.code) continue;
    if (!by.has(w.code)) by.set(w.code, []);
    by.get(w.code).push(w);
  }
  let changed = false;
  for (const [code, arr] of [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (arr.length < 2) continue;
    arr.sort((a, b) => (a.c || 0) - (b.c || 0) || String(a.id).localeCompare(String(b.id)));
    for (const w of arr.slice(1)) {
      const t = now();
      w.code = nextCode(codeLetter(code));
      w.u = t;
      recodeVariants(w, t);
      changed = true;
    }
  }
  for (const w of Object.values(S.works)) {
    if (!w.code) continue;
    const l = codeLetter(w.code);
    if ((S.counters[l] || 0) < codeNum(w.code)) S.counters[l] = codeNum(w.code);
  }
  return changed;
}

// ── Obras ──────────────────────────────────────────────────
export const getWork = (id) => (id && S.works[id] && !S.works[id].del ? S.works[id] : null);
export const works = () => alive(S.works).filter((w) => !w.trashed);
export const trashedWorks = () => alive(S.works).filter((w) => w.trashed).sort((a, b) => b.trashed - a.trashed);
export const workTitle = (w) => w.name || '(sin nombre)';

export const WORK_LABELS = {
  name: 'Nombre', type: 'Tipo', code: 'Código', authors: 'Autor', owners: 'Encargado', state: 'Estado', dest: 'Destino',
  sell: '¿La queremos vender?', date: 'Fecha de creación', themes: 'Temática', styles: 'Estilo', collection: 'Colección',
  tags: 'Etiquetas', review: 'Revisar', descInt: 'Descripción interna', descEs: 'Descripción para la venta (castellano)',
  descCa: 'Descripción para la venta (catalán)', cover: 'Foto principal', next: 'Próximo paso', notes: 'Notas',
  rights: 'Derechos cedidos', trashed: 'Papelera', imported: 'Pendiente de revisar (importada)',
};

export function createWork(data = {}) {
  const t = now();
  const type = getType(data.type);
  const w = {
    id: uid(), c: t, u: t, by: actor, eb: actor,
    name: String(data.name || '').trim(), type: type?.id || null, code: null,
    authors: data.authors || (actor ? [actor] : []), owners: data.owners || [],
    state: type?.workStates?.[0] || 'Idea', dest: '', sell: '',
    date: data.date || ymd(), themes: [], styles: [], collection: '', tags: [],
    review: data.review || null, descInt: '', descEs: '', descCa: '', next: '', notes: data.notes || '',
    cover: null, rights: null, fields: { ...(data.fields || {}) }, origin: data.origin || null,
  };
  if (type) w.code = nextCode(letterFor(type.id, w.fields));
  S.works[w.id] = w;
  addLog(w.id, [{ f: '_new', label: 'Obra creada', old: null, val: w.code || workTitle(w) }], t);
  commit();
  return w;
}

const show = (v) => {
  if (v === null || v === undefined || v === '') return '';
  if (Array.isArray(v)) return v.map((x) => person(x)?.name || x).join(', ');
  if (typeof v === 'object') return v.on !== undefined ? (v.on ? 'Sí' + (v.note ? ': ' + v.note : '') : 'No') : v.ceded !== undefined ? (v.ceded ? 'Sí' + (v.date ? ' (' + v.date + ')' : '') : 'No') : JSON.stringify(v);
  if (v === true) return 'Sí';
  if (v === false) return 'No';
  return String(v);
};

// Cambia campos de una obra. «patch.fields» lleva solo los campos del tipo que cambian.
export function updateWork(id, patch, { log = true } = {}) {
  const w = getWork(id);
  if (!w) return null;
  const t = now();
  const changes = [];
  let touched = false;
  const { fields, ...rest } = patch;
  for (const [k, v] of Object.entries(rest)) {
    if (eq(w[k], v)) continue;
    if (WORK_LABELS[k]) changes.push({ f: k, label: WORK_LABELS[k], old: clone(w[k] ?? null), val: clone(v ?? null) });
    w[k] = v;
    touched = true;
  }
  if (fields) {
    const type = getType(rest.type || w.type);
    w.fields = { ...(w.fields || {}) };
    for (const [k, v] of Object.entries(fields)) {
      if (eq(w.fields[k], v)) continue;
      const def = (type?.workFields || []).find((f) => f.id === k);
      changes.push({ f: 'fields.' + k, label: def?.label || k, old: clone(w.fields[k] ?? null), val: clone(v ?? null) });
      if (v === '' || v === null || v === undefined) delete w.fields[k]; else w.fields[k] = v;
      touched = true;
    }
  }
  if (!touched) return w;
  // Tipo u origen nuevos: puede cambiar la letra del código y los pasos del estado.
  const type = getType(w.type);
  if (type) {
    const letter = letterFor(type.id, w.fields);
    if (!w.code || codeLetter(w.code) !== letter) {
      const old = w.code;
      w.code = nextCode(letter);
      changes.push({ f: 'code', label: 'Código', old, val: w.code });
      recodeVariants(w, t);
    }
    if (!type.workStates.includes(w.state)) w.state = type.workStates[0];
  }
  w.u = t;
  w.eb = actor;
  if (log) addLog(id, changes, t);
  commit();
  return w;
}

export function trashWork(id) { updateWork(id, { trashed: now() }); }
export function restoreWork(id) { updateWork(id, { trashed: null }); }
// Borrado definitivo: la obra, sus variantes y sus archivos desaparecen de la app.
// Su carpeta de Drive va a la papelera de Drive (recuperable allí 30 días).
export function purgeWork(id) {
  const w = getWork(id);
  if (!w) return;
  const t = now();
  meta.driveTrash = meta.driveTrash || [];
  if (w.folderId) meta.driveTrash.push(w.folderId);
  for (const v of alive(S.variants)) if (v.workId === id) S.variants[v.id] = { id: v.id, del: true, u: t };
  for (const f of alive(S.files)) if (f.workId === id) { if (f.driveId && !w.folderId) meta.driveTrash.push(f.driveId); S.files[f.id] = { id: f.id, del: true, u: t }; }
  for (const l of alive(S.log)) if (l.ref === id) S.log[l.id] = { id: l.id, del: true, u: t };
  for (const k of ['samples', 'asks']) for (const r of alive(S[k])) if (r.workId === id) S[k][r.id] = { id: r.id, del: true, u: t };
  S.works[id] = { id, del: true, u: t };
  commit();
}

export function duplicateWork(id) {
  const src = getWork(id);
  if (!src) return null;
  const w = createWork({ name: src.name ? src.name + ' (copia)' : '', type: src.type, fields: clone(src.fields || {}), authors: [...(src.authors || [])], owners: [...(src.owners || [])] });
  Object.assign(w, { themes: [...(src.themes || [])], styles: [...(src.styles || [])], collection: src.collection || '', tags: [...(src.tags || [])], descInt: src.descInt || '' });
  for (const v of variantsOf(id)) {
    const { id: _i, code: _c, u: _u, workId: _w, ...rest } = clone(v);
    const nv = { ...rest, id: uid(), workId: w.id, u: now(), state: 'Borrador', url: '' };
    S.variants[nv.id] = nv;
  }
  recodeVariants(w, now());
  commit();
  return w;
}

// ── Historial ──────────────────────────────────────────────
// Los cambios seguidos de la misma persona en la misma ficha (10 min) se agrupan en una entrada.
function addLog(ref, changes, t) {
  if (!changes.length) return;
  const last = alive(S.log).filter((l) => l.ref === ref && l.by === actor).sort((a, b) => b.at - a.at)[0];
  if (last && t - last.at < 10 * 60e3) {
    for (const ch of changes) {
      const prev = last.changes.find((x) => x.f === ch.f);
      if (prev) prev.val = ch.val; else last.changes.push(ch);
    }
    last.changes = last.changes.filter((x) => !eq(x.old, x.val) || x.f === '_new');
    last.at = t;
    last.u = t;
    return;
  }
  const id = uid();
  S.log[id] = { id, ref, by: actor, at: t, changes, u: t };
}
export const logOf = (ref) => alive(S.log).filter((l) => l.ref === ref && l.changes?.length).sort((a, b) => b.at - a.at);
export const showValue = show;

// ── Variantes ──────────────────────────────────────────────
export const getVariant = (id) => (id && S.variants[id] && !S.variants[id].del ? S.variants[id] : null);
export const variantsOf = (workId) => alive(S.variants).filter((v) => v.workId === workId).sort((a, b) => (a.c || 0) - (b.c || 0));

export const VARIANT_LABELS = {
  support: 'Soporte', label: 'Variante', material: 'Material', finish: 'Acabado', price: 'Precio', vat: 'IVA', qty: 'Cantidad',
  onDemand: 'Bajo demanda', location: 'Ubicación', channels: 'Canales', costMat: 'Coste de material', hours: 'Horas de mano de obra',
  method: 'Método de producción', scal: 'Escalabilidad', state: 'Estado', url: 'Enlace', ready: 'Ficha lista',
};

// IVA propuesto: 10 % si es un original o pieza hecha a mano y su único autor es el titular de la tienda; 21 % en lo demás.
export function proposedVat(w, sup) {
  const tit = titular();
  const a = w.authors || [];
  return sup?.original && tit && a.length === 1 && a[0] === tit.id ? 10 : 21;
}

export function createVariant(workId, supportCode) {
  const w = getWork(workId);
  if (!w) return null;
  const type = getType(w.type);
  const sup = supportOf(type, supportCode);
  const t = now();
  const v = {
    id: uid(), c: t, u: t, workId, support: supportCode || 'VAR', supportName: sup?.name || 'Variante', code: '',
    label: '', material: '', finish: '', price: null, vat: proposedVat(w, sup), qty: sup?.onDemand ? null : sup?.qty ?? null,
    onDemand: !!sup?.onDemand, location: '', channels: [], costMat: null, hours: null,
    method: sup?.method || (type?.handmade ? 'unica' : 'digital'), scal: null, state: 'Borrador', url: '',
    ready: { fotos: false, ficha: false, gpsr: false }, fields: {},
  };
  S.variants[v.id] = v;
  recodeVariants(w, t);
  addLog(workId, [{ f: '_newvar', label: 'Variante creada', old: null, val: v.code }], t);
  commit();
  return v;
}

export function updateVariant(id, patch) {
  const v = getVariant(id);
  if (!v) return null;
  const w = getWork(v.workId);
  const type = getType(w?.type);
  const t = now();
  const changes = [];
  const { fields, ...rest } = patch;
  for (const [k, val] of Object.entries(rest)) {
    if (eq(v[k], val)) continue;
    if (VARIANT_LABELS[k]) changes.push({ f: `v.${id}.${k}`, label: `${v.code} · ${VARIANT_LABELS[k]}`, old: clone(v[k] ?? null), val: clone(val ?? null) });
    v[k] = val;
  }
  if (fields) {
    v.fields = { ...(v.fields || {}) };
    for (const [k, val] of Object.entries(fields)) {
      if (eq(v.fields[k], val)) continue;
      const def = (type?.variantFields || []).find((f) => f.id === k);
      changes.push({ f: `v.${id}.fields.${k}`, label: `${v.code} · ${def?.label || k}`, old: clone(v.fields[k] ?? null), val: clone(val ?? null) });
      if (val === '' || val === null || val === undefined) delete v.fields[k]; else v.fields[k] = val;
    }
  }
  if (!changes.length) return v;
  if ('support' in rest) {
    const sup = supportOf(type, v.support);
    v.supportName = sup?.name || v.supportName;
    if (w) recodeVariants(w, t);
  }
  v.u = t;
  if (w) addLog(w.id, changes, t);
  commit();
  return v;
}

export function deleteVariant(id) {
  const v = getVariant(id);
  if (!v) return null;
  const copy = clone(v);
  const t = now();
  S.variants[id] = { id, del: true, u: t };
  addLog(v.workId, [{ f: '_delvar', label: 'Variante eliminada', old: v.code, val: null }], t);
  commit();
  return copy;
}
export function restoreVariant(copy) {
  S.variants[copy.id] = { ...copy, u: now() };
  commit();
}
export function duplicateVariant(id) {
  const v = getVariant(id);
  if (!v) return null;
  const w = getWork(v.workId);
  const t = now();
  const nv = { ...clone(v), id: uid(), c: t, u: t, state: 'Borrador', url: '' };
  S.variants[nv.id] = nv;
  if (w) recodeVariants(w, t);
  commit();
  return nv;
}
// «Vendida una»: resta 1; al llegar a 0 en todas las variantes con cantidad, la obra pasa a destino «vendida».
export function sellOne(id) {
  const v = getVariant(id);
  if (!v || v.onDemand || !(+v.qty > 0)) return;
  updateVariant(id, { qty: +v.qty - 1 });
  const w = getWork(v.workId);
  const counted = variantsOf(v.workId).filter((x) => !x.onDemand && x.qty !== null && x.qty !== undefined);
  if (w && counted.length && counted.every((x) => +x.qty === 0) && !w.dest) updateWork(w.id, { dest: 'vendida' });
}

export const scalOf = (v) => v.scal || METHODS[v.method]?.scal || '';
// Margen de una variante en un canal:
//   precio sin IVA − material − horas × tarifa − comisión del canal − envío − reserva para devoluciones.
// La comisión en % se calcula sobre lo que paga el cliente (precio con IVA). Sin canal, no hay comisión ni envío.
export function marginOf(v, channel = null) {
  if (v.price === null || v.price === undefined || v.price === '' || isNaN(+v.price)) return null;
  const s = S.settings;
  const vat = (+v.vat || 0) / 100;
  const net = s.priceWithVat ? +v.price / (1 + vat) : +v.price;
  const gross = net * (1 + vat);
  const rate = +s.hourRate || 0;
  const mat = +v.costMat || 0;
  const labor = (+v.hours || 0) * rate;
  const cfg = (channel && s.channelCfg?.[channel]) || {};
  const fee = gross * ((+cfg.pct || 0) / 100) + (+cfg.fixed || 0);
  const ship = +cfg.ship || 0;
  const reserve = net * ((+s.reserve || 0) / 100);
  const m = net - mat - labor - fee - ship - reserve;
  const pct = net > 0 ? Math.round((m / net) * 100) : 0;
  return {
    channel, gross: round(gross), net: round(net), mat: round(mat), labor: round(labor), fee: round(fee), ship: round(ship), reserve: round(reserve),
    cost: round(mat + labor), margin: round(m), pct, level: pct >= (+s.marginGood || 30) ? 'good' : pct >= (+s.marginMid || 10) ? 'mid' : 'bad',
    hoursIgnored: !!(+v.hours > 0 && !rate),
  };
}
// Un margen por cada canal donde se vende (o uno solo, sin comisiones, si todavía no tiene canal).
export function marginsOf(v) {
  const chs = (v.channels || []).filter((c) => (S.settings.channels || []).includes(c));
  return (chs.length ? chs : [null]).map((c) => marginOf(v, c)).filter(Boolean);
}
// El peor margen de la variante: es el que conviene vigilar.
export const worstMargin = (v) => marginsOf(v).sort((a, b) => a.pct - b.pct)[0] || null;
// Cambia el nombre de un canal en todas las variantes que lo usan.
export function renameChannel(from, to) {
  const t = now();
  for (const v of alive(S.variants)) {
    if (!(v.channels || []).includes(from)) continue;
    v.channels = [...new Set(v.channels.map((c) => (c === from ? to : c)))];
    v.u = t;
  }
}

// ── Archivos (fotos y adjuntos) ────────────────────────────
export const getFile = (id) => (id && S.files[id] && !S.files[id].del ? S.files[id] : null);
const liveFiles = () => alive(S.files).filter((f) => !f.trashed);
export const photosOf = (workId) => liveFiles().filter((f) => f.workId === workId && f.kind === 'photo' && !(f.sampleId && getSample(f.sampleId))).sort((a, b) => (a.c || 0) - (b.c || 0));
export const samplePhotos = (sampleId) => liveFiles().filter((f) => f.sampleId === sampleId && f.kind === 'photo').sort((a, b) => (a.c || 0) - (b.c || 0));
export const attachmentsOf = (workId) => liveFiles().filter((f) => f.workId === workId && f.kind === 'file').sort((a, b) => (a.c || 0) - (b.c || 0));
export const inboxPhotos = (inboxId) => liveFiles().filter((f) => f.inboxId === inboxId).sort((a, b) => (a.c || 0) - (b.c || 0));
export const trashedFiles = () => alive(S.files).filter((f) => f.trashed).sort((a, b) => b.trashed - a.trashed);
export function coverOf(w) {
  const ph = photosOf(w.id);
  return ph.find((f) => f.id === w.cover) || ph[0] || null;
}
export function addFile(rec) {
  const t = now();
  const f = { id: rec.id || uid(), c: t, u: t, by: actor, driveId: null, ...rec };
  S.files[f.id] = f;
  if (f.workId) {
    const w = getWork(f.workId);
    if (w) { w.u = t; if (f.kind === 'photo' && !w.cover && !f.sampleId) w.cover = f.id; }
    addLog(f.workId, [{ f: '_file', label: f.sampleId ? 'Foto de muestra añadida' : f.kind === 'photo' ? 'Foto añadida' : 'Archivo añadido', old: null, val: f.orig || f.name || '' }], t);
  }
  commit();
  return f;
}
export function updateFile(id, patch, { local = true } = {}) {
  const f = getFile(id);
  if (!f) return;
  Object.assign(f, patch, { u: now() });
  commit({ local });
}
export function trashFile(id) {
  const f = getFile(id);
  if (!f) return;
  const t = now();
  f.trashed = t;
  f.u = t;
  const w = getWork(f.workId);
  if (w && w.cover === id) { w.cover = null; w.u = t; }
  if (f.workId) addLog(f.workId, [{ f: '_file', label: f.kind === 'photo' ? 'Foto eliminada' : 'Archivo eliminado', old: f.orig || f.name || '', val: null }], t);
  commit();
}
export function restoreFile(id) { const f = getFile(id); if (f) { f.trashed = null; f.u = now(); commit(); } }
export function purgeFile(id) {
  const f = getFile(id);
  if (!f) return;
  meta.driveTrash = meta.driveTrash || [];
  if (f.driveId) meta.driveTrash.push(f.driveId);
  S.files[id] = { id, del: true, u: now() };
  commit();
}

// ── Muestras ───────────────────────────────────────────────
// Una muestra es una prueba física de una variante (una camiseta pedida al proveedor, una placa de esmalte…):
// cuándo se pidió y llegó, cuánto costó, cómo salió, cómo aguanta los lavados y qué se decide.
export const SAMPLE_LABELS = {
  ordered: 'Fecha de pedido', received: 'Fecha de recepción', supplier: 'Proveedor', garment: 'Prenda', prod: 'Producción',
  color: 'Color', size: 'Talla', cost: 'Coste con envío', print: 'Impresión al recibir', wash5: 'Tras 5 lavados',
  wash10: 'Tras 10 lavados', fit: 'Tallaje', vsRef: 'Frente a la serigrafía', decision: 'Decisión', notes: 'Notas',
};
export const DECISIONS = [['aprobada', 'Aprobada'], ['descartada', 'Descartada'], ['repetir', 'Repetir prueba']];
export const getSample = (id) => (id && S.samples[id] && !S.samples[id].del ? S.samples[id] : null);
export const allSamples = () => alive(S.samples).filter((x) => getWork(x.workId)).sort((a, b) => String(b.ordered || '').localeCompare(String(a.ordered || '')) || (b.c || 0) - (a.c || 0));
export const samplesOf = (variantId) => allSamples().filter((x) => x.variantId === variantId);
export const samplesOfWork = (workId) => allSamples().filter((x) => x.workId === workId);
// Días entre el pedido y la llegada.
export function deliveryDays(x) {
  if (!x.ordered || !x.received) return null;
  const d = Math.round((Date.parse(x.received) - Date.parse(x.ordered)) / 864e5);
  return isNaN(d) || d < 0 ? null : d;
}
export const decisionName = (d) => DECISIONS.find((x) => x[0] === d)?.[1] || '';

export function createSample(variantId, data = {}) {
  const v = getVariant(variantId);
  if (!v) return null;
  const t = now();
  const x = {
    id: uid(), c: t, u: t, by: actor, workId: v.workId, variantId,
    ordered: ymd(), received: '', supplier: v.fields?.proveedor || '', garment: v.fields?.prenda || '', prod: v.fields?.produccion || '',
    color: '', size: '', cost: null, print: null, wash5: null, wash10: null, fit: '', vsRef: '', decision: '', notes: '',
    ...data,
  };
  S.samples[x.id] = x;
  addLog(v.workId, [{ f: '_sample', label: `Muestra pedida (${v.code})`, old: null, val: [x.supplier, x.prod].filter(Boolean).join(' · ') || x.ordered }], t);
  commit();
  return x;
}
export function updateSample(id, patch) {
  const x = getSample(id);
  if (!x) return null;
  const t = now();
  let changed = false;
  for (const [k, val] of Object.entries(patch)) {
    if (eq(x[k], val)) continue;
    if (k === 'decision' && val) addLog(x.workId, [{ f: '_sample', label: `Muestra de ${getVariant(x.variantId)?.code || 'una variante'}`, old: null, val: decisionName(val) }], t);
    if (k === 'received' && val && !x.received) addLog(x.workId, [{ f: '_sample', label: `Muestra recibida (${getVariant(x.variantId)?.code || ''})`, old: null, val }], t);
    x[k] = val;
    changed = true;
  }
  if (!changed) return x;
  x.u = t;
  commit();
  return x;
}
// Eliminar una muestra lleva también sus fotos a la papelera. Devuelve una copia para «Deshacer».
export function deleteSample(id) {
  const x = getSample(id);
  if (!x) return null;
  const copy = clone(x);
  const t = now();
  const photos = samplePhotos(id).map((f) => f.id);
  for (const fid of photos) { S.files[fid].trashed = t; S.files[fid].u = t; }
  S.samples[id] = { id, del: true, u: t };
  addLog(x.workId, [{ f: '_sample', label: 'Muestra eliminada', old: null, val: getVariant(x.variantId)?.code || '' }], t);
  commit();
  return { copy, photos };
}
export function restoreSample({ copy, photos = [] }) {
  const t = now();
  S.samples[copy.id] = { ...copy, u: t };
  for (const fid of photos) if (S.files[fid] && !S.files[fid].del) { S.files[fid].trashed = null; S.files[fid].u = t; }
  commit();
}

// ── Registro de la calle ───────────────────────────────────
// Cada vez que alguien pregunta por una obra. Con un toque se guarda la fecha y quién lo apunta; el resto es opcional.
export const ASK_WHO = [['desconocido', 'Desconocido'], ['conocido', 'Conocido']];
export const ASK_REACTIONS = [
  ['donde', 'Preguntó dónde comprarla'], ['precio', 'Pidió precio'], ['elogio', 'Elogió el dibujo'],
  ['comprar', 'Quiso comprarla allí mismo'], ['otra', 'Otra'],
];
export const getAsk = (id) => (id && S.asks[id] && !S.asks[id].del ? S.asks[id] : null);
export const allAsks = () => alive(S.asks).filter((a) => getWork(a.workId)).sort((a, b) => (b.at || 0) - (a.at || 0));
export const asksOf = (workId) => allAsks().filter((a) => a.workId === workId);
// Contador por obra (se recalcula solo cuando cambia algo).
let askCache = null;
let askCacheKey = '';
export function askCount(workId) {
  const key = Object.keys(S.asks).length + ':' + maxU;
  if (!askCache || askCacheKey !== key) {
    askCache = new Map();
    for (const a of alive(S.asks)) askCache.set(a.workId, (askCache.get(a.workId) || 0) + 1);
    askCacheKey = key;
  }
  return askCache.get(workId) || 0;
}
export function addAsk(workId, data = {}) {
  if (!getWork(workId)) return null;
  const t = now();
  const a = { id: uid(), c: t, u: t, by: actor, workId, at: t, date: ymd(), place: '', who: '', reaction: '', price: null, notes: '', ...data };
  S.asks[a.id] = a;
  commit();
  return a;
}
export function updateAsk(id, patch) {
  const a = getAsk(id);
  if (!a) return null;
  let changed = false;
  for (const [k, val] of Object.entries(patch)) if (!eq(a[k], val)) { a[k] = val; changed = true; }
  if (!changed) return a;
  a.u = now();
  commit();
  return a;
}
export function deleteAsk(id) {
  const a = getAsk(id);
  if (!a) return null;
  const copy = clone(a);
  S.asks[id] = { id, del: true, u: now() };
  commit();
  return copy;
}
export function restoreAsk(copy) { S.asks[copy.id] = { ...copy, u: now() }; commit(); }
// Preguntas por mes (AAAA-MM), de la más reciente a la más antigua.
export function asksByMonth() {
  const m = new Map();
  for (const a of allAsks()) { const k = String(a.date || ymd(new Date(a.at))).slice(0, 7); m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

// ── Por ordenar (capturas sin clasificar) ──────────────────
export const inbox = () => alive(S.inbox).sort((a, b) => (b.c || 0) - (a.c || 0));
export function addInbox(text = '') {
  const t = now();
  const e = { id: uid(), c: t, u: t, by: actor, text: String(text || '').trim() };
  S.inbox[e.id] = e;
  commit();
  return e;
}
export function updateInbox(id, patch) {
  const e = S.inbox[id];
  if (!e || e.del) return;
  Object.assign(e, patch, { u: now() });
  commit();
}
// Convierte una captura en obra nueva, o la añade a una obra que ya existe (workId).
export function resolveInbox(id, workId) {
  const e = S.inbox[id];
  const w = getWork(workId);
  if (!e || e.del || !w) return;
  const t = now();
  for (const f of inboxPhotos(id)) {
    f.workId = w.id; f.inboxId = null; f.u = t;
    if (!w.cover) w.cover = f.id;
  }
  if (e.text) w.notes = [w.notes, e.text].filter(Boolean).join('\n');
  w.u = t;
  addLog(w.id, [{ f: '_file', label: 'Captura añadida desde «Por ordenar»', old: null, val: e.text || 'foto' }], t);
  S.inbox[id] = { id, del: true, u: t };
  commit();
}
export function deleteInbox(id) {
  const t = now();
  for (const f of inboxPhotos(id)) { f.trashed = t; f.u = t; }
  S.inbox[id] = { id, del: true, u: t };
  commit();
}

// ── Sugerencias que aprenden de lo ya escrito ──────────────
// key: themes | styles | collection | material | finish | location | wf:<campo> | vf:<campo>
export function suggestions(key, typeId) {
  const count = new Map();
  const add = (v, n = 1) => { const s = String(v || '').trim(); if (s) count.set(s, (count.get(s) || 0) + n); };
  const type = getType(typeId);
  if (key === 'themes' || key === 'styles') for (const w of works()) (w[key] || []).forEach((x) => add(x));
  else if (key === 'collection') for (const w of works()) add(w.collection);
  else if (key === 'material' || key === 'finish' || key === 'location') {
    for (const v of alive(S.variants)) add(v[key]);
    (key === 'material' ? type?.materialSeed : key === 'finish' ? type?.finishSeed : [])?.forEach((x) => add(x, 0.5));
  } else if (key.startsWith('wf:')) {
    const f = key.slice(3);
    for (const w of works()) if (!typeId || w.type === typeId) add(w.fields?.[f]);
    (type?.workFields || []).find((d) => d.id === f)?.seed?.forEach((x) => add(x, 0.5));
  } else if (key.startsWith('vf:')) {
    const f = key.slice(3);
    for (const v of alive(S.variants)) add(v.fields?.[f]);
    (type?.variantFields || []).find((d) => d.id === f)?.seed?.forEach((x) => add(x, 0.5));
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')).map((x) => x[0]);
}

// ── Avisos (informan, nunca bloquean) ──────────────────────
export function warningsFor(w) {
  const out = [];
  const type = getType(w.type);
  const ppl = (w.authors || []).map(person).filter(Boolean);
  const tit = titular();
  const restricted = ppl.some((p) => p.publico);
  const selling = w.sell === 'si';
  let original = false;
  let cesion = false;
  for (const v of variantsOf(w.id)) {
    const sup = supportOf(type, v.support);
    const pub = v.state === 'Publicada';
    if (restricted && sup?.original && (selling || pub)) original = true;
    if (tit && pub && ppl.some((p) => !p.titular) && !w.rights?.ceded) cesion = true;
    for (const f of type?.variantFields || []) {
      const val = v.fields?.[f.id];
      if (f.warnIfSelling && (selling || pub) && val === 'unknown') out.push(`${v.code}: ${f.warnIfSelling}`);
      if (f.warnIfPublishing && pub && !val) out.push(`${v.code}: ${f.warnIfPublishing}`);
    }
  }
  if (original) out.unshift('Original físico de una persona con restricciones por empleo público marcado para vender. Pendiente de personal y gestor.');
  if (cesion) out.push('Hay una variante publicada y «Derechos cedidos» no está marcado.');
  return out;
}
// ¿Hay que mostrar «Derechos cedidos»? Solo cuando algún autor no es el titular de la tienda.
export const needsRights = (w) => !!titular() && (w.authors || []).some((id) => person(id) && !person(id).titular);

// Cuántos campos de la ficha están rellenos.
export function completeness(w) {
  const type = getType(w.type);
  const checks = [!!w.name, !!w.type, (w.authors || []).length > 0, !!w.date, (w.themes || []).length > 0, !!coverOf(w), !!w.descInt, !!w.sell, variantsOf(w.id).length > 0];
  for (const f of (type?.workFields || []).filter((x) => !x.hidden)) { const v = w.fields?.[f.id]; checks.push(v !== undefined && v !== '' && v !== null); }
  return { done: checks.filter(Boolean).length, total: checks.length };
}

// ── Fusión con lo que hay en Drive ─────────────────────────
function mergeRec(k, l, r, b) {
  const out = mergeRecord(l, r, b);
  if (k === 'works' && b && !out.del && !l.del && !r.del && !b.del) {
    const loser = (+r.u || 0) > (+l.u || 0) ? l : r;
    for (const f of LONG_FIELDS) {
      const lv = l[f] || '', rv = r[f] || '', bv = b[f] || '';
      if (lv !== bv && rv !== bv && lv !== rv) out.conflicts = { ...(out.conflicts || {}), [f]: { text: loser[f] || '', by: loser.eb || null, at: +loser.u || 0 } };
    }
  }
  return out;
}

export function merge(remote, { useBase = true } = {}) {
  if (!remote) return false;
  seen(remote);
  const B = useBase ? baseFor(remote) : null;
  let changed = false;
  for (const k of COLLECTIONS) {
    for (const [id, rv] of Object.entries(remote[k] || {})) {
      const lv = S[k][id];
      if (!lv) { S[k][id] = rv; changed = true; continue; }
      const lu = +lv.u || 0;
      const ru = +rv.u || 0;
      if (ru === lu) continue;
      const bv = B?.[k]?.[id];
      if (bv) {
        const bu = +bv.u || 0;
        if (ru <= bu) continue;                               // en Drive no hay nada nuevo: se queda lo de aquí
        S[k][id] = lu === bu ? rv : mergeRec(k, lv, rv, bv);  // solo cambió el otro aparato, o cambiaron los dos
        changed = true;
      } else if (ru > lu) { S[k][id] = rv; changed = true; }
    }
  }
  const rs = remote.settings;
  if (rs) {
    const ls = S.settings;
    const lu = +ls.u || 0;
    const ru = +rs.u || 0;
    const bs = B?.settings;
    const bu = +bs?.u || 0;
    if (ru !== lu) {
      if (bs && ru > bu && lu !== bu) { S.settings = { ...merge3(ls, rs, bs, ru > lu), u: Math.max(ru, lu) + 1 }; changed = true; }
      else if (bs ? ru > bu : ru > lu) { S.settings = { ...ls, ...rs }; changed = true; }
    }
  }
  for (const [l, n] of Object.entries(remote.counters || {})) if ((S.counters[l] || 0) < n) { S.counters[l] = n; changed = true; }
  if ((remote.backupInfo?.u || 0) > (S.backupInfo?.u || 0)) { S.backupInfo = remote.backupInfo; changed = true; }
  // Conserva datos de versiones más nuevas de la app que esta todavía no conoce.
  for (const [k, v] of Object.entries(remote)) if (!(k in S) && k !== 'syncId' && k !== 'parentId') S[k] = v;
  ensure();
  seen(S);
  return changed;
}

export function newerThan(remote) {
  if (!remote) return true;
  for (const k of COLLECTIONS) {
    for (const [id, lv] of Object.entries(S[k])) {
      const rv = remote[k]?.[id];
      if (!rv || (+lv.u || 0) !== (+rv.u || 0)) return true;
    }
  }
  if (!eq(S.counters, remote.counters || {})) return true;
  if ((S.backupInfo?.u || 0) > (remote.backupInfo?.u || 0)) return true;
  return (+S.settings.u || 0) !== (+remote.settings?.u || 0) || (remote.v || 1) < SCHEMA;
}

// Resuelve un conflicto de texto largo: keep = 'mine' (la que se ve), 'other' (la otra) o 'both' (las dos seguidas).
export function resolveConflict(id, field, keep) {
  const w = getWork(id);
  const c = w?.conflicts?.[field];
  if (!w || !c) return;
  const text = keep === 'other' ? c.text : keep === 'both' ? [w[field], c.text].filter(Boolean).join('\n\n') : w[field];
  const conflicts = { ...w.conflicts };
  delete conflicts[field];
  updateWork(id, { [field]: text, conflicts: Object.keys(conflicts).length ? conflicts : null });
}
