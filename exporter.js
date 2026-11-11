// Exportaciones: copia completa fuera de Google (ZIP), catálogo legible (Google Docs o para imprimir)
// y CSV para la tienda propia (formato de importación de productos de Shopify).
import * as st from './store.js';
import * as g from './google.js';
import { D, setDevice } from './device.js';
import { wrap } from './backup.js';
import { ZipWriter } from './zip.js';
import { samplesCsv } from './samples.js';
import { asksCsv } from './street.js';
import { DESTS, SELL, METHODS } from './types.js';
import { fmtSize } from './media.js';
import { h, icon, field, inp, toggle, select, toast, openSheet, download, fmtDateTime, nav } from './ui.js';

const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
const nES = (x) => (x === null || x === undefined || x === '' ? '' : String(st.round(x)).replace('.', ','));
const nameOf = (list, v) => list.find((o) => o[0] === v)?.[1] || '';
const safe = (s) => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'sin-nombre';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const paras = (s) => String(s || '').split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
const DAY = 864e5;

// ── CSV de obras y variantes (con todo, para la copia) ─────
function worksCsv() {
  const head = ['Código', 'Nombre', 'Tipo', 'Autor', 'Encargado', 'Estado', 'Destino', '¿Vender?', 'Fecha de creación', 'Temática', 'Estilo', 'Colección', 'Etiquetas', 'Próximo paso', 'Revisar', 'Descripción interna', 'Descripción (castellano)', 'Descripción (catalán)', 'Notas', 'Preguntas en la calle', 'Campos del tipo'];
  const lines = [head.map(q).join(';')];
  for (const w of st.works()) {
    const type = st.getType(w.type);
    const fields = (type?.workFields || []).filter((f) => w.fields?.[f.id] !== undefined && w.fields?.[f.id] !== '').map((f) => `${f.label}: ${[].concat(w.fields[f.id]).join(', ')}`).join(' | ');
    lines.push([w.code, w.name, type?.name, st.personNames(w.authors), st.personNames(w.owners), w.state, nameOf(DESTS, w.dest), nameOf(SELL, w.sell), w.date, (w.themes || []).join(', '), (w.styles || []).join(', '), w.collection, (w.tags || []).join(', '), w.next, w.review?.on ? w.review.note || 'sí' : '', w.descInt, w.descEs, w.descCa, w.notes, st.askCount(w.id), fields].map(q).join(';'));
  }
  return '﻿' + lines.join('\r\n');
}
function variantsCsv() {
  const head = ['Código', 'Obra', 'Soporte', 'Variante', 'Estado', 'Cantidad', 'Precio', 'IVA %', 'Coste de material', 'Horas', 'Método', 'Escalabilidad', 'Material', 'Acabado', 'Ubicación', 'Canales', 'Enlace', 'Campos del tipo'];
  const lines = [head.map(q).join(';')];
  for (const w of st.works()) {
    const type = st.getType(w.type);
    for (const v of st.variantsOf(w.id)) {
      const fields = (type?.variantFields || []).filter((f) => v.fields?.[f.id] !== undefined && v.fields?.[f.id] !== '').map((f) => `${f.label}: ${[].concat(v.fields[f.id]).join(', ')}`).join(' | ');
      lines.push([q(v.code), q(st.workTitle(w)), q(v.supportName), q(v.label), q(v.state), q(v.onDemand ? 'bajo demanda' : v.qty ?? ''), nES(v.price), nES(v.vat), nES(v.costMat), nES(v.hours), q(METHODS[v.method]?.name), q(st.scalOf(v)), q(v.material), q(v.finish), q(v.location), q((v.channels || []).join(', ')), q(v.url), q(fields)].join(';'));
    }
  }
  return '﻿' + lines.join('\r\n');
}

