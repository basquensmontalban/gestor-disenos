// Comprobación de los archivos de impresión y de los escaneos. Informa, pero nunca impide subir nada.
// Lo que se guarda de cada archivo son sus medidas (tamaño, resolución, perfil, transparencias); el veredicto
// se calcula al mostrarlo, así que cambiar una regla en Ajustes actualiza todos los avisos al momento.
import * as st from './store.js';
import { decodeImage } from './media.js';
import { readTiff } from './tiff.js';

export const CHECK_DEFAULTS = {
  mode: 'always',     // always: al subir · manual: solo con el botón · off: nunca
  size: true,         // tamaño mínimo en píxeles según el soporte
  alpha: true,        // fondo transparente (en prenda)
  srgb: true,         // perfil de color sRGB
  semi: true,         // píxeles semitransparentes (problema en prenda oscura)
  semiMax: 10,        // % de píxeles visibles que pueden ser semitransparentes
  scan: true,         // resolución de los escaneos
  scanPpp: 600,       // ppp mínimos de un escaneo
  previews: true,     // vistas previas sobre fondo claro y oscuro
  sizes: {},          // tamaños mínimos cambiados a mano: { CAM: [3600, 4800] }
};
export const cfg = () => ({ ...CHECK_DEFAULTS, ...(st.S.settings.checks || {}) });
export function putCfg(patch) { st.putSettings({ checks: { ...(st.S.settings.checks || {}), ...patch } }); }

const extOf = (f) => String(f.orig || f.name || '').split('.').pop().toLowerCase();
const RASTER = /^(png|tif|tiff|jpg|jpeg|webp)$/;
const nf = (n) => Number(n).toLocaleString('es-ES');

// Soportes del tipo que se imprimen, con su tamaño mínimo (el del paquete o el cambiado en Ajustes).
export function printSupports(type) {
  const c = cfg();
  return (type?.supports || []).filter((s) => s.print || s.garment).map((s) => ({ ...s, size: s.code in (c.sizes || {}) ? c.sizes[s.code] : s.print || null }));
}
// ¿Para qué soporte se comprueba este archivo? El de su variante, o el primero del tipo que se imprime.
function targetOf(f, type) {
  const sups = printSupports(type);
  const v = st.getVariant(f.variantId);
  return (v && sups.find((s) => s.code === v.support)) || (v ? null : sups[0]) || null;
}
// Qué clase de comprobación le toca: 'print' (archivo de impresión), 'scan' (escaneo) o ninguna.
export function kindOf(f, type) {
  if (f.kind !== 'file' || !RASTER.test(extOf(f))) return null;
  if ((type?.printRoles || []).includes(f.role)) return 'print';
  if ((type?.scanRoles || []).includes(f.role)) return 'scan';
  return null;
}

// ── Medir ──────────────────────────────────────────────────
async function pngMeta(blob) {
  const out = { profile: '', ppp: null, alphaCh: false };
  let pos = 8;
  for (let i = 0; i < 40 && pos + 8 <= blob.size; i++) {
    const hd = new DataView(await blob.slice(pos, pos + 8).arrayBuffer());
    const len = hd.getUint32(0);
    const type = String.fromCharCode(hd.getUint8(4), hd.getUint8(5), hd.getUint8(6), hd.getUint8(7));
    if (type === 'IDAT' || type === 'IEND') break;
    if (type === 'IHDR') {
      const d = new DataView(await blob.slice(pos + 8, pos + 8 + 13).arrayBuffer());
      const ct = d.getUint8(9);
      out.alphaCh = ct === 4 || ct === 6;
    } else if (type === 'tRNS') out.alphaCh = true;
    else if (type === 'sRGB') out.profile = 'sRGB';
    else if (type === 'iCCP') {
      const d = new Uint8Array(await blob.slice(pos + 8, pos + 8 + Math.min(len, 80)).arrayBuffer());
      let name = '';
      for (const c of d) { if (!c) break; name += String.fromCharCode(c); }
      // El nombre del bloque suele ser genérico («ICC Profile»): el de verdad está dentro del perfil, comprimido.
      let real = '';
      try {
        const raw = await blob.slice(pos + 8 + name.length + 2, pos + 8 + len).arrayBuffer();
        real = iccName(new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()));
      } catch {}
      out.profile = profileLabel(real || name);
    } else if (type === 'pHYs') {
      const d = new DataView(await blob.slice(pos + 8, pos + 8 + 9).arrayBuffer());
      if (d.getUint8(8) === 1) out.ppp = Math.round(d.getUint32(0) * 0.0254);
    }
    pos += 12 + len;
  }
  return out;
}

