// Lector de TIFF propio (los navegadores no saben abrirlos). Lee los datos del archivo (tamaño, resolución,
// perfil de color, canal alfa) y, cuando el formato lo permite, una versión reducida de la imagen.
// Admite lo habitual en escaneos: tiras (no teselas), 8 o 16 bits, gris o RGB(A), sin comprimir, LZW, PackBits o Deflate.
// Lo que no se puede leer no da error: se devuelve sin imagen y la app lo marca «sin comprobar».

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
const slice = async (blob, start, len) => new DataView(await blob.slice(start, start + len).arrayBuffer());

export async function readTiff(blob, { maxSide = 1000, pixels = true } = {}) {
  const head = await slice(blob, 0, 8);
  const bo = head.getUint16(0);
  if (bo !== 0x4949 && bo !== 0x4d4d) throw new Error('No es un TIFF');
  const le = bo === 0x4949;
  if (head.getUint16(2, le) !== 42) throw new Error('TIFF de un formato no admitido (BigTIFF)');
  const ifdAt = head.getUint32(4, le);
  const n = (await slice(blob, ifdAt, 2)).getUint16(0, le);
  const dir = await slice(blob, ifdAt + 2, n * 12);
  const tags = new Map();
  for (let i = 0; i < n; i++) {
    const o = i * 12;
    tags.set(dir.getUint16(o, le), { type: dir.getUint16(o + 2, le), count: dir.getUint32(o + 4, le), at: o + 8 });
  }
  // Valores de una etiqueta (los que no caben en 4 bytes están en otra parte del archivo).
  async function values(tag, max = 1e6) {
    const t = tags.get(tag);
    if (!t) return null;
    const size = TYPE_SIZE[t.type] || 1;
    const count = Math.min(t.count, max);
    const dv = t.count * size <= 4 ? new DataView(dir.buffer, dir.byteOffset + t.at, 4) : await slice(blob, dir.getUint32(t.at, le), count * size);
    const out = [];
    for (let i = 0; i < count; i++) {
      const p = i * size;
      if (t.type === 3) out.push(dv.getUint16(p, le));
      else if (t.type === 4) out.push(dv.getUint32(p, le));
      else if (t.type === 5) out.push(dv.getUint32(p, le) / (dv.getUint32(p + 4, le) || 1));
      else out.push(dv.getUint8(p));
    }
    return out;
  }
  const one = async (tag, def) => { const v = await values(tag, 1); return v ? v[0] : def; };

  const W = await one(256, 0);
  const H = await one(257, 0);
  const spp = await one(277, 1);
  const bits = (await values(258, 8)) || [1];
  const comp = await one(259, 1);
  const photo = await one(262, 1);
  const unit = await one(296, 2);
  const xres = await one(282, 0);
  const extra = (await values(338, 4)) || [];
  const info = {
    w: W, h: H,
    ppp: xres ? Math.round(unit === 3 ? xres * 2.54 : xres) : null,   // unidad 2 = pulgadas, 3 = centímetros
    icc: tags.has(34675), iccBytes: null,
    alphaCh: extra.length > 0 && spp >= (photo === 2 ? 4 : 2),
    image: null, reason: '',
  };
  // Perfil de color incrustado (para saber si es sRGB).
  const it = tags.get(34675);
  if (it && it.count > 128 && it.count < 8e6) info.iccBytes = new Uint8Array(await blob.slice(dir.getUint32(it.at, le), dir.getUint32(it.at, le) + it.count).arrayBuffer());
  if (!pixels || !W || !H) return info;

  const bps = bits[0];
  const reason = tags.has(322) ? 'está guardado en teselas'
    : (await one(284, 1)) !== 1 ? 'tiene los canales separados'
      : !bits.every((b) => b === bps) || (bps !== 8 && bps !== 16) ? `usa ${bps} bits por canal`
        : ![1, 5, 8, 32946, 32773].includes(comp) ? 'usa una compresión que la app no lee'
          : ![0, 1, 2].includes(photo) ? 'no está en gris ni en RGB (¿CMYK?)' : '';
  if (reason) { info.reason = reason; return info; }

  const predictor = await one(317, 1);
  const rps = Math.min(await one(278, H), H) || H;
  const offsets = await values(273);
  const counts = await values(279);
  if (!offsets || !counts) { info.reason = 'le faltan datos'; return info; }

  const k = Math.min(1, maxSide / Math.max(W, H));
  const ow = Math.max(1, Math.round(W * k));
  const oh = Math.max(1, Math.round(H * k));
  const img = new ImageData(ow, oh);
  const bytes = bps / 8;
  const rowLen = W * spp * bytes;
  const hi = bytes === 2 ? (le ? 1 : 0) : 0;                 // con 16 bits se usa el byte alto
  const hasAlpha = info.alphaCh;
  const colorCh = photo === 2 ? 3 : 1;
  const srcRow = (y) => Math.min(H - 1, Math.floor((y + 0.5) / k));
  const srcCol = new Int32Array(ow);
  for (let x = 0; x < ow; x++) srcCol[x] = Math.min(W - 1, Math.floor((x + 0.5) / k));

  let y = 0;
  for (let s = 0; s < offsets.length && y < oh; s++) {
    const first = s * rps;
    const rows = Math.min(rps, H - first);
    if (srcRow(y) >= first + rows) continue;                // ninguna fila de esta tira hace falta: no se lee
    let data = new Uint8Array(await blob.slice(offsets[s], offsets[s] + counts[s]).arrayBuffer());
    const expected = rows * rowLen;
    if (comp === 5) data = lzw(data, expected);
    else if (comp === 32773) data = packBits(data, expected);
    else if (comp === 8 || comp === 32946) data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
    if (data.length < expected) { info.reason = 'está incompleto'; return info; }
    for (; y < oh && srcRow(y) < first + rows; y++) {
      const base = (srcRow(y) - first) * rowLen;
      if (predictor === 2) undoPredictor(data, base, W, spp, bytes, le);
      for (let x = 0; x < ow; x++) {
        const p = base + srcCol[x] * spp * bytes + hi;
        const o = (y * ow + x) * 4;
        if (colorCh === 3) { img.data[o] = data[p]; img.data[o + 1] = data[p + bytes]; img.data[o + 2] = data[p + 2 * bytes]; }
        else { const v = photo === 0 ? 255 - data[p] : data[p]; img.data[o] = img.data[o + 1] = img.data[o + 2] = v; }
        img.data[o + 3] = hasAlpha ? data[p + colorCh * bytes] : 255;
      }
    }
  }
  info.image = img;
  return info;
}

