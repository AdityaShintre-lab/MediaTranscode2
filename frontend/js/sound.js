// All sound is synthesized in the browser; there are no audio files.
// Muted until the visitor asks for it, and the choice is remembered.
let ctx, out, wet, step = 0, on = false;
try { on = localStorage.getItem('mt-sound') === 'on'; } catch (e) { /* private mode */ }
const scale = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99, 880];

function init() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3600;
  out = ctx.createGain(); out.gain.value = .5; out.connect(lp); lp.connect(ctx.destination);
  // a short synthetic hall, so notes hang in the space
  const len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
  const hall = ctx.createConvolver(); hall.buffer = ir; wet = ctx.createGain(); wet.gain.value = .22; hall.connect(wet); wet.connect(lp); out.connect(hall);
}

function tone(freq, t, vol, length = 1.4) {
  [[1, 'triangle', 1], [2, 'sine', .28], [3, 'sine', .08]].forEach(([m, type, g]) => {
    const o = ctx.createOscillator(), e = ctx.createGain();
    o.type = type; o.frequency.value = freq * m;
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(vol * g, t + .006);
    e.gain.exponentialRampToValueAtTime(.0001, t + length / Math.sqrt(m));
    o.connect(e); e.connect(out); o.start(t); o.stop(t + length + .1);
  });
}

export const Sound = {
  get on() { return on; },
  unlock() { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
  set(v) { on = v; try { localStorage.setItem('mt-sound', v ? 'on' : 'off'); } catch (e) { /* private mode */ } },
  note(i, vol = .2) { if (on && ctx) tone(scale[i % scale.length], ctx.currentTime, vol); },
  next() { this.note(step++); },
  chord(i) { [0, 2, 4].forEach(k => this.note(i + k, .1)); },
  // used by the entrance, so what you hear is exactly the key you see move
  key(midi, vol = .2) { if (on && ctx) tone(440 * Math.pow(2, (midi - 69) / 12), ctx.currentTime, vol, 2.2); },
  // the detonation
  boom() {
    if (!on || !ctx) return;
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(96, t); o.frequency.exponentialRampToValueAtTime(27, t + 1.6);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.7, t + .03); g.gain.exponentialRampToValueAtTime(.0001, t + 2.6);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 2.7);
    const len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), ng = ctx.createGain();
    n.buffer = b; f.type = 'lowpass'; f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(90, t + 1.8); ng.gain.value = .22;
    n.connect(f); f.connect(ng); ng.connect(out); n.start(t);
  },
};

// The toggle in the corner
const toggle = document.getElementById('sound-toggle');
export function labelSound() { toggle.textContent = Sound.on ? 'Sound on' : 'Sound off'; toggle.setAttribute('aria-pressed', Sound.on); }
toggle.addEventListener('click', () => { Sound.set(!Sound.on); if (Sound.on) { Sound.unlock(); Sound.note(4); } labelSound(); });
labelSound();
// Browsers only start audio after a gesture: honour a remembered "on" at the first one.
if (on) addEventListener('pointerdown', () => Sound.unlock(), { once: true });
