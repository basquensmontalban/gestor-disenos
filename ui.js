// Piezas de interfaz comunes: creación de elementos, iconos, hojas inferiores, avisos breves.
export const $ = (s, r = document) => r.querySelector(s);

// Funciones de navegación que rellena app.js (render, openWork, …) para evitar dependencias circulares.
export const nav = {};

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (['value', 'checked', 'selected', 'disabled'].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}

// Sustituye el contenido de un elemento (admite listas anidadas y huecos nulos, como h).
export function setKids(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  return el;
}

const SVG = (d, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  gear: SVG('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  plus: SVG('<path d="M12 5v14M5 12h14"/>', 2.4),
  minus: SVG('<path d="M5 12h14"/>', 2.4),
  x: SVG('<path d="M6 6l12 12M18 6L6 18"/>', 2.2),
  search: SVG('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  edit: SVG('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  check: SVG('<path d="M5 12l5 5L20 7"/>', 3),
  camera: SVG('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>'),
  copy: SVG('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  download: SVG('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>'),
  shield: SVG('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  image: SVG('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'),
  images: SVG('<rect x="7" y="3" width="14" height="14" rx="2"/><path d="M3 7v12a2 2 0 0 0 2 2h12"/><path d="M21 13l-3.5-3.5L10 17"/>'),
  file: SVG('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>'),
  trash: SVG('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'),
  history: SVG('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>'),
  flag: SVG('<path d="M4 22V4"/><path d="M4 4h13l-2 4 2 4H4"/>'),
  grid: SVG('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  table: SVG('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>'),
  filter: SVG('<path d="M3 5h18l-7 8v6l-4-2v-4z"/>'),
  inbox: SVG('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>'),
  palette: SVG('<path d="M12 22a10 10 0 1 1 10-10c0 3-2.5 4-4.5 4H15a2 2 0 0 0-1.5 3.3c.6.7.2 2.7-1.5 2.7z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15.5" cy="7.5" r="1"/>'),
  star: SVG('<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>'),
  chevron: SVG('<path d="M9 6l6 6-6 6"/>', 2.2),
  link: SVG('<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'),
  shirt: SVG('<path d="M8 3l-5 3 2 4 3-1v12h8V9l3 1 2-4-5-3c0 2-2 3-4 3S8 5 8 3z"/>'),
  msg: SVG('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'),
  cloud: SVG('<path d="M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.7 1.5A4 4 0 0 0 7 19z"/>'),
};
export const icon = (name) => h('span', { class: 'ic', html: ICONS[name] });
export const badge = (text, cls = '') => h('span', { class: 'badge ' + cls }, text);
export const hue = (s) => [...String(s || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
export const num = (v) => (v === '' || v === null || v === undefined ? null : +String(v).replace(',', '.'));

export function field(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), control, hint ? h('small', { class: 'hint' }, hint) : null);
}
export const inp = (props) => h('input', { class: 'inp', ...props });
export function toggle(label, checked, sub, onchange) {
  const cb = h('input', { type: 'checkbox', checked });
  if (onchange) cb.addEventListener('change', () => onchange(cb.checked));
  const el = h('label', { class: 'toggle' }, h('span', {}, label, sub ? h('small', {}, sub) : null), cb, h('span', { class: 'sw' }));
  el.cb = cb;
  return el;
}
export function select(options, value, props = {}) {
  return h('select', { class: 'inp', ...props }, options.map(([v, t]) => h('option', { value: v, selected: String(v) === String(value ?? '') }, t)));
}
export const numInput = (value, props = {}) => inp({ type: 'text', inputmode: 'decimal', value: value ?? '', ...props });
export const indent = (depth) => '   '.repeat(depth) + (depth ? '› ' : '');

export function toast(msg, { action, onAction, ms = 3800 } = {}) {
  const t = h('div', { class: 'toast' }, h('span', {}, msg),
    action ? h('button', { onclick: () => { onAction(); t.remove(); } }, action) : null);
  const box = $('#toasts');
  while (box.children.length >= 2) box.firstElementChild.remove();
  box.append(t);
  setTimeout(() => t.remove(), ms);
}

export const fmtDateTime = (ts) => new Date(ts).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: 'position:fixed;top:0;opacity:0' }, text);
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    ta.remove();
    return ok;
  }
}

export function download(name, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
}

// Elegir archivos. capture=true abre la cámara directamente en el móvil.
export function pickFiles(accept, { multiple = false, capture = false } = {}) {
  return new Promise((resolve) => {
    const f = h('input', { type: 'file', accept, hidden: true, multiple, capture: capture ? 'environment' : null });
    f.addEventListener('change', () => { resolve([...f.files]); f.remove(); });
    f.addEventListener('cancel', () => { resolve([]); f.remove(); });
    document.body.append(f);
    f.click();
  });
}
export const pickFile = async (accept) => (await pickFiles(accept))[0] || null;

// ── Hojas inferiores (con botón «atrás» de Android) ────────
export const sheets = [];
let ignorePop = 0;
export function openSheet(title, render, { live = false, side = false, onClose = null } = {}) {
  const body = h('div', { class: 'sheet-body' });
  const titleEl = h('h2', {}, title);
  const s = {
    body, live, side, title: titleEl, head: null,
    refresh() {
      const out = render(s);
      if (out === null) return;
      const st0 = body.scrollTop;
      body.replaceChildren(...[].concat(out).flat(Infinity).filter(Boolean));
      body.scrollTop = st0;
    },
    close(fromPop) {
      const i = sheets.indexOf(s);
      if (i < 0) return;
      sheets.splice(i, 1);
      back.classList.remove('open');
      if (side) document.body.classList.toggle('has-side', sheets.some((x) => x.side));
      if (onClose) onClose();
      setTimeout(() => back.remove(), 230);
      if (!fromPop) {
        setTimeout(() => {
          if (!sheets.length && history.state?.sheet) { ignorePop++; history.back(); }
        }, 0);
      }
    },
  };
  const panel = h('div', { class: 'sheet', role: 'dialog' },
    h('div', { class: 'sheet-head' }, titleEl, h('button', { class: 'icon-btn', 'aria-label': 'Cerrar', onclick: () => s.close() }, icon('x'))),
    body);
  s.head = panel.firstElementChild;
  const back = h('div', { class: 'backdrop' + (side ? ' side' : '') }, panel);
  if (side) document.body.classList.add('has-side');
  back.addEventListener('click', (e) => { if (e.target === back) s.close(); });
  if (!sheets.length && !history.state?.sheet) history.pushState({ sheet: 1 }, '');
  sheets.push(s);
  s.refresh();
  document.body.append(back);
  requestAnimationFrame(() => requestAnimationFrame(() => back.classList.add('open')));
  return s;
}
addEventListener('popstate', () => {
  if (ignorePop) { ignorePop--; return; }
  const s = sheets[sheets.length - 1];
  if (s) {
    s.close(true);
    if (sheets.length) history.pushState({ sheet: 1 }, '');
  }
});
export const closeAll = () => [...sheets].reverse().forEach((s) => s.close());

// Confirmación sencilla en una hoja. Devuelve true si se acepta.
export function confirmSheet(title, text, { ok = 'Aceptar', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const s = openSheet(title, () => [
      text ? h('p', { class: 'muted' }, text) : null,
      h('button', { class: 'btn block ' + (danger ? 'danger' : 'primary'), onclick: () => { done = true; s.close(); resolve(true); } }, ok),
      h('button', { class: 'btn block', onclick: () => s.close() }, 'Cancelar'),
    ], { onClose: () => { if (!done) resolve(false); } });
  });
}