// ── Exportación completa (ZIP) ─────────────────────────────
function folderOf(w) { return `Diseños/${safe(st.getType(w.type)?.name || 'Sin tipo')}/${safe([w.code, st.workTitle(w)].filter(Boolean).join(' '))}`; }
function filesFor({ printFiles }) {
  const out = [];
  for (const w of st.works()) {
    const all = [...st.photosOf(w.id), ...st.allSamples().filter((x) => x.workId === w.id).flatMap((x) => st.samplePhotos(x.id)), ...(printFiles ? st.attachmentsOf(w.id) : [])];
    for (const f of all) out.push({ f, path: `${folderOf(w)}/${safe(f.dname || f.orig || f.id)}` });
  }
  for (const e of st.inbox()) for (const f of st.inboxPhotos(e.id)) out.push({ f, path: `Diseños/_Por ordenar/${safe(f.dname || f.orig || f.id)}` });
  return out;
}

export const exportInfo = () => ({ last: +st.S.settings.lastExport || 0, by: st.S.settings.lastExportBy || '' });
// Recordatorio mensual: si hace más de 30 días (o nunca, cuando ya hay obras de hace una semana).
export function exportDue() {
  if (Date.now() < (+D.exportSnooze || 0)) return false;
  const { last } = exportInfo();
  if (last) return Date.now() - last > 30 * DAY;
  const oldest = Math.min(...st.works().map((w) => w.c || Date.now()));
  return st.works().length > 0 && Date.now() - oldest > 7 * DAY;
}
export const snoozeExport = (days = 7) => setDevice({ exportSnooze: Date.now() + days * DAY });

