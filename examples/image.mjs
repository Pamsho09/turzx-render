import { TurzxDisplay, Orientation } from 'turzx-render';

const file = process.argv[2];
if (!file) throw new Error('Uso: node examples/image.mjs ./foto.png');
const display = await TurzxDisplay.open({ orientation: Orientation.Landscape, brightness: 70 });
try {
  await display.drawImage(file, { fit: 'contain', atomic: true });
} finally {
  await display.close();
}
