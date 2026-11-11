// Fusión «a tres bandas»: combina el cambio de este aparato (l) y el del otro (r) a partir de la última
// versión que tenían los dos en común (b). Así no se pierde ninguno de los dos.
// - Lo que solo cambió un lado, se queda con ese cambio.
// - Listas con «id»: se combinan elemento a elemento.
// - Listas de valores sueltos (temáticas, etiquetas, canales…): se combinan como conjuntos.
// - Objetos (campos del tipo, ajustes…): campo a campo.
// - Si los dos cambiaron lo mismo de forma distinta, gana el cambio más reciente.

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

export function eq(a, b) {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === null || b === null) return a == b;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => eq(x, b[i]));
  if (isObj(a)) {
    if (!isObj(b)) return false;
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => eq(a[k], b[k]));
  }
  return false;
}

const idArray = (x) => Array.isArray(x) && x.every((e) => isObj(e) && e.id !== undefined && e.id !== null);
const setArray = (x) => Array.isArray(x) && x.every((e) => typeof e === 'string' || typeof e === 'number') && new Set(x).size === x.length;

export function merge3(l, r, b, preferR) {
  if (eq(l, b)) return r;
  if (eq(r, b)) return l;
  if (eq(l, r)) return l;
  if ((idArray(l) || l === undefined) && (idArray(r) || r === undefined) && (l || r)) return mergeById(l || [], r || [], idArray(b) ? b : [], preferR);
  if (setArray(l) && setArray(r) && (b === undefined || b === null || setArray(b))) {
    const bs = new Set(b || []);
    const gone = new Set([...bs].filter((x) => !l.includes(x) || !r.includes(x)));
    return [...new Set([...l, ...r])].filter((x) => !gone.has(x));
  }
  if (isObj(l) && isObj(r)) {
    const bb = isObj(b) ? b : {};
    const out = {};
    for (const k of new Set([...Object.keys(l), ...Object.keys(r), ...Object.keys(bb)])) {
      const v = merge3(l[k], r[k], bb[k], preferR);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return preferR ? r : l;
}

function mergeById(l, r, b, preferR) {
  const L = new Map(l.map((x) => [x.id, x]));
  const R = new Map(r.map((x) => [x.id, x]));
  const B = new Map(b.map((x) => [x.id, x]));
  const ids = [...new Set([...l.map((x) => x.id), ...r.map((x) => x.id)])];
  const out = [];
  for (const id of ids) {
    const li = L.get(id);
    const ri = R.get(id);
    const bi = B.get(id);
    if (bi) {
      if (!li && !ri) continue;
      if (!li) { if (!eq(ri, bi)) out.push(ri); continue; }       // quitado aquí: se va, salvo que allí lo cambiaran
      if (!ri) { if (!eq(li, bi)) out.push(li); continue; }
      out.push(merge3(li, ri, bi, preferR));
    } else {
      out.push(li && ri ? merge3(li, ri, {}, preferR) : li || ri);
    }
  }
  return out;
}

// Un registro cambiado en los dos lados desde la versión común.
export function mergeRecord(l, r, b) {
  const preferR = (+r.u || 0) > (+l.u || 0);
  if (!b || l.del || r.del || b.del) return preferR ? r : l;
  const out = merge3(l, r, b, preferR);
  out.id = l.id ?? r.id;
  out.u = Math.max(+l.u || 0, +r.u || 0) + 1;
  return out;
}
