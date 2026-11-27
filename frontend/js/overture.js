// The entrance: a wall of monumental ivory and obsidian slabs, seen front-on and filling the
// whole view, is played like a phrase. Struck slabs sink inward and leak light from their
// edges; on the last chord they turn edge-on and part, and the star is behind them.
// Deliberately abstract: no instrument, no outline, only the rhythm of the keys.
import { Scene, PerspectiveCamera, Group, Mesh, Points, BufferGeometry, BufferAttribute, Shape, ExtrudeGeometry, PlaneGeometry, MeshPhysicalMaterial, MeshBasicMaterial, ShaderMaterial, CustomBlending, OneFactor, ZeroFactor, AddEquation, Color, SpotLight, PointLight, DirectionalLight, PMREMGenerator, PCFShadowMap, ACESFilmicToneMapping, DoubleSide, NoBlending } from '../vendor/three.slim.min.js';
import { Sound } from './sound.js';

// [seconds, midi note, velocity] - a short phrase, played across the whole width
const PHRASE = [
  [.35, 49, .8], [.52, 56, .5], [.69, 61, .55], [.86, 64, .6], [1.03, 68, .6], [1.20, 71, .7], [1.38, 75, .95],
  [1.70, 73, .6], [1.86, 71, .5], [2.02, 57, .75], [2.02, 64, .4], [2.19, 61, .5], [2.36, 64, .55], [2.52, 69, .6], [2.68, 73, .75], [2.86, 76, .95], [3.06, 75, .6], [3.22, 71, .55],
];
const PHRASE_END = 3.4;
const CHORD = [52, 59, 64, 68, 71, 76];
const LOW = 60, HIGH = 83; // two octaves span the view; notes outside fold in
const BLACK = new Set([1, 3, 6, 8, 10]);
const isBlack = m => BLACK.has(m % 12);

function layout() {
  const keys = []; let w = 0;
  for (let m = LOW; m <= HIGH; m++) if (!isBlack(m)) keys.push({ midi: m, black: false, x: w++ });
  for (let m = LOW + 1; m < HIGH; m++) if (isBlack(m)) keys.push({ midi: m, black: true, x: keys.find(k => k.midi === m - 1).x + .5 });
  const mid = (w - 1) / 2; keys.forEach(k => { k.x -= mid; k.press = 0; k.vel = 0; k.hold = 0; k.open = 0; k.glow = 0; });
  return keys.sort((a, b) => a.midi - b.midi);
}

// the score, shared by the WebGL and the CSS version
class Player {
  constructor(keys) { this.keys = keys; this.byMidi = new Map(keys.map(k => [k.midi, k])); this.t = 0; this.i = 0; this.loop = 0; this.phase = 'play'; }
  strike(midi, vel, hold = .2) { let f = midi; while (f > HIGH) f -= 12; while (f < LOW) f += 12; const k = this.byMidi.get(f); if (!k) return; k.hold = hold; k.force = vel; k.glow = Math.max(k.glow, vel); this.onStrike?.(k, vel); Sound.key(midi, vel * .2); }
  update(dt, canLeave) {
    this.t += dt;
    if (this.phase === 'play') {
      while (this.i < PHRASE.length && this.t >= PHRASE[this.i][0]) { const [, m, v] = PHRASE[this.i++]; this.strike(m + (this.loop % 2 ? 5 : 0), v); }
      if (this.t >= PHRASE_END) { if (canLeave) this.leave(); else { this.t = .2; this.i = 0; this.loop++; } }
    } else if (this.phase === 'gliss') {
      const n = this.keys.length, k = Math.min(1, this.t / .78), want = Math.floor(Math.pow(k, 1.25) * n);
      while (this.g < want) { this.strike(this.keys[this.g].midi, .35 + .4 * this.g / n, .1); this.g++; }
      if (k >= 1) { this.phase = 'open'; this.t = 0; CHORD.forEach(m => this.strike(m, .9, .5)); this.onOpen?.(); }
    }
  }
  leave() { if (this.phase !== 'play') return; this.phase = 'gliss'; this.t = 0; this.g = 0; this.onLeave?.(); }
}

export class Overture {
  constructor(renderer, { small = false } = {}) {
    this.renderer = renderer; this.small = small; this.keys = layout(); this.player = new Player(this.keys);
    this.player.onStrike = (k, v) => this.sparks(k, v);
    this.scene = new Scene(); this.camera = new PerspectiveCamera(36, 1, .1, 80);
    this.time = 0; this.openT = 0; this.done = false;
    this.build();
    this.prev = { tone: renderer.toneMapping, exp: renderer.toneMappingExposure, shadow: renderer.shadowMap.enabled };
    renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFShadowMap;
  }

