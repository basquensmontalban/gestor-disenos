// Conexión con Google: inicio de sesión y Drive (datos, fotos, adjuntos y carpetas por obra).
import { CONFIG } from './config.js';
import * as st from './store.js';
import { blobGet, blobSet, blobDel } from './db.js';
import { runBackups, backupDue } from './backup.js';
import { VERSION, cmpVer } from './version.js';
import { makeThumb, keepsAlpha } from './media.js';
import { readTiff } from './tiff.js';

export const DRIVE = 'https://www.googleapis.com/drive/v3';
export const DRIVE_UP = 'https://www.googleapis.com/upload/drive/v3';
const STATE_FILE = 'gestor.json';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export const configured = () => !/PEGA_AQUI/.test(CONFIG.GOOGLE_CLIENT_ID);

// ── Inicio de sesión (por redirección: funciona en apps instaladas) ──
export function redirectUri() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

export function login({ silent = false } = {}) {
  const state = st.uid();
  localStorage.setItem('oauth_state', state);
  const p = new URLSearchParams({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: CONFIG.SCOPES.join(' '),
    include_granted_scopes: 'true',
    state,
  });
  if (silent) p.set('prompt', 'none');
  location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + p);
}

// Lee el resultado al volver de Google. Devuelve null si no venimos de allí.
export function handleRedirect() {
  const hash = location.hash.slice(1);
  if (!/(^|&)(access_token|error)=/.test(hash)) return null;
  const h = new URLSearchParams(hash);
  history.replaceState(null, '', location.pathname + location.search);
  if (h.get('state') !== localStorage.getItem('oauth_state')) return { error: 'state' };
  localStorage.removeItem('oauth_state');
  if (h.get('error')) return { error: h.get('error') };
  const tok = { t: h.get('access_token'), exp: Date.now() + ((+h.get('expires_in') || 3600) - 60) * 1000 };
  localStorage.setItem('gtoken', JSON.stringify(tok));
  localStorage.setItem('ever_connected', '1');
  return { ok: true };
}

export function token() {
  try {
    const t = JSON.parse(localStorage.getItem('gtoken'));
    if (t && t.exp > Date.now()) return t.t;
  } catch {}
  return null;
}
export const everConnected = () => localStorage.getItem('ever_connected') === '1';

export function logout() {
  const t = token();
  localStorage.removeItem('gtoken');
  localStorage.removeItem('ever_connected');
  if (t) {
    fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }).catch(() => {});
  }
  setStatus('auth');
}

export class AuthError extends Error {}

export async function api(url, opts = {}, { raw = false } = {}) {
  const t = token();
  if (!t) throw new AuthError('sin sesión');
  const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + t } });
  if (r.status === 401) {
    localStorage.removeItem('gtoken');
    throw new AuthError('sesión caducada');
  }
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    let msg = txt;
    try { msg = JSON.parse(txt).error.message; } catch {}
    const e = new Error(`Google ${r.status}: ${String(msg).slice(0, 200)}`);
    e.status = r.status;
    throw e;
  }
  if (raw) return r;
  if (r.status === 204) return null;
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : r.text();
}

