// Fotos y archivos adjuntos: añadir, ver, abrir.
import * as st from './store.js';
import * as g from './google.js';
import { blobSet, blobGet } from './db.js';
import { preparePhoto, makeThumb, keepsAlpha, fmtSize } from './media.js';
import { cfg, kindOf, measure, evaluate } from './checks.js';
import { guessRole, PHOTO_TAGS } from './types.js';
import { h, icon, badge, field, toast, download, select, setKids, openSheet } from './ui.js';

const MIME = { svg: 'image/svg+xml', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', tif: 'image/tiff', tiff: 'image/tiff', stl: 'model/stl', webp: 'image/webp' };
const extOf = (name) => String(name || '').split('.').pop().toLowerCase();
// Lo que se suelta o se elige sin más: JPG, HEIC y WEBP son fotos; el resto (PNG, SVG, PDF, TIFF, STL…) son archivos.
export const looksLikePhoto = (file) => /^(jpe?g|hei[cf]|webp)$/.test(extOf(file.name)) || /^image\/(jpeg|hei[cf]|webp)$/.test(file.type || '');

// Fotos: se reducen, se convierten a JPG y se guardan en el aparato hasta que suben a Drive.
export async function addPhotos(files, { workId = null, inboxId = null, sampleId = null } = {}) {
  let ok = 0;
  for (const file of files) {
    try {
      const p = await preparePhoto(file);
      const id = st.uid();
      await blobSet('t:' + id, p.thumb);
      await blobSet('p:' + id, p.full);
      st.addFile({ id, kind: 'photo', workId, inboxId, sampleId, orig: file.name || 'foto.jpg', mime: 'image/jpeg', size: p.full.size, w: p.w, h: p.h, tag: '' });
      ok++;
    } catch (e) {
      console.warn('foto', e);
      toast(/hei[cf]/i.test(file.name + file.type)
        ? 'No se ha podido convertir la foto HEIC. En el iPhone: Ajustes › Cámara › Formatos › «Máxima compatibilidad».'
        : `No se ha podido leer «${file.name}» como foto.`, { ms: 8000 });
    }
  }
  return ok;
}

// Adjuntos: se guardan tal cual, a tamaño completo. Si es un archivo de impresión o un escaneo, se comprueba al subirlo.
export async function addAttachments(files, { workId, variantId = null } = {}) {
  const type = st.getType(st.getWork(workId)?.type);
  for (const file of files) {
    const id = st.uid();
    const mime = file.type || MIME[extOf(file.name)] || 'application/octet-stream';
    const rec = { id, kind: 'file', workId, variantId, role: guessRole(file.name, type), orig: file.name, mime, size: file.size };
    await blobSet('p:' + id, file);
    const wantCheck = cfg().mode === 'always' && !!kindOf(rec, type);
    let thumb = null;
    if (/^tiff?$/.test(extOf(file.name))) {
      // El navegador no sabe abrir TIFF: se lee con el lector propio (también sirve para la miniatura).
      try {
        const r = await measure(file, file.name);
        if (r.canvas) thumb = await makeThumb(null, { alpha: true, src: r.canvas });
        if (wantCheck) rec.meas = r.meas;
      } catch (e) { console.warn('tiff', e); }
    } else if (/^image\//.test(mime)) {
      thumb = await makeThumb(file, { alpha: keepsAlpha(mime, file.name) });
      if (wantCheck) { try { rec.meas = (await measure(file, file.name)).meas; } catch (e) { console.warn('comprobación', e); } }
    }
    if (thumb) await blobSet('t:' + id, thumb);
    st.addFile(rec);
  }
}

// Mide un archivo ya guardado (el pendiente de subir o, si no, el de Drive) y guarda sus medidas.
export async function runCheck(id) {
  const f = st.getFile(id);
  if (!f) return null;
  const blob = await g.fileBlob(f);
  if (!blob) throw new Error('Este archivo todavía no ha subido desde el otro aparato.');
  const { meas, canvas } = await measure(blob, f.orig);
  if (canvas && !(await blobGet('t:' + id))) {
    const t = await makeThumb(null, { alpha: true, src: canvas });
    if (t) await blobSet('t:' + id, t);
  }
  st.updateFile(id, { meas });
  return meas;
}

// Carga la miniatura cuando la tarjeta entra en pantalla.
const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    io.unobserve(e.target);
    e.target._load?.();
  }
}, { rootMargin: '300px' }) : null;
export function thumbImg(file, cls = '') {
  // Si la miniatura ya está cargada, se pinta al momento (sin parpadeo al redibujar la galería).
  const dropPh = (img) => img.previousElementSibling?.classList.contains('ph') && img.previousElementSibling.remove();
  const ready = g.thumbCached(file.id);
  if (ready) {
    const img = h('img', { class: cls, alt: '', src: ready });
    queueMicrotask(() => dropPh(img));
    return img;
  }
  // Sin «hidden»: un elemento oculto nunca «entra en pantalla» y no llegaría a cargarse.
  const img = h('img', { class: cls, alt: '' });
  img._load = () => g.thumbURL(file).then((url) => { if (url) { img.src = url; dropPh(img); } });
  if (io) io.observe(img); else img._load();
  return img;
}

