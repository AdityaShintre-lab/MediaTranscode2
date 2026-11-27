// Offline renderer for the cosmos film (WebGL2, HDR). Everything is a pure function
// of film time, so any frame can be rendered in any order.
import * as S from './shaders.js';

export const DURATION = 24, FPS = 30, BLAST = 7.2;
const canvas = document.querySelector('canvas');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
for (const e of ['EXT_color_buffer_float', 'EXT_float_blend', 'OES_texture_float_linear']) gl.getExtension(e);
const vao = gl.createVertexArray(); gl.bindVertexArray(vao);

function program(vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i), name = a.name.replace('[0]', ''); u[name] = { loc: gl.getUniformLocation(p, a.name), type: a.type, size: a.size }; }
  return { p, u };
}
let unit = 0;
function use(prog, values) {
  gl.useProgram(prog.p); unit = 0;
  for (const k in values) {
    const u = prog.u[k]; if (!u) continue; const v = values[k];
    switch (u.type) {
      case gl.FLOAT: u.size > 1 ? gl.uniform1fv(u.loc, v) : gl.uniform1f(u.loc, v); break;
      case gl.FLOAT_VEC2: gl.uniform2fv(u.loc, v); break;
      case gl.FLOAT_VEC3: gl.uniform3fv(u.loc, v); break;
      case gl.FLOAT_MAT3: gl.uniformMatrix3fv(u.loc, false, v); break;
      case gl.FLOAT_MAT4: gl.uniformMatrix4fv(u.loc, false, v); break;
      case gl.SAMPLER_2D: gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, v); gl.uniform1i(u.loc, unit++); break;
      case gl.SAMPLER_3D: gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_3D, v); gl.uniform1i(u.loc, unit++); break;
    }
  }
}

// --- tileable gradient noise, 4 independent fields, 128^3 half-float ---
function makeNoise() {
  const N = 128, C = 16, data = new Float32Array(N * N * N * 4);
  let seed = 1337; const rand = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  for (let ch = 0; ch < 4; ch++) {
    const g = new Float32Array(C * C * C * 3);
    for (let i = 0; i < C * C * C; i++) { const z = rand() * 2 - 1, a = rand() * Math.PI * 2, s = Math.sqrt(1 - z * z); g[i * 3] = s * Math.cos(a); g[i * 3 + 1] = s * Math.sin(a); g[i * 3 + 2] = z; }
    const f = t => t * t * t * (t * (t * 6 - 15) + 10), M = C - 1, k = C / N;
    const dot = (ix, iy, iz, x, y, z) => { const o = (((iz & M) * C + (iy & M)) * C + (ix & M)) * 3; return g[o] * x + g[o + 1] * y + g[o + 2] * z; };
    for (let z = 0; z < N; z++) { const pz = (z + .5) * k, iz = Math.floor(pz), fz = pz - iz, w = f(fz);
      for (let y = 0; y < N; y++) { const py = (y + .5) * k, iy = Math.floor(py), fy = py - iy, v = f(fy);
        for (let x = 0; x < N; x++) { const px = (x + .5) * k, ix = Math.floor(px), fx = px - ix, u = f(fx);
          const l = (a, b, t) => a + (b - a) * t;
          const r = l(l(l(dot(ix, iy, iz, fx, fy, fz), dot(ix + 1, iy, iz, fx - 1, fy, fz), u), l(dot(ix, iy + 1, iz, fx, fy - 1, fz), dot(ix + 1, iy + 1, iz, fx - 1, fy - 1, fz), u), v),
            l(l(dot(ix, iy, iz + 1, fx, fy, fz - 1), dot(ix + 1, iy, iz + 1, fx - 1, fy, fz - 1), u), l(dot(ix, iy + 1, iz + 1, fx, fy - 1, fz - 1), dot(ix + 1, iy + 1, iz + 1, fx - 1, fy - 1, fz - 1), u), v), w);
          data[((z * N + y) * N + x) * 4 + ch] = r * 1.25;
        } } }
  }
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D, t);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, N, N, N, 0, gl.RGBA, gl.FLOAT, data);
  for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, p, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return t;
}
function target(w, h, fmt = gl.RGBA16F) {
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, w, h);
  for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
  for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);
  const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fbo, w, h };
}
const bind = t => { gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null); gl.viewport(0, 0, t ? t.w : W, t ? t.h : H); };
const tri = () => gl.drawArrays(gl.TRIANGLES, 0, 3);

