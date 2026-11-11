// Ficha de una obra: datos comunes, campos del tipo, variantes, fotos, archivos, textos e historial.
import * as st from './store.js';
import * as g from './google.js';
import { blobGet } from './db.js';
import { D, setDeviceIn } from './device.js';
import { METHODS, SCAL_LEVELS, VARIANT_STATES, DESTS, SELL } from './types.js';
import { fmtSize } from './media.js';
import { addPhotos, addAttachments, looksLikePhoto, thumbImg, openPhoto, openFile, checkBadge } from './files.js';
import { streetSection } from './street.js';
import { sampleRow, newSample, openSample } from './samples.js';
import { h, icon, badge, field, inp, numInput, num, toggle, select, toast, openSheet, confirmSheet, pickFiles, chips, suggestInput, tagsInput, fmtDateTime, nav, setKids } from './ui.js';

const YN = [['si', 'Sí'], ['no', 'No']];
const YNU = [['si', 'Sí'], ['no', 'No'], ['unknown', 'Sin comprobar']];
const DATE_RE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;

// Control para un campo de un paquete de tipo.
function fieldCtl(def, value, onChange, scope, typeId) {
  switch (def.kind) {
    case 'long': {
      const t = h('textarea', { class: 'inp' }, value ?? '');
      t.addEventListener('change', () => onChange(t.value.trim()));
      return t;
    }
    case 'number': {
      const i = numInput(value);
      i.addEventListener('change', () => { const n = num(i.value); onChange(n === null || isNaN(n) ? null : n); });
      return h('div', { class: 'inline' }, i, def.unit ? h('span', { class: 'unit' }, def.unit) : null);
    }
    case 'date': {
      const i = inp({ type: 'date', value: value ?? '' });
      i.addEventListener('change', () => onChange(i.value));
      return i;
    }
    case 'dims': {
      const i = inp({ value: value ?? '', placeholder: `alto × ancho × fondo${def.unit ? ' (' + def.unit + ')' : ''}` });
      i.addEventListener('change', () => onChange(i.value.trim()));
      return i;
    }
    case 'yesno': return chips(YN, value || '', onChange);
    case 'ynu': return chips(YNU, value || '', onChange);
    case 'choice': return def.options.length <= 6 ? chips(def.options, value || '', onChange) : select([['', '—'], ...def.options.map((o) => [o, o])], value, { onchange: (e) => onChange(e.target.value) });
    case 'multi': return chips(def.options, value || [], onChange, { multi: true });
    case 'suggest': return suggestInput(value, st.suggestions(`${scope}:${def.id}`, typeId), onChange);
    default: {
      const i = inp({ value: value ?? '' });
      i.addEventListener('change', () => onChange(i.value.trim()));
      return i;
    }
  }
}

function section(key, title, extra, ...kids) {
  const d = h('details', { class: 'sec', open: !!D.open[key] },
    h('summary', {}, icon('chevron'), title, extra ? h('small', {}, extra) : null),
    h('div', { class: 'sec-body' }, kids));
  d.addEventListener('toggle', () => setDeviceIn('open', key, d.open, { quiet: true }));
  return d;
}

const whoDots = (ids) => (ids || []).map((id) => st.person(id)).filter(Boolean).map((p) => h('span', { class: 'who', style: `background:${p.color}`, title: p.name }));

// ── Ficha ──────────────────────────────────────────────────
let cur = null;
export const currentWorkId = () => cur?.id || null;
export function closeWork() { cur?.sheet.close(); }

