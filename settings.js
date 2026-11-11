// Ajustes: cuenta, este aparato, personas, listas, números, fotos, copias de seguridad y papelera.
import * as st from './store.js';
import * as g from './google.js';
import { D, setDevice, setDeviceIn, resetDevice } from './device.js';
import { VERSION } from './version.js';
import { cfg, putCfg, printSupports } from './checks.js';
import { exportAsksCsv } from './street.js';
import { previewPack, editType, PACK_KIND } from './packs.js';
import { reviewImport, WORKS_KIND } from './importer.js';
import { exportSheet, catalogSheet, shopSheet, exportInfo } from './exporter.js';
import { createBackup, listBackupFolder, readJSONFile, unwrap, wrap, REASONS } from './backup.js';
import { h, icon, field, inp, numInput, num, toggle, select, toast, openSheet, confirmSheet, pickFile, download, fmtDateTime, nav } from './ui.js';

const card = (title, ...kids) => h('div', { class: 'card' }, h('h3', {}, title), kids);

export function renderSettings(main) {
  const S = st.S.settings;
  const m = st.meta;
  const status = g.sync.status;
  const dSel = (label, opts, key, hint) => field(label, select(opts, D[key], { onchange: (e) => setDevice({ [key]: isNaN(+e.target.value) || e.target.value === '' ? e.target.value : +e.target.value }) }), hint);
  const sSel = (label, opts, key, hint) => field(label, select(opts, S[key], { onchange: (e) => st.putSettings({ [key]: +e.target.value }) }), hint);
  const listEdit = (label, key, hint) => {
    const t = inp({ value: (S[key] || []).join(', ') });
    t.addEventListener('change', () => st.putSettings({ [key]: [...new Set(t.value.split(',').map((x) => x.trim()).filter(Boolean))] }));
    return field(label, t, hint);
  };
  const rate = numInput(S.hourRate);
  rate.addEventListener('change', () => { const n = num(rate.value); st.putSettings({ hourRate: n === null || isNaN(n) ? null : n }); });
  const devName = inp({ value: D.name || '' });
  devName.addEventListener('change', () => setDevice({ name: devName.value.trim() }));
  const pctInput = (key) => {
    const i = numInput(S[key]);
    i.addEventListener('change', () => { const n = num(i.value); st.putSettings({ [key]: n === null || isNaN(n) ? 0 : n }); });
    return h('div', { class: 'inline' }, i, h('span', { class: 'unit' }, '%'));
  };
  const C = cfg();
  const checkNum = (key, unit) => {
    const i = numInput(C[key]);
    i.addEventListener('change', () => { const n = num(i.value); if (n !== null && !isNaN(n) && n >= 0) putCfg({ [key]: n }); else i.value = C[key]; });
    return h('div', { class: 'inline' }, i, h('span', { class: 'unit' }, unit));
  };
  // Tamaño mínimo de un soporte: ancho × alto en píxeles (vacío = no se comprueba).
  const sizeRow = (t, sp) => {
    const cur = sp.size || ['', ''];
    const a = numInput(cur[0], { 'aria-label': 'Ancho', placeholder: 'ancho' });
    const b = numInput(cur[1], { 'aria-label': 'Alto', placeholder: 'alto' });
    const save = () => {
      const w = num(a.value), hh = num(b.value);
      const sizes = { ...(C.sizes || {}) };
      if (w > 0 && hh > 0) sizes[sp.code] = [Math.round(w), Math.round(hh)]; else if (!a.value && !b.value) sizes[sp.code] = null; else return;
      putCfg({ sizes });
    };
    a.addEventListener('change', save);
    b.addEventListener('change', save);
    return field(`${t.short || t.name} · ${sp.name}`, h('div', { class: 'inline' }, a, h('span', { class: 'unit' }, '×'), b, h('span', { class: 'unit' }, 'px')));
  };
  const space = h('p', { class: 'muted' }, g.token() ? 'Espacio en Drive: calculando…' : '');
  if (g.token() && navigator.onLine) g.driveQuota().then((q) => { space.textContent = q ? `Espacio en Drive: ${q.used} usados de ${q.limit}.` : ''; });

  main.replaceChildren(h('div', { class: 'narrow' },
    card('Cuenta de Google',
      status === 'nocfg' ? h('div', { class: 'note-box' }, 'Falta poner el ID de cliente en el archivo config.js (paso 3 de las instrucciones). Mientras tanto la app funciona, pero solo guarda en este aparato.') : null,
      h('p', { class: 'muted' }, status === 'auth' ? 'Sin conectar: lo que apuntéis se queda en este aparato hasta conectar.'
        : m.lastSync ? `Última sincronización: ${fmtDateTime(m.lastSync)}` : 'Todavía no se ha sincronizado.'),
      g.sync.error ? h('p', { class: 'err' }, g.sync.error) : null,
      m.fileError ? h('p', { class: 'err' }, 'Algún archivo no ha subido: ' + m.fileError) : null,
      m.backupError ? h('p', { class: 'err' }, 'Copia de seguridad: ' + m.backupError) : null,
      h('div', { class: 'btn-row' },
        g.configured() && !g.token() ? h('button', { class: 'btn primary', onclick: () => g.login() }, 'Conectar') : null,
        g.token() ? h('button', { class: 'btn', onclick: () => g.syncNow() }, 'Sincronizar ahora') : null,
        g.token() ? h('button', { class: 'btn', onclick: async () => { if (await confirmSheet('¿Desconectar este aparato?', 'Los datos siguen en Drive y en este aparato. Para volver a sincronizar habrá que conectar otra vez.', { ok: 'Desconectar' })) { g.logout(); nav.rerender(); } } }, 'Desconectar') : null),
      g.everConnected() ? toggle('Reconectar al abrir la app', localStorage.getItem('auto_reconnect') !== '0', 'Google pide renovar el permiso cada hora', (on) => localStorage.setItem('auto_reconnect', on ? '1' : '0')) : null,
    ),

    card('Este aparato',
      field('Quién eres', select([['', '— Elegir —'], ...st.people().map((p) => [p.id, p.name])], D.person || '', { onchange: (e) => setDevice({ person: e.target.value || null }) }), 'Pone tu nombre como autor en lo que crees y marca «Lo mío»'),
      field('Nombre del aparato', devName),
      dSel('Tema', [['auto', 'El del sistema'], ['light', 'Claro'], ['dark', 'Oscuro']], 'theme'),
      dSel('Tamaño de la letra', [['1', 'Normal'], ['1.1', 'Grande'], ['1.2', 'Muy grande']], 'fontScale'),
      dSel('Tamaño de las tarjetas', [['s', 'Pequeñas'], ['m', 'Medianas'], ['l', 'Grandes']], 'cardSize'),
      toggle('Mostrar cuántos datos faltan', D.showProgress, 'En la ficha: «7 de 15 datos rellenos»', (on) => setDevice({ showProgress: on })),
      toggle('Botón «＋1» en las tarjetas', D.askButton, 'Para apuntar desde la galería que alguien ha preguntado por una obra', (on) => setDevice({ askButton: on })),
      toggle('Pestaña Muestras', D.tabs?.samples !== false, null, (on) => setDeviceIn('tabs', 'samples', on)),
      toggle('Pestaña Números', D.tabs?.nums !== false, null, (on) => setDeviceIn('tabs', 'nums', on)),
    ),

    card('Registro de la calle',
      (() => {
        const months = st.asksByMonth();
        const total = st.allAsks().length;
        if (!total) return h('p', { class: 'muted' }, 'Todavía no hay preguntas apuntadas. Se apuntan con «＋1» en la tarjeta o en la ficha de cada obra, o desde el acceso directo «Apuntar pregunta» del icono de la app.');
        const fmtM = (k) => new Date(k + '-15T12:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
        return [
          h('p', { class: 'muted' }, `${total} pregunta${total === 1 ? '' : 's'} apuntada${total === 1 ? '' : 's'}. Para la hoja de seguimiento, por mes:`),
          h('table', { class: 'wt', style: 'margin-top:4px' }, h('tbody', {}, months.slice(0, 12).map(([k, n]) => h('tr', { style: 'cursor:default' }, h('td', {}, fmtM(k)), h('td', { style: 'text-align:right' }, h('b', {}, String(n))))))),
          h('div', { class: 'btn-row', style: 'margin-top:10px' }, h('button', { class: 'btn small', onclick: exportAsksCsv }, icon('download'), 'Guardar el registro (CSV)')),
        ];
      })(),
    ),

    card('Personas',
      h('p', { class: 'muted' }, 'Común a todos los aparatos. De aquí salen los avisos de IVA, cesión de derechos y originales.'),
      st.people().map((p) => h('button', { class: 'row', style: 'margin-bottom:6px', onclick: () => personSheet(p.id) },
        h('span', { class: 'who', style: `background:${p.color};width:16px;height:16px` }),
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, p.name),
          h('div', { class: 'row-sub' }, [p.titular ? 'titular de la tienda' : '', p.publico ? 'restricciones por empleo público' : ''].filter(Boolean).join(' · ') || 'sin marcas')))),
      h('button', { class: 'btn small', onclick: () => personSheet(null) }, icon('plus'), 'Añadir persona'),
    ),

    card('Tipos de obra',
      st.types().map((t) => {
        const own = st.S.types[t.id] && !st.S.types[t.id].del;
        const n = st.works().filter((w) => w.type === t.id).length;
        return h('button', { class: 'row', style: 'margin-bottom:6px;min-height:52px', onclick: () => editType(t.id) },
          h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, `${t.icon || ''} ${t.name}`.trim()),
            h('div', { class: 'row-sub' }, [`código ${[t.letter, ...Object.values(t.letterBy?.map || {})].filter((x, i, a) => a.indexOf(x) === i).join('/')}`, `${n} obra${n === 1 ? '' : 's'}`, own ? (t.source === 'pack' ? `paquete v${t.packVersion || 1}` : 'personalizado') : 'de fábrica'].join(' · '))),
          icon('chevron'));
      }),
      h('button', { class: 'btn small', onclick: importAny }, icon('plus'), 'Añadir o actualizar un tipo (paquete)'),
      h('p', { class: 'hint' }, 'Los paquetes los prepara Claude. Pedidle, por ejemplo, «un paquete de tipo de bisutería para el gestor de diseños».'),
    ),

    card('Importar y exportar',
      h('p', { class: 'muted' }, 'Importar: un paquete de tipo o un archivo de fichas preparado por Claude (de listas, notas, fotos de libretas…). Antes de importar se ve todo y se elige qué entra.'),
      h('button', { class: 'btn small', onclick: importAny }, icon('plus'), 'Importar un archivo de Claude'),
      h('p', { class: 'muted', style: 'margin-top:14px' }, 'Exportar:'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small', onclick: catalogSheet }, icon('file'), 'Catálogo'),
        h('button', { class: 'btn small', onclick: shopSheet }, icon('table'), 'CSV para la tienda'),
        h('button', { class: 'btn small', onclick: exportSheet }, icon('download'), 'Copia completa (ZIP)')),
      h('p', { class: 'hint' }, exportInfo().last ? `Última copia completa: ${fmtDateTime(exportInfo().last)}${exportInfo().by ? ' (' + exportInfo().by + ')' : ''}.` : 'Todavía no se ha hecho ninguna copia completa fuera de Google.'),
    ),

    card('Etiquetas',
      listEdit('Etiquetas', 'tags', 'Lista cerrada, separadas por comas. No repitáis lo que ya dice otro campo.'),
    ),

    card('Números',
      h('p', { class: 'muted' }, 'Comunes a todos los aparatos. Con ellos se calcula el margen de cada variante.'),
      toggle('Los precios se escriben con IVA', S.priceWithVat, 'Si lo apagas, se escriben sin IVA', (on) => st.putSettings({ priceWithVat: on })),
      field('Tarifa por hora de mano de obra', h('div', { class: 'inline' }, rate, h('span', { class: 'unit' }, '€/h')), 'Para calcular el coste de lo hecho a mano'),
      field('Reserva para cambios y devoluciones', pctInput('reserve'), 'Porcentaje del precio sin IVA que se aparta en cada venta'),
      h('div', { class: 'grid2' },
        field('Margen en verde desde', pctInput('marginGood')),
        field('En naranja desde', pctInput('marginMid'), 'Por debajo, en rojo')),
      h('h3', {}, 'Dónde se vende (canales)'),
      (S.channels || []).map((c) => {
        const cfg = S.channelCfg?.[c] || {};
        const sub = [+cfg.pct ? `${st.fmtNum(cfg.pct)} %` : '', +cfg.fixed ? `${st.fmtMoney(cfg.fixed)} por venta` : '', +cfg.ship ? `envío ${st.fmtMoney(cfg.ship)}` : ''].filter(Boolean).join(' + ') || 'sin comisión ni envío';
        return h('button', { class: 'row', style: 'margin-bottom:6px;min-height:52px', onclick: () => channelSheet(c) },
          h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, c), h('div', { class: 'row-sub' }, sub)));
      }),
      h('button', { class: 'btn small', onclick: () => channelSheet(null) }, icon('plus'), 'Añadir canal'),
    ),

    card('Fotos y archivos',
      sSel('Tamaño de las fotos al subir', [[1280, '1.280 px (más ligeras)'], [1600, '1.600 px (recomendado)'], [2048, '2.048 px'], [3000, '3.000 px']], 'photoMax', 'Lado largo. Los originales se quedan en vuestro álbum de Google Fotos.'),
      sSel('Calidad de las fotos', [[0.7, '70 %'], [0.8, '80 % (recomendado)'], [0.9, '90 %']], 'photoQ'),
      toggle('Renombrar los archivos al subir', S.rename, 'código_nombre_rol_versión, p. ej. D001_zorro_oscura_v02.png', (on) => st.putSettings({ rename: on })),
      space,
    ),

    card('Comprobaciones',
      h('p', { class: 'muted' }, 'Para los archivos de impresión (los marcados «clara» u «oscura») y los escaneos. Informan, pero nunca impiden subir un archivo.'),
      field('Cuándo se comprueba', select([['always', 'Siempre, al subir el archivo'], ['manual', 'Solo cuando lo pida con el botón'], ['off', 'Nunca']], C.mode, { onchange: (e) => putCfg({ mode: e.target.value }) })),
      C.mode !== 'off' ? [
        toggle('Tamaño mínimo', C.size, 'En píxeles, según para qué soporte sea el archivo', (on) => putCfg({ size: on })),
        C.size ? st.types().flatMap((t) => printSupports(t).map((sp) => sizeRow(t, sp))) : null,
        toggle('Fondo transparente', C.alpha, 'En prendas, un fondo de color se imprime tal cual', (on) => putCfg({ alpha: on })),
        toggle('Perfil de color sRGB', C.srgb, 'Avisa si el archivo lleva otro perfil', (on) => putCfg({ srgb: on })),
        toggle('Píxeles semitransparentes', C.semi, 'Los bordes difuminados se imprimen mal en prenda oscura', (on) => putCfg({ semi: on })),
        C.semi ? field('Avisar a partir de', checkNum('semiMax', '%'), 'Porcentaje de lo dibujado. Es un valor orientativo: ajustadlo cuando tengáis las primeras muestras.') : null,
        toggle('Resolución de los escaneos', C.scan, 'Para los archivos marcados «escaneo»', (on) => putCfg({ scan: on })),
        C.scan ? field('Resolución mínima', checkNum('scanPpp', 'ppp')) : null,
        toggle('Vistas previas sobre claro y oscuro', C.previews, 'En la ficha de cada archivo con transparencia', (on) => putCfg({ previews: on })),
      ] : null,
    ),

    card('Copias de seguridad',
      h('p', { class: 'muted' }, st.S.backupInfo?.last ? `Última copia en Drive: ${fmtDateTime(st.S.backupInfo.last)}${st.S.backupInfo.by ? ' (' + st.S.backupInfo.by + ')' : ''}` : 'Todavía no hay copias en Drive.'),
      sSel('Copia automática en Drive', [[1, 'Cada día'], [3, 'Cada 3 días'], [7, 'Cada semana']], 'backupEveryDays'),
      sSel('Copias que se guardan', [[15, '15'], [30, '30'], [60, '60'], [120, '120']], 'backupKeep', 'Además se conserva para siempre la primera de cada mes'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small', disabled: !g.token(), onclick: async (e) => { e.target.disabled = true; try { await createBackup('manual'); st.commit(); toast('Copia hecha en Drive'); } catch (err) { toast('No se pudo: ' + err.message); } nav.rerender(); } }, icon('shield'), 'Hacer copia ahora'),
        h('button', { class: 'btn small', disabled: !g.token(), onclick: driveBackupsSheet }, 'Copias en Drive'),
        h('button', { class: 'btn small', onclick: localBackupsSheet }, 'Copias en este aparato')),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small', onclick: () => download(`gestor-disenos-${st.ymd()}.json`, JSON.stringify(wrap(st.S, 'manual'), null, 1)) }, icon('download'), 'Guardar los datos en un archivo'),
        h('button', { class: 'btn small', onclick: importFile }, 'Recuperar desde un archivo')),
      h('p', { class: 'hint' }, 'Estas copias guardan los datos. Las fotos y los archivos siguen en Drive mientras no vaciéis la papelera. Para tenerlo todo fuera de Google: Importar y exportar › Copia completa (ZIP).'),
    ),

    card('Papelera',
      h('p', { class: 'muted' }, `${st.trashedWorks().length} obra(s) y ${st.trashedFiles().length} archivo(s).`),
      h('button', { class: 'btn small', onclick: trashSheet }, icon('trash'), 'Abrir la papelera'),
    ),

    card('La app',
      h('p', { class: 'muted' }, `Versión ${VERSION}`),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small', onclick: async () => { try { await (await navigator.serviceWorker?.getRegistration())?.update(); } catch {} await st.flush(); location.reload(); } }, 'Buscar actualización'),
        h('button', { class: 'btn small', onclick: async () => { if (await confirmSheet('¿Volver a los ajustes de fábrica de este aparato?', 'No se borra ningún dato; solo la configuración de este aparato.', { ok: 'Restablecer' })) resetDevice(); } }, 'Restablecer este aparato')),
    ),
  ));
}

