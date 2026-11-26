// Renders the cosmos film with headless Chrome and pipes raw frames into ffmpeg.
//   node render.mjs                                           full film, 1920x1080 (resumable)
//   node render.mjs --stills 0,3,7.4 --dir ./stills --w 960   check individual moments
// Needs: npm i (puppeteer-core), Google Chrome, ffmpeg on PATH. See README.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const here = path.dirname(fileURLToPath(import.meta.url));
const W = +arg('w', 1920), H = Math.round(W * 9 / 16 / 2) * 2;
const stills = arg('stills', '') ? arg('stills').split(',').map(Number) : null;
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const chrome = process.env.CHROME || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome');
const raw = ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript' };

let sink = null;
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST') {
    try {
      const parts = []; for await (const c of req) parts.push(c);
      const ok = sink.write(Buffer.concat(parts)); if (!ok) await new Promise(r => sink.once('drain', r));
      return res.end('ok');
    } catch { return res.destroy(); } // the page went away mid-frame; that frame is retried
  }
  try { const f = path.join(here, path.basename(new URL(req.url, 'http://x').pathname)); res.setHeader('content-type', TYPES[path.extname(f)] || 'application/octet-stream'); res.end(await readFile(f)); }
  catch { res.statusCode = 404; res.end(); }
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

let browser, page;
async function open() {
  browser = await puppeteer.launch({ executablePath: chrome, headless: true, protocolTimeout: 0, args: ['--use-angle=' + (process.platform === 'darwin' ? 'metal' : 'default'), '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
  page = await browser.newPage();
  page.on('pageerror', e => console.error('[page error]', e.message));
  await page.goto(base + '/film.html'); await page.waitForFunction('window.film', { timeout: 60000 });
  await page.evaluate((w, h) => film.setup(w, h), W, H);
}
// The OS may reset the GPU under load or when the machine sleeps; reopen the page and redo that frame.
async function frame(t, opts) {
  for (let tries = 0; tries < 60; tries++) {
    const work = page.evaluate(async (t, o, u) => { film.render(t, o); return film.post(u); }, t, { ...opts, tiles: 8 + Math.min(tries, 5) * 6 }, base + '/f').catch(() => false);
    const ok = await Promise.race([work, new Promise(r => setTimeout(r, 180000, false).unref())]);
    if (ok) return;
    console.log('GPU reset at', t.toFixed(3), '- retrying'); await Promise.race([browser.close().catch(() => {}), new Promise(r => setTimeout(r, 5000))]);
    if (tries > 2) await new Promise(r => setTimeout(r, 8000));
    await open().catch(() => {});
  }
  throw new Error('could not render t=' + t);
}
await open();
const close = p => new Promise((res, rej) => { p.stdin.end(); p.on('close', c => c ? rej(new Error('ffmpeg ' + c)) : res()); });

if (stills) {
  const dir = path.resolve(arg('dir', './stills')); await mkdir(dir, { recursive: true });
  for (const t of stills) {
    const ff = spawn(ffmpeg, ['-y', '-loglevel', 'error', ...raw, '-i', '-', '-vf', 'vflip', '-frames:v', '1', ...(arg('ext', 'jpg') === 'jpg' ? ['-q:v', '2'] : []), path.join(dir, `t${t.toFixed(2).padStart(5, '0')}.${arg('ext', 'jpg')}`)], { stdio: ['pipe', 'inherit', 'inherit'] });
    sink = ff.stdin; const s = Date.now();
    await frame(t, { volSubs: +arg('vol', 2), ptSubs: +arg('pt', 2), count: +arg('count', 1900000) });
    await close(ff); console.log('still', t, Date.now() - s, 'ms');
  }
} else {
  // Rendered in short segments so a long run can be stopped and resumed at any time.
  const fps = +arg('fps', 30), total = 24 * fps, step = +arg('segment', 30), out = path.resolve(arg('out', './out')); await mkdir(out, { recursive: true });
  const start = Date.now(); let done = 0;
  for (let s = 0; s < total; s += step) {
    const name = `seg_${String(s).padStart(4, '0')}`, file = path.join(out, name + '.mkv');
    if (existsSync(file)) continue;
    const part = path.join(out, name + '.part.mkv');
    const ff = spawn(ffmpeg, ['-y', '-loglevel', 'error', ...raw, '-r', String(fps), '-i', '-', '-vf', 'vflip,scale=out_color_matrix=bt709:out_range=tv', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '8', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', part], { stdio: ['pipe', 'inherit', 'inherit'] });
    sink = ff.stdin;
    for (let i = s; i < Math.min(s + step, total); i++) { await frame(i / fps, { frame: i, volSubs: +arg('vol', 2), ptSubs: +arg('pt', 4) }); done++; }
    await close(ff); await rename(part, file);
    console.log(`frames ${s}-${s + step - 1} of ${total}  ${((Date.now() - start) / done / 1000).toFixed(2)} s/frame`);
  }
  console.log('segments ready in', out, '- now run: node encode.mjs');
}
await browser.close(); server.close();
