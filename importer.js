// Importación de fichas preparadas por Claude (de listas, notas, fotos de libretas, la hoja de cálculo…).
// Reglas: solo fichas nuevas; nunca se sobrescribe nada; lo que completa una ficha existente es un «añadido»
// que solo rellena lo vacío; todo llega con su origen y la marca «importado» hasta que lo reviséis.
import * as st from './store.js';
import { DESTS, SELL, VARIANT_STATES } from './types.js';
import { h, icon, badge, toggle, toast, openSheet, nav } from './ui.js';

export const WORKS_KIND = 'works';
const TEXT_KEYS = ['descInt', 'descEs', 'descCa', 'next', 'collection'];
const LIST_KEYS = ['themes', 'styles'];
const n = (x) => st.norm(x);
const str = (x) => (x === null || x === undefined ? '' : String(x).trim());
const num = (x) => (x === null || x === undefined || x === '' ? null : typeof x === 'number' ? x : +String(x).replace(',', '.'));
const DATE_RE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;

function findType(x) {
  const t = n(x);
  if (!t) return null;
  return st.types().find((ty) => n(ty.id) === t || n(ty.name) === t || n(ty.short) === t) || null;
}
const findPerson = (name) => st.people().find((p) => n(p.name) === n(name)) || null;
function findWork(ref) {
  const r = n(ref);
  return st.works().find((w) => n(w.code) === r) || st.works().find((w) => n(w.name) === r) || null;
}
// Ajusta un valor al campo del tipo. Devuelve { value } o { doubt } si no encaja.
function fitField(def, raw) {
  if (raw === null || raw === undefined || raw === '') return { value: undefined };
  switch (def.kind) {
    case 'number': { const v = num(raw); return isNaN(v) ? { doubt: `«${def.label}»: «${raw}» no es un número` } : { value: v }; }
    case 'yesno': { const v = n(raw); return ['si', 'yes', 'true'].includes(v) ? { value: 'si' } : ['no', 'false'].includes(v) ? { value: 'no' } : { doubt: `«${def.label}»: «${raw}» no es sí ni no` }; }
    case 'ynu': { const v = n(raw); return ['si', 'yes', 'true'].includes(v) ? { value: 'si' } : ['no', 'false'].includes(v) ? { value: 'no' } : ['unknown', 'sin comprobar', ''].includes(v) ? { value: 'unknown' } : { doubt: `«${def.label}»: «${raw}» no es sí, no ni «sin comprobar»` }; }
    case 'choice': { const o = def.options.find((x) => n(x) === n(raw)); return o ? { value: o } : { doubt: `«${def.label}»: «${raw}» no está entre las opciones (${def.options.join(', ')})` }; }
    case 'multi': {
      const vals = [].concat(raw).map(str).filter(Boolean);
      const ok = vals.map((v) => def.options.find((x) => n(x) === n(v))).filter(Boolean);
      const bad = vals.filter((v) => !def.options.some((x) => n(x) === n(v)));
      return bad.length ? { value: ok.length ? ok : undefined, doubt: `«${def.label}»: no están entre las opciones: ${bad.join(', ')}` } : { value: ok };
    }
    case 'date': return DATE_RE.test(str(raw)) ? { value: str(raw) } : { doubt: `«${def.label}»: «${raw}» no es una fecha AAAA-MM-DD` };
    default: return { value: str(raw) };
  }
}

