// Live WebGL layer in front of the film: streaking foreground dust, particle lettering that
// shares the page's CSS perspective, and the glow that keeps the star alive between scrolls.
// Everything is additive with zero alpha, so it lights the page without covering it.
import { WebGLRenderer, Scene, PerspectiveCamera, Points, Mesh, BufferGeometry, BufferAttribute, InstancedBufferGeometry, InstancedBufferAttribute, ShaderMaterial, CustomBlending, OneFactor, ZeroFactor, AddEquation, Vector2, Color } from '../vendor/three.slim.min.js';

export const PERSPECTIVE = 1000; // must match `perspective` on .scene-sticky
const additive = { blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor, depthTest: false, depthWrite: false, transparent: true };
const MODES = { star: 0, gather: 1, burst: 2, spiral: 3, core: 4 };
const SPOT = `float d=dot(vP,vP); if(d>1.)discard; float g=exp(-d*4.2)-.015;`;

export class Cosmos {
  constructor(canvas, { small = false } = {}) {
    this.canvas = canvas; this.small = small; this.sets = []; this.time = 0; this.idle = false;
    this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new Scene(); this.camera = new PerspectiveCamera(50, 1, 1, 6000); this.camera.position.z = PERSPECTIVE;
    this.makeGlow(); this.makeDust();
    this.resize();
  }
  resize() {
    const w = this.w = this.canvas.clientWidth || innerWidth, h = this.h = this.canvas.clientHeight || innerHeight; // its own box, not the window: scrollbars and URL bars must not shift it
    this.dpr = Math.min(devicePixelRatio || 1, [this.small ? 1.5 : 2, 1.25, 1, 1][this.level || 0]);
    this.renderer.setPixelRatio(this.dpr); this.renderer.setSize(w, h, false);
    this.camera.fov = 2 * Math.atan(h / 2 / PERSPECTIVE) * 180 / Math.PI; this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.dust.material.uniforms.uView.value.set(w, h); this.glow.material.uniforms.uView.value.set(w, h);
  }

  makeGlow() {
    const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.glow = new Mesh(g, new ShaderMaterial({ ...additive, uniforms: { uView: { value: new Vector2() }, uTime: { value: 0 }, uK: { value: 0 }, uWarm: { value: 1 }, uC: { value: new Vector2() } },
      vertexShader: `varying vec2 v; void main(){v=position.xy;gl_Position=vec4(position.xy,0.,1.);}`,
      fragmentShader: `precision highp float; varying vec2 v; uniform vec2 uView,uC; uniform float uTime,uK,uWarm;
        float n(float a,float s){return sin(a*3.+s*.31)*.5+sin(a*7.-s*.47+1.7)*.3+sin(a*13.+s*.23+4.)*.2;}
        void main(){ vec2 p=v*uView/uView.y-uC; float r=length(p),a=atan(p.y,p.x);
          float ray=max(0.,.35+.65*n(a,uTime)); float flick=.9+.06*sin(uTime*2.1)+.04*sin(uTime*5.3+1.);
          vec3 c=mix(vec3(.50,.38,1.),vec3(1.,.72,.38),uWarm);
          float l=(.10*exp(-r*7.)*(.5+ray)+.010/(1.+r*r*34.))*uK*flick;
          gl_FragColor=vec4(c*l,0.); }` }));
    this.glow.frustumCulled = false; this.scene.add(this.glow);
  }

