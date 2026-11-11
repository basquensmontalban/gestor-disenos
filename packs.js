// Paquetes de tipos: un tipo de obra (estados, campos, soportes, roles de archivo) en un archivo JSON.
// Claude los prepara; la app los comprueba, enseña qué cambia y los incorpora sin borrar nunca ningún dato.
import * as st from './store.js';
import * as g from './google.js';
import { BUILTIN_TYPES, METHODS } from './types.js';
import { h, icon, badge, field, inp, toggle, select, toast, openSheet, confirmSheet, download, nav } from './ui.js';

export const PACK_KIND = 'type-pack';
// Clases de campo admitidas (y los nombres alternativos que también se aceptan).
export const KINDS = {
  text: 'Texto', long: 'Texto largo', number: 'Número', dims: 'Medidas', yesno: 'Sí / no', ynu: 'Sí / no / sin comprobar',
  choice: 'Lista (una opción)', multi: 'Lista (varias opciones)', suggest: 'Sugerencias que aprenden', date: 'Fecha',
};
const KIND_ALIAS = {
  texto: 'text', textarea: 'long', largo: 'long', numero: 'number', num: 'number', medidas: 'dims', dimensions: 'dims',
  sino: 'yesno', yesNo: 'yesno', boolean: 'yesno', bool: 'yesno', yesNoUnknown: 'ynu', sinocomprobar: 'ynu',
  lista: 'choice', select: 'choice', enum: 'choice', varias: 'multi', multiple: 'multi', sugerencias: 'suggest', fecha: 'date',
};
const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;
const FID = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const CODE = /^[A-Z]{2,4}$/;

const isStrList = (x) => Array.isArray(x) && x.every((s) => typeof s === 'string' && s.trim());
const uniq = (arr) => [...new Set(arr)];

// Letras ocupadas por otros tipos (también las del origen de ilustración: D, A, I).
function lettersOf(t) { return t ? uniq([t.letter, ...Object.values(t.letterBy?.map || {})].filter(Boolean)) : []; }
function takenLetters(exceptId) {
  const m = new Map();
  for (const t of st.types()) if (t.id !== exceptId) for (const l of lettersOf(t)) m.set(l, t.name);
  return m;
}

// Comprueba y normaliza un campo. Devuelve el campo limpio o null (y anota el error).
function cleanField(f, where, errors, warnings) {
  if (!f || typeof f !== 'object') { errors.push(`${where}: un campo no es válido.`); return null; }
  const id = String(f.id || '').trim();
  if (!FID.test(id)) { errors.push(`${where}: el identificador «${id}» no vale (letras y números, sin espacios ni tildes).`); return null; }
  const label = String(f.label || '').trim();
  if (!label) { errors.push(`${where} · ${id}: falta el nombre que se ve («label»).`); return null; }
  let kind = String(f.kind || 'text');
  kind = KIND_ALIAS[kind] || KIND_ALIAS[kind.toLowerCase()] || kind;
  if (!KINDS[kind]) { warnings.push(`${where} · ${label}: la clase «${f.kind}» no existe; se usa «Texto».`); kind = 'text'; }
  const out = { id, label, kind };
  if (kind === 'choice' || kind === 'multi') {
    if (!isStrList(f.options) || !f.options.length) { errors.push(`${where} · ${label}: una lista necesita sus opciones («options»).`); return null; }
    out.options = uniq(f.options.map((s) => s.trim()));
  }
  if (kind === 'suggest' && f.seed !== undefined) {
    if (isStrList(f.seed)) out.seed = uniq(f.seed.map((s) => s.trim()));
    else warnings.push(`${where} · ${label}: las sugerencias iniciales («seed») no son una lista de textos; se ignoran.`);
  }
  if ((kind === 'number' || kind === 'dims') && f.unit) out.unit = String(f.unit).trim().slice(0, 12);
  if (f.hint) out.hint = String(f.hint).trim().slice(0, 200);
  for (const k of ['warnIfSelling', 'warnIfPublishing']) {
    if (!f[k]) continue;
    if (typeof f[k] === 'string' && f[k].trim().length > 8) out[k] = f[k].trim();
    else warnings.push(`${where} · ${label}: «${k}» debe ser el texto del aviso; se ignora.`);
  }
  if (out.warnIfSelling && kind !== 'ynu') warnings.push(`${where} · ${label}: «warnIfSelling» solo avisa en campos «sí / no / sin comprobar».`);
  return out;
}