function personSheet(id) {
  const p = id ? st.person(id) : null;
  let name = p?.name || '';
  const nameI = inp({ value: name, placeholder: 'Nombre' });
  nameI.addEventListener('input', () => { name = nameI.value.trim(); });
  const s = openSheet(p ? p.name : 'Nueva persona', () => {
    const cur = id ? st.person(id) : null;
    return [
      field('Nombre', nameI, 'Siempre escrito igual: es como aparecerá como autor'),
      cur ? field('Color', h('div', { class: 'swatches' }, st.PERSON_COLORS.map((c) => h('button', { class: 'swatch' + (cur.color === c ? ' on' : ''), style: `background:${c}`, 'aria-label': 'Color', onclick: () => { st.putPerson(id, { color: c }); s.refresh(); } })))) : null,
      cur ? toggle('Titular de la tienda', !!cur.titular, 'Quien vende. Solo puede haber uno.', (on) => { st.putPerson(id, { titular: on }); s.refresh(); }) : null,
      cur ? toggle('Restricciones por empleo público', !!cur.publico, 'Avisa si un original físico suyo se marca para vender', (on) => { st.putPerson(id, { publico: on }); s.refresh(); }) : null,
      h('button', { class: 'btn primary block', onclick: () => {
        if (!name) return toast('Escribe un nombre');
        if (cur) st.putPerson(id, { name }); else st.addPerson(name);
        s.close();
        nav.rerender();
      } }, cur ? 'Guardar' : 'Añadir'),
      cur ? h('button', { class: 'btn block danger', onclick: async () => {
        if (!(await confirmSheet(`¿Quitar a ${cur.name}?`, 'Sus obras se conservan, pero dejará de aparecer como autor.', { ok: 'Quitar', danger: true }))) return;
        st.deletePerson(id);
        if (D.person === id) setDevice({ person: null });
        s.close();
        nav.rerender();
      } }, 'Quitar persona') : null,
    ];
  });
}