// Visor de una foto a pantalla completa.
export function openPhoto(fileId, { onChange } = {}) {
  const f = st.getFile(fileId);
  if (!f) return;
  const w = st.getWork(f.workId);
  const img = h('img', { alt: '' });
  g.thumbURL(f).then((u) => { if (u && !img.src) img.src = u; });
  g.fileBlob(f).then((b) => { if (b) img.src = URL.createObjectURL(b); }).catch(() => {});
  const close = () => { v.remove(); removeEventListener('keydown', onKey); onChange?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', onKey);
  const bar = h('div', { class: 'vbar' });
  const fill = () => setKids(bar, 
    w && !(f.sampleId && st.getSample(f.sampleId)) ? h('button', { class: 'btn small', disabled: w.cover === f.id || (!w.cover && st.coverOf(w)?.id === f.id), onclick: () => { st.updateWork(w.id, { cover: f.id }); toast('Foto principal cambiada'); fill(); } }, icon('star'), 'Principal') : null,
    select(PHOTO_TAGS, f.tag || '', { class: 'btn small', style: 'width:auto', onchange: (e) => st.updateFile(f.id, { tag: e.target.value }) }),
    h('button', { class: 'btn small danger', onclick: () => { st.trashFile(f.id); close(); toast('Foto eliminada', { action: 'Deshacer', onAction: () => { st.restoreFile(f.id); onChange?.(); } }); } }, icon('trash'), 'Eliminar'),
  );
  fill();
  const v = h('div', { class: 'viewer' },
    h('div', { class: 'vtop' }, h('span', {}, f.dname || f.orig || ''), h('button', { class: 'icon-btn light', 'aria-label': 'Cerrar', onclick: close }, icon('x'))),
    img, bar);
  document.body.append(v);
}

// Abre un adjunto: lo pendiente de subir o lo descargado de Drive.
export async function openAttachment(f) {
  try {
    const blob = await g.fileBlob(f);
    if (!blob) return toast('Este archivo todavía no ha subido desde el otro aparato.');
    const name = f.dname || f.orig || 'archivo';
    if (/^(image\/|application\/pdf)/.test(f.mime || '')) {
      const a = h('a', { href: URL.createObjectURL(new Blob([blob], { type: f.mime })), target: '_blank', rel: 'noopener' });
      document.body.append(a);
      a.click();
      a.remove();
    } else download(name, blob);
  } catch (e) {
    toast(navigator.onLine ? 'No se ha podido abrir: ' + e.message : 'Sin conexión: este archivo está en Drive.');
  }
}

// ── Ficha de un archivo adjunto: vista previa sobre claro y oscuro, rol, comprobaciones ──
const GARMENTS = [['#111111', 'Negro'], ['#1f2a44', 'Marino'], ['#5a1f2b', 'Burdeos'], ['#1f3d2b', 'Verde'], ['#8a8a8a', 'Gris']];
const MARK = { ok: ['✓', 'ok'], warn: ['!', 'warn'], info: ['·', ''] };
export function checkBadge(f, w) {
  const ev = evaluate(f, w);
  if (!ev) return null;
  return badge(ev.label, ev.status === 'ok' ? 'ok' : ev.status === 'warn' ? 'warn' : '');
}

export function openFile(id, { onChange } = {}) {
  let dark = GARMENTS[0][0];
  let busy = false;
  const check = async () => {
    busy = true; s.refresh();
    try { await runCheck(id); } catch (e) { toast(navigator.onLine ? 'No se ha podido comprobar: ' + e.message : 'Sin conexión: el archivo está en Drive.'); }
    busy = false; s.refresh();
  };
  const s = openSheet('Archivo', (sh) => {
    const f = st.getFile(id);
    if (!f || f.trashed) { setTimeout(() => s.close(), 0); return []; }
    const w = st.getWork(f.workId);
    const type = st.getType(w?.type);
    const c = cfg();
    const ev = evaluate(f, w);
    const m = f.meas;
    sh.title.textContent = f.dname || f.orig || 'Archivo';
    const isImg = /^image\//.test(f.mime || '');
    const tile = (color, label) => {
      const img = h('img', { alt: '' });
      g.thumbURL(f).then((u) => { if (u) img.src = u; });
      return h('div', { class: 'pv', style: `background:${color}` }, img, label ? h('span', { class: 'pvl' }, label) : null);
    };
    const two = isImg && c.previews && keepsAlpha(f.mime, f.orig);
    const roles = [...new Set([...(type?.fileRoles || []), 'archivo', f.role || 'archivo'])];
    const vars = w ? st.variantsOf(w.id) : [];
    const upd = (patch) => {
      st.updateFile(id, patch);
      // Si ahora le toca comprobación y el archivo sigue en este aparato, se comprueba solo.
      const nf = st.getFile(id);
      if (c.mode === 'always' && !nf.meas && kindOf(nf, type)) blobGet('p:' + id).then((b) => { if (b) check(); });
      s.refresh();
    };
    return [
      isImg ? (two
        ? [h('div', { class: 'pvs' }, tile('#ffffff', 'Sobre claro'), tile(dark, 'Sobre oscuro')),
          h('div', { class: 'swatches', style: 'margin:8px 0 12px' }, GARMENTS.map(([col, name]) => h('button', { class: 'swatch' + (dark === col ? ' on' : ''), style: `background:${col}`, title: name, 'aria-label': name, onclick: () => { dark = col; s.refresh(); } })))]
        : h('div', { class: 'pvs one' }, tile('var(--line)'))) : null,
      h('p', { class: 'muted' }, [fmtSize(f.size), m?.w ? `${m.w.toLocaleString('es-ES')} × ${m.h.toLocaleString('es-ES')} px` : '', m?.ppp ? `${m.ppp} ppp` : '', f.driveId ? 'en Drive' : 'pendiente de subir'].filter(Boolean).join(' · ')),
      h('div', { class: vars.length ? 'grid2' : '' },
        field('Qué es', select(roles.map((r) => [r, r]), f.role || 'archivo', { onchange: (e) => upd({ role: e.target.value }) })),
        vars.length ? field('Es para', select([['', 'Toda la obra'], ...vars.map((v) => [v.id, `${v.code} · ${v.supportName}`])], f.variantId || '', { onchange: (e) => upd({ variantId: e.target.value || null }) })) : null),
      ev ? h('div', { class: 'card', style: 'padding-top:10px' },
        ev.status === 'pending'
          ? h('p', { class: 'muted' }, busy ? 'Comprobando…' : 'Sin comprobar todavía.')
          : ev.items.map((it) => h('div', { class: 'chk ' + MARK[it.level][1] }, h('b', {}, MARK[it.level][0]), h('span', {}, it.text))),
        h('button', { class: 'btn small', disabled: busy, onclick: check }, busy ? 'Comprobando…' : ev.status === 'pending' ? 'Comprobar ahora' : 'Volver a comprobar'),
        h('p', { class: 'hint' }, ev.kind === 'scan' ? 'Los avisos informan; no impiden nada.' : 'Los avisos informan; no impiden nada. Las reglas se cambian en Ajustes › Comprobaciones.'))
        : c.mode !== 'off' && (type?.printRoles || type?.scanRoles) && /^(png|tiff?|jpe?g|webp)$/.test(extOf(f.orig))
          ? h('p', { class: 'hint' }, `Se comprueban los archivos marcados como ${[...(type.printRoles || []), ...(type.scanRoles || [])].map((r) => '«' + r + '»').join(', ')}.`) : null,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small', onclick: () => openAttachment(f) }, icon('download'), isImg || f.mime === 'application/pdf' ? 'Abrir' : 'Descargar'),
        h('button', { class: 'btn small danger', onclick: () => { st.trashFile(id); s.close(); toast('Archivo eliminado', { action: 'Deshacer', onAction: () => { st.restoreFile(id); onChange?.(); } }); } }, icon('trash'), 'Eliminar')),
    ];
  }, { live: true, onClose: () => onChange?.() });
}