// Comprueba un paquete. Devuelve { type, errors, warnings } con el tipo ya limpio.
export function validatePack(json) {
  const errors = [];
  const warnings = [];
  const raw = json?.type;
  if (!json || json.app !== 'gestor-disenos' || json.kind !== PACK_KIND || !raw || typeof raw !== 'object') {
    return { type: null, errors: ['No es un paquete de tipo del gestor de diseños.'], warnings };
  }
  const id = String(raw.id || '').trim();
  if (!SLUG.test(id)) errors.push(`El identificador del tipo («${id}») no vale: minúsculas, números y guiones.`);
  const name = String(raw.name || '').trim();
  if (!name) errors.push('Falta el nombre del tipo.');
  const letter = String(raw.letter || '').trim().toUpperCase();
  if (!/^[A-Z]$/.test(letter)) errors.push('La letra del código debe ser una sola letra (A–Z).');
  const taken = takenLetters(id);
  const letters = [letter];
  let letterBy = null;
  if (raw.letterBy) {
    const lb = raw.letterBy;
    if (lb && typeof lb.field === 'string' && lb.map && typeof lb.map === 'object' && Object.values(lb.map).every((l) => /^[A-Z]$/.test(l))) {
      letterBy = { field: lb.field, map: { ...lb.map } };
      letters.push(...Object.values(lb.map));
    } else errors.push('«letterBy» no es válido.');
  }
  for (const l of uniq(letters)) if (taken.has(l)) errors.push(`La letra ${l} ya es de «${taken.get(l)}». Elige otra.`);

  const states = isStrList(raw.workStates) ? uniq(raw.workStates.map((s) => s.trim())) : [];
  if (!states.length) errors.push('Faltan los estados de la obra («workStates»), por ejemplo ["Idea", "En proceso", "Terminada"].');

  const fieldList = (list, where) => {
    if (list === undefined) return [];
    if (!Array.isArray(list)) { errors.push(`${where}: debe ser una lista.`); return []; }
    const out = [];
    for (const f of list) {
      const c = cleanField(f, where, errors, warnings);
      if (!c) continue;
      if (out.some((x) => x.id === c.id)) { errors.push(`${where}: el campo «${c.id}» está repetido.`); continue; }
      out.push(c);
    }
    return out;
  };
  const workFields = fieldList(raw.workFields, 'Campos de la obra');
  const variantFields = fieldList(raw.variantFields, 'Campos de la variante');
  if (letterBy && !workFields.some((f) => f.id === letterBy.field && f.kind === 'choice')) errors.push('«letterBy» debe apuntar a un campo de la obra de tipo lista.');

  const supports = [];
  if (raw.supports !== undefined && !Array.isArray(raw.supports)) errors.push('«supports» debe ser una lista.');
  for (const s of raw.supports || []) {
    const code = String(s?.code || '').trim().toUpperCase();
    const sname = String(s?.name || '').trim();
    if (!CODE.test(code)) { errors.push(`Soporte «${sname || '?'}»: el código («${s?.code}») deben ser de 2 a 4 letras.`); continue; }
    if (!sname) { errors.push(`Soporte ${code}: falta el nombre.`); continue; }
    if (supports.some((x) => x.code === code)) { errors.push(`Soporte ${code} repetido.`); continue; }
    const method = METHODS[s.method] ? s.method : null;
    if (s.method && !method) warnings.push(`Soporte ${sname}: el método «${s.method}» no existe (${Object.keys(METHODS).join(', ')}); se usa «${raw.handmade ? 'unica' : 'digital'}».`);
    const out = { code, name: sname, method: method || (raw.handmade ? 'unica' : 'digital') };
    if (s.onDemand) out.onDemand = true;
    if (s.original) out.original = true;
    if (s.garment) out.garment = true;
    if (Number.isInteger(s.qty) && s.qty >= 0) out.qty = s.qty;
    if (Array.isArray(s.print) && s.print.length === 2 && s.print.every((n) => Number.isInteger(n) && n > 0)) out.print = s.print;
    supports.push(out);
  }
  const roles = isStrList(raw.fileRoles) ? uniq(raw.fileRoles.map((s) => s.trim())) : [];
  const subset = (k) => (isStrList(raw[k]) ? raw[k].filter((r) => roles.includes(r)) : []);
  const type = {
    id, name, short: String(raw.short || name).trim().slice(0, 18), icon: String(raw.icon || '').trim().slice(0, 4), letter,
    ...(letterBy ? { letterBy } : {}), ...(raw.handmade ? { handmade: true } : {}),
    workStates: states, workFields, variantFields, supports,
    materialSeed: isStrList(raw.materialSeed) ? raw.materialSeed : [], finishSeed: isStrList(raw.finishSeed) ? raw.finishSeed : [],
    fileRoles: roles, ...(subset('printRoles').length ? { printRoles: subset('printRoles') } : {}), ...(subset('scanRoles').length ? { scanRoles: subset('scanRoles') } : {}),
    packVersion: Number.isInteger(json.version) ? json.version : 1,
  };
  if (!supports.length) warnings.push('El tipo no tiene soportes: las variantes no tendrán valores por defecto.');
  return { type, errors, warnings };
}