  makeDust() {
    const n = this.small ? 520 : 1500, pos = new Float32Array(n * 3), seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { for (let k = 0; k < 3; k++) pos[i * 3 + k] = Math.random(); for (let k = 0; k < 4; k++) seed[i * 4 + k] = Math.random(); }
    const g = new InstancedBufferGeometry(); g.instanceCount = n;
    g.setAttribute('position', new BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0]), 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('aPos', new InstancedBufferAttribute(pos, 3)); g.setAttribute('aSeed', new InstancedBufferAttribute(seed, 4));
    this.dust = new Mesh(g, new ShaderMaterial({ ...additive,
      uniforms: { uView: { value: new Vector2() }, uTravel: { value: 0 }, uStretch: { value: 0 }, uTime: { value: 0 }, uBurst: { value: 0 }, uSwirl: { value: 0 }, uK: { value: 0 }, uWarm: { value: 1 }, uPointer: { value: new Vector2() } },
      vertexShader: `precision highp float; attribute vec3 aPos; attribute vec4 aSeed; varying vec2 vP; varying vec3 vC; varying float vL;
        uniform vec2 uView,uPointer; uniform float uTravel,uStretch,uTime,uBurst,uSwirl,uK,uWarm;
        vec2 px(vec4 c){return c.xy/c.w*uView*.5;}
        void main(){
          const float D=3400.;
          float z=mod(aPos.z*D+uTravel+uTime*9.,D)-D+980.;
          vec3 p=vec3((aPos.xy-.5)*uView*vec2(2.7,2.9),z);
          p.xy*=1.+uBurst*(.25+.9*aSeed.x);
          float a=uSwirl*(.25+.75*aSeed.y); p.xy=mat2(cos(a),-sin(a),sin(a),cos(a))*p.xy;
          p.xy+=vec2(sin(uTime*.17+aSeed.z*40.),cos(uTime*.13+aSeed.w*40.))*22.;
          p.xy-=uPointer*(60.+.03*(z+2400.));
          vec4 A=projectionMatrix*modelViewMatrix*vec4(p,1.);
          vec3 q=p; q.z-=uStretch; q.xy*=1.-.00005*abs(uStretch)*uBurst;
          vec4 B=projectionMatrix*modelViewMatrix*vec4(q,1.);
          float depth=1000.-z;
          float big=pow(aSeed.w,9.);
          float w=(.85+1.5*aSeed.z+7.*big)*1000./max(depth,60.); float bok=smoothstep(520.,120.,depth); w=min(w,64.)*(1.+bok*.8);
          vec2 sa=px(A),sb=px(B),dir=sa-sb; float len=min(length(dir),uView.y*.35); dir=len>.5?normalize(dir):vec2(1.,0.); vec2 nrm=vec2(-dir.y,dir.x);
          vec2 s=mix(sa-dir*(len+w),sa+dir*w,position.y)+nrm*position.x*w;
          gl_Position=vec4(s/(uView*.5),0.,1.); if(A.w<40.)gl_Position=vec4(2.,2.,0.,1.);
          vP=vec2(position.x,position.y*2.-1.);
          float far=smoothstep(3300.,1500.,depth),near=smoothstep(40.,320.,depth);
          vL=uK*far*near*(.16+.9*aSeed.y*aSeed.y)*(w/(w+len*.35))/(1.+bok*11.)*(1.+1.2*big)*(.75+.25*sin(uTime*(.6+aSeed.x)+aSeed.z*60.));
          vec3 cool=mix(vec3(.45,.55,1.),vec3(.78,.55,1.),aSeed.x); vC=mix(cool,vec3(1.,.80,.50),step(.62-.45*uWarm,aSeed.z)*.85);
        }`,
      fragmentShader: `precision highp float; varying vec2 vP; varying vec3 vC; varying float vL; void main(){${SPOT} gl_FragColor=vec4(vC*g*vL,0.);}` }));
    this.dust.frustumCulled = false; this.scene.add(this.dust);
  }

  // Build the particle version of each line from its measured letters.
  setLines(lines) {
    this.sets.forEach(s => { this.scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); });
    const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
    this.sets = lines.map(line => {
      const cs = getComputedStyle(line.el), size = parseFloat(cs.fontSize);
      const x0 = Math.min(...line.rest.map(r => r.x)) - 8, x1 = Math.max(...line.rest.map(r => r.x + r.w)) + 8, y0 = Math.min(...line.rest.map(r => r.y)) - 8, y1 = Math.max(...line.rest.map(r => r.y + r.h)) + 8;
      const W = Math.max(2, Math.ceil(x1 - x0)), H = Math.max(2, Math.ceil(y1 - y0));
      cv.width = W; cv.height = H; cx.clearRect(0, 0, W, H);
      cx.font = `${cs.fontWeight} ${size}px "Mona Wide"`; cx.textBaseline = 'alphabetic'; cx.fillStyle = '#fff';
      const m = cx.measureText('Hg'), asc = m.fontBoundingBoxAscent, desc = m.fontBoundingBoxDescent;
      line.rest.forEach((r, i) => cx.fillText(line.chars[i].textContent, r.x - x0, r.y - y0 + (r.h - asc - desc) / 2 + asc));
      const data = cx.getImageData(0, 0, W, H).data, hits = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 110) hits.push(x, y);
      const total = hits.length / 2, n = Math.min(this.small ? 2200 : 7000, total);
      const to = new Float32Array(n * 2), seed = new Float32Array(n * 4), ch = new Float32Array(n), pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const k = Math.floor((i + Math.random()) / n * total) * 2, x = hits[k] + Math.random() + x0, y = hits[k + 1] + Math.random() + y0;
        to[i * 2] = x - this.w / 2; to[i * 2 + 1] = this.h / 2 - y;
        let best = 0, bd = 1e9; line.rest.forEach((r, j) => { const d = Math.abs(x - r.x - r.w / 2) + (y < r.y || y > r.y + r.h ? 1e5 : 0); if (d < bd) { bd = d; best = j; } });
        ch[i] = line.order[best]; for (let s = 0; s < 4; s++) seed[i * 4 + s] = Math.random();
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(pos, 3)); g.setAttribute('aTo', new BufferAttribute(to, 2)); g.setAttribute('aSeed', new BufferAttribute(seed, 4)); g.setAttribute('aChar', new BufferAttribute(ch, 1));
      const warm = line.name === 'spark' || line.name === 'yours';
      const mesh = new Points(g, new ShaderMaterial({ ...additive,
        uniforms: { uFade: { value: 1 }, uIn: { value: 0 }, uOut: { value: 0 }, uZ: { value: 0 }, uTime: { value: 0 }, uMode: { value: MODES[line.mode] }, uBlast: { value: line.name === 'hush' ? 1 : 0 }, uPull: { value: line.name === 'import' ? 1 : 0 }, uPx: { value: this.dpr }, uSize: { value: Math.max(1.5, Math.min(2.5, size / 34)) }, uHalf: { value: new Vector2(this.w / 2, this.h / 2) }, uA: { value: new Color(warm ? '#ffd79a' : '#a98bff') }, uB: { value: new Color(warm ? '#fff3dc' : '#8db8ff') } },
        vertexShader: `precision highp float; attribute vec2 aTo; attribute vec4 aSeed; attribute float aChar; varying vec3 vC; varying float vL;
          uniform float uFade,uIn,uOut,uZ,uTime,uMode,uBlast,uPull,uPx,uSize; uniform vec2 uHalf; uniform vec3 uA,uB;
          mat2 rot(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
          void main(){
            float f=clamp((uIn-aChar*.5)/.5,0.,1.); float e=1.-pow(1.-f,3.4); e=clamp(e*(.86+.14*aSeed.w)+step(.999,f),0.,1.);
            float an=aSeed.x*6.2832,ra=sqrt(aSeed.y); vec3 d=vec3(cos(an)*ra,sin(an)*ra,aSeed.z*2.-1.);
            vec3 to=vec3(aTo,0.),from; float k=e*(1.-e)*4.;
            if(uMode<.5){ from=vec3(d.xy*16.,-60.); to.xy=rot((1.-e)*(.8+aSeed.z)*(aSeed.w>.5?1.:-1.)*.55)*to.xy; }
            else if(uMode<1.5){ from=to+d*vec3(uHalf.x*.9,uHalf.y*1.1,820.); }
            else if(uMode<2.5){ from=vec3(d.xy*uHalf.y*.55,-900.+d.z*500.); }
            else if(uMode<3.5){ to.xy=rot((1.-e)*2.3)*to.xy*(1.+(1.-e)*.5*aSeed.z); from=vec3(to.xy*(1.3+aSeed.y),-500.*aSeed.z); }
            else { from=vec3(d.xy*46.,-1900.+500.*d.z); }
            vec3 p=mix(from,to,e);
            p+=vec3(sin(aSeed.w*40.+uTime*.9+p.y*.011),cos(aSeed.z*40.+uTime*.8+p.x*.011),sin(aSeed.x*33.+uTime*.5))*k*vec3(34.,34.,90.);
            p.xy+=vec2(sin(uTime*1.4+aSeed.x*50.),cos(uTime*1.2+aSeed.y*50.))*.7*e;
            // leaving: peel off letter by letter into a curling drift, not a block
            float o=clamp((uOut*1.5-aChar*.5*(1.-uBlast)-.12*aSeed.z)/1.,0.,1.),oo=o*o;
            float reach=pow(aSeed.w,2.6);
            vec2 curl=vec2(sin(aTo.y*.016+uTime*.25+aSeed.z*5.)+.5*sin(aTo.x*.021+3.),cos(aTo.x*.013-uTime*.2+aSeed.x*5.)+.5*cos(aTo.y*.024+1.));
            p.xy+=curl*(26.+150.*reach)*oo+d.xy*uHalf.y*(.06+.75*reach)*oo;
            p.xy+=aTo*(uBlast*2.6*o-uPull*.92*oo+(1.-uBlast)*(1.-uPull)*(.10+.6*reach)*oo);
            p.y+=uBlast*aSeed.z*260.*o; p.z+=(uBlast>.5?700.*o:(uPull>.5?-700.*oo:(60.+620.*reach)*oo));
            p.z+=uZ;
            vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; if(-mv.z<30.)gl_Position=vec4(2.,2.,0.,1.);
            gl_PointSize=min(uSize*(.55+1.5*aSeed.w*aSeed.w)*uPx*1000./max(-mv.z,60.)*mix(1.7,1.2,e)*2.,30.);
            float born=smoothstep(0.,.16,f)*mix(1.,smoothstep(.05,.6,f),step(1.5,uMode)*step(uMode,2.5)),settle=smoothstep(.80,1.,e);
            vL=uFade*born*(1.-smoothstep(.30,1.,o))*mix(.62,.085+.10*sin(uTime*2.+aSeed.y*80.)*aSeed.x,settle*(1.-smoothstep(0.,.10,o)));
            vC=mix(mix(uA,uB,aSeed.x),vec3(1.,.97,.92),.25+.35*k);
          }`,
        fragmentShader: `precision highp float; varying vec3 vC; varying float vL; void main(){ vec2 vP=gl_PointCoord*2.-1.; ${SPOT} gl_FragColor=vec4(vC*g*vL,0.); }` }));
      mesh.frustumCulled = false; mesh.visible = false; this.scene.add(mesh);
      return { line, mesh };
    });
  }

  // Drop resolution, then dust, if the device cannot keep up.
  adapt(real) {
    if (real > .4 || document.hidden) return;
    this.avg = (this.avg ?? .016) + (real - (this.avg ?? .016)) * .05; this.age = (this.age || 0) + 1;
    if (this.age < 50 || this.avg < .026 || this.level >= 3) return;
    this.level = (this.level || 0) + 1; this.age = 0;
    if (this.level === 3) this.dust.geometry.instanceCount = Math.floor(this.dust.geometry.instanceCount / 2.5);
    else this.resize();
  }

  setIdle(v) { if (v === this.idle) return; this.idle = v; this.canvas.classList.toggle('is-idle', v); }

  frame(dt, director, look, fade = 1) {
    this.time += dt;
    const u = this.dust.material.uniforms, g = this.glow.material.uniforms, p = director.pointer;
    u.uTime.value = this.time; u.uTravel.value = look.travel; u.uBurst.value = look.burst; u.uSwirl.value = look.swirl; u.uK.value = look.dust * fade; u.uWarm.value = look.warm; u.uPointer.value.set(p.x, -p.y);
    // streaks follow the actual camera speed
    const target = Math.max(-1500, Math.min(1500, (look.travel - (this.prev ?? look.travel)) / Math.max(dt, .004) * .055)); this.prev = look.travel;
    this.stretch = (this.stretch || 0) + (target - (this.stretch || 0)) * Math.min(1, dt * 9); u.uStretch.value = this.stretch;
    g.uTime.value = this.time; g.uK.value = look.glow * fade; g.uWarm.value = look.warm; g.uC.value.set(-p.x * .012, p.y * .012);
    for (const { line, mesh } of this.sets) {
      const on = line.fx.in > 0 && line.fx.out < 1; mesh.visible = on; if (!on) continue;
      const m = mesh.material.uniforms; m.uIn.value = line.fx.in; m.uOut.value = line.fx.out; m.uZ.value = line.fx.z; m.uTime.value = this.time; m.uFade.value = fade; mesh.position.y = director.arrivalTarget * this.h; // the section unpins and scrolls away
    }
    this.renderer.render(this.scene, this.camera);
  }
}
