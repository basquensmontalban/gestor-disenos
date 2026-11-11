// Arranque, pestañas y pantalla principal «Diseños» (galería, filtros, bandeja «Por ordenar» y «Revisar»).
import * as st from './store.js';
import * as g from './google.js';
import { D, loadDevice, setDevice, setDeviceIn, onDeviceChange } from './device.js';
import { DESTS, SELL } from './types.js';
import { thumbImg, looksLikePhoto } from './files.js';
import { openWork, currentWorkId } from './work.js';
import { quickAdd, captureNow, openInbox } from './capture.js';
import { renderSettings, welcome, whoCheck } from './settings.js';
import { renderNumbers } from './numbers.js';
import { renderSamples } from './samples.js';
import { plusOne, askFromShortcut } from './street.js';
import { exportDue, exportSheet, snoozeExport } from './exporter.js';
import { $, h, icon, badge, field, toggle, select, toast, openSheet, sheets, closeAll, nav } from './ui.js';

const TABS = { works: 'Diseños', samples: 'Muestras', nums: 'Números', set: 'Ajustes' };
const tabOn = (t) => t === 'works' || t === 'set' || D.tabs?.[t] !== false;
let tab = 'works';
let query = '';
let onlyReview = false;
let refill = null;    // vuelve a pintar solo los resultados (para no perder el foco del buscador)

// ── Búsqueda que perdona tildes y erratas ──────────────────
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
const hayCache = new Map();
function hayOf(w) {
  const c = hayCache.get(w.id);
  if (c && c.u === w.u) return c;
  const hay = st.norm([w.code, w.name, st.getType(w.type)?.name, ...(w.themes || []), ...(w.styles || []), w.collection, ...(w.tags || []), w.next, w.notes, w.descInt,
    w.review?.note, ...st.variantsOf(w.id).map((v) => `${v.code} ${v.supportName} ${v.label}`)].filter(Boolean).join(' '));
  const out = { u: w.u, hay, words: hay.split(/[^a-z0-9]+/).filter(Boolean) };
  hayCache.set(w.id, out);
  return out;
}
function matchesQuery(w, tokens) {
  if (!tokens.length) return true;
  const { hay, words } = hayOf(w);
  return tokens.every((t) => {
    if (hay.includes(t)) return true;
    if (t.length < 4) return false;
    const max = t.length >= 8 ? 2 : 1;
    return words.some((x) => lev(x.length > t.length ? x.slice(0, t.length) : x, t, max) <= max);
  });
}

// ── Filtros ────────────────────────────────────────────────
const F_KEYS = ['mine', 'author', 'state', 'dest', 'sell', 'theme', 'collection', 'tag'];
const activeFilters = () => F_KEYS.filter((k) => D.filters[k]).length + (onlyReview ? 1 : 0);
function passes(w, { type = true } = {}) {
  const f = D.filters;
  if (type && D.typeTab && w.type !== D.typeTab) return false;
  if (onlyReview && !w.review?.on && !w.imported) return false;
  if (f.mine && D.person && !(w.authors || []).includes(D.person) && !(w.owners || []).includes(D.person)) return false;
  if (f.author && !(w.authors || []).includes(f.author)) return false;
  if (f.state && w.state !== f.state) return false;
  if (f.dest && (f.dest === '-' ? !!w.dest : w.dest !== f.dest)) return false;
  if (f.sell && (w.sell || '') !== f.sell) return false;
  if (f.theme && !(w.themes || []).includes(f.theme)) return false;
  if (f.collection && w.collection !== f.collection) return false;
  if (f.tag && !(w.tags || []).includes(f.tag)) return false;
  return true;
}
const SORTS = {
  recent: (a, b) => (b.u || 0) - (a.u || 0),
  created: (a, b) => (b.c || 0) - (a.c || 0),
  code: (a, b) => String(a.code || 'ZZZ').localeCompare(String(b.code || 'ZZZ'), 'es', { numeric: true }),
  name: (a, b) => st.workTitle(a).localeCompare(st.workTitle(b), 'es'),
  asks: (a, b) => st.askCount(b.id) - st.askCount(a.id) || (b.u || 0) - (a.u || 0),
};
function visibleWorks() {
  const tokens = st.norm(query).split(/\s+/).filter(Boolean);
  return st.works().filter((w) => passes(w) && matchesQuery(w, tokens)).sort(SORTS[D.sort] || SORTS.recent);
}