// Prepara lo que se va a importar, sin tocar nada todavía.
export function planImport(json) {
  const errors = [];
  if (!json || json.app !== 'gestor-disenos' || json.kind !== WORKS_KIND || !Array.isArray(json.works)) {
    return { errors: ['No es un archivo de fichas del gestor de diseños.'] };
  }
  const origin = str(json.origin) || 'importado ' + st.ymd();
  const plan = { origin, creates: [], additions: [], doubts: [...[].concat(json.doubts || []).map(str).filter(Boolean)], newValues: [], errors };
  const known = {
    themes: new Set(st.suggestions('themes').map(n)), styles: new Set(st.suggestions('styles').map(n)),
    collection: new Set(st.suggestions('collection').map(n)), material: new Set(st.suggestions('material').map(n)),
  };
  const noteNew = (kind, v) => { if (v && !known[kind].has(n(v))) { known[kind].add(n(v)); plan.newValues.push(`${{ themes: 'Temática', styles: 'Estilo', collection: 'Colección', material: 'Material' }[kind]}: ${v}`); } };

  json.works.forEach((raw, i) => {
    const name = str(raw?.name);
    const tag = name || `Ficha ${i + 1}`;
    const doubts = [...[].concat(raw?.doubts || []).map(str).filter(Boolean)];
    const type = raw?.type ? findType(raw.type) : null;
    if (raw?.type && !type) doubts.push(`El tipo «${raw.type}» no existe: la ficha queda sin tipo.`);
    if (!raw?.type) doubts.push('No dice de qué tipo es.');
    if (!name) doubts.push('No tiene nombre.');
    const work = { name, type: type?.id || null, fields: {}, notes: str(raw?.notes) };
    // Autores por nombre (tal como están en Ajustes › Personas).
    const authors = [];
    for (const a of [].concat(raw?.authors || [])) { const p = findPerson(a); if (p) authors.push(p.id); else doubts.push(`Autor «${a}»: no hay nadie con ese nombre en Ajustes › Personas.`); }
    work.authors = uniqIds(authors);
    if (!authors.length && !raw?.authors) doubts.push('No dice quién es el autor.');
    if (raw?.date) { if (DATE_RE.test(str(raw.date))) work.date = str(raw.date); else doubts.push(`Fecha «${raw.date}»: escribe AAAA-MM-DD, AAAA-MM o AAAA.`); } else work.date = '';
    if (raw?.state) { if (type?.workStates.some((s) => n(s) === n(raw.state))) work.state = type.workStates.find((s) => n(s) === n(raw.state)); else doubts.push(`Estado «${raw.state}»: no es uno de los pasos de ${type?.name || 'este tipo'}.`); }
    if (raw?.dest) { const d = DESTS.find((x) => x[0] && (n(x[0]) === n(raw.dest) || n(x[1]) === n(raw.dest))); if (d) work.dest = d[0]; else doubts.push(`Destino «${raw.dest}» no existe.`); }
    if (raw?.sell) { const d = SELL.find((x) => n(x[0]) === n(raw.sell) || n(x[1]) === n(raw.sell)); if (d) work.sell = d[0]; else doubts.push(`«¿Vender?»: «${raw.sell}» no es sí, no ni quizá.`); }
    for (const k of TEXT_KEYS) if (str(raw?.[k])) work[k] = str(raw[k]);
    for (const k of LIST_KEYS) if (raw?.[k]) { work[k] = [...new Set([].concat(raw[k]).map(str).filter(Boolean))]; work[k].forEach((v) => noteNew(k, v)); }
    if (work.collection) noteNew('collection', work.collection);
    if (raw?.tags) { const ok = [].concat(raw.tags).filter((t) => (st.S.settings.tags || []).includes(n(t))).map(n); const bad = [].concat(raw.tags).filter((t) => !(st.S.settings.tags || []).includes(n(t))); work.tags = ok; if (bad.length) doubts.push(`Etiquetas que no están en la lista: ${bad.join(', ')}.`); }
    // Campos del tipo: lo que no encaja no se pierde, va a las notas.
    const extra = [];
    for (const [k, v] of Object.entries(raw?.fields || {})) {
      const def = (type?.workFields || []).find((f) => f.id === k || n(f.label) === n(k));
      if (!def) { extra.push(`${k}: ${Array.isArray(v) ? v.join(', ') : v}`); continue; }
      const r = fitField(def, v);
      if (r.value !== undefined) work.fields[def.id] = r.value;
      if (r.doubt) { doubts.push(r.doubt); if (r.value === undefined) extra.push(`${def.label}: ${v}`); }
    }
    if (extra.length) { work.notes = [work.notes, 'Otros datos importados:\n' + extra.join('\n')].filter(Boolean).join('\n\n'); doubts.push(`Datos sin campo propio, guardados en Notas: ${extra.map((x) => x.split(':')[0]).join(', ')}.`); }
    // Variantes
    const variants = [];
    for (const rv of [].concat(raw?.variants || [])) {
      const sup = (type?.supports || []).find((s) => n(s.code) === n(rv?.support) || n(s.name) === n(rv?.support));
      if (rv?.support && !sup) doubts.push(`Variante «${rv.support}»: no es un soporte de ${type?.name || 'este tipo'}.`);
      const v = { support: sup?.code || null, patch: {}, fields: {} };
      if (str(rv?.label)) v.patch.label = str(rv.label);
      for (const k of ['price', 'costMat', 'hours', 'qty']) if (rv?.[k] !== undefined && rv?.[k] !== null && rv?.[k] !== '') { const x = num(rv[k]); if (isNaN(x)) doubts.push(`Variante ${sup?.name || ''}: «${k}» no es un número.`); else v.patch[k] = x; }
      if (rv?.vat !== undefined) { const x = num(rv.vat); if ([21, 10, 4, 0].includes(x)) v.patch.vat = x; else doubts.push(`IVA «${rv.vat}»: debe ser 21, 10, 4 o 0.`); }
      for (const k of ['material', 'finish', 'location']) if (str(rv?.[k])) { v.patch[k] = str(rv[k]); if (k === 'material') noteNew('material', v.patch[k]); }
      if (rv?.state) { const s = VARIANT_STATES.find((x) => n(x) === n(rv.state)); if (s) v.patch.state = s; else doubts.push(`Estado de variante «${rv.state}» no existe.`); }
      if (rv?.channels) { const chs = [].concat(rv.channels).map((c) => (st.S.settings.channels || []).find((x) => n(x) === n(c))).filter(Boolean); v.patch.channels = chs; }
      for (const [k, val] of Object.entries(rv?.fields || {})) {
        const def = (type?.variantFields || []).find((f) => f.id === k || n(f.label) === n(k));
        if (!def) { doubts.push(`Variante: el campo «${k}» no existe; no se importa.`); continue; }
        const r = fitField(def, val);
        if (r.value !== undefined) v.fields[def.id] = r.value;
        if (r.doubt) doubts.push(r.doubt);
      }
      variants.push(v);
    }
    // ¿Ya existe una obra con ese nombre?
    const dup = name ? st.works().find((w) => n(w.name) === n(name) && (!type || w.type === type.id)) : null;
    plan.creates.push({ key: 'c' + i, tag, work, variants, doubts, dup: dup ? (dup.code || dup.name) : null, on: !dup, review: str(raw?.review) });
  });

  // Añadidos a fichas que ya existen: solo rellenan lo que está vacío.
  [].concat(json.additions || []).forEach((raw, i) => {
    const w = findWork(raw?.work);
    if (!w) { plan.doubts.push(`Añadido para «${raw?.work}»: no hay ninguna obra con ese código o nombre.`); return; }
    const type = st.getType(w.type);
    const sets = [];
    const skipped = [];
    for (const k of TEXT_KEYS) if (str(raw?.[k])) (str(w[k]) ? skipped : sets).push({ k, label: st.WORK_LABELS[k], val: str(raw[k]), cur: w[k] });
    for (const k of LIST_KEYS) if (raw?.[k]) { const add = [].concat(raw[k]).map(str).filter((x) => x && !(w[k] || []).some((y) => n(y) === n(x))); if (add.length) sets.push({ k, label: st.WORK_LABELS[k], val: add, list: true }); }
    for (const [k, v] of Object.entries(raw?.fields || {})) {
      const def = (type?.workFields || []).find((f) => f.id === k || n(f.label) === n(k));
      if (!def) { plan.doubts.push(`${w.code}: el campo «${k}» no existe en ${type?.name || 'su tipo'}.`); continue; }
      const r = fitField(def, v);
      if (r.doubt) plan.doubts.push(`${w.code}: ${r.doubt}`);
      if (r.value === undefined) continue;
      const cur = w.fields?.[def.id];
      if (cur !== undefined && cur !== '' && cur !== null) skipped.push({ k: 'f:' + def.id, label: def.label, val: r.value, cur });
      else sets.push({ k: 'f:' + def.id, label: def.label, val: r.value });
    }
    if (str(raw?.notes)) sets.push({ k: 'notes', label: 'Notas (se añade al final)', val: str(raw.notes), append: true });
    if (sets.length || skipped.length) plan.additions.push({ key: 'a' + i, workId: w.id, tag: `${w.code || ''} · ${st.workTitle(w)}`, sets, skipped, on: sets.length > 0 });
  });
  if (!plan.creates.length && !plan.additions.length) errors.push('El archivo no trae ninguna ficha ni ningún añadido.');
  return plan;
}
const uniqIds = (a) => [...new Set(a)];

