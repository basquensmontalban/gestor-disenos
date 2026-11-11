// Copias de seguridad: automáticas en Drive y configuración de cada aparato.
import * as st from './store.js';
import { D } from './device.js';
import { DRIVE, DRIVE_UP, api, multipartCreate, findOrCreateFolder, ensureFolder, AuthError } from './google.js';

const BACKUP_FOLDER = 'Copias de seguridad';
const APP = 'gestor-disenos';

export const REASONS = {
  auto: 'Automática',
  manual: 'Hecha a mano',
  'antes-de-actualizar': 'Antes de actualizar la app',
  'antes-de-restaurar': 'Antes de restaurar otra copia',
};

export async function backupFolder() {
  const m = st.meta;
  if (m.backupFolderId) {
    try {
      const f = await api(`${DRIVE}/files/${m.backupFolderId}?fields=id,trashed`);
      if (!f.trashed) return m.backupFolderId;
    } catch (e) {
      if (e instanceof AuthError) throw e;
    }
  }
  m.backupFolderId = await findOrCreateFolder(BACKUP_FOLDER, await ensureFolder());
  m.deviceFileId = null;
  return m.backupFolderId;
}

function stamp(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${st.ymd(d)}_${z(d.getHours())}${z(d.getMinutes())}`;
}

export function wrap(data, reason) {
  return { app: APP, kind: 'backup', schema: data.v || 1, createdAt: new Date().toISOString(), device: D?.name || '', reason, data };
}

// Acepta una copia (formato con envoltorio) o un estado suelto.
export function unwrap(j) {
  if (j?.app === APP && j?.kind === 'backup' && j.data?.works) return j.data;
  if (j?.works && j?.settings) return j;
  throw new Error('No es una copia de esta app');
}

export async function createBackup(reason = 'auto', data = st.S) {
  const folder = await backupFolder();
  const prefix = reason === 'auto' ? 'copia' : 'copia-' + reason;
  const name = `${prefix}-${stamp()}.json`;
  await multipartCreate(
    { name, parents: [folder], mimeType: 'application/json', description: `${REASONS[reason] || reason} · ${D?.name || ''}` },
    new Blob([JSON.stringify(wrap(data, reason))], { type: 'application/json' }),
  );
  if (data === st.S) st.S.backupInfo = { last: Date.now(), by: D?.name || '', u: Date.now() };
  return name;
}

export async function listBackupFolder() {
  const folder = await backupFolder();
  const files = [];
  let pageToken;
  do {
    const q = new URLSearchParams({
      q: `'${folder}' in parents and trashed=false`,
      fields: 'nextPageToken,files(id,name,createdTime,modifiedTime,size,description,mimeType)',
      orderBy: 'createdTime desc',
      pageSize: '200',
    });
    if (pageToken) q.set('pageToken', pageToken);
    const r = await api(`${DRIVE}/files?` + q);
    files.push(...(r.files || []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return files;
}

export async function readJSONFile(id) {
  const r = await api(`${DRIVE}/files/${id}?alt=media`);
  return typeof r === 'string' ? JSON.parse(r) : r;
}

// Conserva las N copias automáticas más recientes y la primera de cada mes (para siempre).
// Las copias hechas a mano y las especiales no se borran nunca. Lo que sobra va a la papelera de Drive.
async function prune() {
  const keep = +st.S.settings.backupKeep || 30;
  const files = (await listBackupFolder()).filter((f) => /^copia-\d{4}-\d{2}-\d{2}_/.test(f.name));
  const keepIds = new Set(files.slice(0, keep).map((f) => f.id));
  const months = new Set();
  [...files].reverse().forEach((f) => {
    const m = f.name.slice(6, 13);
    if (!months.has(m)) { months.add(m); keepIds.add(f.id); }
  });
  for (const f of files) {
    if (keepIds.has(f.id)) continue;
    await api(`${DRIVE}/files/${f.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
  }
}

const hasData = () => Object.keys(st.S.works).length > 0 || Object.keys(st.S.inbox).length > 0;

// ¿Hay alguna copia pendiente de hacer?
export function backupDue() {
  const m = st.meta;
  const every = (+st.S.settings.backupEveryDays || 1) * 864e5;
  return (D.u || 0) > (m.deviceSavedAt || 0) || (hasData() && Date.now() - (st.S.backupInfo?.last || 0) >= every - 3600e3);
}

// Se llama en cada sincronización.
export async function runBackups() {
  const m = st.meta;
  if ((D.u || 0) > (m.deviceSavedAt || 0)) await saveDeviceConfig();
  const every = (+st.S.settings.backupEveryDays || 1) * 864e5;
  if (hasData() && Date.now() - (st.S.backupInfo?.last || 0) >= every - 3600e3) {
    await createBackup('auto');
    await prune();
  }
}

// ── Configuración de cada aparato ──
export async function saveDeviceConfig() {
  const m = st.meta;
  const folder = await backupFolder();
  const body = JSON.stringify({ app: APP, kind: 'device-settings', savedAt: new Date().toISOString(), device: D.name, settings: D });
  if (m.deviceFileId) {
    try {
      await api(`${DRIVE_UP}/files/${m.deviceFileId}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
    } catch (e) {
      if (e instanceof AuthError) throw e;
      if (e.status === 404) m.deviceFileId = null; else throw e;
    }
  }
  if (!m.deviceFileId) {
    const f = await multipartCreate(
      { name: `ajustes-aparato-${D.id}.json`, parents: [folder], mimeType: 'application/json', description: D.name },
      new Blob([body], { type: 'application/json' }),
    );
    m.deviceFileId = f.id;
  }
  m.deviceSavedAt = Date.now();
}
