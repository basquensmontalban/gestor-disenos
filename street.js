// Registro de la calle: cada vez que alguien pregunta por una obra. Un toque guarda la fecha y quién lo apunta;
// los detalles (lugar, quién, reacción, precio) son opcionales y se pueden añadir después.
import * as st from './store.js';
import { pickWork } from './capture.js';
import { h, icon, field, numInput, num, toast, openSheet, chips, suggestInput, download, fmtDateTime, nav } from './ui.js';

const fmtDay = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const nameOf = (list, v) => list.find((o) => o[0] === v)?.[1] || '';
const times = (n) => (n === 1 ? '1 vez' : `${n} veces`);

export function askSummary(a) {
  return [nameOf(st.ASK_REACTIONS, a.reaction), a.place, nameOf(st.ASK_WHO, a.who), a.price ? st.fmtMoney(a.price) : ''].filter(Boolean).join(' · ');
}

// «＋1 Me han preguntado»: lo apunta al momento y deja abrir los detalles.
export function plusOne(workId, { onChange, openDetails = false } = {}) {
  const a = st.addAsk(workId);
  if (!a) return null;
  const w = st.getWork(workId);
  if (openDetails) openAsk(a.id, { fresh: true, onChange });
  else toast(`Apuntado: te han preguntado ${times(st.askCount(workId))} por «${st.workTitle(w)}»`, { action: 'Detalles', ms: 6000, onAction: () => openAsk(a.id, { fresh: true, onChange }) });
  onChange?.();
  return a;
}

// Acceso directo «Apuntar pregunta»: elegir la obra (con buscador y foto) y apuntar.
export function askFromShortcut() {
  pickWork('¿Por qué obra te han preguntado?', (wid) => plusOne(wid, { openDetails: true, onChange: () => nav.rerender?.() }), { photos: true, sort: (a, b) => st.askCount(b.id) - st.askCount(a.id) || (b.u || 0) - (a.u || 0) });
}

export function openAsk(id, { fresh = false, onChange } = {}) {
  const upd = (patch) => { st.updateAsk(id, patch); onChange?.(); };
  const s = openSheet(fresh ? 'Apuntado' : 'Pregunta', () => {
    const a = st.getAsk(id);
    if (!a) { setTimeout(() => s.close(), 0); return []; }
    const w = st.getWork(a.workId);
    const date = h('input', { class: 'inp', type: 'date', value: a.date || '' });
    date.addEventListener('change', () => upd({ date: date.value || st.ymd(new Date(a.at)) }));
    const price = numInput(a.price);
    price.addEventListener('change', () => { const n = num(price.value); upd({ price: n === null || isNaN(n) ? null : n }); });
    const notes = h('textarea', { class: 'inp', placeholder: 'Lo que dijo, si quería otra talla o color…' }, a.notes || '');
    notes.addEventListener('change', () => upd({ notes: notes.value.trim() }));
    const places = [...new Set(st.allAsks().map((x) => x.place).filter(Boolean))];
    return [
      h('p', { class: 'muted', style: 'margin-top:0' },
        fresh ? `Guardado: ${w ? w.code + ' · ' + st.workTitle(w) : ''}. Te han preguntado ${times(st.askCount(a.workId))}. Lo demás es opcional.`
          : `${w ? w.code + ' · ' + st.workTitle(w) : ''} · apuntado el ${fmtDateTime(a.at)}${st.person(a.by) ? ' por ' + st.person(a.by).name : ''}`),
      field('Reacción', chips(st.ASK_REACTIONS, a.reaction || '', (v) => upd({ reaction: v }))),
      field('Quién', chips(st.ASK_WHO, a.who || '', (v) => upd({ who: v }))),
      field('Lugar', suggestInput(a.place, places, (v) => upd({ place: v }), { placeholder: 'Metro, mercado, trabajo…' })),
      h('div', { class: 'grid2' },
        field('Precio que mencionó', h('div', { class: 'inline' }, price, h('span', { class: 'unit' }, '€'))),
        field('Fecha', date)),
      field('Notas', notes),
      h('button', { class: 'btn block primary', onclick: () => s.close() }, 'Listo'),
      h('button', { class: 'btn block danger', onclick: () => {
        const copy = st.deleteAsk(id);
        s.close();
        onChange?.();
        toast('Pregunta borrada', { action: 'Deshacer', onAction: () => { st.restoreAsk(copy); onChange?.(); } });
      } }, icon('trash'), 'Borrar esta pregunta'),
    ];
  }, { onClose: () => onChange?.() });
}

// Sección «Calle» dentro de la ficha de una obra.
export function streetSection(workId, refresh) {
  const list = st.asksOf(workId);
  const month = st.ymd().slice(0, 7);
  const inMonth = list.filter((a) => String(a.date || '').startsWith(month)).length;
  let all = false;
  const box = h('div');
  const draw = () => box.replaceChildren(...(all ? list : list.slice(0, 5)).map((a) => h('button', { class: 'frow', onclick: () => openAsk(a.id, { onChange: refresh }) },
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title' }, fmtDay(a.date), st.person(a.by) ? ' · ' + st.person(a.by).name : ''),
      h('div', { class: 'row-sub' }, askSummary(a) || 'Sin detalles')),
    icon('chevron'))));
  draw();
  return [
    h('button', { class: 'btn block primary', onclick: () => plusOne(workId, { onChange: refresh }) }, h('b', {}, '+1'), ' Me han preguntado'),
    list.length ? h('p', { class: 'muted' }, `Te han preguntado ${times(list.length)}${inMonth ? ` (${inMonth} este mes)` : ''}.`) : h('p', { class: 'hint' }, 'Cada vez que alguien pregunte por esta obra, un toque. Es la mejor prueba de que se vendería.'),
    box,
    list.length > 5 ? h('button', { class: 'linkbtn', onclick: (e) => { all = !all; draw(); e.target.textContent = all ? 'Ver menos' : `Ver las ${list.length}`; } }, `Ver las ${list.length}`) : null,
  ];
}

// CSV con todo el registro (como la pestaña «Registro calle» de la hoja).
export function asksCsv() {
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = [['Fecha', 'Código diseño', 'Obra', 'Lugar', 'Quién', 'Reacción', 'Precio que mencionó', 'Notas', 'Apuntado por'].map(q).join(';')];
  for (const a of st.allAsks()) {
    const w = st.getWork(a.workId);
    lines.push([q(a.date), q(w?.code), q(w ? st.workTitle(w) : ''), q(a.place), q(nameOf(st.ASK_WHO, a.who)), q(nameOf(st.ASK_REACTIONS, a.reaction)), q(a.price === null || a.price === undefined ? '' : String(a.price).replace('.', ',')), q(a.notes), q(st.person(a.by)?.name || '')].join(';'));
  }
  return '\ufeff' + lines.join('\r\n');
}
export const exportAsksCsv = () => download(`registro-calle-${st.ymd()}.csv`, asksCsv(), 'text/csv;charset=utf-8');