function filterSheet() {
  const set = (k, v) => { setDeviceIn('filters', k, v); s.refresh(); };
  const s = openSheet('Filtros y orden', () => {
    const f = D.filters;
    const ws = st.works();
    const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    const type = st.getType(D.typeTab);
    const states = type ? type.workStates : uniq(st.types().flatMap((t) => t.workStates));
    const opt = (label, key, values) => field(label, select([['', 'Todos'], ...values], f[key] || '', { onchange: (e) => set(key, e.target.value) }));
    const wide = matchMedia('(min-width: 1000px)').matches;
    return [
      D.person ? toggle('Lo mío', !!f.mine, 'Solo las obras en las que eres autor o encargado', (on) => set('mine', on)) : null,
      toggle('Solo lo marcado «revisar»', onlyReview, null, (on) => { onlyReview = on; rerender(); }),
      st.people().length ? opt('Autor', 'author', st.people().map((p) => [p.id, p.name])) : null,
      opt('Estado', 'state', states.map((x) => [x, x])),
      opt('Destino', 'dest', [['-', 'Sin decidir'], ...DESTS.filter((d) => d[0])]),
      opt('¿La queremos vender?', 'sell', SELL),
      opt('Temática', 'theme', uniq(ws.flatMap((w) => w.themes || [])).map((x) => [x, x])),
      opt('Colección', 'collection', uniq(ws.map((w) => w.collection)).map((x) => [x, x])),
      opt('Etiqueta', 'tag', (st.S.settings.tags || []).map((x) => [x, x])),
      field('Orden', select([['recent', 'Lo último que se ha tocado'], ['created', 'Las más nuevas'], ['asks', 'Las más preguntadas en la calle'], ['code', 'Por código'], ['name', 'Por nombre']], D.sort, { onchange: (e) => setDevice({ sort: e.target.value }) })),
      wide ? field('Vista', select([['cards', 'Tarjetas'], ['table', 'Tabla']], D.view, { onchange: (e) => setDevice({ view: e.target.value }) })) : null,
      h('button', { class: 'btn block', disabled: !activeFilters(), onclick: () => { onlyReview = false; setDevice({ filters: Object.fromEntries(F_KEYS.map((k) => [k, k === 'mine' ? false : ''])) }); s.close(); } }, 'Quitar todos los filtros'),
      h('button', { class: 'btn block primary', onclick: () => s.close() }, 'Listo'),
    ];
  });
}

// ── Galería ────────────────────────────────────────────────
const destName = (d) => DESTS.find((x) => x[0] === d)?.[1] || '';
function card(w) {
  const type = st.getType(w.type);
  const cover = st.coverOf(w);
  const authors = (w.authors || []).map(st.person).filter(Boolean);
  const asks = st.askCount(w.id);
  return h('div', { class: 'wcard' + (currentWorkId() === w.id ? ' sel' : ''), role: 'button', tabindex: '0', onclick: () => openWork(w.id), onkeydown: (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) openWork(w.id); } },
    h('div', { class: 'wphoto' }, h('span', { class: 'ph' }, type?.icon || '🖼️'), cover ? thumbImg(cover) : null,
      D.askButton ? h('button', { class: 'wask' + (asks ? ' has' : ''), title: 'Me han preguntado por esta obra', 'aria-label': `Me han preguntado por ${st.workTitle(w)}${asks ? ' (' + asks + ')' : ''}`,
        onclick: (e) => { e.stopPropagation(); plusOne(w.id); } }, icon('msg'), asks ? h('b', {}, String(asks)) : null, '+1')
        : asks ? h('span', { class: 'wask has static', title: `Preguntas en la calle: ${asks}` }, icon('msg'), h('b', {}, String(asks))) : null),
    h('div', { class: 'wbar' }, authors.map((p) => h('i', { style: `background:${p.color}`, title: p.name }))),
    w.review?.on || w.imported ? h('span', { class: 'wflag', title: w.imported ? 'Importada: pendiente de revisar' : w.review.note || 'Revisar' }, icon('flag')) : null,
    h('div', { class: 'wbody' },
      h('div', { class: 'wcode' }, w.code || 'Sin código', w.dest ? badge(destName(w.dest), w.dest === 'descartada' ? 'bad' : 'ok') : badge(w.state || 'Idea')),
      h('div', { class: 'wname' }, st.workTitle(w)),
      w.next ? h('div', { class: 'wnext' }, '→ ' + w.next) : null));
}
function tableView(list) {
  return h('div', { class: 'scrollx' }, h('table', { class: 'wt' },
    h('thead', {}, h('tr', {}, ['', 'Código', 'Nombre', 'Tipo', 'Autor', 'Estado', 'Destino', '¿Vender?', 'Variantes', 'Próximo paso'].map((t) => h('th', {}, t)))),
    h('tbody', {}, list.map((w) => {
      const cover = st.coverOf(w);
      return h('tr', { onclick: () => openWork(w.id) },
        h('td', {}, cover ? [h('span', { class: 'ph' }), thumbImg(cover)] : null),
        h('td', {}, h('b', {}, w.code || '—'), w.review?.on ? ' ⚑' : ''),
        h('td', {}, st.workTitle(w)),
        h('td', {}, st.getType(w.type)?.short || ''),
        h('td', {}, st.personNames(w.authors)),
        h('td', {}, w.state || ''),
        h('td', {}, destName(w.dest)),
        h('td', {}, SELL.find((x) => x[0] === w.sell)?.[1] || ''),
        h('td', {}, st.variantsOf(w.id).map((v) => v.supportName).join(', ')),
        h('td', {}, w.next || ''));
    }))));
}

