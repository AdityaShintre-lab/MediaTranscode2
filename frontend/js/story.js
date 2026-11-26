// The words. Each line is split into characters, measured once at rest, and choreographed
// on a single paused GSAP timeline whose unit is story progress (0-100). The director
// scrubs it with the same value that drives the film.
import { Sound } from './sound.js';
const { gsap } = window;

const coarse = matchMedia('(hover: none)').matches;
const BLUR = coarse ? 0 : 14;

// enter: where the letters come from, matched by the particles in cosmos.js
// window: [in, settled, leaving, gone] in story progress
export const LINES = {
  spark:       { mode: 'star',   window: [0, 0, 4.6, 9.4] },
  'element-a': { mode: 'star',   window: [9.8, 14, 20.4, 23.5] },
  'element-b': { mode: 'star',   window: [11.4, 15.6, 20.4, 23.5] },
  hush:        { mode: 'gather', window: [23.7, 26.3, 28.5, 30.2] },
  unfolds:     { mode: 'burst',  window: [31.8, 37.4, 42.8, 46.4] },
  import:      { mode: 'gather', window: [46.6, 50.8, 57.8, 61] },
  transform:   { mode: 'spiral', window: [61.6, 66, 73.4, 76.4] },
  export:      { mode: 'core',   window: [77.2, 81.2, 87.6, 90.6] },
  yours:       { mode: 'core',   window: [91.2, 95.4, 200, 201] },
};
const SCENE_OF = { 'element-a': 'element', 'element-b': 'element' };

function split(el) {
  const text = el.textContent.trim(), chars = [];
  el.textContent = '';
  const sr = document.createElement('span'); sr.className = 'sr-only'; sr.textContent = text;
  const vis = document.createElement('span'); vis.setAttribute('aria-hidden', 'true');
  text.split(' ').forEach((word, i) => {
    if (i) vis.append(' ');
    const w = document.createElement('span'); w.className = 'word';
    [...word].forEach(ch => { const c = document.createElement('span'); c.className = 'char'; c.textContent = ch; w.append(c); chars.push(c); });
    vis.append(w);
  });
  el.append(sr, vis);
  return chars;
}
// deterministic per-character randomness, so a rebuild never reshuffles
const rnd = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

export class Story {
  constructor({ root, reduced }) {
    this.root = root; this.reduced = reduced;
    this.look = { dust: .55, burst: 0, swirl: 0, travel: 0, glow: .5, warm: 1 };
    this.last = 0;
    this.lines = [...root.querySelectorAll('[data-line]')].map(el => ({ name: el.dataset.line, el, chars: split(el), fx: { in: 0, out: 0, z: 0 }, ...LINES[el.dataset.line] }));
    this.scenes = Object.fromEntries([...root.querySelectorAll('[data-scene]')].map(el => [el.dataset.scene, el]));
  }

