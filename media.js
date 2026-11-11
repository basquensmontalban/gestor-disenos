// Fotos: se reducen antes de guardarlas, se convierten a JPG (también las HEIC del iPhone) y se les hace miniatura.
import * as st from './store.js';

const HEIC_LIB = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
const isHeic = (file) => /hei[cf]/i.test(file.type || '') || /\.hei[cf]$/i.test(file.name || '');

export const decodeImage = (blob) => decode(blob);
async function decode(blob) {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {}
  return new Promise((res, rej) => {
    const i = new Image();
    const url = URL.createObjectURL(blob);
    i.onload = () => { res(i); setTimeout(() => URL.revokeObjectURL(url), 5000); };
    i.onerror = () => { URL.revokeObjectURL(url); rej(new Error('No se puede leer la imagen')); };
    i.src = url;
  });
}

// Algunos navegadores (Chrome en Windows y Android) no saben leer HEIC: se descarga un conversor la primera vez.
let heicLib;
function loadHeic() {
  heicLib = heicLib || new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = HEIC_LIB;
    s.onload = () => (window.heic2any ? res(window.heic2any) : rej(new Error('conversor no disponible')));
    s.onerror = () => { heicLib = null; rej(new Error('Sin conexión para descargar el conversor de HEIC')); };
    document.head.append(s);
  });
  return heicLib;
}

async function toBitmap(file) {
  try {
    return await decode(file);
  } catch (e) {
    if (!isHeic(file)) throw e;
    const conv = await loadHeic();
    const out = await conv({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    return decode(Array.isArray(out) ? out[0] : out);
  }
}

function draw(src, max, quality, type = 'image/jpeg') {
  const w = src.width || src.naturalWidth;
  const hgt = src.height || src.naturalHeight;
  const k = Math.min(1, max / Math.max(w, hgt));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(hgt * k));
  const ctx = c.getContext('2d');
  if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob((b) => r({ blob: b, w: c.width, h: c.height }), type, quality));
}

// Foto para la ficha: reducida (lado largo y calidad de Ajustes) + miniatura.
export async function preparePhoto(file) {
  const bmp = await toBitmap(file);
  const full = await draw(bmp, +st.S.settings.photoMax || 1600, +st.S.settings.photoQ || 0.8);
  const thumb = await draw(bmp, 520, 0.72);
  bmp.close?.();
  return { full: full.blob, thumb: thumb.blob, w: full.w, h: full.h };
}

// Miniatura de cualquier imagen (también de un adjunto PNG o SVG, o de una foto bajada de Drive).
// alpha=true conserva la transparencia (para verla después sobre fondo claro y oscuro); src puede ser un lienzo ya leído.
export async function makeThumb(blob, { alpha = false, src = null } = {}) {
  try {
    const bmp = src || await decode(blob);
    let t = alpha ? await draw(bmp, 900, 0.85, 'image/webp') : await draw(bmp, 520, 0.72);
    // Safari no sabe guardar WebP y devuelve otra cosa: en ese caso, PNG (que sí conserva la transparencia).
    if (alpha && t.blob && t.blob.type !== 'image/webp') t = await draw(bmp, 700, 1, 'image/png');
    if (!src) bmp.close?.();
    return t.blob;
  } catch {
    return null;
  }
}
export const keepsAlpha = (mime, name = '') => /^image\/(png|svg|webp|tiff)/.test(mime || '') || /\.(png|svg|webp|tiff?)$/i.test(name);

export const fmtSize = (n) => (n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round((n || 0) / 1024)) + ' KB');