// Canal de venta: nombre, comisión y envío. Renombrarlo lo cambia también en las variantes que lo usan.
function channelSheet(name) {
  const S = st.S.settings;
  const cfg = { pct: null, fixed: null, ship: null, ...(name ? S.channelCfg?.[name] || {} : {}) };
  let newName = name || '';
  const nameI = inp({ value: newName, placeholder: 'Nombre del canal' });
  nameI.addEventListener('input', () => { newName = nameI.value.trim(); });
  const numF = (key, unit) => {
    const i = numInput(cfg[key]);
    i.addEventListener('input', () => { const n = num(i.value); cfg[key] = n === null || isNaN(n) ? null : n; });
    return h('div', { class: 'inline' }, i, h('span', { class: 'unit' }, unit));
  };
  const s = openSheet(name || 'Nuevo canal', () => [
    field('Nombre', nameI),
    field('Comisión', numF('pct', '%'), 'Sobre lo que paga el cliente (precio con IVA)'),
    field('Cantidad fija por venta', numF('fixed', '€')),
    field('Envío a vuestro cargo', numF('ship', '€'), 'Lo que os cuesta enviar cada venta, si no lo paga el cliente'),
    h('button', { class: 'btn primary block', onclick: () => {
      if (!newName) return toast('Escribe un nombre');
      const list = S.channels || [];
      if (newName !== name && list.includes(newName)) return toast('Ya hay un canal con ese nombre');
      const channels = name ? list.map((c) => (c === name ? newName : c)) : [...list, newName];
      const channelCfg = { ...(S.channelCfg || {}) };
      if (name && name !== newName) { delete channelCfg[name]; st.renameChannel(name, newName); }
      channelCfg[newName] = { pct: cfg.pct, fixed: cfg.fixed, ship: cfg.ship };
      st.putSettings({ channels, channelCfg });
      s.close();
      nav.rerender();
    } }, 'Guardar'),
    name ? h('button', { class: 'btn block danger', onclick: async () => {
      if (!(await confirmSheet(`¿Quitar el canal «${name}»?`, 'Las variantes que lo tenían marcado dejarán de mostrarlo.', { ok: 'Quitar', danger: true }))) return;
      const channelCfg = { ...(S.channelCfg || {}) };
      delete channelCfg[name];
      st.putSettings({ channels: (S.channels || []).filter((c) => c !== name), channelCfg });
      s.close();
      nav.rerender();
    } }, 'Quitar canal') : null,
  ]);
}