// Descripción de un perfil ICC (etiqueta «desc»: texto ASCII en la versión 2, UTF-16 en la 4).
export function iccName(b) {
  try {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const n = dv.getUint32(128);
    for (let i = 0; i < n && i < 100; i++) {
      const o = 132 + i * 12;
      if (dv.getUint32(o) !== 0x64657363) continue;                    // 'desc'
      const at = dv.getUint32(o + 4);
      const type = dv.getUint32(at);
      let s = '';
      if (type === 0x64657363) { const len = dv.getUint32(at + 8); for (let j = 0; j < len - 1; j++) s += String.fromCharCode(b[at + 12 + j]); }
      else if (type === 0x6d6c7563) {                                   // 'mluc'
        const len = dv.getUint32(at + 20), off = dv.getUint32(at + 24);
        for (let j = 0; j < len; j += 2) s += String.fromCharCode(dv.getUint16(at + off + j));
      }
      return s.replace(/\0/g, '').trim();
    }
  } catch {}
  return '';
}
const profileLabel = (name) => (/srgb/i.test(name) ? 'sRGB' : String(name || '').trim().slice(0, 40) || 'perfil incrustado');

// Cuenta transparencias en una versión reducida (sin suavizar, para no inventar píxeles semitransparentes).
function alphaStats(data) {
  let zero = 0, semi = 0, vis = 0;
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i];
    if (a === 0) zero++;
    else { vis++; if (a > 12 && a < 243) semi++; }
  }
  const total = data.length / 4;
  const r1 = (x) => Math.round(x * 10) / 10;
  return { transp: r1((zero / total) * 100), semi: vis ? r1((semi / vis) * 100) : 0 };
}
function sample(src, w, h, max = 1000) {
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return ctx.getImageData(0, 0, c.width, c.height).data;
}

// Devuelve las medidas del archivo y, si se ha podido leer la imagen, un lienzo reducido para hacer la miniatura.
export async function measure(blob, name) {
  const ext = String(name || '').split('.').pop().toLowerCase();
  const m = { at: Date.now(), fmt: ext === 'tif' ? 'tiff' : ext === 'jpg' ? 'jpeg' : ext, w: 0, h: 0, ppp: null, profile: '', alphaCh: false, px: false };
  let canvas = null;
  if (m.fmt === 'tiff') {
    const t = await readTiff(blob, { maxSide: 1000 });
    Object.assign(m, { w: t.w, h: t.h, ppp: t.ppp, profile: t.icc ? profileLabel(t.iccBytes ? iccName(t.iccBytes) : '') : '', alphaCh: t.alphaCh });
    if (t.image) {
      Object.assign(m, alphaStats(t.image.data), { px: true });
      canvas = document.createElement('canvas');
      canvas.width = t.image.width; canvas.height = t.image.height;
      canvas.getContext('2d').putImageData(t.image, 0, 0);
    } else m.why = t.reason;
    return { meas: m, canvas };
  }
  if (m.fmt === 'png') Object.assign(m, await pngMeta(blob));
  const bmp = await decodeImage(blob);
  m.w = bmp.width || bmp.naturalWidth;
  m.h = bmp.height || bmp.naturalHeight;
  Object.assign(m, alphaStats(sample(bmp, m.w, m.h)), { px: true });
  bmp.close?.();
  return { meas: m, canvas };
}