// Aplica lo marcado. Devuelve cuántas fichas y añadidos se han hecho.
export function applyImport(plan) {
  let made = 0, added = 0;
  for (const c of plan.creates.filter((x) => x.on)) {
    const reviewNote = [c.review, ...c.doubts].filter(Boolean).join(' · ');
    const w = st.createWork({ name: c.work.name, type: c.work.type, fields: c.work.fields, authors: c.work.authors, date: c.work.date || undefined, notes: c.work.notes, origin: plan.origin, review: reviewNote ? { on: true, note: reviewNote.slice(0, 500) } : null });
    const { name, type, fields, authors, date, notes, ...rest } = c.work;
    st.updateWork(w.id, { ...rest, date: date || '', imported: true }, { log: false });
    for (const v of c.variants) {
      const nv = st.createVariant(w.id, v.support);
      if (nv) st.updateVariant(nv.id, { ...v.patch, ...(Object.keys(v.fields).length ? { fields: v.fields } : {}) });
    }
    made++;
  }
  for (const a of plan.additions.filter((x) => x.on)) {
    const w = st.getWork(a.workId);
    if (!w) continue;
    const patch = {};
    const fields = {};
    for (const s of a.sets) {
      if (s.k.startsWith('f:')) { if (w.fields?.[s.k.slice(2)] === undefined || w.fields?.[s.k.slice(2)] === '') fields[s.k.slice(2)] = s.val; }
      else if (s.list) patch[s.k] = [...(w[s.k] || []), ...s.val];
      else if (s.append) patch.notes = [w.notes, s.val].filter(Boolean).join('\n\n');
      else if (!str(w[s.k])) patch[s.k] = s.val;
    }
    if (Object.keys(fields).length) patch.fields = fields;
    const tag = 'Añadido importado: ' + plan.origin;
    const note = w.review?.note?.includes(tag) ? w.review.note : [tag, w.review?.note].filter(Boolean).join(' · ').slice(0, 500);
    if (Object.keys(patch).length) { st.updateWork(w.id, { ...patch, review: { on: true, note } }); added++; }
  }
  return { made, added };
}