// ── Primer uso ─────────────────────────────────────────────
// 1) Conectar con Google (si está configurado y nunca se ha conectado). 2) Quiénes sois / quién eres.
export function welcome() {
  if (!g.configured() || g.everConnected() || localStorage.getItem('welcome_seen')) return false;
  const s = openSheet('Gestor de diseños', () => [
    h('p', {}, 'Para que los dos veáis lo mismo en todos los aparatos, conecta con la cuenta de Google conjunta.'),
    h('p', { class: 'muted' }, 'La app solo puede ver los archivos que crea ella misma, en la carpeta «Tienda» de vuestro Drive.'),
    h('button', { class: 'btn primary block', onclick: () => { localStorage.setItem('welcome_seen', '1'); g.login(); } }, 'Conectar con Google'),
    h('button', { class: 'btn block', onclick: () => { localStorage.setItem('welcome_seen', '1'); s.close(); whoCheck(true); } }, 'Ahora no'),
  ]);
  return true;
}

let asking = false;
export function whoCheck(force = false) {
  if (asking || (D.person && st.person(D.person))) return;
  if (!force && sessionStorage.getItem('who_skipped')) return;
  asking = true;
  const ppl = st.people();
  const done = () => { asking = false; nav.rerender(); };
  if (ppl.length) {
    const s = openSheet('¿Quién eres?', () => [
      h('p', { class: 'muted' }, 'Así tus obras llevan tu nombre y tu color en este aparato.'),
      st.people().map((p) => h('button', { class: 'btn block', style: `border-color:${p.color}`, onclick: () => { setDevice({ person: p.id }); st.setActor(p.id); s.close(); } }, p.name)),
      h('button', { class: 'btn block', onclick: () => { s.close(); personSheet(null); } }, 'Soy otra persona'),
    ], { onClose: () => { sessionStorage.setItem('who_skipped', '1'); done(); } });
    return;
  }
  const a = inp({ placeholder: 'Tu nombre' });
  const b = inp({ placeholder: 'El nombre de tu pareja' });
  const s = openSheet('¿Quiénes sois?', () => [
    h('p', { class: 'muted' }, 'Cada uno tendrá su color y verá sus piezas con «Lo mío». Escribid los nombres siempre igual.'),
    field('Tú (quien usa este aparato)', a),
    field('La otra persona', b),
    h('button', { class: 'btn primary block', onclick: () => {
      const me = st.addPerson(a.value);
      if (!me) return toast('Escribe al menos tu nombre');
      st.addPerson(b.value);
      setDevice({ person: me.id });
      st.setActor(me.id);
      s.close();
      toast('Hecho. En Ajustes › Personas puedes marcar quién es el titular de la tienda.', { ms: 7000 });
    } }, 'Empezar'),
  ], { onClose: () => { sessionStorage.setItem('who_skipped', '1'); done(); } });
}

