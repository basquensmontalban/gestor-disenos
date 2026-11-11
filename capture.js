// Alta rápida, captura directa, alta en serie y bandeja «Por ordenar».
import * as st from './store.js';
import { D, setDevice } from './device.js';
import { addPhotos, thumbImg } from './files.js';
import { openWork } from './work.js';
import { h, icon, field, inp, toggle, toast, openSheet, confirmSheet, pickFiles, chips, fmtDateTime, nav } from './ui.js';

// Foto directa a «Por ordenar»: un toque, sin elegir nada.
export async function captureNow() {
  const files = await pickFiles('image/*', { capture: true });
  if (!files.length) return;
  const e = st.addInbox('');
  const ok = await addPhotos(files, { inboxId: e.id });
  if (!ok) { st.deleteInbox(e.id); return; }
  toast('Guardada en «Por ordenar»', { action: 'Ordenar ahora', onAction: openInbox });
}

// Alta rápida. Con solo una foto (o una línea de texto) ya se puede guardar: va a «Por ordenar».
// Con nombre y tipo, la obra queda creada del todo. Si viene de una captura (inboxId), la convierte en obra.
export function quickAdd({ inboxId = null, files: initial = [] } = {}) {
  const entry = inboxId ? st.S.inbox[inboxId] : null;
  let files = [...initial];
  let name = '';
  let note = entry?.text || '';
  let typeId = st.getType(D.lastType) ? D.lastType : st.types()[0]?.id || '';
  let origin = D.lastOrigin || 'Digital';
  let serie = false;
  const urls = new Map();
  const urlOf = (f) => { if (!urls.has(f)) urls.set(f, URL.createObjectURL(f)); return urls.get(f); };

  const pick = async (capture) => {
    const got = await pickFiles('image/*', { multiple: !capture, capture });
    if (!got.length) return;
    files = [...files, ...got];
    s.refresh();
  };

  async function saveAll() {
    const type = st.getType(typeId);
    const fields = type?.letterBy ? { [type.letterBy.field]: origin } : {};
    const existing = inboxId ? st.inboxPhotos(inboxId).length : 0;
    if (!files.length && !existing && !name && !note) return toast('Añade una foto o escribe algo');
    if (type) setDevice({ lastType: typeId, lastOrigin: origin }, { quiet: true });
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    if (serie && type && files.length > 1) {
      // Alta en serie: una obra por foto, con el nombre pendiente.
      for (const f of files) {
        const w = st.createWork({ type: typeId, fields, review: { on: true, note: 'Falta el nombre' } });
        await addPhotos([f], { workId: w.id });
      }
      s.close();
      toast(`${files.length} obras creadas. Están en «Revisar» para ponerles nombre.`);
      return;
    }
    if (name && type) {
      const w = st.createWork({ name, type: typeId, fields, notes: inboxId ? '' : note });
      if (inboxId) st.resolveInbox(inboxId, w.id);
      await addPhotos(files, { workId: w.id });
      s.close();
      toast(`Obra creada: ${w.code}`);
      openWork(w.id);
      return;
    }
    // Sin nombre o sin tipo: a «Por ordenar».
    if (inboxId) {
      st.updateInbox(inboxId, { text: [name, note].filter(Boolean).join(' · ') });
      await addPhotos(files, { inboxId });
    } else {
      const e = st.addInbox([name, note].filter(Boolean).join(' · '));
      await addPhotos(files, { inboxId: e.id });
    }
    s.close();
    toast('Guardado en «Por ordenar»', inboxId ? {} : { action: 'Ver', onAction: openInbox });
  }

  let btn;
  const label = () => {
    const type = st.getType(typeId);
    if (serie && type && files.length > 1) return `Crear ${files.length} obras`;
    if (name && type) return 'Crear obra';
    return 'Guardar en «Por ordenar»';
  };
  const relabel = () => { if (btn) btn.textContent = label(); };

  const s = openSheet(inboxId ? 'Convertir en obra' : 'Nueva obra', () => {
    const type = st.getType(typeId);
    const nameI = inp({ value: name, placeholder: 'Nombre (opcional)', enterkeyhint: 'done' });
    nameI.addEventListener('input', () => { name = nameI.value.trim(); relabel(); });
    const noteI = inp({ value: note, placeholder: 'Una línea de texto (opcional)' });
    noteI.addEventListener('input', () => { note = noteI.value.trim(); });
    btn = h('button', { class: 'btn primary block', onclick: saveAll }, label());
    const olds = inboxId ? st.inboxPhotos(inboxId) : [];
    return [
      h('div', { class: 'shots' },
        olds.map((f) => h('div', { class: 'pth' }, h('span', { class: 'ph' }, icon('image')), thumbImg(f))),
        files.map((f) => h('button', { class: 'pth', title: 'Quitar', onclick: () => { files = files.filter((x) => x !== f); s.refresh(); } }, h('img', { src: urlOf(f), alt: '' }))),
        h('button', { class: 'pth add', onclick: () => pick(true) }, icon('camera'), 'Cámara'),
        h('button', { class: 'pth add', onclick: () => pick(false) }, icon('images'), 'Galería')),
      field('Nombre', nameI),
      field('Tipo', chips(st.types().map((t) => [t.id, `${t.icon || ''} ${t.short || t.name}`.trim()]), typeId, (v) => { typeId = v; s.refresh(); })),
      type?.letterBy ? field('Origen', chips(Object.keys(type.letterBy.map), origin, (v) => { origin = v; }, { allowNone: false }), 'Decide la letra del código: D digital, A acuarela, I otro') : null,
      entry || note ? field('Texto', noteI) : null,
      files.length > 1 && !inboxId ? toggle('Una obra por foto', serie, 'Alta en serie: para documentar de golpe piezas que ya tenéis', (on) => { serie = on; relabel(); }) : null,
      btn,
      h('p', { class: 'hint', style: 'text-align:center;margin-top:8px' }, 'Con solo la foto ya vale: se queda en «Por ordenar» y la completáis otro día.'),
    ];
  });
}