// Pantalla de revisión: cada ficha y cada añadido con su casilla; dudas y valores nuevos a la vista.
export function reviewImport(json) {
  const plan = planImport(json);
  const s = openSheet('Importar fichas', () => {
    if (plan.errors?.length && !plan.creates?.length && !plan.additions?.length) return h('div', { class: 'note-box' }, plan.errors.join(' '));
    const chosen = plan.creates.filter((c) => c.on).length + plan.additions.filter((a) => a.on).length;
    const show = (v) => (Array.isArray(v) ? v.join(', ') : v === 'unknown' ? 'sin comprobar' : v === 'si' ? 'sí' : String(v));
    return [
      h('p', { class: 'muted' }, `Origen: ${plan.origin}. Nada de lo que ya tenéis se sobrescribe. Las fichas nuevas llegan marcadas «importado» para revisarlas.`),
      plan.creates.length ? [h('h3', {}, `Fichas nuevas (${plan.creates.length})`), plan.creates.map((c) => {
        const t = st.getType(c.work.type);
        const facts = [t?.name || 'sin tipo', st.personNames(c.work.authors), c.work.state, c.work.date, (c.work.themes || []).join(', '), c.variants.length ? `${c.variants.length} variante${c.variants.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
        return h('div', { class: 'imp' + (c.on ? '' : ' off') },
          toggle(c.tag, c.on, facts, (on) => { c.on = on; s.refresh(); }),
          c.dup ? h('p', { class: 'imp-warn' }, `Ya hay una obra con este nombre (${c.dup}). Desmarcada para no duplicarla.`) : null,
          Object.keys(c.work.fields).length ? h('p', { class: 'imp-sub' }, Object.entries(c.work.fields).map(([k, v]) => `${(t?.workFields || []).find((f) => f.id === k)?.label || k}: ${show(v)}`).join(' · ')) : null,
          c.doubts.length ? h('ul', { class: 'imp-doubts' }, c.doubts.map((d) => h('li', {}, d))) : null);
      })] : null,
      plan.additions.length ? [h('h3', {}, `Añadidos a fichas que ya existen (${plan.additions.length})`), plan.additions.map((a) => h('div', { class: 'imp' + (a.on ? '' : ' off') },
        toggle(a.tag, a.on, 'Solo rellena lo que está vacío', (on) => { a.on = on; s.refresh(); }),
        a.sets.length ? h('ul', { class: 'imp-sub' }, a.sets.map((x) => h('li', {}, `${x.label}: ${show(x.val)}`))) : null,
        a.skipped.length ? h('ul', { class: 'imp-doubts' }, a.skipped.map((x) => h('li', {}, `${x.label}: ya tiene «${show(x.cur)}»; no se cambia por «${show(x.val)}».`))) : null))] : null,
      plan.newValues.length ? [h('h3', {}, 'Valores nuevos'), h('p', { class: 'muted' }, 'No estaban en vuestras listas de sugerencias; se añadirán: ' + plan.newValues.join(' · '))] : null,
      plan.doubts.length ? [h('h3', {}, 'Dudas'), h('ul', { class: 'imp-doubts' }, plan.doubts.map((d) => h('li', {}, d)))] : null,
      h('button', { class: 'btn block primary', disabled: !chosen, onclick: () => {
        const r = applyImport(plan);
        s.close();
        toast(`${r.made} ficha${r.made === 1 ? '' : 's'} nueva${r.made === 1 ? '' : 's'}${r.added ? ` y ${r.added} añadido${r.added === 1 ? '' : 's'}` : ''}. Están en «Revisar».`, { ms: 6000 });
        nav.setTab?.('works');
      } }, chosen ? `Importar ${chosen === 1 ? '1 cosa' : chosen + ' cosas'}` : 'No hay nada marcado'),
    ];
  });
}