export function exportSheet() {
  let printFiles = false;
  let busy = null;   // { done, total, failed, cancel }
  const s = openSheet('Copia completa fuera de Google', () => {
    const list = filesFor({ printFiles });
    const bytes = list.reduce((a, x) => a + (+x.f.size || 0), 0);
    const { last, by } = exportInfo();
    if (busy) {
      return [
        h('p', {}, `Preparando… ${busy.done} de ${busy.total} archivos`),
        h('div', { class: 'progressbar' }, h('i', { style: `width:${busy.total ? Math.round((busy.done / busy.total) * 100) : 0}%` })),
        busy.failed.length ? h('p', { class: 'muted' }, `${busy.failed.length} no se han podido descargar (se apuntan en LEEME.txt).`) : null,
        h('p', { class: 'hint' }, 'No cierres la app mientras tanto. Las fotos que no están en este aparato se descargan de Drive.'),
        h('button', { class: 'btn block', onclick: () => { busy.cancel = true; } }, 'Cancelar'),
      ];
    }
    return [
      h('p', { class: 'muted' }, 'Un archivo ZIP con todos los datos (en JSON y en CSV, que se abren con cualquier hoja de cálculo) y las fotos, ordenadas en carpetas por obra. Guardadlo en un disco externo o en otra nube: si la cuenta de Google fallara, esta copia no depende de ella.'),
      last ? h('p', {}, `Última: ${fmtDateTime(last)}${by ? ' (' + by + ')' : ''}.`) : h('p', {}, 'Todavía no se ha hecho ninguna.'),
      toggle('Incluir los archivos de impresión y adjuntos', printFiles, 'PNG, TIFF, SVG, PDF, STL… Pueden pesar mucho', (on) => { printFiles = on; s.refresh(); }),
      h('p', { class: 'muted' }, `${list.length} archivos, unos ${fmtSize(bytes) || '0 KB'} en total.`),
      !navigator.onLine ? h('p', { class: 'note-box' }, 'Sin conexión: solo entrarán las fotos que estén guardadas en este aparato.') : null,
      h('button', { class: 'btn block primary', onclick: () => run(list) }, icon('download'), 'Preparar y descargar'),
      h('p', { class: 'hint' }, 'Conviene guardar las tres últimas y una por año.'),
    ];
  }, { onClose: () => { if (busy) busy.cancel = true; nav.rerender?.(); } });

  async function run(list) {
    busy = { done: 0, total: list.length, failed: [], cancel: false };
    s.refresh();
    try {
      const zip = new ZipWriter();
      const root = `gestor-disenos-${st.ymd()}`;
      await zip.add(`${root}/datos/gestor.json`, JSON.stringify(wrap(st.S, 'exportacion'), null, 1));
      await zip.add(`${root}/datos/obras.csv`, worksCsv());
      await zip.add(`${root}/datos/variantes.csv`, variantsCsv());
      await zip.add(`${root}/datos/muestras.csv`, samplesCsv());
      await zip.add(`${root}/datos/registro-calle.csv`, asksCsv());
      for (const t of st.types().filter((x) => st.S.types[x.id] && !st.S.types[x.id].del)) {
        const { packOf } = await import('./packs.js');
        await zip.add(`${root}/datos/tipos/${t.id}.json`, JSON.stringify(packOf(t), null, 1));
      }
      let last = 0;
      for (const { f, path } of list) {
        if (busy.cancel) { busy = null; s.refresh(); toast('Exportación cancelada'); return; }
        try {
          const b = await g.fileBlob(f);
          if (b) await zip.add(`${root}/${path}`, b, new Date(f.c || Date.now()));
          else busy.failed.push(path + ' (todavía no ha subido desde el otro aparato)');
        } catch (e) { busy.failed.push(`${path} (${e.message})`); }
        busy.done++;
        if (Date.now() - last > 250) { last = Date.now(); s.refresh(); }
      }
      const readme = [
        'Gestor de diseños · copia completa',
        `Hecha el ${fmtDateTime(Date.now())}${D.name ? ' desde ' + D.name : ''}.`,
        '',
        'datos/gestor.json      Todos los datos. Se recuperan en la app: Ajustes › Copias de seguridad › Recuperar desde un archivo.',
        'datos/obras.csv        Las obras, para abrir con una hoja de cálculo (separado por punto y coma).',
        'datos/variantes.csv    Las variantes, con precios y costes.',
        'datos/muestras.csv     Las muestras.',
        'datos/registro-calle.csv  Las preguntas de la calle.',
        'datos/tipos/           Los tipos importados o cambiados, como paquetes.',
        'Diseños/               Fotos (y, si se eligió, archivos de impresión), en una carpeta por obra.',
        '',
        printFiles ? 'Incluye los archivos de impresión y adjuntos.' : 'No incluye los archivos de impresión ni los adjuntos (siguen en Google Drive).',
        busy.failed.length ? ['', 'No se han podido incluir:', ...busy.failed.map((x) => '  · ' + x)].join('\n') : '',
      ].join('\r\n');
      await zip.add(`${root}/LEEME.txt`, '﻿' + readme);
      download(`${root}.zip`, zip.finish());
      st.putSettings({ lastExport: Date.now(), lastExportBy: D.name || '' });
      const failed = busy.failed.length;
      busy = null;
      s.close();
      toast(failed ? `ZIP descargado. ${failed} archivo(s) no han entrado: mira LEEME.txt.` : 'ZIP descargado. Guardadlo fuera de Google.', { ms: 7000 });
    } catch (e) {
      busy = null;
      s.refresh();
      toast('No se ha podido hacer: ' + e.message, { ms: 7000 });
    }
  }
}