// ── Copias ─────────────────────────────────────────────────
async function restore(data, label) {
  const n = st.alive(data.works).length;
  if (!(await confirmSheet('¿Recuperar esta copia?', `${label}. Tiene ${n} obra(s). Antes se guarda una copia de cómo está todo ahora.`, { ok: 'Recuperar' }))) return false;
  await st.localSnapshot(true);
  if (g.token() && navigator.onLine) { try { await createBackup('antes-de-restaurar'); } catch (e) { console.warn(e); } }
  st.replaceAll(data);
  toast('Copia recuperada');
  nav.rerender();
  return true;
}

function driveBackupsSheet() {
  let files = null;
  let err = null;
  const s = openSheet('Copias en Drive', () => {
    if (err) return h('p', { class: 'err' }, err);
    if (!files) return h('p', { class: 'muted' }, 'Buscando…');
    const list = files.filter((f) => f.name.startsWith('copia'));
    if (!list.length) return h('p', { class: 'muted' }, 'Todavía no hay copias.');
    return list.map((f) => h('button', { class: 'row', style: 'margin-bottom:6px', onclick: async () => {
      try { if (await restore(unwrap(await readJSONFile(f.id)), fmtDateTime(f.createdTime))) s.close(); } catch (e) { toast('No se pudo leer: ' + e.message); }
    } }, h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, fmtDateTime(f.createdTime)), h('div', { class: 'row-sub' }, f.description || f.name))));
  });
  listBackupFolder().then((r) => { files = r; s.refresh(); }).catch((e) => { err = e.message; s.refresh(); });
}