  // rest positions relative to the viewport centre
  measure() {
    const base = this.root.getBoundingClientRect(), cx = base.width / 2, cy = base.height / 2;
    this.lines.forEach(line => {
      line.rest = line.chars.map((c, i) => {
        const r = c.getBoundingClientRect();
        return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height, cx: r.left - base.left + r.width / 2 - cx, cy: r.top - base.top + r.height / 2 - cy, i };
      });
      const mid = (line.chars.length - 1) / 2;
      line.order = line.chars.map((_, i) => line.mode === 'burst' ? Math.abs(i - mid) / mid : i / Math.max(1, line.chars.length - 1));
    });
  }

  build() {
    if (this.tl) this.tl.kill();
    const all = this.root.querySelectorAll('.line, .word, .char, [data-soft], .scene, .scroll-cue');
    gsap.killTweensOf(all); gsap.set(all, { clearProps: 'transform,opacity,filter,visibility' });
    this.measure();
    this.tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
    this.reduced ? this.buildReduced() : this.buildFull();
    this.tl.set({}, {}, 100);
    this.tl.time(this.last, true);
    this.applyIntro();
  }

  from(line) {
    const r = line.rest;
    const pos = {
      star:   i => ({ x: -r[i].cx * .22, y: -r[i].cy * .34, z: -240, rx: 46, ry: -r[i].cx * .02, s: .55 }),
      gather: i => ({ x: (rnd(i, 1) - .5) * 260, y: (rnd(i, 2) - .5) * 190, z: -380 + rnd(i, 3) * 520, rx: (rnd(i, 4) - .5) * 120, ry: (rnd(i, 5) - .5) * 120, s: .8 }),
      burst:  i => ({ x: -r[i].cx * .66, y: -r[i].cy * .4, z: -640, rx: 0, ry: r[i].cx * .03, s: .62 }),
      spiral: i => ({ x: -r[i].cx * .30 + r[i].cy * .34, y: -r[i].cy * .30 - r[i].cx * .20, z: -320, rx: 26, ry: 34, s: .6 }),
      core:   i => ({ x: -r[i].cx * .55, y: -r[i].cy * .62, z: -880, rx: 0, ry: 0, s: .8 }),
    }[line.mode];
    return { x: i => pos(i).x, y: i => pos(i).y, z: i => pos(i).z, rotationX: i => pos(i).rx, rotationY: i => pos(i).ry, scale: i => pos(i).s };
  }
  to(line) {
    const r = line.rest;
    const pos = {
      spark:       i => ({ x: r[i].cx * .10, y: -30 - 40 * rnd(i, 6), z: 260, rz: 0, rx: -20 }),
      'element-a': i => ({ x: -150 - 60 * rnd(i, 6), y: -30, z: 340, rz: 0, rx: 0 }),
      'element-b': i => ({ x: 150 + 60 * rnd(i, 6), y: 30, z: 340, rz: 0, rx: 0 }),
      hush:        i => ({ x: r[i].cx * 2.4 + (rnd(i, 1) - .5) * 260, y: 120 + r[i].cy * 1.1 + rnd(i, 2) * 220, z: 520 + 260 * rnd(i, 3), rz: (rnd(i, 4) - .5) * 160, rx: (rnd(i, 5) - .5) * 160 }),
      unfolds:     i => ({ x: r[i].cx * .55, y: r[i].cy * .55, z: 420, rz: 0, rx: 0 }),
      import:      i => ({ x: -r[i].cx * .55 + 60 * (rnd(i, 1) - .5), y: -r[i].cy * .5, z: -520, rz: (rnd(i, 4) - .5) * 70, rx: 0 }),
      transform:   i => ({ x: r[i].cy * .5, y: -r[i].cx * .34, z: 120, rz: 24, rx: 0 }),
      export:      i => ({ x: r[i].cx * .5, y: r[i].cy * .4 + 40, z: 560, rz: 0, rx: 30 }),
      yours:       () => ({ x: 0, y: 0, z: 0, rz: 0, rx: 0 }),
    }[line.name];
    return { x: i => pos(i).x, y: i => pos(i).y, z: i => pos(i).z, rotationZ: i => pos(i).rz, rotationX: i => pos(i).rx };
  }

  buildFull() {
    const tl = this.tl, S = this.scenes;
    // scene on/off and the soft shadow that keeps words legible over bright gas
    const span = (name, a, b, c, d, shade = 1) => {
      tl.fromTo(S[name], { autoAlpha: 0 }, { autoAlpha: 1, duration: .01 }, Math.max(a, .001));
      if (shade) tl.fromTo(S[name], { '--shade': 0 }, { '--shade': shade, duration: b - a }, a).to(S[name], { '--shade': 0, duration: d - c, immediateRender: false }, c);
      tl.to(S[name], { autoAlpha: 0, duration: .01, immediateRender: false }, d);
    };
    gsap.set(S.spark, { autoAlpha: 1 });
    tl.to(S.spark, { autoAlpha: 0, duration: .01 }, 9.5);
    span('element', 9.7, 14, 20.4, 23.6, 0);
    span('hush', 23.6, 25, 28.4, 30.3, 0);
    span('unfolds', 31.7, 36, 42, 46.6, .8);
    span('import', 46.5, 50, 57.8, 61.1, .95);
    span('transform', 61.5, 65, 73.4, 76.5, .95);
    span('export', 77.1, 80, 87.6, 90.7, .95);
    tl.fromTo(S.yours, { autoAlpha: 0 }, { autoAlpha: 1, duration: .01 }, 91.1).fromTo(S.yours, { '--shade': 0 }, { '--shade': .9, duration: 4 }, 91.4);

    this.lines.forEach(line => {
      const [a, b, c, d] = line.window, n = line.chars.length;
      // slow drift toward the camera for as long as the line lives
      const drift = line.name === 'yours' ? 0 : 1;
      if (drift) { const z = [line.name === 'spark' ? 0 : -70, 60]; tl.fromTo(line.el, { z: z[0] }, { z: z[1], duration: d - a }, a).fromTo(line.fx, { z: z[0] }, { z: z[1], duration: d - a }, a); }
      if (line.name !== 'spark') {
        const each = (b - a) * .5, gap = (b - a) * .5, at = line.order;
        const start = this.from(line), end = { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, scale: 1, duration: each, ease: 'power3.out', stagger: i => at[i] * gap };
        // letters only become solid once the dust that forms them has nearly landed
        const haze = { opacity: 0 }, solid = { opacity: 1, duration: each * .62, ease: 'power2.in', stagger: i => at[i] * gap };
        if (BLUR) { haze.filter = `blur(${BLUR}px)`; solid.filter = 'blur(0px)'; }
        tl.fromTo(line.chars, start, end, a).fromTo(line.chars, haze, solid, a + each * .38);
        tl.fromTo(line.fx, { in: 0 }, { in: 1, duration: b - a }, a);
      }
      if (line.name !== 'yours') {
        // spark leaves by word so its timed entrance (per character) is never fought over
        const targets = line.name === 'spark' ? [...line.el.querySelectorAll('.word')] : line.chars;
        const first = line.name === 'spark' ? targets.map(w => line.chars.indexOf(w.firstChild)) : null;
        const m = this.to(line), map = fn => i => fn(first ? first[i] : i);
        const gap = (d - c) * .35;
        const out = { opacity: 0, x: map(m.x), y: map(m.y), z: map(m.z), rotationZ: map(m.rotationZ), rotationX: map(m.rotationX), duration: d - c - gap, ease: line.name === 'hush' ? 'power2.out' : 'power2.in', immediateRender: false, overwrite: false, stagger: i => line.name === 'hush' ? rnd(i, 9) * gap * .4 : (first ? i / targets.length : line.order[i]) * gap };
        if (BLUR) out.filter = `blur(${BLUR}px)`;
        tl.to(targets, out, c);
        tl.fromTo(line.fx, { out: 0 }, { out: 1, duration: d - c, immediateRender: false }, c);
      }
    });

    // supporting copy
    const soft = (name, a, c, dy = 26) => {
      const els = S[name].querySelectorAll('[data-soft]');
      tl.fromTo(els, { opacity: 0, y: dy, z: -120, rotationX: -24 }, { opacity: 1, y: 0, z: 0, rotationX: 0, duration: 2.2, stagger: .7, ease: 'power3.out' }, a);
      if (c) tl.to(els, { opacity: 0, y: -18, z: 90, duration: 1.8, stagger: .2, ease: 'power2.in', immediateRender: false }, c);
    };
    soft('element', 13.4, 20.2); soft('import', 48.6, 57.6); soft('transform', 63.8, 73.2); soft('export', 79, 87.4); soft('yours', 94, null);
    tl.to(S.spark.querySelector('[data-cue]'), { opacity: 0, y: 24, duration: 2.6 }, 1.4);

    // the live layer follows the same events as the film
    const L = this.look;
    tl.fromTo(L, { dust: .55 }, { dust: .8, duration: 20 }, 0)
      .to(L, { dust: .22, duration: 4 }, 23).to(L, { dust: 1.5, duration: 3 }, 28.6).to(L, { dust: 1, duration: 14 }, 34).to(L, { dust: .5, duration: 12 }, 62).to(L, { dust: .85, duration: 14 }, 84)
      .fromTo(L, { travel: 0 }, { travel: 2600, duration: 23, ease: 'power1.in' }, 0).to(L, { travel: 2500, duration: 5.4 }, 23).to(L, { travel: 6400, duration: 18, ease: 'power3.out' }, 28.6).to(L, { travel: 8200, duration: 34 }, 48).to(L, { travel: 12000, duration: 18, ease: 'power1.in' }, 82)
      .fromTo(L, { burst: 0 }, { burst: 1.9, duration: 13, ease: 'power3.out' }, 28.6).to(L, { burst: 0, duration: 22, ease: 'power1.inOut' }, 46)
      .fromTo(L, { swirl: 0 }, { swirl: 2.6, duration: 38, ease: 'power1.inOut' }, 54)
      .fromTo(L, { glow: .5 }, { glow: 1, duration: 20, ease: 'power1.in' }, 0).to(L, { glow: .25, duration: 5 }, 23).to(L, { glow: .9, duration: 1.2 }, 28.6).to(L, { glow: .12, duration: 14 }, 31).to(L, { glow: .34, duration: 22 }, 62).to(L, { glow: .2, duration: 12 }, 86)
      .fromTo(L, { warm: 1 }, { warm: .15, duration: 6 }, 18).to(L, { warm: .25, duration: 10 }, 36).to(L, { warm: .6, duration: 20 }, 66);
  }

  buildReduced() {
    const tl = this.tl;
    const show = (name, a, d) => { tl.fromTo(this.scenes[name], { autoAlpha: 0, '--shade': .95 }, { autoAlpha: 1, duration: 1 }, Math.max(a, .001)); if (d) tl.to(this.scenes[name], { autoAlpha: 0, duration: 1, immediateRender: false }, d); };
    gsap.set(this.scenes.spark, { autoAlpha: 1, '--shade': .9 }); tl.to(this.scenes.spark, { autoAlpha: 0, duration: 1 }, 9);
    show('element', 11, 22); show('hush', 23.5, 28); show('unfolds', 33, 45); show('import', 47, 59); show('transform', 62, 75); show('export', 77, 89); show('yours', 91);
  }

  // The first line arrives on its own, right after the entrance.
  applyIntro() {
    const line = this.lines[0];
    if (this.reduced) return;
    if (!this.introTl) return gsap.set(line.chars, { opacity: 0 });
    this.introTl.kill(); line.fx.in = 1; // rebuilt after a resize: it has already arrived
  }
  begin() {
    const line = this.lines[0], cue = this.scenes.spark.querySelector('[data-cue]');
    if (this.reduced) return;
    const at = line.order, f = this.from(line);
    const end = { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, scale: 1, duration: 1.7, ease: 'power3.out', stagger: i => at[i] * 1.5 };
    const haze = { opacity: 0 }, solid = { opacity: 1, duration: 1.05, ease: 'power2.in', stagger: i => at[i] * 1.5 };
    if (BLUR) { haze.filter = 'blur(16px)'; solid.filter = 'blur(0px)'; }
    this.introTl = gsap.timeline().fromTo(line.fx, { in: 0 }, { in: 1, duration: 3.2, ease: 'none' }, 0).fromTo(line.chars, f, end, 0).fromTo(line.chars, haze, solid, .62).from(cue.querySelector('i'), { scale: 0, duration: 1 }, 2.4);
    if (this.last > 8) this.introTl.progress(1);
  }

  update(progress) {
    if (progress === this.last) return;
    const a = this.last, b = progress; this.last = b;
    this.tl.time(b);
    const crossed = x => a < x && b >= x;
    if (crossed(28.6)) Sound.boom();
    [[11, 0], [48, 2], [63, 4], [78.5, 6], [92.5, 1]].forEach(([x, n]) => { if (crossed(x)) Sound.chord(n); });
  }
}