export function openWork(id) {
  if (cur?.id === id) return;
  if (cur) cur.sheet.close();
  if (!st.getWork(id)) return;
  let self = false;     // el cambio viene de esta ficha: no hace falta redibujarla entera
  let stale = false;    // ha llegado un cambio de fuera mientras se escribía
  let headEl = null;

  const save = (patch, rebuild = false) => {
    self = true;
    st.updateWork(id, patch);
    self = false;
    if (rebuild) s.refresh(true); else fillHead();
  };

  function fillHead() {
    const w = st.getWork(id);
    if (!w || !headEl) return;
    const type = st.getType(w.type);
    s.title.replaceChildren(h('span', { class: 'codechip' }, w.code || 'Sin código'), ' ', ...whoDots(w.authors));
    const cover = st.coverOf(w);
    const states = type?.workStates || ['Idea'];
    const si = Math.max(0, states.indexOf(w.state));
    const warn = st.warningsFor(w);
    const conflicts = Object.entries(w.conflicts || {});
    const prog = st.completeness(w);
    setKids(headEl, 
      h('div', { class: 'fhero' },
        cover ? thumbImgNow(cover, () => openPhoto(cover.id, { onChange: () => s.refresh(true) })) : h('div', { class: 'muted', style: 'padding:24px' }, 'Sin foto todavía'),
        h('button', { class: 'btn small', onclick: () => pickPhotos() }, icon('camera'), cover ? 'Más fotos' : 'Añadir foto')),
      h('div', { class: 'staterow' },
        h('button', { class: 'statebtn', title: 'Pasar al siguiente paso', onclick: () => {
          const next = states[si + 1];
          if (!next) return pickState();
          const prev = w.state;
          save({ state: next });
          toast(`Estado: ${next}`, { action: 'Deshacer', onAction: () => save({ state: prev }) });
        } }, w.state || states[0], si < states.length - 1 ? icon('chevron') : null),
        h('div', { class: 'steps', title: states.join(' → '), onclick: pickState }, states.map((_, i) => h('i', { class: i <= si ? 'on' : '' }))),
        select(DESTS, w.dest || '', { class: 'chip', title: 'Destino', onchange: (e) => save({ dest: e.target.value }) })),
      w.imported ? h('div', { class: 'note-box' }, `Importada${w.origin ? ' de ' + w.origin : ''}: repasad los datos. `,
        h('button', { class: 'linkbtn', onclick: () => { save({ imported: false }); toast('Marcada como revisada'); } }, 'Ya está revisada')) : null,
      warn.map((t) => h('div', { class: 'note-box' }, t)),
      conflicts.map(([f, c]) => h('div', { class: 'note-box' },
        `«${st.WORK_LABELS[f]}» se cambió a la vez en dos aparatos. Se ve la versión más reciente; la otra${c.by && st.person(c.by) ? ' (de ' + st.person(c.by).name + ')' : ''} está guardada. `,
        h('button', { class: 'linkbtn', onclick: () => conflictSheet(f) }, 'Ver y elegir'))),
      D.showProgress ? h('div', { class: 'progress' }, `${prog.done} de ${prog.total} datos rellenos`) : null,
    );
  }

  function pickState() {
    const w = st.getWork(id);
    const states = st.getType(w.type)?.workStates || ['Idea'];
    const p = openSheet('Estado de la obra', () => states.map((x) => h('button', { class: 'btn block' + (x === w.state ? ' primary' : ''), onclick: () => { save({ state: x }); p.close(); } }, x)));
  }

  function conflictSheet(f) {
    const w = st.getWork(id);
    const c = w.conflicts?.[f];
    if (!c) return;
    const done = (keep) => { st.resolveConflict(id, f, keep); p.close(); s.refresh(true); };
    const p = openSheet(st.WORK_LABELS[f], () => [
      h('h3', {}, 'La que se ve ahora'), h('pre', { class: 'notes' }, w[f] || '(vacío)'),
      h('h3', {}, 'La otra versión'), h('pre', { class: 'notes' }, c.text || '(vacío)'),
      h('button', { class: 'btn block primary', onclick: () => done('mine') }, 'Quedarme con la que se ve'),
      h('button', { class: 'btn block', onclick: () => done('other') }, 'Usar la otra'),
      h('button', { class: 'btn block', onclick: () => done('both') }, 'Juntar las dos'),
    ]);
  }

  async function pickPhotos() {
    const files = await pickFiles('image/*', { multiple: true });
    if (!files.length) return;
    await addPhotos(files, { workId: id });
    s.refresh(true);
  }
  async function pickAttachments() {
    const files = await pickFiles('', { multiple: true });
    if (!files.length) return;
    await addAttachments(files, { workId: id });
    s.refresh(true);
  }

  function build(sheet) {
    const w = st.getWork(id);
    if (!w) return null;
    const type = st.getType(w.type);
    headEl = h('div');
    const ppl = st.people().map((p) => [p.id, p.name, p.color]);

    const name = inp({ value: w.name || '', placeholder: 'Nombre de la obra', 'aria-label': 'Nombre' });
    name.addEventListener('change', () => save({ name: name.value.trim() }));

    const date = inp({ value: w.date || '', placeholder: 'AAAA-MM-DD, AAAA-MM o AAAA', inputmode: 'numeric' });
    date.addEventListener('change', () => {
      const v = date.value.trim();
      if (v && !DATE_RE.test(v)) { toast('Fecha: escribe AAAA-MM-DD, AAAA-MM o solo AAAA'); date.value = w.date || ''; return; }
      save({ date: v });
    });
    const next = inp({ value: w.next || '', placeholder: 'Lo siguiente que hay que hacer' });
    next.addEventListener('change', () => save({ next: next.value.trim() }));
    const rev = w.review || { on: false, note: '' };
    const revNote = inp({ value: rev.note || '', placeholder: '¿Qué falta o qué hay que comprobar?' });
    revNote.addEventListener('change', () => save({ review: { on: true, note: revNote.value.trim() } }));
    const rights = w.rights || { ceded: false, date: '' };
    const rDate = inp({ type: 'date', value: rights.date || '' });
    rDate.addEventListener('change', () => save({ rights: { ceded: true, date: rDate.value } }));

    const general = section('general', 'General', null,
      field('Tipo', chips(st.types().map((t) => [t.id, `${t.icon || ''} ${t.short || t.name}`.trim()]), w.type || '', (v) => save({ type: v }, true), { allowNone: false })),
      ppl.length ? field('Autor', chips(ppl, w.authors || [], (v) => save({ authors: v }, true), { multi: true })) : null,
      ppl.length ? field('Encargado', chips(ppl, w.owners || [], (v) => save({ owners: v }), { multi: true }), 'Quién se ocupa de producirla y venderla') : null,
      field('¿La queremos vender?', chips(SELL, w.sell || '', (v) => save({ sell: v }))),
      field('Fecha de creación', date, 'Vale una fecha aproximada: solo el mes o solo el año'),
      field('Temática', tagsInput(w.themes, st.suggestions('themes'), (v) => save({ themes: v }), 'Añadir temática…')),
      field('Estilo', tagsInput(w.styles, st.suggestions('styles'), (v) => save({ styles: v }), 'Añadir estilo…')),
      field('Colección', suggestInput(w.collection, st.suggestions('collection'), (v) => save({ collection: v }), { placeholder: 'Opcional' })),
      field('Etiquetas', chips(st.S.settings.tags || [], w.tags || [], (v) => save({ tags: v }), { multi: true })),
      field('Próximo paso', next),
      toggle('Revisar', !!rev.on, 'Falta algo o hay que comprobarlo', (on) => save({ review: on ? { on: true, note: rev.note || '' } : null }, true)),
      rev.on ? field('', revNote) : null,
      st.needsRights(w) ? toggle('Derechos cedidos', !!rights.ceded, 'Cesión por escrito al titular de la tienda', (on) => save({ rights: on ? { ceded: true, date: rights.date || '' } : { ceded: false, date: '' } }, true)) : null,
      st.needsRights(w) && rights.ceded ? field('Fecha de la cesión', rDate) : null,
    );

    const tipo = type ? section('tipo', `Datos de ${type.name.toLowerCase()}`, null,
      st.shownFields(type.workFields, w.fields).map((def) => field(def.label + (def.hidden ? ' (retirado)' : ''), fieldCtl(def, w.fields?.[def.id], (v) => save({ fields: { [def.id]: v } }, type.letterBy?.field === def.id), 'wf', type.id)))) : null;

    const vs = st.variantsOf(id);
    const variantes = section('variantes', 'Variantes', vs.length ? String(vs.length) : 'lo que se vende',
      vs.map((v) => {
        const m = st.worstMargin(v);
        return h('button', { class: 'vcard', onclick: () => openVariant(v.id, () => s.refresh(true)) },
          h('div', { class: 'row-main' },
            h('div', { class: 'row-title' }, v.code, ' · ', v.supportName, v.label ? ' · ' + v.label : ''),
            h('div', { class: 'row-sub' }, [v.state, v.onDemand ? 'bajo demanda' : v.qty !== null && v.qty !== undefined ? `${v.qty} ud.` : '', st.scalOf(v) ? 'escalable: ' + st.scalOf(v).toLowerCase() : ''].filter(Boolean).join(' · '))),
          h('div', { class: 'price' }, st.fmtMoney(v.price), m ? h('div', { class: 'row-sub', style: 'text-align:right' }, `margen ${m.pct} %`) : null));
      }),
      h('button', { class: 'btn block', onclick: addVariant }, icon('plus'), 'Añadir variante'),
    );

    const photos = st.photosOf(id);
    const coverId = st.coverOf(w)?.id;
    const fotos = section('fotos', 'Fotos', photos.length ? String(photos.length) : null,
      h('div', { class: 'pgrid' },
        photos.map((f) => h('button', { class: 'pth', onclick: () => openPhoto(f.id, { onChange: () => s.refresh(true) }) },
          h('span', { class: 'ph' }, icon('image')), thumbImg(f),
          f.id === coverId ? h('span', { class: 'star', title: 'Foto principal' }, icon('star')) : null,
          !f.driveId ? h('span', { class: 'pend', title: 'Pendiente de subir a Drive' }, icon('cloud')) : null)),
        h('button', { class: 'pth add', onclick: pickPhotos }, icon('plus'), 'Fotos')),
      h('p', { class: 'hint' }, 'Se guardan reducidas. Los originales, en vuestro álbum de Google Fotos.'),
    );

    const atts = st.attachmentsOf(id);
    const archivos = section('archivos', 'Archivos', atts.length ? String(atts.length) : 'SVG, PNG de impresión, PDF…',
      atts.map((f) => h('button', { class: 'frow', onclick: () => openFile(f.id, { onChange: () => s.refresh(true) }) },
        h('span', { class: 'ficon' }, /^image\//.test(f.mime || '') ? [h('span', { class: 'ph' }, icon('file')), thumbImg(f)] : icon('file')),
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title' }, f.dname || f.orig),
          h('div', { class: 'row-sub' }, [f.role || 'archivo', fmtSize(f.size), f.driveId ? 'en Drive' : 'pendiente de subir'].join(' · '))),
        checkBadge(f, w),
        icon('chevron'))),
      h('button', { class: 'btn block', onclick: pickAttachments }, icon('plus'), 'Añadir archivo'),
      h('p', { class: 'hint' }, 'Se guardan tal cual, a tamaño completo. En el ordenador también puedes arrastrarlos aquí.'),
    );

    const area = (key, ph) => {
      const t = h('textarea', { class: 'inp', placeholder: ph || '' }, w[key] || '');
      t.addEventListener('change', () => save({ [key]: t.value.trim() }));
      return t;
    };
    const textos = section('textos', 'Descripciones', null,
      field('Interna', area('descInt', 'Historia de la pieza, proceso, qué aprendisteis…')),
      field('Para la venta (castellano)', area('descEs')),
      field('Para la venta (catalán)', area('descCa')));
    const notas = section('notas', 'Notas', null, area('notes'));
    const nAsks = st.askCount(id);
    const calle = section('calle', 'Calle', nAsks ? `${nAsks} pregunta${nAsks === 1 ? '' : 's'}` : 'quién pregunta por ella', streetSection(id, () => s.refresh(true)));

    const footer = h('div', { class: 'btn-row', style: 'margin:14px 0 6px' },
      h('button', { class: 'btn small', onclick: () => historySheet(id, () => s.refresh(true)) }, icon('history'), 'Historial'),
      h('button', { class: 'btn small', onclick: () => { const c = st.duplicateWork(id); if (c) { toast('Copia creada: ' + (c.code || '')); openWork(c.id); } } }, icon('copy'), 'Duplicar'),
      h('button', { class: 'btn small danger', onclick: async () => {
        if (!(await confirmSheet('¿Mover a la papelera?', 'La obra deja de verse, pero se puede recuperar desde Ajustes › Papelera. Sus archivos siguen en Drive.', { ok: 'Mover a la papelera', danger: true }))) return;
        st.trashWork(id);
        sheet.close();
        toast('En la papelera', { action: 'Deshacer', onAction: () => st.restoreWork(id) });
      } }, icon('trash'), 'Papelera'));

    setTimeout(fillHead, 0);
    return [headEl, h('div', { class: 'ftitle' }, name), general, tipo, variantes, fotos, archivos, calle, textos, notas, footer,
      w.origin ? h('p', { class: 'hint' }, 'Importada de: ' + w.origin) : null,
      h('p', { class: 'hint' }, `Creada el ${fmtDateTime(w.c)}${st.person(w.by) ? ' por ' + st.person(w.by).name : ''}`)];
  }

  function addVariant() {
    const w = st.getWork(id);
    const type = st.getType(w.type);
    const sups = (type?.supports || []).filter((x) => !x.hidden);
    const make = (code) => { const v = st.createVariant(id, code); p?.close(); s.refresh(true); if (v) openVariant(v.id, () => s.refresh(true)); };
    if (!sups.length) return make(null);
    const p = openSheet('¿Qué variante?', () => [
      h('p', { class: 'muted' }, 'Cada variante es una cosa que se puede vender. Viene con sus valores habituales ya puestos.'),
      sups.map((x) => h('button', { class: 'btn block', onclick: () => make(x.code) }, x.name, h('small', { class: 'muted', style: 'margin-left:8px' }, `${w.code || ''}-${x.code}`))),
    ]);
  }

  const s = openSheet('', build, { live: true, side: true, onClose: () => { cur = null; nav.rerender?.(); } });
  const redraw = s.refresh;
  s.refresh = (force = false) => {
    if (self) return;
    const w = st.getWork(id);
    if (!w || w.trashed) { s.close(); return; }
    const a = document.activeElement;
    if (!force && s.body.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) { stale = true; return; }
    stale = false;
    redraw();
  };
  s.body.addEventListener('focusout', () => setTimeout(() => { if (stale) s.refresh(); }, 80));

  // Arrastrar archivos desde el ordenador: JPG/HEIC/WEBP van a Fotos; el resto, a Archivos.
  const sheetEl = s.body.parentElement;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  sheetEl.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); sheetEl.classList.add('drop-on'); } });
  sheetEl.addEventListener('dragleave', (e) => { if (!sheetEl.contains(e.relatedTarget)) sheetEl.classList.remove('drop-on'); });
  sheetEl.addEventListener('drop', async (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    sheetEl.classList.remove('drop-on');
    const files = [...e.dataTransfer.files];
    const ph = files.filter(looksLikePhoto);
    const at = files.filter((f) => !looksLikePhoto(f));
    if (ph.length) await addPhotos(ph, { workId: id });
    if (at.length) await addAttachments(at, { workId: id });
    toast([ph.length ? `${ph.length} foto(s)` : '', at.length ? `${at.length} archivo(s)` : ''].filter(Boolean).join(' y ') + ' añadido(s)');
    s.refresh(true);
  });

  cur = { id, sheet: s };
  nav.rerender?.();
}

