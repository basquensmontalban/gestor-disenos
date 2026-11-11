// Tipos de obra de partida. Cada tipo es un «paquete»: estados, campos propios, soportes y roles de archivo.
// Los tipos nuevos (bisutería, vidrieras, forja…) se añadirán como paquetes con este mismo formato.
//
// Clases de campo (kind): text · long · number (con unit) · yesno · ynu (sí / no / sin comprobar)
//                         choice (options) · multi (options) · suggest (seed, aprende de lo escrito)

export const METHODS = {
  digital: { name: 'Digital o bajo demanda', scal: 'Muy alta' },
  molde: { name: 'Molde o colada', scal: 'Media' },
  serie: { name: 'Serie hecha a mano', scal: 'Baja' },
  unica: { name: 'Pieza única', scal: 'Ninguna' },
};
export const SCAL_LEVELS = ['Muy alta', 'Media', 'Baja', 'Ninguna'];

export const VARIANT_STATES = ['Borrador', 'Muestra pedida', 'Aprobada', 'Publicada', 'Pausada', 'Retirada'];
export const DESTS = [['', 'Sin decidir'], ['vendida', 'Vendida'], ['regalada', 'Regalada'], ['nuestra', 'Nuestra'], ['descartada', 'Descartada']];
export const SELL = [['si', 'Sí'], ['quiza', 'Quizá'], ['no', 'No']];
export const PHOTO_TAGS = [['', 'Sin etiqueta'], ['proceso', 'Proceso'], ['final', 'Pieza final'], ['mockup', 'Mockup']];
export const DEFAULT_CHANNELS = ['LaTostadora', 'Tienda propia', 'Etsy', 'Feria', 'Vinted', 'Wallapop', 'Venta directa'];
export const DEFAULT_TAGS = ['encargo', 'prueba', 'fallo', 'inspiracion'];

const HAND_SUPPORTS = [
  { code: 'ORI', name: 'Pieza única', method: 'unica', original: true, qty: 1 },
  { code: 'SER', name: 'Serie hecha a mano', method: 'serie', original: true },
];