// --- helpers ---
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { x = clamp((x - a) / (b - a)); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
// monotone-ish cubic through keyframes [[t, v...]...]
function spline(keys) {
  return t => {
    const n = keys.length; if (t <= keys[0][0]) return keys[0].slice(1); if (t >= keys[n - 1][0]) return keys[n - 1].slice(1);
    let i = 0; while (t > keys[i + 1][0]) i++;
    const k0 = keys[Math.max(i - 1, 0)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(i + 2, n - 1)];
    const h = k2[0] - k1[0], u = (t - k1[0]) / h, out = [];
    for (let c = 1; c < k1.length; c++) {
      const m1 = i === 0 ? (k2[c] - k1[c]) / h : (k2[c] - k0[c]) / (k2[0] - k0[0]);
      const m2 = i + 2 > n - 1 ? (k2[c] - k1[c]) / h : (k3[c] - k1[c]) / (k3[0] - k1[0]);
      const u2 = u * u, u3 = u2 * u;
      out.push((2 * u3 - 3 * u2 + 1) * k1[c] + (u3 - 2 * u2 + u) * h * m1 + (-2 * u3 + 3 * u2) * k2[c] + (u3 - u2) * h * m2);
    }
    return out;
  };
}

// --- direction: camera (x y z, look x y z, roll, fov) ---
const camera = spline([
  [0.0, 0.0, 0.0, 62, 0, 0, 0, 0.00, 42],
  [2.4, 0.9, 0.3, 38, 0, 0, 0, 0.02, 42],
  [4.8, 1.2, 0.9, 19.5, 0, 0, 0, 0.05, 42],
  [6.7, 0.9, 1.0, 13.4, 0, 0, 0, 0.06, 42],
  [7.2, 0.9, 1.0, 13.0, 0, 0, 0, 0.06, 42],
  [8.2, 1.2, 1.4, 17.5, 0, 0, 0, 0.04, 44],
  [10.0, 3.0, 3.2, 20.0, 0, 0, 0, 0.00, 45],
  [12.4, 7.4, 6.6, 20.0, 0, 0, 0, -0.05, 46],
  [15.0, 9.5, 13.0, 18.5, 0, 0, 0, -0.10, 46],
  [17.4, 5.0, 16.0, 17.5, 0, -0.2, 0, -0.14, 45],
  [19.8, -6.5, 9.6, 15.5, 0, -0.2, 0, -0.16, 45],
  [21.8, -8.4, 4.2, 11.4, 0, -0.1, 0, -0.13, 46],
  [24.0, -6.2, 1.7, 7.2, 0.2, -0.35, 0, -0.10, 47],
]);
const starR = spline([[0, .30], [1.4, .42], [3.0, .86], [4.6, 1.45], [5.8, 1.95], [6.45, 2.15], [6.75, 1.75], [7.05, .55], [7.2, .16]]);
const starI = spline([[0, 1.9], [1.6, 2.5], [3.4, 3.4], [5.8, 4.6], [6.4, 6.0], [6.75, 5.0], [7.05, 1.7], [7.2, 3.5]]);
const exposure = spline([[0, 1.0], [5, .86], [6.4, .74], [7.0, .95], [7.25, .80], [8.2, .80], [9.4, 1.0], [11, 1.5], [12.6, 1.75], [14, 1.45], [16, 1.02], [19.5, .96], [22, .80], [24, .66]]);

function state(t) {
  const tau = Math.max(t - BLAST, 0), on = t >= BLAST ? 1 : 0;
  const pulse = smooth(5.2, 6.5, t) * (1 - smooth(6.55, 6.9, t));
  const [R0] = starR(t), [I0] = starI(t);
  const R = R0 * (1 + .035 * pulse * Math.sin(t * 11)), I = I0 * (1 + .14 * pulse * Math.sin(t * 13 + 1));
  const grow = tt => 13.2 * (1 - Math.exp(-1.15 * tt)) / 1.15 + 1.35 * tt;
  const lightAtTime = tt => {
    if (tt < 0) tt = 0;
    if (tt < BLAST) { const [i] = starI(tt), [r] = starR(tt); return i * (.4 + r * r * 4.5); }
    const u = tt - BLAST; return (.02 + .98 * smooth(0, .25, u)) * 240 * Math.exp(-u / .32) + 60 * Math.exp(-u / 1.3) + 10 * Math.exp(-u / 5);
  };
  const light = new Float32Array(64); for (let i = 0; i < 64; i++) light[i] = lightAtTime(t - i / 8);
  const [cx, cy, cz, lx, ly, lz, roll, fov] = camera(t);
  // impact shake, decays fast
  const sh = on * Math.exp(-tau * 2.6) * .035;
  const cam = [cx + sh * Math.sin(tau * 47), cy + sh * Math.cos(tau * 39), cz];
  return {
    t, tau, on, cam, look: [lx, ly, lz], roll, fov, light,
    starR: R, starI: on ? 0 : I, starHeat: smooth(5.6, 6.5, t), instab: smooth(5.0, 6.5, t) * (1 - smooth(6.6, 7.0, t) * .4),
    shell: .3 + grow(tau) * .78, blastR: grow(tau),
    ejecta: on * (1.05 * Math.exp(-tau * .12) + 1.2 * Math.exp(-tau * 2.4)) * smooth(0, .12, tau) * (1 - smooth(11.4, 14.2, t)),
    core: on * (.12 + .88 * smooth(0, .16, tau)) * (10 * Math.exp(-tau / .24) + 3.2 * Math.exp(-tau / .7) + 1.1 * Math.exp(-tau / 3.5)) * (1 - smooth(13.0, 15.5, t)) ,
    gal: smooth(13.7, 17.2, t), galR: lerp(13, 21, smooth(12.5, 20, t)) + 1.5 * smooth(20, 24, t),
    spin: -(t - 18) * .125, chaos: 1 - smooth(13.0, 16.8, t),
    neb: 1 - smooth(9.5, 14.2, t), dark: smooth(6.5, 7.15, t) * (1 - on) + 0,
    form: t - 11.4, blastFade: (.62 + 1.2 * Math.exp(-tau * .6) + .5 * smooth(2.5, 5, tau)), galGain: lerp(2.0, 1.35, smooth(13.5, 18.5, t)) * lerp(1, .62, smooth(20, 23, t)) ,
    infall: smooth(4.8, 7.15, t), infallGain: smooth(3.6, 5.2, t) * (1 - on),
    flash: on * smooth(0, .20, tau) * (.52 * Math.exp(-tau / .20) + .07 * Math.exp(-tau / .42)),
    shockR: tau * 1.45, shockA: on * Math.exp(-tau * 2.4) * smooth(0, .05, tau),
    exp: exposure(t)[0], fieldGain: (1 - .55 * smooth(6.6, 7.1, t) * (1 - on)) * (1 - .35 * smooth(20, 23, t)),
    near: 1 - smooth(12.5, 15, t) * .82,
    aperture: lerp(1.0, 1.5, smooth(20, 24, t)), focus: Math.hypot(cx, cy, cz) * lerp(1, .82, smooth(20, 24, t)),
  };
}
function matrices(s) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nrm = a => { const l = Math.hypot(...a); return a.map(v => v / l); }, dt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const z = nrm(sub(s.cam, s.look)); let x = nrm(cr([0, 1, 0], z)), y = cr(z, x);
  const c = Math.cos(s.roll), n = Math.sin(s.roll);
  [x, y] = [x.map((v, i) => v * c + y[i] * n), y.map((v, i) => v * c - x[i] * n)];
  const view = new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dt(x, s.cam), -dt(y, s.cam), -dt(z, s.cam), 1]);
  const tan = Math.tan(s.fov * Math.PI / 360), a = W / H, nr = .05, fr = 1000;
  const proj = new Float32Array([1 / (a * tan), 0, 0, 0, 0, 1 / tan, 0, 0, 0, 0, (fr + nr) / (nr - fr), -1, 0, 0, 2 * fr * nr / (nr - fr), 0]);
  const basis = new Float32Array([...x, ...y, ...z]);
  // screen position of the origin
  const o = [view[12], view[13], view[14]], w = -o[2];
  const centre = [.5 + .5 * (proj[0] * o[0]) / w, .5 + .5 * (proj[5] * o[1]) / w];
  return { view, proj, basis, tan, centre, px: H / 2 / tan };
}