// ── Veredicto ──────────────────────────────────────────────
// Devuelve null si al archivo no le toca ninguna comprobación.
// level: ok · warn (cuenta como aviso) · info (dato o nota suave)
export function evaluate(f, w) {
  const c = cfg();
  if (c.mode === 'off') return null;
  const type = st.getType(w?.type);
  const kind = kindOf(f, type);
  if (!kind) return null;
  const m = f.meas;
  if (!m) return { kind, status: 'pending', items: [], warns: 0, label: 'sin comprobar' };
  const items = [];
  const dims = m.w && m.h ? `${nf(m.w)} × ${nf(m.h)} px` : '';

  if (kind === 'scan') {
    if (c.scan) {
      if (!m.ppp) items.push({ level: 'info', text: `El archivo no dice su resolución${dims ? ' (' + dims + ')' : ''}.` });
      else if (m.ppp >= c.scanPpp) items.push({ level: 'ok', text: `${nf(m.ppp)} ppp${dims ? ' · ' + dims : ''}` });
      else items.push({ level: 'warn', text: `Escaneado a ${nf(m.ppp)} ppp: el mínimo es ${nf(c.scanPpp)} (1.200 si el original es menor que A5).` });
    } else if (dims) items.push({ level: 'info', text: dims + (m.ppp ? ` · ${nf(m.ppp)} ppp` : '') });
  } else {
    const t = targetOf(f, type);
    if (c.size && t?.size && m.w && m.h) {
      const [a, b] = [Math.max(...t.size), Math.min(...t.size)];
      const good = Math.max(m.w, m.h) >= a && Math.min(m.w, m.h) >= b;
      items.push({ level: good ? 'ok' : 'warn', text: good ? `${dims}: suficiente para ${t.name.toLowerCase()}` : `${dims}: pequeño para ${t.name.toLowerCase()} (mínimo ${nf(b)} × ${nf(a)} px). Ampliarlo emborrona: mejor rehacerlo a más tamaño.` });
    } else if (dims) items.push({ level: 'info', text: dims });
    if (c.alpha && t?.garment) {
      if (m.fmt === 'jpeg') items.push({ level: 'warn', text: 'Es un JPG: no puede tener fondo transparente. Para prenda hace falta un PNG.' });
      else if (m.px) items.push(m.transp >= 0.5 ? { level: 'ok', text: 'Fondo transparente' } : { level: 'warn', text: 'No tiene fondo transparente: el fondo se imprimiría tal cual sobre la prenda.' });
    }
    if (c.srgb) {
      if (m.profile === 'sRGB') items.push({ level: 'ok', text: 'Perfil de color sRGB' });
      else if (m.profile) items.push({ level: 'warn', text: `Perfil de color «${m.profile}»: conviene exportarlo en sRGB para que los colores no cambien.` });
      else items.push({ level: 'info', text: 'Sin perfil de color incrustado: se tratará como sRGB.' });
    }
    if (c.semi && m.px && t?.garment && m.fmt !== 'jpeg') {
      const txt = `${String(m.semi).replace('.', ',')} % de lo dibujado es semitransparente`;
      if (m.semi <= c.semiMax) items.push({ level: 'ok', text: `${txt}: bien` });
      else if (f.role === 'clara') items.push({ level: 'info', text: `${txt}. En prenda clara no importa; en oscura se imprimiría mal.` });
      else items.push({ level: 'warn', text: `${txt} (bordes difuminados): en prenda oscura se imprime mal. Mejor en prenda clara o encerrado en una forma.` });
    }
  }
  if (!m.px) items.push({ level: 'info', text: `No se ha podido leer la imagen${m.why ? ' (' + m.why + ')' : ''}: transparencias sin comprobar.` });
  const warns = items.filter((i) => i.level === 'warn').length;
  return { kind, status: warns ? 'warn' : 'ok', items, warns, label: warns ? (warns === 1 ? '1 aviso' : `${warns} avisos`) : 'OK' };
}