// ── Juntar una versión nueva con la que ya hay ─────────────
// Lo nuevo manda; lo que desaparece y todavía tiene datos se conserva oculto («retirado»).
export function mergePack(old, neu) {
  if (!old) return neu;
  const ws = st.works().filter((w) => w.type === neu.id);
  const vs = ws.flatMap((w) => st.variantsOf(w.id));
  const keepFields = (oldList, newList, holders) => {
    const out = newList.map((f) => ({ ...f }));
    for (const f of oldList || []) {
      if (out.some((x) => x.id === f.id)) continue;
      if (holders.some((r) => r.fields?.[f.id] !== undefined && r.fields?.[f.id] !== '')) out.push({ ...f, hidden: true });
    }
    return out;
  };
  const usedStates = uniq(ws.map((w) => w.state).filter(Boolean));
  const usedSupports = uniq(vs.map((v) => v.support));
  return {
    ...neu,
    workFields: keepFields(old.workFields, neu.workFields, ws),
    variantFields: keepFields(old.variantFields, neu.variantFields, vs),
    workStates: uniq([...neu.workStates, ...usedStates.filter((s) => !neu.workStates.includes(s))]),
    supports: [...neu.supports, ...(old.supports || []).filter((s) => !neu.supports.some((x) => x.code === s.code) && usedSupports.includes(s.code)).map((s) => ({ ...s, hidden: true }))],
  };
}

// Qué cambia respecto a la versión que hay (para enseñarlo antes de aceptar).
export function diffPack(old, neu) {
  if (!old) return null;
  const out = [];
  const cmp = (a = [], b = [], label) => {
    for (const f of b) {
      const o = a.find((x) => x.id === f.id);
      if (!o) out.push(['add', `${label}: nuevo «${f.label}»`]);
      else if (o.label !== f.label || o.kind !== f.kind || JSON.stringify(o.options || []) !== JSON.stringify(f.options || [])) out.push(['chg', `${label}: cambia «${o.label}»${o.label !== f.label ? ' → «' + f.label + '»' : ''}`]);
    }
    for (const f of a) if (!f.hidden && !b.some((x) => x.id === f.id)) out.push(['del', `${label}: se retira «${f.label}» (si tiene datos, se conservan ocultos)`]);
  };
  cmp(old.workFields, neu.workFields, 'Campo de la obra');
  cmp(old.variantFields, neu.variantFields, 'Campo de la variante');
  for (const s of neu.workStates) if (!old.workStates.includes(s)) out.push(['add', `Estado nuevo: ${s}`]);
  for (const s of old.workStates) if (!neu.workStates.includes(s)) out.push(['del', `Estado retirado: ${s}`]);
  for (const s of neu.supports) if (!(old.supports || []).some((x) => x.code === s.code)) out.push(['add', `Soporte nuevo: ${s.name} (${s.code})`]);
  for (const s of old.supports || []) if (!s.hidden && !neu.supports.some((x) => x.code === s.code)) out.push(['del', `Soporte retirado: ${s.name}`]);
  if (old.letter !== neu.letter) out.push(['chg', `Letra del código: ${old.letter} → ${neu.letter} (las obras que ya tienen código lo conservan)`]);
  if (old.name !== neu.name) out.push(['chg', `Nombre: ${old.name} → ${neu.name}`]);
  return out;
}

// Paquete listo para guardar o para pasárselo a Claude (para que proponga cambios sobre él).
export function packOf(type) {
  const { u, c, del, packVersion, source, ...rest } = st.clone(type);
  return { app: 'gestor-disenos', kind: PACK_KIND, version: (packVersion || 1), type: rest };
}

