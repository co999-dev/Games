// Rendert trailer.html Bild für Bild und kodiert es mit ffmpeg.
// Nutzung: node tools/render-trailer.js <ausgabe.mp4> [audio.wav] [--dry]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

(async () => {
  const [out, audio] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const dry = process.argv.includes('--dry');
  const stills = process.argv.includes('--stills');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.resolve(__dirname, '../trailer.html'));
  await page.evaluate(() => document.fonts.ready);
  const total = await page.evaluate(() => window.TOTAL_FRAMES);

  let ff;
  if (!dry && !stills) {
    const args = ['-y', '-f', 'image2pipe', '-framerate', '30', '-i', '-'];
    if (audio) args.push('-i', audio);
    args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
    if (audio) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
    args.push(out);
    ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
  }
  const canvas = await page.$('canvas');
  for (let i = 0; i < total; i++) {
    const info = await page.evaluate(i => window.renderFrame(i), i);
    if (i % 30 === 0 || (i > 0 && !info.alive && i % 5 === 0 && info.t < 20)) console.error(`frame ${i} t=${info.t.toFixed(2)} alive=${info.alive} score=${info.score} combo=${info.combo}`);
    if (stills && i % 45 === 0) await canvas.screenshot({ path: path.join(out, `still_${String(i).padStart(3, '0')}.png`) });
    if (ff) {
      const buf = await canvas.screenshot({ type: 'png' });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    }
  }
  if (ff) { ff.stdin.end(); await new Promise(r => ff.on('close', r)); }
  await browser.close();
})();