function renderWorks(main) {
  const all = st.works();
  const q = h('input', { type: 'search', placeholder: 'Buscar por nombre, código, temática…', value: query, autocomplete: 'off', enterkeyhint: 'search' });
  const results = h('div');
  const nf = activeFilters();
  const inboxN = st.inbox().length;
  const reviewN = all.filter((w) => w.review?.on || w.imported).length;
  const counted = all.filter((w) => passes(w, { type: false }));
  const typeChip = (id, text) => h('button', { class: 'chip' + ((D.typeTab || '') === id ? ' on' : ''), onclick: () => setDevice({ typeTab: id }) },
    text, h('span', { class: 'n' }, String(counted.filter((w) => !id || w.type === id).length)));

  const fill = () => {
    const list = visibleWorks();
    if (!all.length) {
      results.replaceChildren(h('div', { class: 'empty' }, icon('palette'),
        h('p', {}, h('b', {}, 'Todavía no hay ninguna obra.')),
        h('p', {}, 'Toca ＋ para crear la primera, o la cámara para guardar una foto en «Por ordenar» y completarla otro día.'),
        h('button', { class: 'btn primary', onclick: () => quickAdd() }, icon('plus'), 'Nueva obra')));
      return;
    }
    if (!list.length) {
      results.replaceChildren(h('div', { class: 'empty' }, icon('search'), h('p', {}, 'Ninguna obra coincide con lo que buscas.'),
        nf || D.typeTab || query ? h('button', { class: 'btn', onclick: () => { query = ''; onlyReview = false; setDevice({ typeTab: '', filters: Object.fromEntries(F_KEYS.map((k) => [k, k === 'mine' ? false : ''])) }); } }, 'Ver todas') : null));
      return;
    }
    const wide = matchMedia('(min-width: 1000px)').matches;
    results.replaceChildren(wide && D.view === 'table' ? tableView(list) : h('div', { class: 'gallery' }, list.map(card)));
  };
  q.addEventListener('input', () => { query = q.value; fill(); });
  refill = fill;

  main.replaceChildren(...[
    h('div', { class: 'bar' },
      h('div', { class: 'search' }, icon('search'), q),
      h('button', { class: 'icon-btn' + (nf ? ' on' : ''), 'aria-label': 'Filtros y orden', title: 'Filtros y orden', onclick: filterSheet }, icon('filter'), nf ? h('span', { class: 'dot' }) : null)),
    h('div', { class: 'chips' }, typeChip('', 'Todos'), st.types().map((t) => typeChip(t.id, `${t.icon || ''} ${t.short || t.name}`.trim()))),
    inboxN ? h('button', { class: 'strip', onclick: openInbox }, icon('inbox'), 'Por ordenar', h('small', {}, inboxN === 1 ? '1 captura' : `${inboxN} capturas`)) : null,
    reviewN || onlyReview ? h('button', { class: 'strip warn', onclick: () => { onlyReview = !onlyReview; rerender(); } }, icon('flag'),
      onlyReview ? 'Viendo solo lo marcado «revisar»' : 'Revisar', h('small', {}, onlyReview ? 'Ver todo' : String(reviewN))) : null,
    exportDue() ? h('div', { class: 'strip soft' }, icon('shield'), h('span', {}, 'Toca hacer la copia completa fuera de Google'),
      h('button', { class: 'linkbtn', onclick: exportSheet }, 'Hacerla'), h('button', { class: 'linkbtn', onclick: () => { snoozeExport(7); rerender(); } }, 'Más tarde')) : null,
    results].filter(Boolean));
  fill();
}