async function savePackCopy(type) {
  if (!g.token() || !navigator.onLine) return;
  try {
    const folder = await g.findOrCreateFolder('Paquetes de tipos', await g.ensureFolder());
    await g.multipartCreate({ name: `${type.id}-v${type.packVersion || 1}-${st.ymd()}.json`, parents: [folder], mimeType: 'application/json' },
      new Blob([JSON.stringify(packOf(type), null, 1)], { type: 'application/json' }));
  } catch (e) { console.warn('paquete en Drive', e); }
}

// Hoja de vista previa: qué es el tipo, qué cambia, errores y avisos. Solo se importa si no hay errores.
export function previewPack(json, { onDone } = {}) {
  const { type, errors, warnings } = validatePack(json);
  const old = type ? st.getType(type.id) : null;
  const diff = type && old ? diffPack(old, type) : null;
  const n = type && old ? st.works().filter((w) => w.type === type.id).length : 0;
  const s = openSheet(type ? `${type.icon || ''} ${type.name}`.trim() : 'Paquete de tipo', () => [
    errors.length ? h('div', { class: 'note-box' }, h('b', {}, 'No se puede importar:'), h('ul', {}, errors.map((e) => h('li', {}, e)))) : null,
    type ? [
      h('p', { class: 'muted' }, old ? `Ya existe este tipo (${n} obra${n === 1 ? '' : 's'}). Esto lo actualiza: ningún dato se borra.` : 'Tipo nuevo.'),
      h('div', { class: 'card', style: 'padding-top:10px' },
        h('p', {}, h('b', {}, 'Código: '), uniq([type.letter, ...Object.values(type.letterBy?.map || {})]).join(' / '), '001…'),
        h('p', {}, h('b', {}, 'Estados: '), type.workStates.join(' → ')),
        h('p', {}, h('b', {}, 'Campos de la obra: '), type.workFields.map((f) => f.label).join(', ') || '—'),
        h('p', {}, h('b', {}, 'Campos de la variante: '), type.variantFields.map((f) => f.label).join(', ') || '—'),
        h('p', {}, h('b', {}, 'Soportes: '), type.supports.map((x) => `${x.name} (${x.code})`).join(', ') || '—'),
        type.fileRoles.length ? h('p', {}, h('b', {}, 'Archivos: '), type.fileRoles.join(', ')) : null,
        [...type.workFields, ...type.variantFields].some((f) => f.warnIfSelling || f.warnIfPublishing) ? h('p', {}, h('b', {}, 'Avisos: '), [...type.workFields, ...type.variantFields].filter((f) => f.warnIfSelling || f.warnIfPublishing).map((f) => f.label).join(', ')) : null),
      diff ? [h('h3', {}, 'Qué cambia'), diff.length ? h('ul', { class: 'difflist' }, diff.map(([k, t]) => h('li', { class: k }, t))) : h('p', { class: 'muted' }, 'Nada: es igual que el que ya tenéis.')] : null,
      warnings.length ? [h('h3', {}, 'Avisos'), h('ul', { class: 'muted' }, warnings.map((w) => h('li', {}, w)))] : null,
      h('button', { class: 'btn block primary', disabled: errors.length > 0 || (diff && !diff.length), onclick: async () => {
        const merged = { ...mergePack(old, type), source: BUILTIN_TYPES[type.id] ? 'builtin' : 'pack' };
        st.putType(merged);
        s.close();
        toast(old ? `Tipo «${type.name}» actualizado` : `Tipo «${type.name}» añadido`);
        savePackCopy(merged);
        onDone?.();
        nav.rerender?.();
      } }, old ? 'Actualizar el tipo' : 'Añadir el tipo'),
    ] : null,
  ]);
}