// Bandeja «Por ordenar».
export function openInbox() {
  const s = openSheet('Por ordenar', () => {
    const list = st.inbox();
    if (!list.length) return h('div', { class: 'empty' }, icon('inbox'), h('p', {}, 'No hay nada por ordenar.'));
    return [
      h('p', { class: 'muted' }, 'Capturas sin clasificar. Conviértelas en obra, añádelas a una que ya exista o déjalas para otro día.'),
      list.map((e) => {
        const ph = st.inboxPhotos(e.id);
        const text = inp({ value: e.text || '', placeholder: 'Añadir una nota…' });
        text.addEventListener('change', () => st.updateInbox(e.id, { text: text.value.trim() }));
        return h('div', { class: 'ibox' },
          ph[0] ? h('div', { style: 'position:relative;flex:none' }, h('span', { class: 'ph' }), thumbImg(ph[0]), ph.length > 1 ? h('span', { class: 'badge', style: 'position:absolute;right:4px;bottom:4px' }, '+' + (ph.length - 1)) : null) : null,
          h('div', { class: 'row-main' },
            text,
            h('div', { class: 'row-sub', style: 'margin-top:4px' }, fmtDateTime(e.c), st.person(e.by) ? ' · ' + st.person(e.by).name : ''),
            h('div', { class: 'btn-row' },
              h('button', { class: 'btn small primary', onclick: () => { s.close(); quickAdd({ inboxId: e.id }); } }, 'Crear obra'),
              h('button', { class: 'btn small', onclick: () => pickWork('Añadir a…', (wid) => { st.resolveInbox(e.id, wid); toast('Añadido a ' + (st.getWork(wid)?.code || 'la obra')); s.refresh(); }) }, 'Añadir a una obra'),
              h('button', { class: 'btn small danger', 'aria-label': 'Borrar', onclick: async () => { if (await confirmSheet('¿Borrar esta captura?', '', { ok: 'Borrar', danger: true })) { st.deleteInbox(e.id); s.refresh(); } } }, icon('trash')))));
      }),
    ];
  }, { onClose: () => nav.rerender?.() });
}

// Elegir una obra de la lista (con buscador).
export function pickWork(title, onPick, { photos = false, sort = null } = {}) {
  const q = h('input', { type: 'search', placeholder: 'Buscar obra…', autocomplete: 'off' });
  const box = h('div', { class: 'list' });
  const fill = () => {
    const t = st.norm(q.value);
    const arr = st.works().filter((w) => !t || st.norm(`${w.code} ${w.name} ${(w.themes || []).join(' ')}`).includes(t)).sort(sort || ((a, b) => (b.u || 0) - (a.u || 0))).slice(0, 60);
    box.replaceChildren(...arr.map((w) => h('button', { class: 'row', onclick: () => { s.close(); onPick(w.id); } },
      photos ? h('span', { class: 'ficon big' }, h('span', { class: 'ph' }, st.getType(w.type)?.icon || ''), st.coverOf(w) ? thumbImg(st.coverOf(w)) : null) : null,
      h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, w.code || '—', ' · ', st.workTitle(w)), h('div', { class: 'row-sub' }, st.getType(w.type)?.name || '')))));
    if (!arr.length) box.replaceChildren(h('p', { class: 'muted' }, 'Ninguna obra coincide.'));
  };
  q.addEventListener('input', fill);
  const s = openSheet(title, () => [h('div', { class: 'search', style: 'margin-bottom:10px' }, icon('search'), q), box]);
  fill();
}