// Grupo de botones para elegir uno (o varios con multi). options: [[valor, texto]] o [valor].
export function chips(options, value, onChange, { multi = false, allowNone = true } = {}) {
  const box = h('div', { class: 'chipset' });
  let cur = multi ? [...(value || [])] : value;
  const draw = () => box.replaceChildren(...options.map((o) => {
    const [v, text, color] = Array.isArray(o) ? o : [o, o];
    const on = multi ? cur.includes(v) : cur === v;
    return h('button', {
      type: 'button', class: 'chip' + (on ? ' on' : ''), style: color && on ? `background:${color};border-color:${color};color:#fff` : color ? `border-color:${color}` : null,
      onclick: () => {
        if (multi) cur = on ? cur.filter((x) => x !== v) : [...cur, v];
        else cur = on && allowNone ? '' : v;
        draw();
        onChange(cur);
      },
    }, text);
  }));
  draw();
  return box;
}

// Campo de texto con sugerencias (lo que ya habéis escrito antes).
let dlN = 0;
export function suggestInput(value, options, onChange, props = {}) {
  const id = 'dl-' + (++dlN);
  const i = inp({ value: value ?? '', list: id, autocomplete: 'off', ...props });
  i.addEventListener('change', () => onChange(i.value.trim()));
  const wrap = h('div', {}, i, h('datalist', { id }, options.map((o) => h('option', { value: o }))));
  wrap.input = i;
  return wrap;
}

// Varios valores con sugerencias (temática, estilo): se añaden con Intro o coma y se quitan con un toque.
export function tagsInput(values, options, onChange, placeholder = 'Añadir…') {
  let cur = [...(values || [])];
  const id = 'dl-' + (++dlN);
  const box = h('div', { class: 'tags-inp' });
  const i = h('input', { list: id, placeholder, autocomplete: 'off', enterkeyhint: 'done' });
  const add = () => {
    const parts = i.value.split(',').map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return;
    // Si ya existe escrito de otra forma («Gres» / «gres»), se usa la que ya había.
    const canon = (x) => [...cur, ...options].find((o) => o.toLowerCase() === x.toLowerCase()) || x;
    cur = [...new Set([...cur, ...parts.map(canon)])];
    i.value = '';
    draw();
    onChange(cur);
  };
  i.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } else if (e.key === 'Backspace' && !i.value && cur.length) { cur = cur.slice(0, -1); draw(); onChange(cur); } });
  i.addEventListener('change', add);
  i.addEventListener('blur', add);
  const dl = h('datalist', { id });
  const draw = () => {
    dl.replaceChildren(...options.filter((o) => !cur.includes(o)).map((o) => h('option', { value: o })));
    box.replaceChildren(...cur.map((v) => h('button', { type: 'button', class: 'tag', title: 'Quitar', onclick: () => { cur = cur.filter((x) => x !== v); draw(); onChange(cur); } }, v, h('span', { class: 'tag-x' }, '×'))), i, dl);
  };
  draw();
  return box;
}