// ── Catálogo legible ───────────────────────────────────────
async function dataUrl(f) {
  try {
    const u = await g.thumbURL(f);
    if (!u) return null;
    const b = await (await fetch(u)).blob();
    return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(b); });
  } catch { return null; }
}
function pickWorks({ scope, typeId }) {
  return st.works().filter((w) => (!typeId || w.type === typeId)
    && (scope === 'all' || (scope === 'sell' ? w.sell === 'si' : st.variantsOf(w.id).some((v) => v.state === 'Publicada'))))
    .sort((a, b) => String(a.code || 'ZZZ').localeCompare(String(b.code || 'ZZZ'), 'es', { numeric: true }));
}
export async function catalogHtml({ scope = 'all', typeId = '', prices = true, costs = false, forDocs = false } = {}) {
  const list = pickWorks({ scope, typeId });
  const s = st.S.settings;
  const parts = [];
  for (const w of list) {
    const type = st.getType(w.type);
    const cover = st.coverOf(w);
    const img = cover ? await dataUrl(cover) : null;
    const facts = [
      ['Tipo', type?.name], ['Autor', st.personNames(w.authors)], ['Estado', w.state], ['Destino', nameOf(DESTS, w.dest)],
      ['Fecha', w.date], ['Temática', (w.themes || []).join(', ')], ['Estilo', (w.styles || []).join(', ')], ['Colección', w.collection],
      ...st.shownFields(type?.workFields, w.fields).filter((f) => !f.hidden && w.fields?.[f.id] !== undefined && w.fields?.[f.id] !== '')
        .map((f) => [f.label, [].concat(w.fields[f.id]).map((x) => (x === 'si' ? 'sí' : x === 'unknown' ? 'sin comprobar' : x)).join(', ')]),
    ].filter(([, v]) => v);
    const vs = st.variantsOf(w.id);
    const vrows = vs.map((v) => {
      const m = costs ? st.worstMargin(v) : null;
      return `<tr><td><b>${esc(v.code)}</b></td><td>${esc([v.supportName, v.label].filter(Boolean).join(' · '))}</td><td>${esc(v.state)}</td><td>${esc(v.onDemand ? 'bajo demanda' : v.qty ?? '')}</td>${prices ? `<td style="text-align:right">${esc(st.fmtMoney(v.price))}</td>` : ''}${costs ? `<td style="text-align:right">${esc(m ? st.fmtMoney(m.cost) : '')}</td><td style="text-align:right">${esc(m ? `${st.fmtMoney(m.margin)} (${m.pct} %)` : '')}</td>` : ''}</tr>`;
    }).join('');
    const vhead = `<tr><th>Código</th><th>Variante</th><th>Estado</th><th>Cantidad</th>${prices ? `<th>Precio${s.priceWithVat ? ' (con IVA)' : ' (sin IVA)'}</th>` : ''}${costs ? '<th>Costes</th><th>Margen</th>' : ''}</tr>`;
    const imgTag = img ? `<img src="${img}" alt="" width="${forDocs ? 180 : 220}" style="max-width:${forDocs ? 180 : 220}px;height:auto">` : '';
    const factsHtml = facts.map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v)}`).join('<br>');
    parts.push(`<div class="obra">