// Imagen de cabecera: carga enseguida (sin esperar a que entre en pantalla).
function thumbImgNow(file, onclick) {
  const img = h('img', { alt: '', onclick, style: 'cursor:zoom-in' });
  g.thumbURL(file).then((u) => { if (u) img.src = u; });
  return img;
}

// ── Variante ───────────────────────────────────────────────
export function openVariant(vid, onClose) {
  const first = st.getVariant(vid);
  if (!first) return;
  const upd = (patch, rebuild = false) => { st.updateVariant(vid, patch); if (rebuild) s.refresh(); else fillMargin(); };
  let marginEl = null;
  function fillMargin() {
    const v = st.getVariant(vid);
    if (!v || !marginEl) return;
    const ms = st.marginsOf(v);
    if (!ms.length) { setKids(marginEl, h('div', { class: 'mrg' }, 'Pon el precio y los costes para ver el margen.')); return; }
    const parts = (m) => [
      `precio sin IVA ${st.fmtMoney(m.net)}`,
      m.mat ? `material ${st.fmtMoney(m.mat)}` : '',
      m.labor ? `mano de obra ${st.fmtMoney(m.labor)}` : '',
      m.fee ? `comisión ${st.fmtMoney(m.fee)}` : '',
      m.ship ? `envío ${st.fmtMoney(m.ship)}` : '',
      m.reserve ? `reserva ${st.fmtMoney(m.reserve)}` : '',
    ].filter(Boolean).join(' − ');
    setKids(marginEl, 
      ms.map((m) => h('div', { class: 'mrg ' + m.level },
        h('b', {}, `${m.channel ? m.channel + ': ' : 'Margen: '}${st.fmtMoney(m.margin)} (${m.pct} %)`),
        h('div', {}, parts(m)))),
      ms[0].hoursIgnored ? h('p', { class: 'hint' }, 'Las horas no cuentan todavía: falta la tarifa por hora en Ajustes › Números.') : null,
      !ms[0].channel ? h('p', { class: 'hint' }, 'Sin comisiones ni envío: elige abajo dónde se vende para verlo por canal.') : null);
  }
  const s = openSheet('', (sh) => {
    const v = st.getVariant(vid);
    if (!v) return null;
    const w = st.getWork(v.workId);
    const type = st.getType(w?.type);
    sh.title.replaceChildren(h('span', { class: 'codechip' }, v.code), ' ', v.supportName);
    const text = (key, props = {}) => { const i = inp({ value: v[key] ?? '', ...props }); i.addEventListener('change', () => upd({ [key]: i.value.trim() })); return i; };
    const number = (key, unit) => { const i = numInput(v[key]); i.addEventListener('change', () => { const n = num(i.value); upd({ [key]: n === null || isNaN(n) ? null : n }); }); return h('div', { class: 'inline' }, i, unit ? h('span', { class: 'unit' }, unit) : null); };
    marginEl = h('div');
    setTimeout(fillMargin, 0);
    const warn = w ? st.warningsFor(w).filter((t) => t.startsWith(v.code + ':')) : [];
    const sups = (type?.supports || []).filter((x) => !x.hidden || x.code === v.support);
    return [
      warn.map((t) => h('div', { class: 'note-box' }, t)),
      sups.length ? field('Soporte', chips(sups.map((x) => [x.code, x.name]), v.support, (c) => upd({ support: c }, true), { allowNone: false })) : null,
      field('Variante', text('label', { placeholder: 'Color, tallas, tamaño… («blanca, S–XL»)' })),
      field('Estado', chips(VARIANT_STATES, v.state, (x) => upd({ state: x }, true), { allowNone: false })),
      h('h3', {}, 'Muestras', st.samplesOf(vid).length ? h('small', { class: 'muted', style: 'font-weight:400;margin-left:6px' }, String(st.samplesOf(vid).length)) : null),
      st.samplesOf(vid).map((x) => sampleRow(x, () => openSample(x.id, () => s.refresh()))),
      h('button', { class: 'btn block', style: 'margin:8px 0 14px', onclick: () => newSample(vid, () => s.refresh()) }, icon('plus'), 'Apuntar una muestra'),
      h('div', { class: 'grid2' },
        field(st.S.settings.priceWithVat ? 'Precio (con IVA)' : 'Precio (sin IVA)', number('price', '€')),
        field('IVA', select([[21, '21 %'], [10, '10 %'], [4, '4 %'], [0, '0 %']], v.vat, { onchange: (e) => upd({ vat: +e.target.value }) }), 'Propuesto según autor y soporte')),
      h('div', { class: 'grid2' },
        field('Coste de material', number('costMat', '€'), v.onDemand ? 'Lo que cobra el proveedor' : null),
        field('Mano de obra', number('hours', 'h'))),
      marginEl,
      toggle('Bajo demanda', !!v.onDemand, 'Sin stock: se produce al venderse', (on) => upd({ onDemand: on, qty: on ? null : v.qty }, true)),
      v.onDemand ? null : h('div', { class: 'grid2', style: 'margin-top:10px' },
        field('Cantidad', number('qty', 'ud.')),
        field(' ', h('button', { class: 'btn', disabled: !(+v.qty > 0), onclick: () => { st.sellOne(vid); s.refresh(); toast('Vendida una. Quedan ' + (st.getVariant(vid)?.qty ?? 0)); } }, 'Vendida una'))),
      v.onDemand ? null : field('Ubicación', suggestInput(v.location, st.suggestions('location'), (x) => upd({ location: x }), { placeholder: 'Taller, casa, en depósito en…' })),
      field('Material', suggestInput(v.material, st.suggestions('material', type?.id), (x) => upd({ material: x }))),
      field('Acabado', suggestInput(v.finish, st.suggestions('finish', type?.id), (x) => upd({ finish: x }))),
      field('Dónde se vende', chips(st.S.settings.channels || [], v.channels || [], (x) => upd({ channels: x }), { multi: true }), 'Las comisiones y el envío de cada canal se ponen en Ajustes › Números'),
      field('Método de producción', select(Object.entries(METHODS).map(([k, m]) => [k, m.name]), v.method, { onchange: (e) => upd({ method: e.target.value, scal: null }, true) })),
      field('Escalabilidad', select([['', `Automática: ${METHODS[v.method]?.scal || '—'}`], ...SCAL_LEVELS.map((x) => [x, x])], v.scal || '', { onchange: (e) => upd({ scal: e.target.value || null }) })),
      st.shownFields(type?.variantFields, v.fields).map((def) => field(def.label + (def.hidden ? ' (retirado)' : ''), fieldCtl(def, v.fields?.[def.id], (x) => upd({ fields: { [def.id]: x } }, !!(def.warnIfSelling || def.warnIfPublishing)), 'vf', type.id))),
      field('Enlace', text('url', { type: 'url', placeholder: 'Dirección de la publicación, si la hay' })),
      h('fieldset', {}, h('legend', {}, 'Ficha lista'),
        [['fotos', 'Fotos'], ['ficha', 'Ficha técnica'], ['gpsr', 'Datos GPSR']].map(([k, t]) => toggle(t, !!v.ready?.[k], null, (on) => upd({ ready: { ...(st.getVariant(vid).ready || {}), [k]: on } })))),
      h('div', { class: 'btn-row', style: 'margin-top:14px' },
        h('button', { class: 'btn small', onclick: () => { const c = st.duplicateVariant(vid); s.close(); if (c) openVariant(c.id, onClose); } }, icon('copy'), 'Duplicar'),
        h('button', { class: 'btn small danger', onclick: () => { const copy = st.deleteVariant(vid); s.close(); toast('Variante eliminada', { action: 'Deshacer', onAction: () => { st.restoreVariant(copy); onClose?.(); } }); } }, icon('trash'), 'Eliminar')),
    ];
  }, { live: true, onClose: () => onClose?.() });
}