// ── Pestañas ───────────────────────────────────────────────
function render() {
  const main = $('#main');
  $('#title').textContent = TABS[tab];
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach((b) => { b.hidden = !tabOn(b.dataset.tab); });
  $('#fabAdd').hidden = $('#fabCam').hidden = tab !== 'works';
  refill = null;
  if (tab === 'works') renderWorks(main);
  else if (tab === 'samples') renderSamples(main);
  else if (tab === 'nums') renderNumbers(main);
  else renderSettings(main);
}
function rerender() {
  // Las pestañas visibles se ponen al día siempre (aunque se esté tocando un interruptor de Ajustes).
  document.querySelectorAll('.tab').forEach((b) => { b.hidden = !tabOn(b.dataset.tab); });
  if (!tabOn(tab)) { setTab('works'); return; }
  const a = document.activeElement;
  const typing = $('#main').contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName);
  if (typing) { if (tab === 'works' && refill) refill(); }
  else render();
  sheets.filter((s) => s.live).forEach((s) => s.refresh());
}
function setTab(t) {
  tab = tabOn(t) ? t : 'works';
  closeAll();
  render();
  scrollTo(0, 0);
}

// ── Estado de sincronización ───────────────────────────────
let oldWarned = false;
async function updateApp(reload) {
  try { await (await navigator.serviceWorker?.getRegistration())?.update(); } catch {}
  if (reload) { await st.flush(); setTimeout(() => location.reload(), 600); }
}
function renderPill() {
  const p = $('#syncPill');
  const map = {
    nocfg: ['Sin configurar', 'warn'], auth: ['Conectar', 'warn'], offline: ['Sin conexión', ''],
    syncing: ['Sincronizando', 'busy'], ok: [st.meta.dirty ? 'Pendiente' : 'Al día', 'ok'], error: ['Error', 'bad'], idle: ['…', ''],
    old: ['Actualiza la app', 'warn'],
  };
  if (g.sync.status === 'old' && !oldWarned) {
    oldWarned = true;
    updateApp(false);
    toast(`El otro aparato ya usa la versión ${g.sync.newer}. Actualiza esta para seguir sincronizando (no se pierde nada).`, { action: 'Actualizar', ms: 12000, onAction: () => updateApp(true) });
  }
  const [txt, cls] = map[g.sync.status] || map.idle;
  p.textContent = txt;
  p.className = 'pill ' + cls;
  const a = document.activeElement;
  if (tab === 'set' && !($('#main').contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName))) renderSettings($('#main'));
}

let syncTimer;
function scheduleSync(ms = 2500) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => g.syncNow(), ms);
}

// El permiso de Google dura una hora. Al caducar, se renueva solo (la app va a Google y vuelve en un momento).
// Con la app abierta solo se hace si no estáis tocando nada: ni escribiendo ni con una hoja abierta.
let lastTouch = Date.now();
function maybeSilentLogin({ whileOpen = false } = {}) {
  if (!g.configured() || g.token() || !g.everConnected() || !navigator.onLine) return false;
  if (localStorage.getItem('auto_reconnect') === '0') return false;
  if (sheets.some((s) => !s.side)) return false;
  if (Date.now() - (+localStorage.getItem('last_silent') || 0) < 10 * 60000) return false;
  if (whileOpen) {
    if (Date.now() - lastTouch < 45e3 || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) return false;
    // Si la última vez Google pidió que tocarais «Conectar», no se insiste con la app abierta.
    if (Date.now() - (+localStorage.getItem('silent_failed') || 0) < 6 * 3600e3) return false;
  }
  localStorage.setItem('last_silent', String(Date.now()));
  sessionStorage.setItem('return_tab', tab);
  if (currentWorkId()) sessionStorage.setItem('return_work', currentWorkId());
  st.flush().finally(() => g.login({ silent: true }));
  return true;
}

// ── Arranque ───────────────────────────────────────────────
function applyChrome() {
  const root = document.documentElement;
  if (D.theme === 'light' || D.theme === 'dark') root.dataset.theme = D.theme; else delete root.dataset.theme;
  const dark = D.theme === 'dark' || (D.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]').content = dark ? '#171614' : '#b4532a';
  document.body.style.zoom = String(+D.fontScale || 1);
  document.body.dataset.cards = D.cardSize || 'm';
  st.setActor(D.person && st.person(D.person) ? D.person : null);
}