<h2>${esc(w.code || '')} · ${esc(st.workTitle(w))}</h2>
<table class="lay"><tr>${img ? `<td class="ph" width="${forDocs ? 190 : 230}">${imgTag}</td>` : ''}<td>${factsHtml}</td></tr></table>
${w.descEs ? paras(w.descEs) : ''}${w.descCa ? `<p><i>Català:</i></p>${paras(w.descCa)}` : ''}
${vs.length ? `<table class="vt">${vhead}${vrows}</table>` : ''}
</div>`);
  }
  const title = `Catálogo del Taller · ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  const sub = [scope === 'sell' ? 'Obras que queremos vender' : scope === 'pub' ? 'Obras con variantes publicadas' : 'Todas las obras', typeId ? st.getType(typeId)?.name : '', `${list.length} obra${list.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
  return { count: list.length, title, html: `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:Georgia,'Times New Roman',serif;color:#23201b;max-width:820px;margin:24px auto;padding:0 16px;line-height:1.45}
h1{font-size:26px;margin:0}.sub{color:#6b6459;margin:4px 0 24px}h2{font-size:19px;margin:0 0 8px}
.obra{border-top:1px solid #d9d2c5;padding:18px 0;page-break-inside:avoid;break-inside:avoid}
table.lay{border-collapse:collapse;width:100%}table.lay td{vertical-align:top;padding:0 14px 0 0}
table.vt{border-collapse:collapse;width:100%;margin-top:10px;font-size:13px}table.vt th,table.vt td{border:1px solid #d9d2c5;padding:4px 7px;text-align:left}
table.vt th{background:#f1ece2}@media print{body{margin:0}}</style></head><body>
<h1>${esc(title)}</h1><p class="sub">${esc(sub)}</p>${parts.join('\n') || '<p>No hay obras con estos filtros.</p>'}</body></html>` };
}

export function catalogSheet() {
  const o = { scope: 'all', typeId: '', prices: true, costs: false };
  let busy = false;
  const s = openSheet('Catálogo', () => {
    const n = pickWorks(o).length;
    return [
      h('p', { class: 'muted' }, 'Un documento con la foto, los datos y las variantes de cada obra. Para repasarlo con calma, imprimirlo o enseñarlo.'),
      field('Qué obras', select([['all', 'Todas'], ['sell', 'Solo las que queremos vender'], ['pub', 'Solo las que tienen variantes publicadas']], o.scope, { onchange: (e) => { o.scope = e.target.value; s.refresh(); } })),
      field('Tipo', select([['', 'Todos'], ...st.types().map((t) => [t.id, t.name])], o.typeId, { onchange: (e) => { o.typeId = e.target.value; s.refresh(); } })),
      toggle('Con precios', o.prices, null, (on) => { o.prices = on; }),
      toggle('Con costes y márgenes', o.costs, 'Solo para vosotros: no lo enseñéis fuera', (on) => { o.costs = on; }),
      h('p', { class: 'muted' }, `${n} obra${n === 1 ? '' : 's'}.`),
      h('button', { class: 'btn block primary', disabled: busy || !n || !g.token() || !navigator.onLine, onclick: async () => {
        busy = true; s.refresh();
        try {
          const { html, title } = await catalogHtml({ ...o, forDocs: true });
          const folder = await g.findOrCreateFolder('Catálogos', await g.ensureFolder());
          const f = await g.multipartCreate({ name: title, parents: [folder], mimeType: 'application/vnd.google-apps.document' }, new Blob([html], { type: 'text/html' }), 'id,webViewLink');
          busy = false; s.close();
          toast('Catálogo creado en Drive › Tienda › Catálogos', { action: 'Abrir', ms: 9000, onAction: () => open(f.webViewLink || `https://docs.google.com/document/d/${f.id}/edit`, '_blank') });
        } catch (e) { busy = false; s.refresh(); toast('No se ha podido crear: ' + e.message, { ms: 7000 }); }
      } }, busy ? 'Creando…' : 'Crear en Google Docs'),
      !g.token() || !navigator.onLine ? h('p', { class: 'hint' }, 'Para crearlo en Google Docs hace falta conexión y estar conectado con Google.') : null,
      h('button', { class: 'btn block', disabled: busy || !n, onclick: async () => {
        busy = true; s.refresh();
        const { html } = await catalogHtml(o);
        busy = false; s.refresh();
        download(`catalogo-${st.ymd()}.html`, html, 'text/html;charset=utf-8');
        toast('Ábrelo en el navegador para verlo o imprimirlo (también como PDF).', { ms: 7000 });
      } }, icon('download'), 'Descargar para imprimir'),
    ];
  });
}

