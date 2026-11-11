// Muestras: la prueba física de una variante. Ficha de una muestra y pestaña «Muestras» con todas.
import * as st from './store.js';
import { addPhotos, thumbImg, openPhoto } from './files.js';
import { pickWork } from './capture.js';
import { h, icon, badge, field, inp, numInput, num, toast, openSheet, confirmSheet, pickFiles, chips, suggestInput, download, nav } from './ui.js';

const SCORE = [1, 2, 3, 4, 5].map((n) => [n, String(n)]);
const FITS = [['pequena', 'Pequeña'], ['correcta', 'Correcta'], ['grande', 'Grande']];
const VS = [['mejor', 'Mejor'], ['igual', 'Igual'], ['peor', 'Peor']];
const DEC_CLS = { aprobada: 'ok', descartada: 'bad', repetir: 'warn' };
const fmtDay = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const isGarment = (x) => {
  const v = st.getVariant(x.variantId);
  const w = st.getWork(x.workId);
  return !!st.supportOf(st.getType(w?.type), v?.support)?.garment;
};

// Estado corto de una muestra para las listas.
export function sampleStatus(x) {
  if (x.decision) return badge(st.decisionName(x.decision), DEC_CLS[x.decision]);
  if (!x.received) return badge('Pendiente de llegar');
  return badge('Sin decidir', 'warn');
}
export function sampleRow(x, onOpen) {
  const v = st.getVariant(x.variantId);
  const w = st.getWork(x.workId);
  const ph = st.samplePhotos(x.id)[0];
  const days = st.deliveryDays(x);
  return h('button', { class: 'row', onclick: onOpen },
    ph ? h('span', { class: 'ficon' }, h('span', { class: 'ph' }, icon('image')), thumbImg(ph)) : h('span', { class: 'ficon' }, icon('shirt')),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title' }, [v?.code || w?.code, w ? st.workTitle(w) : '', [x.prod, x.color, x.size].filter(Boolean).join(' · ')].filter(Boolean).join(' · ')),
      h('div', { class: 'row-sub' }, [x.ordered ? 'pedida el ' + fmtDay(x.ordered) : '', x.supplier, days !== null ? `llegó en ${days} día${days === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · '))),
    h('div', { class: 'row-qty' }, sampleStatus(x), x.cost ? h('small', { style: 'display:block;margin-top:4px' }, st.fmtMoney(x.cost)) : null));
}

// Crea una muestra de una variante y abre su ficha. Si la variante está en borrador, propone «Muestra pedida».
export function newSample(variantId, onChange) {
  const v = st.getVariant(variantId);
  if (!v) return;
  const x = st.createSample(variantId);
  if (v.state === 'Borrador') toast('Muestra apuntada', { action: 'Marcar la variante «Muestra pedida»', ms: 8000, onAction: () => { st.updateVariant(variantId, { state: 'Muestra pedida' }); onChange?.(); } });
  openSample(x.id, onChange);
}

export function openSample(id, onChange) {
  const upd = (patch, redraw = false) => { st.updateSample(id, patch); if (redraw) s.refresh(); };
  const s = openSheet('Muestra', (sh) => {
    const x = st.getSample(id);
    if (!x) { setTimeout(() => s.close(), 0); return []; }
    const v = st.getVariant(x.variantId);
    const w = st.getWork(x.workId);
    sh.title.replaceChildren(h('span', { class: 'codechip' }, v?.code || w?.code || '—'), ' Muestra');
    const date = (key) => { const i = inp({ type: 'date', value: x[key] || '' }); i.addEventListener('change', () => upd({ [key]: i.value }, true)); return i; };
    const text = (key, props = {}) => { const i = inp({ value: x[key] || '', ...props }); i.addEventListener('change', () => upd({ [key]: i.value.trim() })); return i; };
    const cost = numInput(x.cost);
    cost.addEventListener('change', () => { const n = num(cost.value); upd({ cost: n === null || isNaN(n) ? null : n }); });
    const notes = h('textarea', { class: 'inp', placeholder: 'Cómo se ve, qué cambiaríais…' }, x.notes || '');
    notes.addEventListener('change', () => upd({ notes: notes.value.trim() }));
    const days = st.deliveryDays(x);
    const garment = isGarment(x);
    const photos = st.samplePhotos(id);
    const suppliers = [...new Set([...st.allSamples().map((y) => y.supplier), ...st.suggestions('vf:proveedor', w?.type)].filter(Boolean))];
    const prods = [...new Set([...st.suggestions('vf:produccion', w?.type), ...st.allSamples().map((y) => y.prod), 'Serigrafía (original)'].filter(Boolean))];
    const pick = async (capture) => {
      const files = await pickFiles('image/*', { multiple: !capture, capture });
      if (!files.length) return;
      await addPhotos(files, { workId: x.workId, sampleId: id });
      s.refresh();
    };
    return [
      w ? h('p', { class: 'muted', style: 'margin-top:0' }, `${st.workTitle(w)} · ${v ? v.supportName + (v.label ? ' · ' + v.label : '') : 'variante eliminada'}`) : null,
      h('div', { class: 'grid2' },
        field('Fecha de pedido', date('ordered')),
        field('Fecha de recepción', x.received ? date('received') : h('button', { class: 'btn', onclick: () => upd({ received: st.ymd() }, true) }, 'Ha llegado hoy'))),
      !x.received ? h('p', { class: 'hint', style: 'margin-top:-4px' }, 'Si llegó otro día, toca el botón y cambia la fecha.') : null,
      days !== null ? h('p', { class: 'muted', style: 'margin-top:-4px' }, `Tardó ${days} día${days === 1 ? '' : 's'} en llegar.`) : null,
      h('div', { class: 'grid2' },
        field('Proveedor', suggestInput(x.supplier, suppliers, (val) => upd({ supplier: val }))),
        field('Producción', suggestInput(x.prod, prods, (val) => upd({ prod: val }), { placeholder: 'DTG, DTFlex, gres…' }))),
      garment ? field('Prenda', text('garment', { placeholder: 'Marca y modelo' })) : null,
      h('div', { class: 'grid2' }, field('Color', text('color')), field(garment ? 'Talla' : 'Tamaño', text('size'))),
      field('Coste con envío', h('div', { class: 'inline' }, cost, h('span', { class: 'unit' }, '€'))),

      h('h3', {}, 'Cómo ha salido'),
      field(garment ? 'Impresión al recibir' : 'Resultado al recibir', chips(SCORE, x.print ?? '', (val) => upd({ print: val === '' ? null : val })), '1 = mal · 5 = perfecta'),
      garment ? [
        h('div', { class: 'grid2' },
          field('Tras 5 lavados', chips(SCORE, x.wash5 ?? '', (val) => upd({ wash5: val === '' ? null : val }))),
          field('Tras 10 lavados', chips(SCORE, x.wash10 ?? '', (val) => upd({ wash10: val === '' ? null : val })))),
        h('p', { class: 'hint', style: 'margin-top:-4px' }, 'Lavadas del revés a 30 °C. Haced una foto después del 1.º, el 5.º y el 10.º lavado.'),
        field('Tallaje', chips(FITS, x.fit || '', (val) => upd({ fit: val }))),
        field('Frente a la serigrafía original', chips(VS, x.vsRef || '', (val) => upd({ vsRef: val })), 'Al lado de una camiseta serigrafiada, con luz de día'),
      ] : null,

      h('h3', {}, 'Fotos'),
      h('div', { class: 'pgrid' },
        photos.map((f) => h('button', { class: 'pth', onclick: () => openPhoto(f.id, { onChange: () => s.refresh() }) }, h('span', { class: 'ph' }, icon('image')), thumbImg(f),
          !f.driveId ? h('span', { class: 'pend', title: 'Pendiente de subir a Drive' }, icon('cloud')) : null)),
        h('button', { class: 'pth add', onclick: () => pick(true) }, icon('camera'), 'Foto'),
        h('button', { class: 'pth add', onclick: () => pick(false) }, icon('images'), 'Galería')),

      field('Decisión', chips(st.DECISIONS, x.decision || '', (val) => {
        upd({ decision: val }, true);
        const cv = st.getVariant(x.variantId);
        if (val === 'aprobada' && cv && ['Borrador', 'Muestra pedida'].includes(cv.state)) {
          toast('Muestra aprobada', { action: 'Pasar la variante a «Aprobada»', ms: 9000, onAction: () => { st.updateVariant(cv.id, { state: 'Aprobada' }); onChange?.(); toast(`${cv.code}: aprobada`); } });
        }
      })),
      field('Notas', notes),
      h('div', { class: 'btn-row', style: 'margin-top:14px' },
        h('button', { class: 'btn small danger', onclick: async () => {
          if (!(await confirmSheet('¿Eliminar esta muestra?', 'Sus fotos van a la papelera.', { ok: 'Eliminar', danger: true }))) return;
          const copy = st.deleteSample(id);
          s.close();
          toast('Muestra eliminada', { action: 'Deshacer', onAction: () => { st.restoreSample(copy); onChange?.(); } });
        } }, icon('trash'), 'Eliminar muestra')),
    ];
  }, { live: true, onClose: () => onChange?.() });
}

// Muestra nueva desde la pestaña: elegir obra y, si tiene varias, la variante.
function sampleFromTab() {
  pickWork('¿De qué obra es la muestra?', (wid) => {
    const vs = st.variantsOf(wid);
    if (!vs.length) return toast('Esa obra todavía no tiene variantes. Añade una en su ficha (por ejemplo, Camiseta).', { ms: 7000 });
    if (vs.length === 1) return newSample(vs[0].id, () => nav.rerender());
    const p = openSheet('¿De qué variante?', () => vs.map((v) => h('button', { class: 'btn block', onclick: () => { p.close(); newSample(v.id, () => nav.rerender()); } }, `${v.code} · ${v.supportName}${v.label ? ' · ' + v.label : ''}`)));
  });
}

// ── Pestaña Muestras ───────────────────────────────────────
let filter = '';
const FILTERS = [['', 'Todas'], ['espera', 'Pendientes de llegar'], ['decidir', 'Sin decidir'], ['aprobada', 'Aprobadas'], ['descartada', 'Descartadas'], ['repetir', 'Repetir']];
const passes = (x) => !filter || (filter === 'espera' ? !x.received && !x.decision : filter === 'decidir' ? !!x.received && !x.decision : x.decision === filter);

export function samplesCsv() {
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const n = (x) => (x === null || x === undefined || x === '' ? '' : String(x).replace('.', ','));
  const name = (list, v) => list.find((o) => o[0] === v)?.[1] || '';
  const head = ['Fecha pedido', 'Proveedor', 'Código', 'Obra', 'Prenda', 'Producción', 'Color', 'Talla', 'Coste con envío', 'Fecha recibido', 'Días de entrega', 'Impresión al recibir (1-5)', 'Tras 5 lavados', 'Tras 10 lavados', 'Tallaje', 'Frente a la serigrafía', 'Decisión', 'Notas'];
  const lines = [head.map(q).join(';')];
  for (const x of st.allSamples()) {
    const v = st.getVariant(x.variantId);
    const w = st.getWork(x.workId);
    lines.push([q(x.ordered), q(x.supplier), q(v?.code || w?.code), q(w ? st.workTitle(w) : ''), q(x.garment), q(x.prod), q(x.color), q(x.size), n(x.cost), q(x.received), n(st.deliveryDays(x)), n(x.print), n(x.wash5), n(x.wash10), q(name(FITS, x.fit)), q(name(VS, x.vsRef)), q(st.decisionName(x.decision)), q(x.notes)].join(';'));
  }
  return '\ufeff' + lines.join('\r\n');
}
const exportCsv = () => download(`muestras-${st.ymd()}.csv`, samplesCsv(), 'text/csv;charset=utf-8');

export function renderSamples(main) {
  const all = st.allSamples();
  const list = all.filter(passes);
  const total = all.reduce((a, x) => a + (+x.cost || 0), 0);
  const shown = list.reduce((a, x) => a + (+x.cost || 0), 0);
  const count = (k) => all.filter((x) => { const f = filter; filter = k; const r = passes(x); filter = f; return r; }).length;
  main.replaceChildren(...[
    h('div', { class: 'bar' },
      h('button', { class: 'btn primary', style: 'flex:1', onclick: sampleFromTab }, icon('plus'), 'Nueva muestra'),
      h('button', { class: 'icon-btn', title: 'Guardar como CSV', 'aria-label': 'Guardar como CSV', disabled: !all.length, onclick: exportCsv }, icon('download'))),
    all.length ? h('div', { class: 'chips' }, FILTERS.map(([k, t]) => {
      const n = k ? count(k) : all.length;
      return k && !n && filter !== k ? null : h('button', { class: 'chip' + (filter === k ? ' on' : ''), onclick: () => { filter = k; nav.rerender(); } }, t, h('span', { class: 'n' }, String(n)));
    })) : null,
    all.length ? h('p', { class: 'muted', style: 'margin:10px 2px 0' },
      `${all.length} muestra${all.length === 1 ? '' : 's'} · gastado en total ${st.fmtMoney(total) || '0,00 €'}`,
      filter && list.length !== all.length ? ` · en esta lista ${st.fmtMoney(shown) || '0,00 €'}` : '') : null,
    !all.length
      ? h('div', { class: 'empty' }, icon('shirt'), h('p', {}, h('b', {}, 'Todavía no hay muestras.')),
        h('p', {}, 'Cada muestra es una prueba de una variante: la camiseta que pedís al proveedor, una placa de esmalte… Se apunta desde aquí o desde la variante, en la ficha de la obra.'))
      : !list.length ? h('div', { class: 'empty' }, h('p', {}, 'Ninguna muestra en esta lista.'))
        : h('div', { class: 'list' }, list.map((x) => sampleRow(x, () => openSample(x.id, () => nav.rerender())))),
  ].filter(Boolean));
}
