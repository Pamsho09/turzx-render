import { TurzxDisplay, loadFramebuffer } from 'turzx-render';

// Build SVG with controlled values. Escape XML if you insert external text.
export function dashboardSvg(width, height) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#101827"/>
    <text x="24" y="60" font-family="sans-serif" font-size="28" fill="white">Mi proyecto</text>
    <text x="24" y="105" font-family="sans-serif" font-size="18" fill="#93c5fd">Pantalla lista</text>
  </svg>`);
}

export function clockSvg(width) {
  const time = new Date().toLocaleTimeString('es-MX', { hour12: false });
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="80">
    <rect width="100%" height="100%" fill="#101827"/>
    <text x="24" y="53" font-family="monospace" font-size="38" fill="#34d399">${time}</text>
  </svg>`);
}

// --preview renders without claiming USB, useful while another app owns the panel.
if (process.argv.includes('--preview')) {
  const { default: sharp } = await import('sharp');
  const output = process.argv[process.argv.indexOf('--preview') + 1] || 'dashboard.png';
  await sharp(dashboardSvg(480, 320)).composite([{ input: clockSvg(480), top: 240, left: 0 }]).png().toFile(output);
  console.log(output);
} else {
  const display = await TurzxDisplay.open();
  let stopped = false;
  const stop = () => { stopped = true; };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    await display.drawImage(dashboardSvg(display.width, display.height));
    while (!stopped) {
      const pixels = await loadFramebuffer(clockSvg(display.width), display.width, 80);
      await display.drawRegion(0, display.height - 80, display.width, 80, pixels);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } finally {
    await display.close();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}