// Accesos directos del icono de la app: …/?accion=nueva, …/?accion=ordenar y …/?accion=pregunta
function handleUrlActions() {
  const q = new URLSearchParams(location.search);
  const action = q.get('accion');
  if (!action) return;
  history.replaceState(null, '', location.pathname);
  if (action === 'nueva') setTimeout(() => quickAdd(), 300);
  if (action === 'ordenar') setTimeout(openInbox, 300);
  if (action === 'pregunta') setTimeout(askFromShortcut, 300);
}

Object.assign(nav, { render, rerender, setTab, openWork, scheduleSync, applyChrome });

async function start() {
  const res = g.handleRedirect();
  await st.load();
  await loadDevice();
  const back = sessionStorage.getItem('return_tab');
  const backWork = sessionStorage.getItem('return_work');
  sessionStorage.removeItem('return_tab');
  sessionStorage.removeItem('return_work');
  if (res && back && TABS[back] && tabOn(back)) tab = back;
  if (res?.ok) localStorage.removeItem('silent_failed');
  else if (res?.error && /required/.test(res.error)) localStorage.setItem('silent_failed', String(Date.now()));

  const names = { works: ['grid', 'Diseños'], samples: ['shirt', 'Muestras'], nums: ['table', 'Números'], set: ['gear', 'Ajustes'] };
  document.querySelectorAll('.tab').forEach((b) => { b.append(icon(names[b.dataset.tab][0]), names[b.dataset.tab][1]); b.onclick = () => setTab(b.dataset.tab); });
  $('#fabAdd').append(icon('plus'));
  $('#fabAdd').onclick = () => quickAdd();
  $('#fabCam').append(icon('camera'));
  $('#fabCam').onclick = () => captureNow();
  $('#syncPill').onclick = () => {
    if (g.sync.status === 'nocfg') setTab('set');
    else if (g.sync.status === 'old') updateApp(true);
    else if (g.sync.status === 'auth') g.login();
    else g.syncNow();
  };

  applyChrome();
  st.onChange(({ local }) => { rerender(); if (local) scheduleSync(); });
  onDeviceChange(() => { applyChrome(); rerender(); scheduleSync(); });
  g.onStatus(renderPill);
  render();
  renderPill();
  if (res && backWork) openWork(backWork);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

  if (res?.ok) toast('Conectado con Google');
  else if (res?.error && res.error !== 'state') {
    if (/required/.test(res.error)) toast('Toca «Conectar» para volver a sincronizar');
    else if (res.error !== 'access_denied') toast('No se pudo conectar: ' + res.error);
  }
  handleUrlActions();
  if (!res && maybeSilentLogin()) return;

  // Primera vez: conectar y decir quién usa este aparato (después de sincronizar, por si las personas ya están en Drive).
  if (!welcome()) g.syncNow().finally(() => whoCheck());

  addEventListener('online', () => g.syncNow());
  addEventListener('offline', () => g.syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') { st.flush(); return; }
    if (!maybeSilentLogin()) g.syncNow();
  });
  addEventListener('pagehide', () => { st.flush(); });
  // Con la app a la vista se comprueba cada minuto si el otro aparato ha cambiado algo (solo descarga si hay cambios).
  let lastAuto = Date.now();
  for (const ev of ['pointerdown', 'keydown', 'scroll']) addEventListener(ev, () => { lastTouch = Date.now(); }, { capture: true, passive: true });
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (!g.token() && maybeSilentLogin({ whileOpen: true })) return;
    if (Date.now() - lastAuto >= 60e3) { lastAuto = Date.now(); g.syncNow(); }
  }, 5000);

  // En el ordenador: soltar fotos sobre la galería abre el alta rápida con ellas.
  const main = $('#main');
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  main.addEventListener('dragover', (e) => { if (tab === 'works' && hasFiles(e)) { e.preventDefault(); main.classList.add('drop-on'); } });
  main.addEventListener('dragleave', (e) => { if (!main.contains(e.relatedTarget)) main.classList.remove('drop-on'); });
  main.addEventListener('drop', (e) => {
    if (tab !== 'works' || !hasFiles(e)) return;
    e.preventDefault();
    main.classList.remove('drop-on');
    const files = [...e.dataTransfer.files];
    const photos = files.filter((f) => looksLikePhoto(f) || /^image\/png$/.test(f.type));
    if (photos.length) quickAdd({ files: photos });
    if (photos.length < files.length) toast('Los archivos que no son fotos (SVG, PDF, STL…) se arrastran sobre la ficha de su obra.', { ms: 6000 });
  });
}

start();
