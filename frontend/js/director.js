// One clock for everything. Scroll sets a target; the director eases toward it and hands
// the same smoothed value to the film, the lettering and the WebGL layer, so they can
// never drift apart.
const { gsap, ScrollTrigger } = window;

// story progress (0-100)  ->  film time (seconds)
export const CUES = [
  [0, 0], [8, 1.9], [18, 5.2], [22.5, 6.45], [27, 7.04], [28.6, 7.2], [31, 7.5], [37, 8.6],
  [45, 10.2], [56, 12.3], [64, 14.4], [72, 16.6], [82, 18.9], [92, 21.8], [100, 23.3],
];
const END = 23.95;

// monotone cubic (Fritsch-Carlson), so the film never hitches at a cue or runs backwards
function monotone(points) {
  const n = points.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((points[i + 1][1] - points[i][1]) / (points[i + 1][0] - points[i][0]));
  m.push(d[0]); for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : 2 / (1 / d[i - 1] + 1 / d[i])); m.push(d[n - 2]);
  return x => {
    if (x <= points[0][0]) return points[0][1]; if (x >= points[n - 1][0]) return points[n - 1][1];
    let i = 0; while (x > points[i + 1][0]) i++;
    const h = points[i + 1][0] - points[i][0], u = (x - points[i][0]) / h, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * points[i][1] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * points[i + 1][1] + (u3 - u2) * h * m[i + 1];
  };
}
export const filmTime = monotone(CUES);

export class Director {
  constructor({ story, app, reduced }) {
    this.target = 0; this.progress = 0; this.velocity = 0; this.arrivalTarget = 0; this.arrival = 0;
    this.reduced = reduced; this.listeners = []; this.dirty = true;
    this.pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
    this.triggers = [
      ScrollTrigger.create({ trigger: story, start: 'top top', end: 'bottom bottom', onUpdate: s => { this.target = s.progress * 100; }, onRefresh: s => { this.target = s.progress * 100; } }),
      ScrollTrigger.create({ trigger: app, start: 'top bottom', end: 'top top', onUpdate: s => { this.arrivalTarget = s.progress; }, onRefresh: s => { this.arrivalTarget = s.progress; } }),
    ];
    // land directly on a restored scroll position instead of fast-forwarding to it
    this.progress = this.target; this.arrival = this.arrivalTarget;
    if (!reduced && matchMedia('(hover: hover)').matches) addEventListener('pointermove', e => { this.pointer.tx = (e.clientX / innerWidth - .5) * 2; this.pointer.ty = (e.clientY / innerHeight - .5) * 2; }, { passive: true });
    this.tick = this.tick.bind(this);
    gsap.ticker.add(this.tick);
  }
  get film() { return this.arrival > 0 && this.progress > 99 ? filmTime(this.progress) + (END - filmTime(100)) * this.arrival : filmTime(this.progress); }
  onFrame(fn) { this.listeners.push(fn); }
  tick(time, deltaMs) {
    const dt = Math.min(deltaMs / 1000, .05), k = this.reduced ? 1 : 1 - Math.exp(-dt * 6.5);
    const before = this.progress;
    this.progress += (this.target - this.progress) * k; if (Math.abs(this.target - this.progress) < .002) this.progress = this.target;
    this.arrival += (this.arrivalTarget - this.arrival) * k; if (Math.abs(this.arrivalTarget - this.arrival) < .0005) this.arrival = this.arrivalTarget;
    const v = dt > 0 ? (this.progress - before) / dt : 0;
    this.velocity += (v - this.velocity) * (1 - Math.exp(-dt * 9));
    const p = this.pointer, pk = 1 - Math.exp(-dt * 3.2); p.x += (p.tx - p.x) * pk; p.y += (p.ty - p.y) * pk;
    for (const fn of this.listeners) fn(this, dt, deltaMs / 1000);
  }
  destroy() { gsap.ticker.remove(this.tick); this.triggers.forEach(t => t.kill()); }
}
