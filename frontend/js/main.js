// Boots the cinematic layers. Each one is optional: no WebGL, no video, reduced motion or a
// failed script all leave a working site (see script.js for the workspace itself).
import { Film } from './film.js';
import { Sound, labelSound } from './sound.js';

const root = document.documentElement, $ = id => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = Math.min(innerWidth, innerHeight) < 620 || (navigator.deviceMemory && navigator.deviceMemory < 4);
const saver = navigator.connection?.saveData;
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Real GPU only. Software WebGL (no driver, remote desktop, acceleration switched off in the
// browser) would make every frame crawl, so those machines get the CSS entrance instead.
const SOFTWARE = /swiftshader|llvmpipe|softpipe|basic render|microsoft basic|software|warp/i;
const hasGL = () => {
  try {
    const gl = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    if (!gl) return false;
    const info = gl.getExtension('WEBGL_debug_renderer_info'), name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return !SOFTWARE.test(name);
  } catch { return false; }
};

const loader = $('site-loader');
const film = new Film({ video: $('film'), holder: $('stage-film') });
let cosmos = null, overture = null, story = null, director = null, entered = false, filmSettled = false;

root.classList.add('is-entering');
const behind = [$('immersive-intro'), $('app')]; behind.forEach(el => { el.inert = true; });
boot().catch(error => { console.error(error); finish(true); });

async function boot() {
  if (!window.gsap || !window.ScrollTrigger) throw new Error('GSAP unavailable');
  const [{ Director }, { Story }] = await Promise.all([import('./director.js'), import('./story.js')]);
  await Promise.race([Promise.all([document.fonts.load('250 40px "Mona Wide"'), document.fonts.load('400 16px "Mona Sans"')]), sleep(2500)]);

  // film, or stills when scrubbing is not possible or not wanted
  const loading = reduced || saver ? Promise.reject(new Error('stills')) : film.load(small ? '/assets/media/cosmos-720.mp4' : '/assets/media/cosmos-1080.mp4');
  loading.catch(() => { film.failed = true; film.enableStills(); }).finally(() => { filmSettled = true; });
  setTimeout(() => { if (!film.ready) film.enableStills(); }, 9000); // slow line: scroll through stills meanwhile

  if (!reduced && hasGL()) {
    try { const { Cosmos } = await import('./cosmos.js'); cosmos = new Cosmos($('cosmos'), { small }); }
    catch (error) { console.warn('WebGL layer disabled:', error.message); cosmos = null; }
  }

  director = new Director({ story: $('immersive-intro'), app: $('app'), reduced });
  story = new Story({ root: $('scene-sticky'), reduced });
  story.build(); cosmos?.setLines(story.lines);

  if (reduced) finish(false);
  else {
    const { Overture, FlatOverture } = await import('./overture.js');
    overture = cosmos ? new Overture(cosmos.renderer, { small }) : new FlatOverture($('overture-keys'));
    if (!cosmos) loader.classList.add('no-gl');
    overture.resize($('cosmos').clientWidth, $('cosmos').clientHeight);
    overture.player.onLeave = () => loader.classList.add('is-leaving');
    overture.player.onOpen = () => { loader.classList.add('is-opening'); setTimeout(enterSite, 780); };
  }
  director.onFrame(frame);

  let w = innerWidth, timer;
  addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      cosmos?.resize(); overture?.resize($('cosmos').clientWidth, $('cosmos').clientHeight);
      if (innerWidth !== w || !matchMedia('(hover: none)').matches) { w = innerWidth; story.build(); cosmos?.setLines(story.lines); }
    }, 160);
  }, { passive: true });
  $('cosmos').addEventListener('webglcontextlost', event => { event.preventDefault(); cosmos = null; if (overture && !overture.done) finish(true); });
}

// ---------- one loop ----------
const started = performance.now();
const stage = $('stage'), stageFilm = $('stage-film'), frameEl = $('app-frame');
let veil = -1, tilt = '', parallax = '';
function frame(d, dt, real) {
  film.seek(d.film);
  story.update(d.progress);

  if (overture) {
    // hold the phrase until the film can be scrubbed, but never past ten seconds
    const canLeave = filmSettled || performance.now() - started > 10000;
    overture.update(real, canLeave);
    if (!loader.classList.contains('is-playing')) loader.classList.add('is-playing');
    if (overture.done || performance.now() - started > 19000) finish(false);
  }

  // the film leans with the pointer; the WebGL layer leans further, which is the depth
  if (!reduced) {
    const p = d.pointer, t = `translate3d(${(-p.x * 9).toFixed(2)}px,${(-p.y * 6).toFixed(2)}px,0) rotateY(${(p.x * .9).toFixed(3)}deg) rotateX(${(-p.y * .7).toFixed(3)}deg) scale(1.06)`;
    if (t !== parallax) stageFilm.style.transform = parallax = t;
  }
  // the workspace swings up out of the disc as it arrives
  const a = d.arrival, v = Math.round(a * 36) / 100;
  if (v !== veil) { veil = v; stage.style.setProperty('--veil', v); root.classList.toggle('in-workspace', a > .85); }
  if (!reduced) {
    const e = 1 - Math.pow(1 - Math.min(1, a), 2.2), t = a >= .999 || a <= 0 ? '' : `translate3d(0,0,${((1 - e) * -420).toFixed(1)}px) rotateX(${((1 - e) * 24).toFixed(2)}deg)`;
    if (t !== tilt) frameEl.style.transform = tilt = t;
  }

  if (cosmos) {
    cosmos.adapt(real);
    const covered = a >= .999 && !overture; cosmos.setIdle(covered); if (covered) return;
    const r = cosmos.renderer;
    if (overture) {
      // keys first, then the dust on top as the way opens
      r.autoClear = true; overture.render();
      if (overture.openT > 0) { r.autoClear = false; const tm = r.toneMapping; r.toneMapping = 0; cosmos.frame(dt, d, story.look, Math.min(1, overture.openT / 1.4)); r.toneMapping = tm; r.autoClear = true; }
    } else cosmos.frame(dt, d, story.look, 1 - Math.min(1, a * 1.15));
  }
}

// ---------- entering ----------
function enterSite() { if (entered) return; entered = true; root.classList.remove('is-entering'); behind.forEach(el => { el.inert = false; }); story?.begin(); }
function finish(force) {
  if (overture && cosmos) overture.dispose(); overture = null;
  loader.classList.add('is-playing', 'is-leaving', 'is-gone');
  if (force) { root.classList.remove('is-entering'); document.querySelectorAll('.js .scene').forEach(s => { s.style.visibility = ''; }); if (!director) root.classList.remove('js'); }
  enterSite();
}
function leave(withSound) { Sound.set(withSound); if (withSound) Sound.unlock(); labelSound(); overture ? overture.player.leave() : finish(false); }
$('enter-sound').addEventListener('click', () => leave(true));
$('enter-quiet').addEventListener('click', () => leave(false));
addEventListener('keydown', event => { if (event.key === 'Escape' && overture) leave(Sound.on); });