// ── Historial de la ficha ──────────────────────────────────
function historySheet(workId, onChange) {
  const restore = (ch) => {
    const f = ch.f;
    if (f.startsWith('v.')) {
      const [, vid, ...rest] = f.split('.');
      if (!st.getVariant(vid)) return toast('Esa variante ya no existe');
      if (rest[0] === 'fields') st.updateVariant(vid, { fields: { [rest[1]]: ch.old } }); else st.updateVariant(vid, { [rest[0]]: ch.old });
    } else if (f.startsWith('fields.')) st.updateWork(workId, { fields: { [f.slice(7)]: ch.old } });
    else st.updateWork(workId, { [f]: ch.old });
    toast('Valor anterior recuperado');
    s.refresh();
    onChange?.();
  };
  const s = openSheet('Historial', () => {
    const log = st.logOf(workId);
    if (!log.length) return h('p', { class: 'muted' }, 'Todavía no hay cambios anotados.');
    return log.map((l) => h('div', { class: 'hist' },
      h('b', {}, fmtDateTime(l.at), st.person(l.by) ? ' · ' + st.person(l.by).name : ''),
      l.changes.map((ch) => h('div', { class: 'ch' },
        h('span', {}, ch.label + (ch.f.startsWith('_') ? (ch.val || ch.old ? ': ' + st.showValue(ch.val ?? ch.old) : '') : ':')),
        ch.f.startsWith('_') ? null : [
          st.showValue(ch.old) ? h('span', { class: 'old' }, cut(st.showValue(ch.old))) : null,
          h('span', {}, '→ ' + (cut(st.showValue(ch.val)) || '(vacío)')),
          h('button', { class: 'linkbtn', style: 'padding:0', onclick: () => restore(ch) }, 'Recuperar el anterior'),
        ]))));
  });
}
const cut = (t) => (t.length > 90 ? t.slice(0, 90) + '…' : t);

// Un archivo pendiente: ¿sigue guardado en este aparato?
export const hasPending = (f) => blobGet('p:' + f.id).then(Boolean);