async function localBackupsSheet() {
  const arr = await st.localBackups();
  const s = openSheet('Copias en este aparato', () => (arr.length ? arr.map((b) => h('button', { class: 'row', style: 'margin-bottom:6px', onclick: async () => { if (await restore(b.data, fmtDateTime(b.ts))) s.close(); } },
    h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, fmtDateTime(b.ts)), h('div', { class: 'row-sub' }, `${st.alive(b.data.works).length} obra(s)`)))) : h('p', { class: 'muted' }, 'Todavía no hay copias. Se hace una al día.')));
}

// Un archivo de Claude: paquete de tipo, fichas o, si es una copia, se avisa de dónde recuperarla.
async function importAny() {
  const f = await pickFile('application/json,.json,text/plain');
  if (!f) return;
  let j;
  try { j = JSON.parse((await f.text()).replace(/^\ufeff/, '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { return toast('El archivo no es un JSON válido. Pedid a Claude que lo genere otra vez.', { ms: 6000 }); }
  if (j?.kind === PACK_KIND) previewPack(j, { onDone: () => nav.rerender() });
  else if (j?.kind === WORKS_KIND) reviewImport(j);
  else if (j?.kind === 'backup' || (j?.works && j?.settings)) toast('Es una copia de seguridad: se recupera en Copias de seguridad › Recuperar desde un archivo.', { ms: 7000 });
  else toast('No es un archivo del gestor de diseños (falta «kind»: type-pack o works).', { ms: 7000 });
}

async function importFile() {
  const f = await pickFile('application/json,.json');
  if (!f) return;
  try { await restore(unwrap(JSON.parse(await f.text())), f.name); } catch (e) { toast(e.message); }
}

// ── Papelera ───────────────────────────────────────────────
function trashSheet() {
  const s = openSheet('Papelera', () => {
    const ws = st.trashedWorks();
    const fs = st.trashedFiles();
    if (!ws.length && !fs.length) return h('p', { class: 'muted' }, 'La papelera está vacía.');
    const row = (title, sub, onRestore, onPurge) => h('div', { class: 'frow' },
      h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, title), h('div', { class: 'row-sub' }, sub)),
      h('button', { class: 'btn small', onclick: () => { onRestore(); s.refresh(); nav.rerender(); } }, 'Recuperar'),
      h('button', { class: 'icon-btn', 'aria-label': 'Borrar del todo', onclick: async () => { if (await confirmSheet('¿Borrar del todo?', 'Desaparece de la app. En Drive pasa a la papelera de Drive, donde se puede recuperar 30 días.', { ok: 'Borrar del todo', danger: true })) { onPurge(); s.refresh(); nav.rerender(); } } }, icon('trash')));
    return [
      ws.length ? h('h3', {}, 'Obras') : null,
      ws.map((w) => row(`${w.code || '—'} · ${st.workTitle(w)}`, 'Eliminada el ' + fmtDateTime(w.trashed), () => st.restoreWork(w.id), () => st.purgeWork(w.id))),
      fs.length ? h('h3', {}, 'Fotos y archivos') : null,
      fs.map((f) => row(f.dname || f.orig || 'archivo', `${st.getWork(f.workId)?.code || 'sin obra'} · eliminado el ${fmtDateTime(f.trashed)}`, () => st.restoreFile(f.id), () => st.purgeFile(f.id))),
      h('button', { class: 'btn block danger', onclick: async () => {
        if (!(await confirmSheet('¿Vaciar la papelera?', 'Todo lo que hay en ella desaparece de la app y pasa a la papelera de Drive.', { ok: 'Vaciar', danger: true }))) return;
        ws.forEach((w) => st.purgeWork(w.id));
        st.trashedFiles().forEach((f) => st.purgeFile(f.id));
        s.refresh();
        nav.rerender();
      } }, 'Vaciar la papelera'),
    ];
  });
}
