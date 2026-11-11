// Versión de la app. Va también en los datos de Drive: un aparato con una versión anterior
// no sube cambios encima de los de una versión más nueva (podría estropearlos).
export const VERSION = '0.4.0';

// Compara «1.10.1» con «1.9.2»: >0 si a es más nueva.
export function cmpVer(a, b) {
  const pa = String(a || '0').split('.').map((n) => +n || 0);
  const pb = String(b || '0').split('.').map((n) => +n || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}