  environment() {
    // a dark studio with tall strips of violet, gold and white for the gloss to catch
    const s = new Scene(), strip = (c, k, w, h, x, y, z) => { const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: new Color(c).multiplyScalar(k), side: DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m); };
    s.background = new Color('#010207');
    strip('#8d7bff', 6, 1.2, 22, -9, 0, 8); strip('#ffcf8a', 5, .8, 18, 10, -2, 6); strip('#f1edff', 5, .5, 20, -3.4, 2, 12); strip('#4d6bff', 2, 20, 2, 0, -9, 7); strip('#b06bff', 3, .6, 14, 5, 5, 11);
    const gen = new PMREMGenerator(this.renderer), rt = gen.fromScene(s, .015); gen.dispose(); return rt;
  }

  slab(w, len, deep, r) {
    // rounded-rectangle section extruded downward; origin at the top edge, front face at z = 0
    const s = new Shape(), x = w / 2; s.moveTo(-x + r, 0); s.lineTo(x - r, 0); s.quadraticCurveTo(x, 0, x, -r); s.lineTo(x, -deep + r); s.quadraticCurveTo(x, -deep, x - r, -deep); s.lineTo(-x + r, -deep); s.quadraticCurveTo(-x, -deep, -x, -deep + r); s.lineTo(-x, -r); s.quadraticCurveTo(-x, 0, -x + r, 0);
    const g = new ExtrudeGeometry(s, { depth: len, bevelEnabled: true, bevelThickness: .09, bevelSize: .045, bevelOffset: -.045, bevelSegments: 5, curveSegments: 6 });
    g.rotateX(Math.PI / 2); return g;
  }

  build() {
    const env = this.env = this.environment();
    this.rig = new Group(); this.scene.add(this.rig);
    const U = this.unit = 1.36, TOP = this.top = 9;
    const ivoryG = this.slab(U * .972, 22, 1.5, .09), ebonyG = this.slab(U * .56, TOP + .9, 1.25, .11), leakG = new PlaneGeometry(1, 1);
    this.geos = [ivoryG, ebonyG, leakG]; this.mats = [];
    this.keys.forEach((k, i) => {
      const m = new MeshPhysicalMaterial(k.black ? { envMap: env.texture, color: '#05050b', roughness: .2, clearcoat: 1, clearcoatRoughness: .07, envMapIntensity: 0, emissive: '#6a45ff', emissiveIntensity: 0 } : { envMap: env.texture, color: '#c9c3cf', roughness: .5, clearcoat: .6, clearcoatRoughness: .3, envMapIntensity: 0, emissive: '#ff9d45', emissiveIntensity: 0 });
      const mesh = new Mesh(k.black ? ebonyG : ivoryG, m); mesh.castShadow = mesh.receiveShadow = true;
      k.px = k.x * U; k.pz = k.black ? .85 : 0; k.mesh = mesh; this.rig.add(mesh); this.mats.push(m);
      // light that escapes along the edges while the slab is down
      const w = (k.black ? U * .56 : U) + 1.5, lm = new ShaderMaterial({ transparent: true, depthWrite: false, blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor, uniforms: { uK: { value: 0 }, uE: { value: (k.black ? U * .56 : U) / w }, uC: { value: new Color(k.black ? '#8a5cff' : '#ffb868') } },
        vertexShader: 'varying vec2 v; void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: 'precision highp float; varying vec2 v; uniform float uK,uE; uniform vec3 uC; void main(){float x=abs(v.x-.5)*2.; float d=abs(x-uE); float e=exp(-d*d*420.)+.20*exp(-d*9.)*step(uE,x)+.10*exp(-d*5.)*step(x,uE); float y=smoothstep(0.,.10,v.y)*pow(1.-v.y,1.35); gl_FragColor=vec4(mix(uC,vec3(1.,.93,.84),exp(-d*d*1800.)*.6)*e*y*uK*.85*(1.-smoothstep(.9,1.,x)),0.);}' });
      const leak = new Mesh(leakG, lm); leak.scale.set(w, k.black ? 8 : 15, 1); leak.position.set(k.px, k.black ? 2.2 : -.6, k.pz + .03); leak.renderOrder = 2; this.rig.add(leak); k.leak = leak; this.mats.push(lm);
      k.delay = Math.abs(k.px) * .052 + (k.black ? .05 : .10); k.rise = .04 + Math.abs(k.x) * .05 + (k.black ? .22 : 0);
    });
    const key = this.keyLight = new SpotLight('#efe6f2', 0, 60, .29, 1, 1.2); key.position.set(-12, 8.5, 9.5); key.target.position.set(-2, -.9, 0); key.castShadow = true; key.shadow.mapSize.set(this.small ? 1024 : 2048, this.small ? 1024 : 2048); key.shadow.bias = -.0005; key.shadow.normalBias = .025; key.shadow.camera.near = 6; key.shadow.camera.far = 36; key.shadow.radius = 9;
    const rim = this.rim = new DirectionalLight('#ffb765', 0); rim.position.set(14, -3, 2.6);
    const violet = this.violet = new DirectionalLight('#6b4dff', 0); violet.position.set(-14, -2, 2);
    const ember = this.ember = new PointLight('#ffbf6e', 0, 26, 1.4); ember.position.set(0, -1, -1.2);
    this.scene.add(key, key.target, rim, violet, ember);

    // motes struck loose by the keys
    const N = this.N = this.small ? 260 : 620; this.pi = 0; this.pv = new Float32Array(N * 3); this.pl = new Float32Array(N);
    const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(N * 3).fill(999), 3)); g.setAttribute('life', new BufferAttribute(new Float32Array(N), 1));
    this.motes = new Points(g, new ShaderMaterial({ transparent: true, depthWrite: false, blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor, uniforms: { uPx: { value: 1 } },
      vertexShader: 'attribute float life; varying float vL; uniform float uPx; void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;vL=life;gl_PointSize=min(uPx*(.018+.05*life)/max(-mv.z,.5),46.);}',
      fragmentShader: 'precision highp float; varying float vL; void main(){vec2 p=gl_PointCoord*2.-1.;float d=dot(p,p);if(d>1.)discard;float g=exp(-d*4.)-.018;gl_FragColor=vec4(mix(vec3(.62,.42,1.),vec3(1.,.82,.5),vL)*g*vL*1.4,0.);}' }));
    this.motes.frustumCulled = false; this.motes.renderOrder = 3; this.rig.add(this.motes);
  }

  sparks(k, v) {
    const p = this.motes.geometry.attributes.position.array, n = Math.round(5 + v * 10), half = (k.black ? .28 : .5) * this.unit;
    for (let j = 0; j < n; j++) { const i = this.pi = (this.pi + 1) % this.N, side = Math.random() < .5 ? -1 : 1; p[i * 3] = k.px + side * half; p[i * 3 + 1] = (k.black ? 1.4 : -1.2) + (Math.random() - .5) * 4.2; p[i * 3 + 2] = k.pz + .06; this.pv[i * 3] = side * Math.random() * .5 + (Math.random() - .5) * .3; this.pv[i * 3 + 1] = (Math.random() - .25) * 1.1 * v; this.pv[i * 3 + 2] = .5 + Math.random() * 1.9 * v; this.pl[i] = .6 + Math.random() * .6; }
  }

  resize(w, h) {
    this.camera.aspect = w / h; this.camera.fov = w < h ? 62 : 36; this.camera.updateProjectionMatrix();
    this.motes.material.uniforms.uPx.value = this.renderer.domElement.height;
  }

  // `real` is wall-clock: slow machines get fewer frames, never a longer entrance
  update(real, canLeave) {
    for (let left = Math.min(real, 1); left > 0; left -= 1 / 40) this.step(Math.min(left, 1 / 40), canLeave);
    this.motes.geometry.attributes.position.needsUpdate = this.motes.geometry.attributes.life.needsUpdate = true;
  }
  step(dt, canLeave) {
    this.time += dt; const t = this.time, ease = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
    this.player.update(dt, canLeave);
    const opening = this.player.phase === 'open'; if (opening) this.openT += dt;
    const o = this.openT, lit = ease(t / .8), glissing = this.player.phase !== 'play' ? 1 : 0;

    this.heat = (this.heat || 0) + ((glissing ? 1 : .18) - (this.heat || 0)) * Math.min(1, dt * 2.2);
    let energy = 0;
    for (const k of this.keys) {
      // weighted action: fast in, sprung return
      if (k.hold > 0) { k.hold -= dt; k.vel += ((k.force - k.press) * 820 - k.vel * 44) * dt; } else k.vel += ((0 - k.press) * 170 - k.vel * 17) * dt;
      k.press += k.vel * dt; k.glow *= Math.exp(-dt * 2.3); energy += k.glow;
      const rise = 1 - Math.pow(1 - Math.min(1, Math.max(0, (t - k.rise) / 1.15)), 3.4);
      const f = opening ? Math.min(1, Math.max(0, o - k.delay) / 1.35) : 0, q = f * f * (3 - 2 * f), dir = k.px === 0 ? 1 : Math.sign(k.px), m = k.mesh;
      if (k.black) {
        m.position.set(k.px + dir * q * q * 2.2, this.top + (1 - rise) * 9 + q * q * 11, k.pz + q * 2.4);
        m.rotation.set(k.press * .062 - q * .25, dir * q * .9, 0);
      } else {
        m.position.set(k.px + dir * (q * .25 + q * q * q * 7.5), this.top + 2 - (1 - rise) * 14, k.pz + q * q * 4.2);
        m.rotation.set(k.press * .050, dir * q * 1.50, 0);
      }
      m.visible = f < 1; m.material.envMapIntensity = lit * (k.black ? 1.15 : .13) * (1 - .4 * q); m.material.emissiveIntensity = k.glow * k.glow * (k.black ? .10 : .05);
      k.leak.material.uniforms.uK.value = Math.min(1.3, k.glow * k.glow * 1.25 + Math.max(0, k.press) * .28) * (1 - Math.min(1, q * 3)); k.leak.visible = f < .5;
    }
    this.keyLight.intensity = 265 * lit * (1 - .8 * ease(o / 1.4)); this.rim.intensity = (.16 + .22 * ease(o / .8)) * lit; this.violet.intensity = (.15 + .12 * ease(o / .8)) * lit; this.ember.intensity = (7 + 18 * this.heat + energy * 5) * lit + ease(o / .4) * 210 * Math.exp(-o * .9);
    // the pool of light follows the hands
    const centre = this.keys.reduce((a, k) => a + k.px * k.glow, 0) / (energy + .001); this.pool = (this.pool ?? -2) + (Math.max(-5, Math.min(5, centre)) - (this.pool ?? -2)) * Math.min(1, dt * 1.6); this.keyLight.target.position.x = this.pool * .8;

    const p = this.motes.geometry.attributes.position.array, l = this.motes.geometry.attributes.life.array;
    for (let i = 0; i < this.N; i++) { if (this.pl[i] <= 0) { l[i] = 0; continue; } this.pl[i] -= dt * .55; for (let c = 0; c < 3; c++) p[i * 3 + c] += this.pv[i * 3 + c] * dt; this.pv[i * 3 + 1] *= 1 - dt * .9; l[i] = Math.max(0, this.pl[i]); }

    // a slow crane past the wall, then straight through the gap
    const c = this.camera, d = ease(t / 5.2), push = ease((o - .15) / 1.7);
    c.position.set(-2.7 + 2.7 * d, -1.5 + 1.2 * d + push * .3, 11.6 + .9 * d - push * 5.4);
    c.lookAt(.5 - .5 * d, -.35 + .2 * d + push * .15, 0);
    c.rotateZ((.10 - .085 * d) * (1 - push));
    if (opening && o > 2.0) this.done = true;
  }
  render() { this.renderer.render(this.scene, this.camera); }

  dispose() {
    this.geos.forEach(g => g.dispose()); this.mats.forEach(m => m.dispose()); this.motes.geometry.dispose(); this.motes.material.dispose(); this.keyLight.shadow.map?.dispose(); this.env.dispose();
    Object.assign(this.renderer, { toneMapping: this.prev.tone, toneMappingExposure: this.prev.exp }); this.renderer.shadowMap.enabled = this.prev.shadow;
  }
}

// Same score, CSS slabs: used when WebGL is unavailable.
export class FlatOverture {
  constructor(holder) {
    this.keys = layout(); this.player = new Player(this.keys); this.done = false; this.o = 0;
    const whites = this.keys.filter(k => !k.black), n = whites.length, w = 100 / n, x0 = whites[0].x;
    this.keys.forEach(k => { const i = document.createElement('i'); i.className = k.black ? 'ebony' : 'ivory'; i.style.width = `${w * (k.black ? .58 : .985)}%`; i.style.left = `${(k.x - x0) * w + (k.black ? w * .21 : 0)}%`; holder.append(i); k.el = i; });
  }
  update(dt, canLeave) {
    this.player.update(dt, canLeave);
    if (this.player.phase === 'open') { this.o += dt; for (const k of this.keys) if (this.o > Math.abs(k.x) * .03) k.el.classList.add('open'); if (this.o > 1.7) this.done = true; return; }
    for (const k of this.keys) { const down = k.hold > 0; k.hold -= dt; k.el.classList.toggle('down', down); }
  }
  resize() {} render() {} dispose() {}
}
