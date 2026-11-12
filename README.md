# turzx-render

Una librería pequeña de Node.js y TypeScript para controlar la pantalla USB
**TURZX / Turing / UsbMonitor de 3.5 pulgadas**. Puedes mostrar imágenes,
texto y dashboards desde cualquier proyecto de Node, sin abrir una app de escritorio.
Incluye una CLI y tipos de TypeScript. Licencia MIT.

La librería maneja la pantalla; tu proyecto decide qué mostrar. No incluye
lectores de consumo de Claude/Codex, datos personales ni servicios de terceros.

## Compatibilidad

- Panel de **320 × 480**; en horizontal, **480 × 320**.
- Unidad utilizada: USB `1a86:5722`, serie `USB35INCHIPSV2`, protocolo Revision A.
- Transporte USB bulk directo, interfaz 1, endpoint OUT `0x03`, mediante `usb`/libusb.
- Node.js **20 o superior**; se recomienda Node 24.
- Probado con el hardware original en macOS. Linux y Windows no están validados
  en este proyecto; dependen de permisos y del driver USB. No asumir compatibilidad
  con otros modelos de 3.5, 5 o 7 pulgadas solo porque tengan la misma marca.

Solo un programa puede controlar el panel a la vez. Cierra `usage-screen`, Chato
o el software del fabricante antes de abrirlo desde otro proyecto.

## Instalar en otro proyecto

Desde GitHub (no requiere que el paquete esté publicado en npm):

```bash
npm install github:Pamsho09/turzx-render#v1.0.1
```

La instalación compila TypeScript mediante `prepare`. También puedes instalar un
tarball construido localmente:

```bash
git clone https://github.com/Pamsho09/turzx-render.git
cd turzx-render
npm ci
npm pack
# En tu otro proyecto:
npm install /ruta/turzx-render/turzx-render-1.0.1.tgz
```

`usb` y `sharp` contienen componentes nativos. Usa una versión de Node compatible
con tu sistema y reinstala las dependencias si cambias de arquitectura o runtime.
Esta librería es para Node; no se ejecuta dentro del navegador.

## Primera imagen

En un archivo `.mjs`, o en un proyecto con `"type": "module"`:

```js
import { TurzxDisplay, Orientation } from 'turzx-render';

const display = await TurzxDisplay.open({
  orientation: Orientation.Landscape,
  brightness: 70,
});

try {
  await display.drawImage('./foto.png', { fit: 'contain' });
} finally {
  await display.close();
}
```

`close()` libera USB y devuelve el driver del kernel cuando se había separado.
La última imagen permanece en la pantalla. Usa `clear()` para borrarla o
`screenOff()` para apagar la salida antes de cerrar.

## Texto y gráficos

El panel recibe píxeles, no texto. Para dibujar texto, iconos, barras o tarjetas,
genera una imagen SVG y pásala como `Buffer`; `sharp` la convierte a RGB565.

```js
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320">
  <rect width="480" height="320" fill="#101827"/>
  <text x="24" y="70" font-family="sans-serif" font-size="32" fill="white">Hola, pantalla</text>
</svg>`);
await display.drawImage(svg);
```

Escapa `&`, `<`, `>`, comillas y apóstrofos si insertas texto externo en SVG.
Las fuentes disponibles dependen del equipo que renderiza la imagen.

## Actualizar una parte

Para un reloj o un porcentaje, actualiza su región en vez de enviar toda la imagen:

```js
import { loadFramebuffer } from 'turzx-render';

const row = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="80">
  <rect width="480" height="80" fill="black"/>
  <text x="20" y="50" fill="white" font-size="32">42%</text>
</svg>`);
const pixels = await loadFramebuffer(row, 480, 80);
await display.drawRegion(0, 240, 480, 80, pixels);
```

Las coordenadas usan la orientación actual, con origen arriba a la izquierda.
`drawRegion` espera exactamente `ancho × alto × 2` bytes RGB565 little-endian.
No acepta PNG directamente: usa `loadFramebuffer` para convertirlo.

## Ejemplos ejecutables

Desde este repositorio, después de `npm ci`:

```bash
node examples/image.mjs ./assets/test.png
npm run example:dashboard
# Vista previa sin acceder a USB:
npm run example:dashboard -- --preview /tmp/turzx-dashboard.png
```

El dashboard dibuja una base y actualiza solo la fila del reloj. Ctrl+C libera la
pantalla. Sus importaciones usan el nombre del paquete, igual que otro proyecto.

## API