export const jsonPost = (url, body, method = 'POST') =>
  api(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function multipartCreate(metadata, blob, fields = 'id') {
  const fd = new FormData();
  fd.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  fd.append('file', blob);
  return api(`${DRIVE_UP}/files?uploadType=multipart&fields=${encodeURIComponent(fields)}`, { method: 'POST', body: fd });
}

// Archivos grandes (PNG de impresión, TIFF, STL): subida «reanudable», en dos pasos.
async function resumableCreate(metadata, blob) {
  const r = await api(`${DRIVE_UP}/files?uploadType=resumable&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': blob.type || 'application/octet-stream' },
    body: JSON.stringify(metadata),
  }, { raw: true });
  const loc = r.headers.get('Location');
  if (!loc) throw new Error('Drive no ha devuelto la dirección de subida');
  return api(loc, { method: 'PUT', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
}
const createFile = (metadata, blob) => (blob.size > 4 * 1024 * 1024 ? resumableCreate(metadata, blob) : multipartCreate(metadata, blob));

export async function findOne(q) {
  const r = await api(`${DRIVE}/files?` + new URLSearchParams({ q, fields: 'files(id)', spaces: 'drive', pageSize: '10' }));
  return r.files?.[0]?.id || null;
}

export async function findOrCreateFolder(name, parent = null) {
  const n = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  let q = `mimeType='${FOLDER_MIME}' and name='${n}' and trashed=false`;
  if (parent) q += ` and '${parent}' in parents`;
  let id = await findOne(q);
  if (!id) {
    const body = { name, mimeType: FOLDER_MIME };
    if (parent) body.parents = [parent];
    id = (await jsonPost(`${DRIVE}/files?fields=id`, body)).id;
  }
  return id;
}

const patchMeta = (id, body, query = '') => jsonPost(`${DRIVE}/files/${id}?fields=id${query}`, body, 'PATCH');

// ── Estado de sincronización (lo muestra la cabecera) ──
export const sync = { status: 'idle', error: null };
const statusListeners = new Set();
export const onStatus = (fn) => statusListeners.add(fn);
function setStatus(s, error = null) {
  sync.status = s;
  sync.error = error;
  statusListeners.forEach((f) => f(sync));
}

// ── Carpetas ──
let folderCheckedAt = 0;
export async function ensureFolder() {
  const m = st.meta;
  if (m.folderId && Date.now() - folderCheckedAt < 10 * 60e3) return m.folderId;
  folderCheckedAt = Date.now();
  if (m.folderId) {
    try {
      const f = await api(`${DRIVE}/files/${m.folderId}?fields=id,trashed`);
      if (!f.trashed) return m.folderId;
    } catch (e) {
      if (e instanceof AuthError) throw e;
    }
  }
  const id = await findOrCreateFolder(CONFIG.DRIVE_FOLDER_NAME);
  if (m.folderId !== id) { m.fileId = null; m.backupFolderId = null; m.deviceFileId = null; sub.clear(); }
  m.folderId = id;
  return id;
}

// Subcarpetas (Diseños, Diseños/<Tipo>, Diseños/_Por ordenar): se buscan una vez por sesión.
const sub = new Map();
async function subFolder(name, parent) {
  const key = parent + '/' + name;
  if (!sub.has(key)) sub.set(key, await findOrCreateFolder(name, parent));
  return sub.get(key);
}
const clean = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
export const slug = (s) => st.norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const folderNameOf = (w) => clean([w.code, w.name].filter(Boolean).join(' ')) || 'Sin nombre';
const ext = (name, fallback = '') => { const m = String(name || '').match(/\.([a-z0-9]{1,8})$/i); return m ? m[1].toLowerCase() : fallback; };

// Nombre del archivo en Drive: código_nombre_rol_versión.ext (si el renombrado está activado).
function driveName(f, w) {
  if (!w) return `captura-${f.id}.${ext(f.orig, 'jpg')}`;
  if (!st.S.settings.rename) return clean(f.orig) || `${f.kind === 'photo' ? 'foto' : 'archivo'}-${f.id}.${ext(f.orig, 'jpg')}`;
  const sameWork = st.alive(st.S.files).filter((x) => x.workId === w.id && x.id !== f.id && x.dname && !/^captura-/.test(x.dname));
  // El número es el primero libre: dos archivos de la misma carpeta nunca se llaman igual.
  const taken = new Set(sameWork.map((x) => x.dname));
  const free = (make) => { let n = 1; while (taken.has(make(n))) n++; return make(n); };
  const two = (n) => String(n).padStart(2, '0');
  if (f.kind === 'photo' && f.sampleId) {
    const vcode = st.getVariant(st.getSample(f.sampleId)?.variantId)?.code || w.code;
    return free((n) => [vcode, slug(w.name), 'muestra', two(n)].filter(Boolean).join('_') + '.jpg');
  }
  if (f.kind === 'photo') return free((n) => [w.code, slug(w.name), 'foto', two(n)].filter(Boolean).join('_') + '.jpg');
  const code = st.getVariant(f.variantId)?.code || w.code;
  const role = slug(f.role || 'archivo') || 'archivo';
  return free((n) => [code, slug(w.name), role, 'v' + two(n)].filter(Boolean).join('_') + '.' + ext(f.orig, 'bin'));
}

// ¿El nombre en Drive (código_nombre_rol_vNN.ext) ya no corresponde al rol o a la variante del archivo?
function staleName(f, w) {
  const parts = String(f.dname || '').replace(/\.[a-z0-9]+$/i, '').split('_');
  if (parts.length < 3 || !/^v\d+$/.test(parts[parts.length - 1])) return false;
  const code = st.getVariant(f.variantId)?.code || w.code;
  return parts[0] !== code || parts[parts.length - 2] !== (slug(f.role || 'archivo') || 'archivo');
}

// Crea, renombra o mueve las carpetas de las obras; sube lo pendiente; recoloca lo que ha cambiado de obra.
async function syncFiles(root) {
  const m = st.meta;
  const S = st.S;
  let errors = 0;
  const guard = (e) => { if (e instanceof AuthError) throw e; errors++; console.warn('archivo', e); m.fileError = e.message; };
  const files = st.alive(S.files).filter((f) => !f.trashed);
  const withFiles = new Set(files.filter((f) => f.workId).map((f) => f.workId));
  if (!files.length && !st.alive(S.works).some((w) => w.folderId) && !(m.driveTrash || []).length) return;
  const dis = await subFolder('Diseños', root);

  for (const w of st.alive(S.works)) {
    if (!w.folderId && !withFiles.has(w.id)) continue;
    try {
      const type = st.getType(w.type);
      const parent = await subFolder(clean(type?.name || 'Sin tipo'), dis);
      const name = folderNameOf(w);
      if (!w.folderId) {
        w.folderId = (await jsonPost(`${DRIVE}/files?fields=id`, { name, mimeType: FOLDER_MIME, parents: [parent] })).id;
        w.folderName = name; w.folderParent = parent; w.u = st.stamp();
      } else {
        if (w.folderParent && w.folderParent !== parent) {
          await patchMeta(w.folderId, {}, `&addParents=${parent}&removeParents=${w.folderParent}`);
          w.folderParent = parent; w.u = st.stamp();
        }
        if (w.folderName !== name) { await patchMeta(w.folderId, { name }); w.folderName = name; w.u = st.stamp(); }
      }
    } catch (e) {
      if (e.status === 404) { w.folderId = null; w.folderName = null; w.u = st.stamp(); }
      guard(e);
    }
  }

  let inboxFolder = null;
  for (const f of files) {
    const w = f.workId ? st.getWork(f.workId) : null;
    if (f.workId && !w?.folderId) continue;
    try {
      const parent = w ? w.folderId : (inboxFolder = inboxFolder || await subFolder('_Por ordenar', dis));
      if (!f.driveId) {
        const blob = await blobGet('p:' + f.id);
        if (!blob) continue;                       // lo tiene pendiente el otro aparato
        const name = driveName(f, w);
        const made = await createFile({ name, parents: [parent] }, blob);
        Object.assign(f, { driveId: made.id, dparent: parent, dname: name, u: st.stamp() });
        await blobDel('p:' + f.id);
      } else if (f.dparent && f.dparent !== parent) {
        const body = /^captura-/.test(f.dname || '') && w ? { name: driveName(f, w) } : {};
        await patchMeta(f.driveId, body, `&addParents=${parent}&removeParents=${f.dparent}`);
        Object.assign(f, { dparent: parent, dname: body.name || f.dname, u: st.stamp() });
      } else if (w && f.kind === 'file' && st.S.settings.rename && staleName(f, w)) {
        // Ha cambiado el rol del archivo o la variante a la que pertenece: el nombre en Drive se pone al día.
        const name = driveName(f, w);
        await patchMeta(f.driveId, { name });
        Object.assign(f, { dname: name, u: st.stamp() });
      }
    } catch (e) { guard(e); }
  }

  // Lo borrado del todo en la app va a la papelera de Drive (allí se puede recuperar 30 días).
  const pend = [];
  for (const id of m.driveTrash || []) {
    try { await patchMeta(id, { trashed: true }); } catch (e) { if (e instanceof AuthError) throw e; if (e.status !== 404) pend.push(id); }
  }
  m.driveTrash = pend;
  if (!errors) m.fileError = null;
}

// Espacio usado en la cuenta de Google (Drive, Gmail y Fotos comparten los mismos 15 GB gratuitos).
export async function driveQuota() {
  try {
    const q = (await api(`${DRIVE}/about?fields=storageQuota`)).storageQuota || {};
    const gb = (n) => (n / 1073741824).toFixed(1).replace('.', ',') + ' GB';
    if (!q.usage) return null;
    return { used: gb(+q.usage), limit: q.limit ? gb(+q.limit) : 'sin límite', ratio: q.limit ? +q.usage / +q.limit : 0 };
  } catch { return null; }
}

// ¿Queda algo por subir en este aparato?
export async function pendingUploads() {
  let n = 0;
  for (const f of st.alive(st.S.files)) if (!f.driveId && !f.trashed && (await blobGet('p:' + f.id))) n++;
  return n;
}

// ── Fotos y adjuntos: lectura ──
// Miniatura: la guardada en el aparato o, si falta, hecha a partir de la foto de Drive.
const urlCache = new Map();
export const thumbCached = (id) => urlCache.get(id) || null;
export async function thumbURL(f) {
  if (!f) return null;
  if (urlCache.has(f.id)) return urlCache.get(f.id);
  let blob = await blobGet('t:' + f.id);
  if (!blob && f.driveId && token() && navigator.onLine && /^image\//.test(f.mime || '')) {
    try {
      const full = await (await api(`${DRIVE}/files/${f.driveId}?alt=media`, {}, { raw: true })).blob();
      if (/tiff/.test(f.mime)) {
        const t = await readTiff(full, { maxSide: 900 });
        if (t.image) {
          const c = document.createElement('canvas');
          c.width = t.image.width; c.height = t.image.height;
          c.getContext('2d').putImageData(t.image, 0, 0);
          blob = await makeThumb(null, { alpha: true, src: c });
        }
      } else blob = await makeThumb(full, { alpha: f.kind === 'file' && keepsAlpha(f.mime, f.orig) });
      if (blob) await blobSet('t:' + f.id, blob);
    } catch (e) { console.warn('miniatura', e); }
  }
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(f.id, url);
  return url;
}
// El archivo entero: el pendiente de subir o el de Drive.
export async function fileBlob(f) {
  const local = await blobGet('p:' + f.id);
  if (local) return local;
  if (!f.driveId) return null;
  const r = await api(`${DRIVE}/files/${f.driveId}?alt=media`, {}, { raw: true });
  const b = await r.blob();
  return f.mime && b.type !== f.mime ? new Blob([b], { type: f.mime }) : b;
}

// ── Sincronización completa ──
let running = null;
let again = false;
let raceRetries = 0;   // veces seguidas que el otro aparato ha subido algo justo a la vez
export function syncNow() {
  if (running) { again = true; return running; }
  running = doSync().finally(() => {
    running = null;
    if (again) { again = false; syncNow(); }
  });
  return running;
}

async function doSync() {
  if (!configured()) return setStatus('nocfg');
  if (!navigator.onLine) return setStatus('offline');
  if (!token()) return setStatus('auth');
  setStatus('syncing');
  const m = st.meta;
  let cleared = false;   // se ha quitado la marca de «cambios por subir»…
  let uploaded = false;  // …y la subida ha terminado bien
  try {
    const folder = await ensureFolder();

    if (!m.fileId) m.fileId = await findOne(`name='${STATE_FILE}' and '${folder}' in parents and trashed=false`);
    // Comprobación rápida: si no ha cambiado nada aquí ni en Drive, no se descarga nada.
    let md5 = null;
    if (m.fileId) {
      try {
        const f = await api(`${DRIVE}/files/${m.fileId}?fields=md5Checksum,trashed`);
        if (f.trashed) m.fileId = null; else md5 = f.md5Checksum || null;
      } catch (e) {
        if (e.status === 404) m.fileId = null; else throw e;
      }
    }
    if (md5 && md5 === m.remoteMd5 && !m.dirty && !m.fileError && !backupDue() && !(m.driveTrash || []).length) {
      m.lastSync = Date.now();
      await st.saveMeta();
      setStatus('ok');
      return;
    }

    let remote = null;
    // La versión común solo vale para el mismo archivo de Drive (si cambia la carpeta o el archivo, no se usa).
    const sameFile = !!m.fileId && m.baseFileId === m.fileId;
    if (sameFile && md5 && md5 === m.baseMd5 && st.getBase()) {
      // Drive tiene justo la versión que este aparato ya incorporó: no hace falta descargarla otra vez.
      remote = st.getBase();
      m.remoteMd5 = md5;
    } else if (m.fileId) {
      try {
        remote = await api(`${DRIVE}/files/${m.fileId}?alt=media`);
        if (typeof remote === 'string') remote = JSON.parse(remote);
        m.remoteMd5 = md5;
      } catch (e) {
        if (e.status === 404) m.fileId = null;
        else throw e;
      }
      if (remote) {
        st.merge(remote, { useBase: sameFile });
        // Lo fusionado y la nueva versión común se guardan juntos en el aparato.
        m.baseFileId = m.fileId;
        await st.setBase(remote, md5);
        remote = st.getBase();
      }
    }

    // En Drive hay datos de una versión más nueva de la app: este aparato no sube nada hasta actualizarse
    // (lo cambiado aquí queda pendiente y se subirá después, juntándolo con lo del otro aparato).
    if (remote?.app && cmpVer(remote.app, VERSION) > 0) {
      sync.newer = remote.app;
      await st.saveMeta();
      st.commit({ local: false });
      return setStatus('old');
    }

    // Carpetas, fotos y adjuntos: después de fusionar, para no crear dos veces la carpeta de una obra.
    await syncFiles(folder);

    // Copias de seguridad (antes de subir, para que el otro aparato sepa cuándo fue la última).
    try {
      await runBackups();
      m.backupError = null;
    } catch (e) {
      if (e instanceof AuthError) throw e;
      m.backupError = e.message;
      console.warn('backup', e);
    }

    // Si algo cambia aquí mientras se sube, volverá a marcarse como pendiente y se subirá en la siguiente.
    m.dirty = false;
    cleared = true;
    if (st.newerThan(remote)) {
      // Justo antes de subir se comprueba que nadie haya subido nada desde que se descargó. Si el otro aparato
      // ha sincronizado entretanto, no se sube: se vuelve a empezar para juntar también su cambio.
      if (m.fileId && raceRetries < 3) {
        const chk = await api(`${DRIVE}/files/${m.fileId}?fields=md5Checksum`);
        if ((chk.md5Checksum || null) !== (m.remoteMd5 || null)) {
          raceRetries++;
          m.dirty = true;
          cleared = false;
          again = true;
          await st.saveMeta();
          return setStatus('syncing');
        }
      }
      raceRetries = 0;
      st.S.app = VERSION;
      // Cada subida lleva su identificador y el de la versión de Drive de la que parte.
      const parent = remote || null;
      st.S.parentId = parent?.syncId || null;
      st.S.syncId = st.uid();
      const body = JSON.stringify(st.S);
      if (m.fileId) {
        const r = await api(`${DRIVE_UP}/files/${m.fileId}?uploadType=media&fields=md5Checksum`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body,
        });
        m.remoteMd5 = r?.md5Checksum || null;
      } else {
        const f = await multipartCreate(
          { name: STATE_FILE, parents: [folder], mimeType: 'application/json' },
          new Blob([body], { type: 'application/json' }),
          'id,md5Checksum',
        );
        m.fileId = f.id;
        m.remoteMd5 = f.md5Checksum || null;
      }
      m.baseFileId = m.fileId;
      await st.setBase(body, m.remoteMd5, { parent });
    }
    uploaded = true;
    m.lastSync = Date.now();
    st.commit({ local: false });
    await st.saveMeta();
    setStatus('ok');
  } catch (e) {
    console.warn('sync', e);
    // Si no se llegó a subir, los cambios siguen pendientes (y no se muestra «Al día»).
    if (cleared && !uploaded) m.dirty = true;
    await st.saveMeta();
    if (e instanceof AuthError) setStatus('auth');
    else setStatus(navigator.onLine ? 'error' : 'offline', e.message);
  }
}