// ── CSV para la tienda propia (Shopify) ────────────────────
// Solo originales y piezas con existencias propias: los productos de Printful o LaTostadora se crean en sus webs.
// Nunca lleva costes ni márgenes. Los productos entran como borrador para revisarlos en Shopify.
export const SHOP_HEAD = ['Title', 'URL handle', 'Description', 'Vendor', 'Product category', 'Type', 'Tags', 'Published on online store', 'Status', 'SKU', 'Option1 name', 'Option1 value', 'Price', 'Charge tax', 'Inventory tracker', 'Inventory quantity', 'Weight value (grams)', 'Weight unit for display', 'Requires shipping', 'Fulfillment service', 'Product image URL', 'Image alt text', 'Gift card'];
export function shopRows({ onlySell = true, onDemand = false } = {}) {
  const rows = [];
  for (const w of st.works()) {
    if (onlySell && w.sell !== 'si') continue;
    if (w.dest && w.dest !== '') continue;            // vendida, regalada, nuestra o descartada: no se pone a la venta
    const type = st.getType(w.type);
    for (const v of st.variantsOf(w.id)) {
      if (v.onDemand && !onDemand) continue;
      if (['Retirada', 'Pausada'].includes(v.state)) continue;
      if (v.price === null || v.price === undefined || v.price === '') continue;
      const gross = st.S.settings.priceWithVat ? +v.price : +v.price * (1 + (+v.vat || 0) / 100);
      const one = st.variantsOf(w.id).length === 1;
      const title = one || v.support === 'ORI' ? st.workTitle(w) : `${st.workTitle(w)} · ${v.supportName}${v.label ? ' ' + v.label : ''}`;
      const grams = +v.fields?.peso > 0 ? Math.round(+v.fields.peso) : null;
      const desc = [w.descEs, v.label && !one ? v.label : '', v.material ? 'Material: ' + v.material : '', v.finish ? 'Acabado: ' + v.finish : '', v.fields?.medidas ? 'Medidas: ' + v.fields.medidas : ''].filter(Boolean).join('\n\n');
      rows.push({
        Title: title, 'URL handle': g.slug(`${v.code} ${title}`), Description: paras(desc), Vendor: st.S.settings.brand || '', 'Product category': '', Type: type?.name || '',
        Tags: [...(w.themes || []), ...(w.styles || []), w.collection].filter(Boolean).join(', '), 'Published on online store': 'FALSE', Status: 'draft',
        SKU: v.code, 'Option1 name': 'Title', 'Option1 value': 'Default Title', Price: gross.toFixed(2), 'Charge tax': 'TRUE',
        'Inventory tracker': v.onDemand ? '' : 'shopify', 'Inventory quantity': v.onDemand ? '' : String(+v.qty || 0),
        'Weight value (grams)': grams ? String(grams) : '', 'Weight unit for display': grams ? 'g' : '', 'Requires shipping': 'TRUE', 'Fulfillment service': 'manual',
        'Product image URL': '', 'Image alt text': st.workTitle(w), 'Gift card': 'FALSE',
      });
    }
  }
  return rows;
}
export function shopCsv(opts) {
  const c = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  return [SHOP_HEAD.map(c).join(','), ...shopRows(opts).map((r) => SHOP_HEAD.map((k) => c(r[k])).join(','))].join('\r\n');
}
export function shopSheet() {
  const o = { onlySell: true, onDemand: false };
  const brand = inp({ value: st.S.settings.brand || '', placeholder: 'El nombre de la marca' });
  brand.addEventListener('change', () => st.putSettings({ brand: brand.value.trim() }));
  const s = openSheet('CSV para la tienda', () => {
    const n = shopRows(o).length;
    return [
      h('p', { class: 'muted' }, 'Para crear de golpe en Shopify los originales y las piezas hechas a mano (Productos › Importar). Los productos de Printful y de LaTostadora no se crean así: se crean desde sus propias webs.'),
      field('Marca (aparece como «Vendor»)', brand),
      toggle('Solo las obras que queremos vender', o.onlySell, null, (on) => { o.onlySell = on; s.refresh(); }),
      toggle('Incluir también lo bajo demanda', o.onDemand, 'Normalmente no: lo crea la integración del proveedor', (on) => { o.onDemand = on; s.refresh(); }),
      h('p', { class: 'muted' }, `${n} producto${n === 1 ? '' : 's'}. Entran como borrador, con el precio con IVA y la descripción en castellano. Sin costes ni márgenes. Sin fotos: se añaden en Shopify.`),
      h('p', { class: 'hint' }, 'Se quedan fuera las obras con destino (vendida, regalada…), las variantes pausadas o retiradas y las que no tienen precio.'),
      h('button', { class: 'btn block primary', disabled: !n, onclick: () => { download(`tienda-shopify-${st.ymd()}.csv`, shopCsv(o), 'text/csv;charset=utf-8'); s.close(); } }, icon('download'), 'Descargar el CSV'),
    ];
  });
}
