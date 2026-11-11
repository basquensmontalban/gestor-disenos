// Escritor de ZIP mínimo (sin comprimir: las fotos ya van comprimidas). Nombres en UTF-8.
// Lee cada archivo una vez para calcular su CRC y guarda solo la referencia al Blob, así no duplica memoria.
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf, crc = 0) {
  let c = ~crc >>> 0;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return ~c >>> 0;
}
const enc = new TextEncoder();
function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export class ZipWriter {
  constructor() { this.parts = []; this.central = []; this.offset = 0; this.count = 0; this.names = new Set(); }
  // Evita nombres repetidos dentro del ZIP («foto.jpg», «foto (2).jpg»…).
  unique(name) {
    let out = name;
    for (let i = 2; this.names.has(out.toLowerCase()); i++) out = name.replace(/(\.[^./]+)?$/, (m) => ` (${i})${m}`);
    this.names.add(out.toLowerCase());
    return out;
  }
  async add(path, data, when = new Date()) {
    const blob = data instanceof Blob ? data : new Blob([data]);
    if (this.offset + blob.size > 0xfffffff0 || this.count >= 0xfffe) throw new Error('La exportación es demasiado grande para un solo ZIP.');
    const name = enc.encode(this.unique(path));
    let crc = 0;
    // CRC por trozos (archivos grandes sin cargarlos enteros de golpe).
    for (let pos = 0; pos < blob.size; pos += 8 * 1024 * 1024) crc = crc32(new Uint8Array(await blob.slice(pos, pos + 8 * 1024 * 1024).arrayBuffer()), crc);
    const { time, date } = dosTime(when);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true); head.setUint16(8, 0, true);
    head.setUint16(10, time, true); head.setUint16(12, date, true); head.setUint32(14, crc, true);
    head.setUint32(18, blob.size, true); head.setUint32(22, blob.size, true); head.setUint16(26, name.length, true); head.setUint16(28, 0, true);
    this.parts.push(head.buffer, name, blob);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true);
    cen.setUint16(12, time, true); cen.setUint16(14, date, true); cen.setUint32(16, crc, true); cen.setUint32(20, blob.size, true); cen.setUint32(24, blob.size, true);
    cen.setUint16(28, name.length, true); cen.setUint32(42, this.offset, true);
    this.central.push(cen.buffer, name);
    this.offset += 30 + name.length + blob.size;
    this.count++;
  }
  finish() {
    const size = this.central.reduce((a, p) => a + (p.byteLength ?? p.length), 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, this.count, true); end.setUint16(10, this.count, true);
    end.setUint32(12, size, true); end.setUint32(16, this.offset, true);
    return new Blob([...this.parts, ...this.central, end.buffer], { type: 'application/zip' });
  }
}
