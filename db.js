// Almacenamiento local (IndexedDB): datos, miniaturas y archivos pendientes de subir, guardados en el propio aparato.
const DB_NAME = 'gestor-disenos';
let dbp;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  return dbp;
}

async function run(store, mode, fn) {
  const d = await open();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const kvGet = (k) => run('kv', 'readonly', (s) => s.get(k));
export const kvSet = (k, v) => run('kv', 'readwrite', (s) => s.put(v, k));
// Varias claves en una sola operación: o se guardan todas o ninguna.
export const kvSetMany = (obj) => run('kv', 'readwrite', (s) => { for (const [k, v] of Object.entries(obj)) s.put(v, k); });
// Blobs: «t:<id>» miniatura (se conserva) y «p:<id>» archivo pendiente de subir a Drive (se borra al subirlo).
export const blobGet = (k) => run('blobs', 'readonly', (s) => s.get(k));
export const blobSet = (k, v) => run('blobs', 'readwrite', (s) => s.put(v, k));
export const blobDel = (k) => run('blobs', 'readwrite', (s) => s.delete(k));
export const blobKeys = () => run('blobs', 'readonly', (s) => s.getAllKeys());