// ── Editar un tipo a mano ──────────────────────────────────
// Nombres de campos, opciones de las listas, ocultar o recuperar campos, estados. Lo demás, con un paquete.
export function editType(id) {
  const work = () => st.clone(st.getType(id));
  let t = work();
  const save = (msg) => { st.putType({ ...t, source: t.source || (BUILTIN_TYPES[id] ? 'builtin' : 'pack') }); t = work(); s.refresh(); if (msg) toast(msg); };
  const fieldRow = (f, list) => {
    const label = inp({ value: f.label });
    label.addEventListener('change', () => { const v = label.value.trim(); if (v && v !== f.label) { f.label = v; save('Nombre cambiado'); } else label.value = f.label; });
    const opts = f.options ? inp({ value: f.options.join(', ') }) : null;
    opts?.addEventListener('change', () => {
      const next = uniq(opts.value.split(',').map((x) => x.trim()).filter(Boolean));
      // Las opciones que ya se usan no se pueden quitar desde aquí (se perdería el valor de esas obras).
      const holders = list === 'workFields' ? st.works().filter((w) => w.type === id) : st.works().filter((w) => w.type === id).flatMap((w) => st.variantsOf(w.id));
      const used = uniq(holders.flatMap((r) => [].concat(r.fields?.[f.id] ?? [])).filter(Boolean));
      const kept = [...next, ...used.filter((u) => !next.includes(u))];
      if (kept.length > next.length) toast('Las opciones que ya usan algunas obras se mantienen: ' + used.filter((u) => !next.includes(u)).join(', '), { ms: 6000 });
      f.options = kept;
      save();
    });
    return h('div', { class: 'tfield' + (f.hidden ? ' off' : '') },
      h('div', { class: 'grid2' }, field('Nombre', label), field('Clase', h('div', { class: 'inp', style: 'display:flex;align-items:center;opacity:.75' }, KINDS[f.kind] || f.kind))),
      opts ? field('Opciones', opts, 'Separadas por comas') : null,
      toggle(f.hidden ? 'Oculto (se conservan sus datos)' : 'Se ve en la ficha', !f.hidden, null, (on) => { f.hidden = !on; save(on ? 'Campo visible' : 'Campo oculto: sus datos se conservan'); }));
  };
  const s = openSheet(`${t.icon || ''} ${t.name}`.trim(), () => {
    const states = inp({ value: t.workStates.join(', ') });
    states.addEventListener('change', () => {
      const next = uniq(states.value.split(',').map((x) => x.trim()).filter(Boolean));
      const used = uniq(st.works().filter((w) => w.type === id).map((w) => w.state).filter(Boolean));
      if (!next.length) { states.value = t.workStates.join(', '); return; }
      t.workStates = [...next, ...used.filter((u) => !next.includes(u))];
      save('Estados guardados');
    });
    return [
      h('p', { class: 'muted' }, `Código ${uniq([t.letter, ...Object.values(t.letterBy?.map || {})]).join(' / ')} · ${st.works().filter((w) => w.type === id).length} obras${t.source === 'pack' ? ` · paquete v${t.packVersion || 1}` : ''}`),
      field('Estados de la obra', states, 'En orden y separados por comas. Los que ya usan algunas obras no se pueden quitar.'),
      h('h3', {}, 'Campos de la obra'), t.workFields.map((f) => fieldRow(f, 'workFields')),
      h('h3', {}, 'Campos de la variante'), t.variantFields.map((f) => fieldRow(f, 'variantFields')),
      h('p', { class: 'hint' }, 'Para añadir campos, soportes o cambiar la letra del código, pedid a Claude un paquete nuevo (podéis darle este tipo con «Guardar como paquete»).'),
      h('div', { class: 'btn-row', style: 'margin-top:12px' },
        h('button', { class: 'btn small', onclick: () => download(`tipo-${id}.json`, JSON.stringify(packOf(st.getType(id)), null, 1)) }, icon('download'), 'Guardar como paquete'),
        BUILTIN_TYPES[id] && st.S.types[id] && !st.S.types[id].del ? h('button', { class: 'btn small', onclick: async () => {
          if (!(await confirmSheet('¿Volver al tipo de fábrica?', 'Se pierden los cambios hechos a este tipo (nombres, opciones, campos ocultos). Los datos de las obras se conservan.', { ok: 'Volver al de fábrica' }))) return;
          st.resetType(id); t = work(); s.refresh(); toast('Tipo de fábrica recuperado');
        } }, 'Volver al de fábrica') : null,
        !BUILTIN_TYPES[id] && !st.works().some((w) => w.type === id) ? h('button', { class: 'btn small danger', onclick: async () => {
          if (!(await confirmSheet(`¿Quitar el tipo «${t.name}»?`, 'No hay ninguna obra de este tipo.', { ok: 'Quitar', danger: true }))) return;
          st.resetType(id); s.close(); nav.rerender?.();
        } }, icon('trash'), 'Quitar el tipo') : null),
    ];
  }, { onClose: () => nav.rerender?.() });
}