export const BUILTIN_TYPES = {
  ilustracion: {
    id: 'ilustracion', name: 'Ilustración', short: 'Ilustración', icon: '🎨', letter: 'I',
    // La letra del código depende del origen: digital D, acuarela A, otro I.
    letterBy: { field: 'origen', map: { Digital: 'D', Acuarela: 'A', Otro: 'I' } },
    workStates: ['Idea', 'En proceso', 'Terminada', 'Escaneada', 'Limpia', 'Archivo maestro', 'Exportada'],
    workFields: [
      { id: 'origen', label: 'Origen', kind: 'choice', options: ['Digital', 'Acuarela', 'Otro'] },
      { id: 'medio', label: 'Medio', kind: 'suggest', seed: ['Acuarela', 'Tinta', 'Lápiz', 'Digital'] },
      { id: 'programa', label: 'Programa y pinceles (si es digital)', kind: 'text' },
      { id: 'papel', label: 'Papel (marca y gramaje)', kind: 'text' },
      { id: 'paleta', label: 'Paleta', kind: 'text' },
      { id: 'tamano', label: 'Tamaño del original', kind: 'text' },
      { id: 'dondeOriginal', label: 'Dónde está el original físico', kind: 'suggest', seed: [] },
      { id: 'ppp', label: 'Resolución del escaneo', kind: 'number', unit: 'ppp' },
      { id: 'vClara', label: 'Versión para prenda clara', kind: 'yesno' },
      { id: 'vOscura', label: 'Versión para prenda oscura', kind: 'yesno' },
      { id: 'vector', label: 'Vector', kind: 'yesno' },
      { id: 'aptaOscura', label: 'Apta para prenda oscura', kind: 'yesno' },
    ],
    variantFields: [
      { id: 'proveedor', label: 'Proveedor', kind: 'suggest', seed: ['Printful', 'LaTostadora', 'Gelato'] },
      { id: 'produccion', label: 'Producción', kind: 'suggest', seed: ['DTG', 'DTFlex', 'Bordado bajo demanda', 'Giclée', 'Serigrafía', 'Vinilo', 'Transfer', 'Pintura textil'] },
      { id: 'prenda', label: 'Prenda base (marca, modelo, gramaje, composición)', kind: 'text' },
      { id: 'colores', label: 'Colores', kind: 'text' },
      { id: 'tallas', label: 'Tallas', kind: 'text' },
      { id: 'tintas', label: 'Tintas, malla y emulsión (si lo estampáis vosotros)', kind: 'text' },
      { id: 'curado', label: 'Curado (temperatura y tiempo)', kind: 'text' },
    ],
    supports: [
      // print: tamaño mínimo del archivo de impresión en píxeles · garment: es una prenda (pide fondo transparente)
      { code: 'CAM', name: 'Camiseta', method: 'digital', onDemand: true, garment: true, print: [3600, 4800] },
      { code: 'SUD', name: 'Sudadera', method: 'digital', onDemand: true, garment: true, print: [3600, 4800] },
      { code: 'BOL', name: 'Bolsa', method: 'digital', onDemand: true, garment: true },
      { code: 'LAM', name: 'Lámina', method: 'digital', onDemand: true, print: [2480, 3508] },   // A4 a 300 ppp
      { code: 'ORI', name: 'Original', method: 'unica', original: true, qty: 1 },
    ],
    materialSeed: ['Algodón', 'Algodón orgánico', 'Papel'],
    finishSeed: [],
    fileRoles: ['escaneo', 'maestro', 'clara', 'oscura', 'vector', 'mockup', 'ficha técnica'],
    printRoles: ['clara', 'oscura'],   // archivos de impresión: se les comprueba tamaño, transparencia y color
    scanRoles: ['escaneo'],            // escaneos: se les comprueba la resolución
  },

  ceramica: {
    id: 'ceramica', name: 'Cerámica', short: 'Cerámica', icon: '🏺', letter: 'C', handmade: true,
    workStates: ['Idea', 'Modelada', 'Secando', 'Bizcochada', 'Esmaltada', 'Terminada'],
    workFields: [
      { id: 'tecnica', label: 'Técnica', kind: 'choice', options: ['Torno', 'Planchas', 'Pellizco', 'Churros', 'Colada en molde'] },
      { id: 'pesoBola', label: 'Peso de la bola (torno)', kind: 'number', unit: 'g' },
      { id: 'pasta', label: 'Barro o pasta (marca, referencia, chamota)', kind: 'suggest', seed: ['Gres', 'Porcelana', 'Loza'] },
      { id: 'grosor', label: 'Grosor', kind: 'text' },
      { id: 'secado', label: 'Secado', kind: 'text' },
      { id: 'bizcocho', label: 'Cocción de bizcocho (temperatura o cono, curva, horno)', kind: 'text' },
      { id: 'coccionEsmalte', label: 'Cocción de esmalte (temperatura o cono, curva, horno)', kind: 'text' },
      { id: 'esmalte', label: 'Esmalte o engobe (receta o marca, capas, aplicación)', kind: 'long' },
      { id: 'contraccion', label: 'Contracción', kind: 'number', unit: '%' },
      { id: 'molde', label: 'Con molde', kind: 'yesno' },
    ],
    variantFields: [
      { id: 'medidas', label: 'Medidas', kind: 'text' },
      { id: 'peso', label: 'Peso', kind: 'number', unit: 'g' },
      { id: 'fragil', label: 'Frágil', kind: 'yesno' },
      { id: 'alimentos', label: 'Apta para alimentos', kind: 'ynu', warnIfSelling: 'Vajilla sin comprobar si es apta para alimentos: no la vendáis hasta comprobarlo.' },
    ],
    supports: [...HAND_SUPPORTS, { code: 'MOL', name: 'Serie con molde', method: 'molde', original: true }],
    materialSeed: ['Gres', 'Porcelana', 'Loza'],
    finishSeed: ['Esmalte brillante', 'Esmalte mate', 'Engobe', 'Sin esmaltar'],
    fileRoles: ['STL', 'receta de esmalte', 'boceto', 'ficha técnica'],
  },

  talla: {
    id: 'talla', name: 'Talla de madera', short: 'Talla', icon: '🪵', letter: 'T', handmade: true,
    workStates: ['Idea', 'Desbastada', 'Tallada', 'Lijada', 'Acabada'],
    workFields: [
      { id: 'madera', label: 'Madera (especie)', kind: 'suggest', seed: ['Tilo', 'Nogal', 'Cerezo', 'Olivo', 'Haya', 'Pino'] },
      { id: 'procedencia', label: 'Procedencia', kind: 'text' },
      { id: 'secaVerde', label: 'Seca o verde', kind: 'choice', options: ['Seca', 'Verde'] },
      { id: 'veta', label: 'Veta', kind: 'text' },
      { id: 'tecnica', label: 'Técnica', kind: 'choice', options: ['Relieve', 'Bulto redondo', 'Utensilio'] },
      { id: 'gubias', label: 'Gubias (número y perfil)', kind: 'text' },
      { id: 'afilado', label: 'Afilado (piedras y ángulo)', kind: 'text' },
    ],
    variantFields: [
      { id: 'medidas', label: 'Medidas', kind: 'text' },
      { id: 'peso', label: 'Peso', kind: 'number', unit: 'g' },
      { id: 'acabadoDetalle', label: 'Acabado: producto, capas y tiempos', kind: 'text' },
      { id: 'cuidados', label: 'Cuidados', kind: 'text' },
      { id: 'alimentos', label: 'Apta para alimentos (cucharas, tablas)', kind: 'ynu', warnIfSelling: 'Sin comprobar si es apta para alimentos.' },
    ],
    supports: HAND_SUPPORTS,
    materialSeed: ['Tilo', 'Nogal', 'Cerezo', 'Olivo', 'Haya', 'Pino'],
    finishSeed: ['Aceite', 'Cera', 'Barniz', 'Sin acabado'],
    fileRoles: ['boceto', 'plantilla', 'ficha técnica'],
  },

  costura: {
    id: 'costura', name: 'Costura', short: 'Costura', icon: '🧵', letter: 'S', handmade: true,
    workStates: ['Idea', 'Patronaje', 'Corte', 'Cosido', 'Acabados', 'Terminada'],
    workFields: [
      { id: 'subtipo', label: 'Qué es', kind: 'choice', options: ['Bordado', 'Patrón', 'Pieza cosida'] },
      { id: 'tecnica', label: 'Técnica', kind: 'choice', options: ['A máquina', 'A mano', 'Bordado a mano', 'Bordado a máquina'] },
      { id: 'tela', label: 'Tela (tipo y cuenta)', kind: 'text' },
      { id: 'hilos', label: 'Hilos (marca y color)', kind: 'text' },
      { id: 'agujas', label: 'Agujas', kind: 'text' },
      { id: 'bastidor', label: 'Bastidor', kind: 'text' },
      { id: 'pasoPatron', label: 'Cómo se pasó el patrón', kind: 'text' },
      { id: 'puntadas', label: 'Puntadas', kind: 'text' },
      { id: 'montaje', label: 'Montaje', kind: 'text' },
    ],
    variantFields: [
      { id: 'tejido', label: 'Tejido', kind: 'text' },
      { id: 'composicion', label: 'Composición', kind: 'text', warnIfPublishing: 'Falta la composición del tejido (hace falta para el etiquetado textil).' },
      { id: 'tallas', label: 'Tallas o medidas', kind: 'text' },
      { id: 'lavado', label: 'Cuidados de lavado', kind: 'text' },
    ],
    supports: [
      ...HAND_SUPPORTS,
      { code: 'PDF', name: 'Patrón en PDF', method: 'digital', onDemand: true },
      { code: 'PAP', name: 'Patrón en papel', method: 'serie' },
    ],
    materialSeed: ['Algodón', 'Lino', 'Lana'],
    finishSeed: [],
    fileRoles: ['patrón', 'boceto', 'ficha técnica'],
  },
};

// Rol propuesto para un archivo adjunto según su extensión.
export function guessRole(filename, type) {
  const ext = String(filename).split('.').pop().toLowerCase();
  const roles = type?.fileRoles || [];
  const has = (r) => roles.includes(r);
  // Si el nombre del archivo ya dice qué es («zorro_oscura_v02.png»), se usa eso.
  const plain = (x) => String(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const words = plain(filename).split(/[^a-z0-9]+/);
  const named = roles.find((r) => plain(r).split(/[^a-z0-9]+/).every((w) => words.includes(w)));
  if (named) return named;
  if (ext === 'svg' || ext === 'ai' || ext === 'eps') return has('vector') ? 'vector' : 'boceto';
  if (ext === 'stl' || ext === '3mf' || ext === 'obj') return 'STL';
  if (ext === 'pdf') return has('patrón') && !has('ficha técnica') ? 'patrón' : 'ficha técnica';
  if (ext === 'tif' || ext === 'tiff') return has('escaneo') ? 'escaneo' : 'archivo';
  if (ext === 'psd' || ext === 'afphoto' || ext === 'afdesign' || ext === 'procreate' || ext === 'kra') return has('maestro') ? 'maestro' : 'archivo';
  return 'archivo';
}