// Predictor 2: cada muestra guarda la diferencia con la anterior de la misma fila.
function undoPredictor(d, base, W, spp, bytes, le) {
  if (bytes === 1) {
    for (let i = base + spp, end = base + W * spp; i < end; i++) d[i] = (d[i] + d[i - spp]) & 255;
    return;
  }
  const a = le ? 0 : 1, b = le ? 1 : 0;                      // a = byte bajo, b = byte alto
  for (let i = spp, end = W * spp; i < end; i++) {
    const p = base + i * 2, q = p - spp * 2;
    const v = ((d[p + a] | (d[p + b] << 8)) + (d[q + a] | (d[q + b] << 8))) & 0xffff;
    d[p + a] = v & 255; d[p + b] = v >> 8;
  }
}

function packBits(src, expected) {
  const out = new Uint8Array(expected);
  let ip = 0, op = 0;
  while (ip < src.length && op < expected) {
    const c = src[ip++] << 24 >> 24;
    if (c >= 0) { for (let i = 0; i <= c && op < expected; i++) out[op++] = src[ip++]; }
    else if (c !== -128) { const v = src[ip++]; for (let i = 0; i <= -c && op < expected; i++) out[op++] = v; }
  }
  return out;
}

// LZW al estilo TIFF: códigos de 9 a 12 bits, el bit más significativo primero, y el cambio de tamaño «adelantado».
function lzw(src, expected) {
  const out = new Uint8Array(expected);
  const prefix = new Int32Array(4097), suffix = new Uint8Array(4097), len = new Uint16Array(4097);
  for (let i = 0; i < 256; i++) { suffix[i] = i; len[i] = 1; prefix[i] = -1; }
  let next = 258, bits = 9, buf = 0, nbits = 0, ip = 0, op = 0, old = -1;
  const put = (code, at) => { let c = code; for (let j = len[code] - 1; j >= 0; j--) { out[at + j] = suffix[c]; c = prefix[c]; } };
  while (op < expected) {
    while (nbits < bits) { if (ip >= src.length) return out; buf = (buf << 8) | src[ip++]; nbits += 8; }
    const code = (buf >> (nbits - bits)) & ((1 << bits) - 1);
    nbits -= bits;
    buf &= (1 << nbits) - 1;
    if (code === 256) { next = 258; bits = 9; old = -1; continue; }
    if (code === 257) break;
    if (old === -1) { if (code > 255) break; out[op++] = code; old = code; continue; }
    let l;
    if (code < next) {
      l = len[code];
      if (op + l > expected) break;
      put(code, op);
    } else {
      l = len[old] + 1;
      if (code !== next || op + l > expected) break;
      put(old, op);
      out[op + l - 1] = out[op];
    }
    if (next < 4096) { prefix[next] = old; suffix[next] = out[op]; len[next] = len[old] + 1; next++; }
    op += l;
    old = code;
    if (next >= (1 << bits) - 1 && bits < 12) bits++;
  }
  return out;
}