let W = 0, H = 0, noise, P, T;
export function setup(w, h) {
  W = canvas.width = w; H = canvas.height = h;
  if (!P) {
    noise = makeNoise();
    P = { vol: program(S.FSQ, S.VOLUME), ej: program(S.EJECTA_VS, S.POINT_FS), inf: program(S.INFALL_VS, S.POINT_FS), st: program(S.STARS_VS, S.POINT_FS),
      down: program(S.FSQ, S.DOWN), up: program(S.FSQ, S.UP), streak: program(S.FSQ, S.STREAK), rays: program(S.FSQ, S.RAYS), fin: program(S.FSQ, S.FINAL), copy: program(S.FSQ, S.COPY) };
  }
  T = { scene: target(w, h, gl.RGBA16F), out: target(w, h, gl.RGBA8), mips: [] };
  let mw = w >> 1, mh = h >> 1; for (let i = 0; i < 7; i++) { T.mips.push(target(Math.max(mw, 2), Math.max(mh, 2))); mw >>= 1; mh >>= 1; }
  T.streakT = target(w >> 2, h >> 2); T.streakT2 = target(w >> 2, h >> 2); T.rays = target(w >> 1, h >> 1);
}
const HALT = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };

export function render(t, { volSubs = 3, ptSubs = 4, count = 1900000, shutter = .5, tiles = 8, frame = 0 } = {}) {
  bind(T.scene); gl.disable(gl.BLEND); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  const dt = shutter / FPS;
  for (let i = 0; i < volSubs; i++) {
    const s = state(t + dt * ((i + .5) / volSubs - .5) * (t > BLAST || t < BLAST - dt ? 1 : 0)), m = matrices(s);
    use(P.vol, { uNoise: noise, uT: s.t, uCam: s.cam, uBasis: m.basis, uTan: m.tan, uAspect: W / H, uJit: [(HALT(i + 1, 2) - .5) * 2 / W, (HALT(i + 1, 3) - .5) * 2 / H], uSeed: i + (frame % 8) * .37,
      uStarR: s.starR, uStarI: s.starI, uStarHeat: s.starHeat, uInstab: s.instab, uTau: s.tau, uShell: s.shell, uEjecta: s.ejecta, uCore: s.core,
      uGal: s.gal, uGalR: s.galR, uGalSpin: s.spin, uChaos: s.chaos, uNeb: s.neb, uDark: s.dark, uLight: s.light });
    gl.blendColor(0, 0, 0, 1 / volSubs); gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE);
    gl.enable(gl.SCISSOR_TEST);
    const cols = 6, heavy = s.gal > .001 || s.ejecta > .001 ? 2 : 1, rows = tiles * heavy;
    for (let k = 0; k < rows; k++) for (let c = 0; c < cols; c++) {
      const y0 = Math.floor(H * k / rows), y1 = Math.floor(H * (k + 1) / rows), x0 = Math.floor(W * c / cols), x1 = Math.floor(W * (c + 1) / cols);
      gl.scissor(x0, y0, x1 - x0, y1 - y0); tri(); gl.finish();
    }
    gl.disable(gl.SCISSOR_TEST);
  }
  gl.blendFunc(gl.ONE, gl.ONE);
  for (let i = 0; i < ptSubs; i++) {
    const open = t > BLAST ? 1 + 2.6 * Math.exp(-(t - BLAST) * 1.1) : 1;
    const s = state(Math.max(t + dt * open * ((i + .5) / ptSubs - .5), t > BLAST ? BLAST + .004 : 0)), m = matrices(s), g = 1 / ptSubs;
    const base = { uNoise: noise, uT: s.t, uView: m.view, uProj: m.proj, uPx: m.px, uAperture: s.aperture, uFocus: s.focus, uTau: s.tau, uJit: [(HALT(i + 1, 2) - .5) / W, (HALT(i + 1, 3) - .5) / H], uGain: g };
    use(P.st, { ...base, uFieldGain: s.fieldGain * .9, uCam: s.cam, uNear: s.near }); gl.drawArrays(gl.POINTS, 0, 90000);
    if (s.infallGain > .001) { use(P.inf, { ...base, uInfall: s.infall, uStarR2: s.starR, uInfallGain: s.infallGain * .55 }); gl.drawArrays(gl.POINTS, 0, 60000); }
    if (s.on) {
      use(P.ej, { ...base, uBlastR: s.blastR, uBlastFade: s.blastFade, uGalR: s.galR, uGalSpin: s.spin, uForm: s.form, uGalGain: s.galGain, uGain: g * 2600000 / count * .026 });
      const chunk = t > 12 && t < 18 ? 50000 : 120000; for (let o = 0; o < count; o += chunk) { gl.drawArrays(gl.POINTS, o, Math.min(chunk, count - o)); gl.finish(); }
    }
  }
  gl.disable(gl.BLEND);
  const s = state(t), m = matrices(s);
  // bloom chain
  let src = T.scene;
  T.mips.forEach((d, i) => { bind(d); use(P.down, { uTex: src.tex, uTexel: [1 / src.w, 1 / src.h], uFirst: i === 0 ? 1 : 0 }); tri(); src = d; });
  bind(T.rays); use(P.rays, { uTex: T.mips[1].tex, uC: m.centre, uThr: .55 }); tri();
  bind(T.streakT); use(P.streak, { uTex: T.mips[2].tex, uW: .22, uThr: 1.1 }); tri();
  bind(T.streakT2); use(P.streak, { uTex: T.streakT.tex, uW: .07, uThr: 0 }); tri();
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  const K = [.9, .85, .85, .85, .9, .9];
  for (let i = T.mips.length - 1; i > 0; i--) { bind(T.mips[i - 1]); use(P.up, { uTex: T.mips[i].tex, uTexel: [1 / T.mips[i].w, 1 / T.mips[i].h], uK: K[i - 1] }); tri(); }
  gl.disable(gl.BLEND);
  bind(T.out);
  use(P.fin, { uScene: T.scene.tex, uBloom: T.mips[0].tex, uStreak: T.streakT2.tex, uRays: T.rays.tex, uExp: s.exp, uBloomK: .075, uStreakK: .045 * (1 - smooth(12, 15, t) * .8), uRaysK: lerp(.15, .06, smooth(11, 15, t)) + .30 * s.on * Math.exp(-s.tau * 1.4),
    uFlash: s.flash, uShockR: s.shockR, uShockA: s.shockA, uAspect: W / H, uFade: 1, uVig: .46, uC: m.centre, uRes: [W, H], uFrame: frame });
  tri();
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.out.fbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  gl.finish();
}
const buf = { a: null };
export function pixels() {
  if (!buf.a || buf.a.length !== W * H * 4) buf.a = new Uint8Array(W * H * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, T.out.fbo); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf.a);
  return buf.a;
}
export async function post(url) { const px = pixels(); if (gl.isContextLost()) return false; await fetch(url, { method: 'POST', body: px }); return true; }
window.film = { lost: () => gl.isContextLost(), setup, render, post, state, DURATION, FPS };