| Operación | Comportamiento |
| --- | --- |
| `TurzxDisplay.open({ orientation?, brightness?, timeoutMs? })` | Abre USB; horizontal por defecto; timeout por transferencia de 10 s |
| `findDisplay()` | Devuelve identidad USB, o `undefined`, sin reclamar el panel |
| `display.device` | Identidad del panel abierto |
| `display.width`, `display.height`, `display.orientation` | Geometría actual |
| `setOrientation(Orientation.Landscape)` | También `Portrait`, `ReversePortrait` y `ReverseLandscape` |
| `setBrightness(0…100)` | Porcentaje de brillo; la librería adapta la escala del firmware |
| `drawImage(pathOrBuffer, { fit?, background?, atomic? })` | Imagen completa, `cover` por defecto; `contain` mantiene la imagen y añade fondo |
| `drawRegion(x, y, width, height, pixels, { atomic? })` | Región RGB565 LE, con límites y tamaño validados |
| `fill(r, g, b)` | Color sólido, componentes de 0 a 255 |
| `clear()` | Borra y restaura la orientación |
| `screenOn()`, `screenOff()` | Enciende o apaga la salida |
| `reset()` | Reinicia y cierra la instancia; espera la reconexión y vuelve a abrir |
| `close()` | Espera las operaciones pendientes y libera USB; se puede llamar varias veces |
| `sendRaw(bytes)` | Comandos avanzados, pasando por la misma cola de escritura |
| `loadFramebuffer(source, width, height, options?)` | Convierte imagen a RGB565 LE |
| `rgb888ToRgb565(buffer)` | Convierte RGB de 3 bytes por píxel a 2 |
| `solidFramebuffer(width, height, r, g, b)` | Crea un framebuffer de color sólido |

Todas las operaciones del panel son asíncronas: usa `await`. No escribas al endpoint
por tu cuenta mientras la librería transmite una imagen. La cola es por instancia;
no abras dos controladores simultáneos para el mismo panel.

## CLI

Tras instalar el paquete en tu proyecto:

```bash
npx turzx --list
npx turzx ./foto.png --contain --brightness 70
npx turzx ./foto.png --portrait
npx turzx --clear
npx turzx --help
```

En este repositorio también puedes usar `npm run dev -- --list`.

## Rendimiento y transporte

En la unidad usada para desarrollar se midieron unos **171 KB/s**: una imagen
completa horizontal tiene **307,200 bytes** y tarda aproximadamente **1.9 s**.
No es un monitor para video a 30/60 FPS. Una fila de 480 × 80 tarda alrededor de
0.45 s. Envía solo las regiones que cambian y evita acumular frames en la cola.

El panel muestra los bytes mientras llegan. `atomic: true` apaga la salida durante
la transferencia y la enciende al terminar: oculta el barrido, pero **no** añade un
doble búfer ni hace más rápida la transferencia. En regiones pequeñas puede parpadear
toda la pantalla; úsalo principalmente para cambios completos.

Se usa USB directo porque en la configuración macOS probada el transporte serial
CDC descolocaba píxeles de las imágenes. Un color sólido podía ocultar el problema.
Para diagnosticarlo utiliza `assets/test.png`, que tiene un patrón asimétrico.

## Errores y desconexiones

- **No display found:** revisa el cable, el puerto y el modelo USB.
- **Unable to claim USB interface:** cierra el programa que ya controla el panel.
- **Short USB write / timeout:** no sigas enviando sobre esa instancia; ciérrala,
  revisa la conexión y abre una nueva. El ejemplo no reconecta automáticamente.
- **Imagen girada:** elige `ReverseLandscape` o `ReversePortrait` según el montaje.
- **No aparece el puerto serial:** llama a `close()` para devolver la interfaz.

La librería propaga errores; tu aplicación decide cuándo reintentar. Evita bucles
de reintentos sin espera. Después de desconectar físicamente o de `reset()`, abre
una instancia nueva.

## Desarrollo

```bash
npm ci
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

`src/usb.ts` contiene el transporte, `src/protocol.ts` los comandos,
`src/image.ts` la conversión y `src/display.ts` la API. El punto de entrada público
es `src/index.ts`. `dist/` se genera al compilar.

Las pruebas no necesitan pantalla: verifican coordenadas, orientación, brillo,
conversión RGB565 y tamaños de framebuffer. El resultado físico y los drivers
de otros sistemas requieren validación con hardware real.

Referencia del protocolo: [turing-smart-screen-python, Revision A](https://github.com/mathoudebine/turing-smart-screen-python/blob/main/library/lcd/lcd_comm_rev_a.py).
Este proyecto implementa su propio cliente Node y utiliza `usb` y `sharp` como dependencias.
