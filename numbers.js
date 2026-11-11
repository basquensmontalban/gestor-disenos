// Pestaña Números: todas las variantes con precio, costes, margen por canal y escalabilidad.
import * as st from './store.js';
import { METHODS } from './types.js';
import { openWork, openVariant } from './work.js';
import { h, icon, toast, download, nav } from './ui.js';

let sortKey = 'code';
let sortDir = 1;
let typeFilter = '';
let query = '';

const COLS = [
  ['code', 'Código'], ['name', 'Obra'], ['support', 'Variante'], ['state', 'Estado'], ['qty', 'Cant.'],
  ['price', 'Precio'], ['cost', 'Costes'], ['margin', 'Margen'], ['pct', '%'], ['scal', 'Escalabilidad'],
];
const SCAL_ORDER = { 'Muy alta': 0, Media: 1, Baja: 2, Ninguna: 3 };

function rows() {
  const out = [];
  for (const w of st.works()) {
    if (typeFilter && w.type !== typeFilter) continue;
    for (const v of st.variantsOf(w.id)) {
      const m = st.worstMargin(v);
      out.push({
        v, w, m,
        code: v.code, name: st.workTitle(w), support: [v.supportName, v.label].filter(Boolean).join(' · '), state: v.state,
        qty: v.onDemand ? Infinity : v.qty ?? -1, price: v.price ?? -1, cost: m ? m.cost : (+v.costMat || 0),
        margin: m ? m.margin : -1e9, pct: m ? m.pct : -1e9, scal: SCAL_ORDER[st.scalOf(v)] ?? 9,
      });
    }
  }
  const t = st.norm(query);
  const list = t ? out.filter((r) => st.norm(`${r.code} ${r.name} ${r.support} ${(r.v.channels || []).join(' ')}`).includes(t)) : out;
  return list.sort((a, b) => {
    const x = a[sortKey], y = b[sortKey];
    return (typeof x === 'string' ? x.localeCompare(y, 'es', { numeric: true }) : x - y) * sortDir || a.code.localeCompare(b.code, 'es', { numeric: true });
  });
}

const qtyText = (v) => (v.onDemand ? 'bajo demanda' : v.qty === null || v.qty === undefined ? '' : String(v.qty));

// CSV interno (con costes y márgenes): no es para subir a la tienda.
function exportCsv(list) {
  const n = (x) => (x === null || x === undefined || x === '' ? '' : String(st.round(x)).replace('.', ','));
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const head = ['Código', 'Obra', 'Tipo', 'Autor', 'Soporte', 'Variante', 'Estado', 'Cantidad', 'Precio', 'IVA %', 'Precio sin IVA', 'Material', 'Horas', 'Mano de obra', 'Canal', 'Comisión', 'Envío', 'Reserva', 'Margen', 'Margen %', 'Método', 'Escalabilidad', 'Material (texto)', 'Acabado', 'Ubicación'];
  const lines = [head.map(q).join(';')];
  for (const r of list) {
    const ms = st.marginsOf(r.v);
    for (const m of ms.length ? ms : [null]) {
      lines.push([
        q(r.v.code), q(r.name), q(st.getType(r.w.type)?.name || ''), q(st.personNames(r.w.authors)), q(r.v.supportName), q(r.v.label), q(r.v.state), q(qtyText(r.v)),
        n(r.v.price), n(r.v.vat), n(m?.net), n(r.v.costMat), n(r.v.hours), n(m?.labor), q(m?.channel || ''), n(m?.fee), n(m?.ship), n(m?.reserve), n(m?.margin), n(m?.pct),
        q(METHODS[r.v.method]?.name || ''), q(st.scalOf(r.v)), q(r.v.material), q(r.v.finish), q(r.v.location),
      ].join(';'));
    }
  }
  download(`numeros-${st.ymd()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  toast('CSV guardado. Lleva costes y márgenes: es para vosotros, no para la tienda.', { ms: 6000 });
}

export function renderNumbers(main) {
  const list = rows();
  const s = st.S.settings;
  const types = st.types().filter((t) => st.works().some((w) => w.type === t.id && st.variantsOf(w.id).length));
  const q = h('input', { type: 'search', placeholder: 'Buscar por código, obra o canal…', value: query, autocomplete: 'off' });
  q.addEventListener('input', () => { query = q.value; fill(); });
  const box = h('div');

  function fill() {
    const l = rows();
    if (!l.length) {
      box.replaceChildren(h('div', { class: 'empty' }, icon('table'), h('p', {}, st.works().length ? 'Ninguna variante coincide.' : 'Todavía no hay variantes.'),
        h('p', { class: 'muted' }, 'Las variantes se añaden desde la ficha de cada obra: son las cosas que se venden, con su precio y sus costes.')));
      return;
    }
    const th = ([k, t]) => h('th', { style: 'cursor:pointer', onclick: () => { if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = 1; } fill(); } }, t, sortKey === k ? (sortDir > 0 ? ' ▲' : ' ▼') : '');
    box.replaceChildren(h('div', { class: 'scrollx' }, h('table', { class: 'wt' },
      h('thead', {}, h('tr', {}, COLS.map(th))),
      h('tbody', {}, l.map((r) => {
        const ms = st.marginsOf(r.v);
        return h('tr', { onclick: () => { openWork(r.w.id); openVariant(r.v.id, () => nav.rerender()); } },
          h('td', {}, h('b', {}, r.v.code)),
          h('td', {}, r.name),
          h('td', {}, r.support),
          h('td', {}, r.v.state),
          h('td', {}, qtyText(r.v)),
          h('td', { style: 'text-align:right' }, st.fmtMoney(r.v.price)),
          h('td', { style: 'text-align:right' }, r.m ? st.fmtMoney(r.m.cost) : ''),
          h('td', {}, ms.map((m) => h('div', {}, h('span', { class: 'mdot ' + m.level }), st.fmtMoney(m.margin), m.channel ? h('small', { class: 'muted' }, ' ' + m.channel) : null))),
          h('td', { style: 'text-align:right' }, ms.map((m) => h('div', {}, m.pct + ' %'))),
          h('td', {}, st.scalOf(r.v)));
      })))));
  }

  main.replaceChildren(...[
    h('div', { class: 'bar' },
      h('div', { class: 'search' }, icon('search'), q),
      h('button', { class: 'icon-btn', title: 'Guardar como CSV', 'aria-label': 'Guardar como CSV', disabled: !list.length, onclick: () => exportCsv(rows()) }, icon('download'))),
    types.length > 1 ? h('div', { class: 'chips' },
      h('button', { class: 'chip' + (!typeFilter ? ' on' : ''), onclick: () => { typeFilter = ''; nav.rerender(); } }, 'Todos'),
      types.map((t) => h('button', { class: 'chip' + (typeFilter === t.id ? ' on' : ''), onclick: () => { typeFilter = t.id; nav.rerender(); } }, `${t.icon || ''} ${t.short || t.name}`.trim()))) : null,
    h('p', { class: 'muted', style: 'margin:10px 2px 0' },
      `Precios ${s.priceWithVat ? 'con' : 'sin'} IVA. Margen = precio sin IVA − material − horas × ${s.hourRate ? st.fmtMoney(s.hourRate) + '/h' : 'tarifa (sin poner)'} − comisión y envío del canal − ${st.fmtNum(s.reserve || 0)} % de reserva. `,
      h('button', { class: 'linkbtn', style: 'padding:0', onclick: () => nav.setTab('set') }, 'Cambiar en Ajustes')),
    box].filter(Boolean));
  fill();
}
