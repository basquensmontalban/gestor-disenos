# Gestor de diseños

App interna del Taller: todas las obras, hechas y por hacer, con su foto, sus archivos, sus variantes vendibles, sus costes y su estado.
Funciona en móvil, tableta y ordenador, también sin conexión, y se sincroniza con Google Drive.

- **El código** está en GitHub (es público, pero no contiene ningún dato vuestro).
- **Los datos, las fotos y los archivos** están en vuestro Drive, carpeta «Tienda», y solo se ven con vuestra cuenta de Google.

Versión 0.4.0 · fases 1 a 5 de la especificación (obras, variantes y números, comprobación de archivos de impresión, muestras y registro de la calle, y paquetes de tipos y exportación).

---

## Puesta en marcha (unos 10 minutos)

Se aprovecha lo que ya hicisteis para «Inventario de casa»: la misma cuenta de GitHub y el mismo proyecto de Google Cloud.

### Paso 1 · Subir la app a GitHub

1. Entra en [github.com](https://github.com) con tu cuenta (`basquensmontalban`).
2. Arriba a la derecha, pulsa **+** y luego **New repository**.
3. En **Repository name** escribe exactamente: `gestor-disenos`
4. Marca **Public**. No marques ninguna otra casilla.
5. Pulsa el botón verde **Create repository**.
6. En la página que aparece, pulsa el enlace **uploading an existing file**.
7. Abre en tu ordenador la carpeta `gestor-disenos` (la que sale al descomprimir el ZIP). Selecciona **todos los archivos de dentro** (Ctrl + A) y arrástralos a la página de GitHub. Arrastra los archivos, no la carpeta.
8. Espera a que termine la barra de subida. Deben aparecer 33 archivos.
9. Abajo, pulsa el botón verde **Commit changes**.
10. Arriba, pulsa **Settings** (el de la fila del repositorio, con una rueda dentada).
11. En el menú de la izquierda, pulsa **Pages**.
12. En **Branch**, cambia `None` por `main`, deja la carpeta en `/ (root)` y pulsa **Save**.
13. Espera 1 o 2 minutos. La app estará en:
    `https://basquensmontalban.github.io/gestor-disenos/`

Si la abres ahora, arriba pondrá «Sin configurar». Es normal: falta el paso 3.

### Paso 2 · Añadir la dirección en Google Cloud

Hazlo con la **cuenta de Google conjunta**, la misma del inventario.

1. Entra en [console.cloud.google.com](https://console.cloud.google.com).
2. Arriba, en el selector de proyectos, comprueba que está elegido el proyecto del inventario (`Inventario casa`).
3. Abre el menú ☰ (arriba a la izquierda) → **APIs y servicios** → **Credenciales**.
4. En la lista **IDs de cliente de OAuth 2.0**, pulsa sobre el nombre del cliente que creaste para el inventario.
5. Baja hasta **URIs de redireccionamiento autorizados** y pulsa **+ Agregar URI**.
6. Escribe exactamente esto, con la barra final:
   `https://basquensmontalban.github.io/gestor-disenos/`
7. No toques **Orígenes de JavaScript autorizados**: `https://basquensmontalban.github.io` ya vale para las dos apps.
8. Pulsa **Guardar** (abajo).
9. Sin salir de esa página, **copia el ID de cliente** (arriba a la derecha; termina en `.apps.googleusercontent.com`). Lo necesitas en el paso 3.

No hace falta activar nada más: la API de Google Drive ya está habilitada y la cuenta conjunta ya es usuaria de prueba.
Google puede tardar unos minutos en aplicar el cambio.

### Paso 3 · Poner el ID en la app

1. En GitHub, entra en el repositorio `gestor-disenos`.
2. Pulsa sobre el archivo `config.js`.
3. Pulsa el lápiz ✏️ (arriba a la derecha del archivo).
4. Sustituye `PEGA_AQUI_TU_ID.apps.googleusercontent.com` por el ID que copiaste. **Mantén las comillas** de los lados.
5. Pulsa **Commit changes** (botón verde) y otra vez **Commit changes** en la ventana que sale.
6. Espera 1 o 2 minutos.

### Paso 4 · Instalarla en cada aparato

Dirección: `https://basquensmontalban.github.io/gestor-disenos/`

- **Android**: ábrela en **Chrome** → menú ⋮ → **Instalar aplicación** (o *Añadir a pantalla de inicio*).
- **iPhone y iPad**: ábrela en **Safari** → botón Compartir → **Añadir a pantalla de inicio**.
- **Windows**: ábrela en **Chrome** o **Edge** → en la barra de direcciones, a la derecha, pulsa el icono de instalar (una pantalla con una flecha).
- **Mac**: en **Safari** → menú **Archivo** → **Añadir al Dock**. En Chrome, igual que en Windows.

**Accesos directos**: en Android y en el ordenador, al mantener pulsado (o con el botón derecho) el icono de la app salen tres accesos: **Nueva obra**, **Por ordenar** y **Apuntar pregunta**. En iPhone y iPad no existen; allí se usa el botón «+1» de las tarjetas.

### Paso 5 · Primer uso

1. Abre la app desde su icono y pulsa **Conectar con Google**. Elige la **cuenta conjunta**.
2. Google avisará de que *la app no está verificada*. Es normal, porque la habéis creado vosotros: pulsa **Configuración avanzada** → **Ir a …** y acepta el permiso.
3. En el **primer aparato**, la app pregunta **¿Quiénes sois?** Escribid los dos nombres tal como queréis que aparezcan como autores.
4. En los **demás aparatos**, tras conectar, la app pregunta **¿Quién eres?** y basta con tocar el nombre.
5. Ve a **Ajustes › Personas**, toca cada nombre y marca lo que corresponda: **Titular de la tienda** y **Restricciones por empleo público**. De esas dos marcas salen el IVA propuesto y los avisos. Si no marcáis nada, la app no avisa de nada.
6. En **Ajustes › Números**, pon la **tarifa por hora** y, en cada canal de venta, su comisión y su envío.

La app solo puede ver los archivos que crea ella misma en Drive. No ve el resto de vuestro Drive.

---

## Cómo se usa

### Diseños (pantalla principal)

- **Botón ＋**: obra nueva. Foto, nombre y tipo; con eso ya tiene código (`D001`, `C003`…).
- **Botón de la cámara**: foto directa a **«Por ordenar»**, sin elegir nada. Para el taller, con las manos sucias.
- **Con solo la foto ya vale**: si no pones nombre o tipo, se guarda en «Por ordenar» y la completas otro día.
- **Alta en serie**: en ＋, elige varias fotos, marca el tipo y activa **Una obra por foto**. Crea una obra por foto, marcadas «revisar» para ponerles nombre.
- **Por ordenar**: cada captura se convierte en obra, se añade a una obra que ya existe o se borra.
- **Revisar**: toca la franja «Revisar» para ver solo lo que tiene esa marca.
- **Buscador**: entiende sin tildes y con erratas. Busca en nombre, código, temática, notas y variantes.
- **Filtros y orden** (botón del embudo): lo mío, autor, estado, destino, ¿vender?, temática, colección y etiqueta. En el ordenador, también la vista de tabla.
- **En el ordenador**: la ficha se abre a la derecha y la galería sigue a la vista. Se pueden arrastrar fotos a la galería y archivos a la ficha.

### La ficha de una obra

- **No hay botón de guardar**: cada campo se guarda al salir de él.
- **Estado**: un toque lo pasa al paso siguiente. Los pasos dependen del tipo. Al lado, el **destino**: vendida, regalada, nuestra o descartada.
- **Datos del tipo**: lo que hace falta para repetir la pieza (barro, cocciones y esmalte en cerámica; madera y gubias en talla…). Todo es opcional.
- **Fotos**: se reducen solas a 1.600 px y las HEIC del iPhone pasan a JPG. Toca una foto para hacerla principal, etiquetarla o eliminarla. Los originales, en vuestro álbum de Google Fotos.
- **Archivos**: SVG, PNG de impresión, PDF, STL… Se guardan tal cual. El rol (vector, clara, oscura, ficha técnica…) se propone solo y se puede cambiar. Toca un archivo para ver su ficha.
- **Revisar**: márcalo cuando falte un dato. Lo que no se sabe se deja vacío.
- **Historial**: quién cambió qué, con «Recuperar el anterior».
- **Papelera**: la obra deja de verse pero se recupera desde Ajustes › Papelera.

### Variantes (lo que se vende)

Cada obra puede tener varias: camiseta, lámina, original, serie con molde…

- **Añadir variante** propone los soportes del tipo con sus valores habituales ya puestos.
- El código sale solo: código de la obra + soporte (`D001-CAM`).
- **IVA propuesto**: 10 % si es un original o pieza hecha a mano y su único autor es el titular de la tienda; 21 % en lo demás. Se puede cambiar. Está pendiente de confirmar con el gestor.
- **Margen**: se calcula solo, uno por cada canal donde se vende.
  `margen = precio sin IVA − material − horas × tarifa − comisión del canal − envío − reserva`
- **Vendida una**: resta 1 de la cantidad. Al llegar a 0, la obra pasa a destino «vendida».
- **Escalabilidad**: sale del método de producción (digital: muy alta; molde: media; serie a mano: baja; pieza única: ninguna).

### Números

Tabla con todas las variantes: precio, costes, margen por canal y escalabilidad. Se ordena tocando las cabeceras.
El botón de descarga guarda un CSV **interno** (lleva costes y márgenes: no es para subir a la tienda).

Las pestañas **Muestras** y **Números** se pueden ocultar en cada aparato (Ajustes › Este aparato) mientras no las uséis.

### Comprobación de archivos de impresión

Se hace sola al subir un archivo de ilustración marcado como **«clara»**, **«oscura»** o **«escaneo»**. El resultado sale como una insignia junto al archivo («OK», «2 avisos»). Nunca impide subirlo.

- **Truco**: si el nombre del archivo ya lo dice (`zorro_oscura.png`, `hoja_escaneo.tif`), el rol se pone solo.
- **Archivos de impresión** («clara» y «oscura»):
  - Tamaño mínimo: 3.600 × 4.800 px para camiseta y sudadera; 2.480 × 3.508 px (A4 a 300 ppp) para lámina.
  - Fondo transparente, en prendas.
  - Perfil de color sRGB.
  - Porcentaje de píxeles semitransparentes: los bordes difuminados de las acuarelas se imprimen mal en prenda oscura.
- **Escaneos**: resolución mínima de 600 ppp.
- **Ficha del archivo** (tocando el archivo): vista previa **sobre claro y sobre oscuro**, con varios colores de prenda para probar. Ahí se cambia el rol y, en **Es para**, la variante a la que pertenece (el tamaño mínimo cambia según sea camiseta o lámina).
- **TIFF**: la app trae su propio lector, así que también hace miniatura y comprueba los escaneos en TIFF. Lee lo habitual (8 o 16 bits, gris o RGB, sin comprimir, LZW, PackBits o Deflate). Si un TIFF es de otra clase (CMYK, en teselas), se sube igual y dice qué no ha podido leer.
- **Todo se ajusta** en Ajustes › Comprobaciones: cuándo se comprueba (siempre, solo con el botón o nunca), cada comprobación por separado, los tamaños mínimos y el umbral de semitransparencias. Al cambiar una regla, los avisos de todos los archivos se actualizan al momento.
- Si cambias el rol o la variante de un archivo ya subido, su nombre en Drive se pone al día en la siguiente sincronización.

### Muestras

Cada muestra es una prueba física de una variante: la camiseta que pedís al proveedor, una placa de esmalte… Sustituye a la pestaña «Muestras» de la hoja de cálculo.

- **Dónde se apuntan**: en la variante (botón **Apuntar una muestra**, justo debajo del estado) o en la pestaña **Muestras** (botón **Nueva muestra**).
- **Viene rellena** con el proveedor, la producción y la prenda de la variante. Si la variante estaba en «Borrador», la app propone pasarla a «Muestra pedida».
- **Al llegar**: botón **Ha llegado hoy** (si llegó otro día, cambia la fecha). Los días de entrega se calculan solos.
- **Valoración** del 1 al 5: impresión al recibir y tras 5 y 10 lavados. También el tallaje y la comparación con la camiseta serigrafiada. Lavados, tallaje y serigrafía solo salen en prendas; en cerámica, talla o costura hay una valoración general.
- **Fotos de la muestra**: con la cámara o de la galería. Van a la carpeta de la obra en Drive (`D001-CAM_zorro_muestra_01.jpg`), pero no se mezclan con las fotos de la obra.
- **Decisión**: aprobada, descartada o repetir prueba. Al aprobarla, la app propone pasar la variante a «Aprobada».
- **Pestaña Muestras**: todas, con filtros (pendientes de llegar, sin decidir, aprobadas…) y el **total gastado**. El botón de descarga guarda un CSV con las mismas columnas que la hoja.

### Registro de la calle

Cada vez que alguien pregunta por una obra. Sustituye a la pestaña «Registro calle» de la hoja.

- **Un toque**: el botón **💬 +1** de cada tarjeta de la galería apunta la pregunta con la fecha y quién la apunta, sin abrir nada. El número que lleva es cuántas veces os han preguntado por esa obra.
- **Detalles, si hay tiempo**: el aviso que sale tiene el botón **Detalles** para añadir la reacción, quién (desconocido o conocido), el lugar y el precio que mencionó. Ahí también se borra una pregunta apuntada por error.
- **En la ficha de la obra**, sección **Calle**: el botón **+1 Me han preguntado** y la lista de preguntas.
- **Acceso directo «Apuntar pregunta»** (Android y ordenador): abre la lista de obras con su foto, las más preguntadas primero.
- **Orden «Las más preguntadas en la calle»** en Filtros y orden.
- **Ajustes › Registro de la calle**: cuántas preguntas hay por mes (para la hoja de seguimiento) y el CSV con todo.
- Si el botón de las tarjetas os estorba, se quita en Ajustes › Este aparato. La tarjeta sigue enseñando el número.

### Tipos de obra y paquetes

Cada tipo (Ilustración, Cerámica, Talla de madera, Costura…) tiene sus propios campos, estados y soportes. Están en **Ajustes › Tipos de obra**.

- **Retocar un tipo**: toca su nombre. Puedes cambiar el nombre de los campos, las opciones de las listas y los estados, y ocultar los campos que no uséis. Lo que ya tiene datos no se borra nunca: una opción o un estado en uso se queda, y un campo oculto que tenga algo escrito sigue saliendo en esa obra con «(retirado)».
- **Volver al de fábrica**: deshace vuestros retoques en los cuatro tipos que trae la app.
- **Quitar el tipo**: solo se puede si ninguna obra lo usa.
- **Tipo nuevo (bisutería, vidrieras, forja…)**: pedidle a Claude un *paquete de tipo*. Es un archivo `.json`. En **Ajustes › Importar y exportar › Importar un archivo de Claude**, elegidlo o pegad el texto tal cual (aunque venga entre las marcas de código de Claude). La app enseña lo que añade o cambia antes de guardar, y no deja importarlo si tiene errores. Se guarda una copia en Drive › Tienda › Paquetes de tipos.
- **Actualizar un tipo** con un paquete nuevo: los campos que desaparezcan pero tengan datos se ocultan, no se borran.
- **Guardar como paquete**: descarga vuestro tipo retocado, por si queréis pasárselo a Claude para ampliarlo.

### Importar fichas preparadas con Claude

Si le pasáis a Claude fotos o una lista de obras, os puede preparar un archivo de *fichas*. Se importa con el mismo botón que un paquete. Antes de guardar se ve cada ficha con su casilla, y elegís cuáles entran.

- **Solo crea obras nuevas.** Si una ya existe con el mismo nombre y tipo, sale desmarcada como posible repetida.
- **Añadidos**: para completar una obra que ya tenéis, el archivo puede traer un *añadido* (por su código o su nombre). Solo rellena campos vacíos, añade texto a las notas y suma valores a las listas: nunca sobrescribe lo que teníais.
- **No se inventa nada.** Un autor, estado u opción que la app no conoce se deja vacío y se apunta como duda. Los datos que no encajan en ningún campo van a las Notas («Otros datos importados»). Si falta la fecha, se queda vacía.
- Cada obra importada lleva la marca **Pendiente de revisar (importada)** con sus dudas. La franja de arriba de Diseños las cuenta. En la ficha, cuando la hayáis repasado, pulsad **Ya está revisada**.
- Las fotos no vienen en el archivo: se añaden después desde la ficha.

### Catálogo

**Ajustes › Importar y exportar › Catálogo**. Una página por obra con su foto, sus datos y la tabla de variantes.

- Elegís qué entra: todas las obras, solo las que queréis vender o solo las que tienen algo publicado; un tipo o todos; con precios o sin ellos; con costes o sin ellos (para enseñarlo fuera, dejad los costes quitados).
- **Crear en Google Docs**: lo deja como documento de Google en Drive › Tienda › Catálogos, listo para retocar, compartir o pasar a PDF.
- **Descargar para imprimir**: un archivo que se abre en el navegador. Desde ahí, Imprimir › Guardar como PDF.

### CSV para la tienda (Shopify)

**Ajustes › Importar y exportar › CSV para la tienda**. Prepara un archivo para importar los productos en Shopify (Productos › Importar).

- Un producto por variante con precio, con el código de la variante como SKU.
- Los productos entran como **borrador** y sin publicar: los repasáis allí antes de que se vean.
- El precio va **con IVA**. El coste no sale nunca.
- No entran: las obras ya vendidas o regaladas, las variantes en pausa o retiradas, ni las que no tienen precio.
- Las fotos no van en el CSV (Shopify solo acepta enlaces públicos). Se suben en Shopify o llegan solas desde Printful/Printify.
- El nombre de la marca (columna *Vendor*) se escribe una vez y se recuerda.

### Copia completa (ZIP)

**Ajustes › Importar y exportar › Copia completa (ZIP)**. Un solo archivo con todo, que no depende de Google:

- Los datos en JSON (se pueden volver a cargar en la app) y en CSV: obras, variantes, muestras y registro de la calle. Los CSV se abren con cualquier hoja de cálculo.
- Las fotos, en carpetas por tipo y obra (`Diseños/Ilustración/D001 Zorro/`).
- Si lo marcáis, también los archivos de impresión y adjuntos (PNG, TIFF, SVG, PDF…). Pueden pesar mucho.
- Un `LEEME.txt` que explica qué hay dentro.

Guardadla en un disco externo o en otra nube. Si pasa un mes sin hacerla, Diseños enseña un aviso con **Hacerla** y **Más tarde**.

### Avisos

Informan, pero nunca impiden guardar:

- Original físico de una persona con restricciones por empleo público marcado para vender.
- Variante publicada sin «Derechos cedidos» cuando el autor no es el titular.
- Vajilla o utensilio «sin comprobar» si es apto para alimentos.
- Pieza de costura publicada sin composición del tejido.

---

## Dónde está cada cosa en Drive

```
Tienda/
├── gestor.json                      (los datos)
├── Diseños/
│   ├── Ilustración/D001 Zorro/      (una carpeta por obra)
│   │   ├── D001_zorro_foto_01.jpg
│   │   ├── D001_zorro_clara_v01.png
│   │   └── D001_zorro_vector_v01.svg
│   ├── Cerámica/ …
│   └── _Por ordenar/                (capturas sin clasificar)
├── Catálogos/                       (documentos de Google creados desde la app)
├── Paquetes de tipos/               (copia de cada paquete importado)
└── Copias de seguridad/
```

- Si cambias el nombre de una obra, su carpeta se renombra sola.
- **Sube siempre los archivos desde la app.** Lo que arrastres a estas carpetas desde la web de Drive no aparecerá en la app.
- El renombrado de archivos se puede apagar en Ajustes › Fotos y archivos.

## Sin conexión y con dos aparatos a la vez

- Todo se guarda en el aparato y funciona sin internet. Al volver la conexión, se sincroniza solo.
- Si los dos cambiáis **campos distintos** de la misma obra, se juntan los dos cambios.
- Si los dos cambiáis el **mismo campo corto**, se queda el cambio más reciente (el otro sigue en el Historial).
- Si los dos cambiáis el **mismo texto largo** (descripciones, notas), no se pierde ninguno: la ficha avisa y deja elegir uno o juntar los dos.
- Si los dos creáis una obra sin conexión y coincide el código, una de las dos recibe el número siguiente.
- Las fotos y archivos hechos sin conexión suben cuando la haya. Hasta entonces llevan el icono de una nube.
- Si los dos aparatos sincronizan **exactamente a la vez**, la app lo detecta y vuelve a juntar los cambios: no se pierde ninguno.
- Las preguntas de la calle apuntadas a la vez en los dos aparatos se suman: cada una es un registro aparte.

## Copias de seguridad

- **Automáticas** en Drive › Tienda › Copias de seguridad (cada día, cada 3 días o cada semana). Se guardan las últimas 30 y la primera de cada mes para siempre.
- Cada **aparato** guarda además una copia al día (las 7 últimas).
- **Guardar los datos en un archivo**: en Ajustes › Copias de seguridad.
- Las copias de Drive guardan los datos. Las fotos y los archivos siguen en Drive mientras no vaciéis la papelera.
- **Fuera de Google**: la copia completa (ZIP) lleva datos y fotos. Haced una al mes (la app os lo recuerda).

## Qué no hace todavía

Llegará en las fases siguientes:

- Generador de anuncios y publicaciones (Instagram, Wallapop, Vinted, Milanuncios…) con el registro de lo publicado.
- La ubicación de las piezas es de momento un texto con sugerencias, no un árbol de sitios.

## Actualizar la app

**Si ya tenías subida una versión anterior**: en el repositorio de GitHub, pulsa **Add file → Upload files**, arrastra **todos los archivos de la carpeta nueva excepto `config.js`** (así no pierdes el ID que pegaste) y pulsa **Commit changes**. Los archivos con el mismo nombre se sustituyen solos. Después, en cada aparato: Ajustes › La app › **Buscar actualización**.

Al cambiar archivos en GitHub por tu cuenta, hay que subir también el número de versión en dos sitios: `VERSION` en `version.js` y `VERSION` en `sw.js` (por ejemplo, `gd-v0.4.1`).
Los aparatos cogen la versión nueva la segunda vez que abren la app, o con Ajustes › La app › **Buscar actualización**.
Usad todos los aparatos con la misma versión: uno con una versión antigua no sube nada hasta actualizarse.

## Si algo falla

- **«Sin configurar»**: falta el ID en `config.js` (paso 3), o GitHub todavía no ha publicado el cambio (espera 2 minutos y recarga).
- **Error 400 `redirect_uri_mismatch` al conectar**: la dirección del paso 2.6 no coincide exactamente con la de la app. Revisa la barra final. Si la acabas de añadir, espera unos minutos.
- **Error 403 `access_denied`**: la cuenta con la que entras no está en *Usuarios de prueba* del proyecto de Google Cloud. Entra con la cuenta conjunta.
- **«Conectar» aparece a menudo**: Google pide renovar el permiso cada hora. Con *Reconectar al abrir la app* activado (Ajustes › Cuenta de Google) se hace solo.
- **Una foto HEIC no se convierte** (pasa en Chrome de Windows o Android con fotos enviadas desde un iPhone): la primera vez hace falta conexión para descargar el conversor. En el iPhone se evita con Ajustes › Cámara › Formatos › **Máxima compatibilidad**.
- **«Error» en la pastilla de arriba**: tócala para reintentar. El detalle sale en Ajustes › Cuenta de Google. Lo que hayáis cambiado no se pierde: queda pendiente y sube en la siguiente sincronización.
