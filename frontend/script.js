const pages = ["library", "upload", "queue", "presets", "settings"];
const jobs = new Map();
const $ = (id) => document.getElementById(id);

function showPage(name) {
  pages.forEach(page => {
    $(`${page}-page`).classList.toggle("active-page", page === name);
    document.querySelector(`[data-page="${page}"]`)?.classList.toggle("active", page === name);
  });
  const titles = {library:"Video Library",upload:"Upload Clip",queue:"Queue Tracker",presets:"Preset Profiles",settings:"Settings"};
  $("page-title").textContent = titles[name];
}

document.querySelectorAll("[data-page]").forEach(button => button.addEventListener("click", () => showPage(button.dataset.page)));
document.querySelectorAll("[data-go]").forEach(button => button.addEventListener("click", () => showPage(button.dataset.go)));

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 2600);
}

function readableSize(mb) {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}

function renderJobs() {
  const list = [...jobs.values()].reverse();
  $("queue-count").textContent = list.filter(job => job.status === "Queued" || job.status === "Processing").length;
  $("clip-total").textContent = `${list.length} CLIPS`;
  const filter = $("status-filter").value;
  const search = $("search").value.toLowerCase();
  const visible = list.filter(job =>
    (filter === "All" || job.status === filter) && job.filename.toLowerCase().includes(search)
  );

  $("video-grid").innerHTML = visible.length ? visible.map(job => `
    <article class="video-card">
      <div class="video-thumb">▶</div>
      <h4 title="${job.filename}">${job.filename}</h4>
      <div class="video-meta">${readableSize(job.size)} · ${job.resolution || "Video"}</div>
      <div class="progress-track"><div class="progress-fill" style="width:${job.progress}%"></div></div>
      <span class="status ${job.status}">${job.status}</span>
      <span class="video-meta"> · ${job.preset}</span>
      ${job.status === "Done" ? `<p><a href="/api/download/${job.id}" style="color:#e7c17f;font-size:10px">Download MP4 ↓</a></p>` : ""}
      ${job.error ? `<p style="color:#df8d81;font-size:10px">${job.error}</p>` : ""}
    </article>`).join("") : `<div class="empty-state"><div class="empty-icon">▧</div><h3>No clips found</h3><p>Try another search or upload a new video.</p><button class="primary" data-go="upload">Upload a clip</button></div>`;

  $("queue-list").innerHTML = list.length ? list.map(job => `
    <article class="queue-card">
      <div class="queue-icon">▶</div><div class="queue-info"><h4>${job.filename}</h4><p>${job.preset} MP4 · ${readableSize(job.size)}</p><div class="progress-track"><div class="progress-fill" style="width:${job.progress}%"></div></div><span class="status ${job.status}">${job.status}</span>${job.error ? `<p style="color:#df8d81">${job.error}</p>` : ""}</div>
      <div class="queue-right"><b>${job.progress}%</b><p>${job.status === "Done" ? `<a href="/api/download/${job.id}">Download ↓</a>` : ""}</p></div>
    </article>`).join("") : `<div class="empty-state compact"><div class="empty-icon">◷</div><h3>No conversions yet</h3><p>Upload a clip to see its progress here.</p><button class="primary" data-go="upload">Upload a clip</button></div>`;
}

$("search").addEventListener("input", renderJobs);
$("status-filter").addEventListener("change", renderJobs);

const fileInput = $("video-file");
const dropZone = $("drop-zone");
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  $("file-picked").textContent = file ? `${file.name} · ${readableSize(file.size / 1024 / 1024)}` : "";
});
["dragenter","dragover"].forEach(eventName => dropZone.addEventListener(eventName, event => {
  event.preventDefault(); dropZone.classList.add("dragging");
}));
["dragleave","drop"].forEach(eventName => dropZone.addEventListener(eventName, event => {
  event.preventDefault(); dropZone.classList.remove("dragging");
  if (eventName === "drop" && event.dataTransfer.files.length) {
    fileInput.files = event.dataTransfer.files;
    fileInput.dispatchEvent(new Event("change"));
  }
}));

$("upload-form").addEventListener("submit", async event => {
  event.preventDefault();
  const file = fileInput.files[0];
  if (!file) return $("form-message").textContent = "Please choose a video file.";
  if (file.size > 500 * 1024 * 1024) return $("form-message").textContent = "This file is larger than 500 MB.";
  $("upload-button").disabled = true;
  $("upload-button").textContent = "Uploading...";
  $("form-message").textContent = "Uploading your video...";
  const form = new FormData();
  form.append("video", file);
  form.append("preset", $("preset").value);
  try {
    const response = await fetch("/api/upload", {method:"POST", body:form});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Upload failed.");
    jobs.set(result.id, result);
    renderJobs();
    $("upload-form").reset();
    $("file-picked").textContent = "";
    $("form-message").textContent = "Upload complete. Conversion has started.";
    toast("Your video has been added to the queue.");
    showPage("queue");
    pollJobs();
  } catch (error) {
    $("form-message").textContent = error.message;
  } finally {
    $("upload-button").disabled = false;
    $("upload-button").innerHTML = 'Start conversion <span>→</span>';
  }
});

let polling = false;
async function pollJobs() {
  if (polling) return;
  polling = true;
  try {
    const response = await fetch("/api/jobs");
    const latest = await response.json();
    latest.forEach(job => jobs.set(job.id, job));
    renderJobs();
    if (latest.some(job => job.status === "Queued" || job.status === "Processing")) {
      setTimeout(() => { polling = false; pollJobs(); }, 1200);
      return;
    }
  } catch (error) {
    console.error(error);
  }
  polling = false;
}
pollJobs();


// Sound: each element that appears plays one soft synthesized note (no audio files).
const Sound = (() => {
  let ctx, out, step = 0, on = true;
  try { on = localStorage.getItem('mt-sound') !== 'off'; } catch (e) {}
  const scale = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99, 880];
  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3400;
    out = ctx.createGain(); out.gain.value = .55; out.connect(lp); lp.connect(ctx.destination);
  }
  function tone(freq, t, vol) {
    [[1, 'triangle', 1], [2, 'sine', .28], [3, 'sine', .08]].forEach(([m, type, g]) => {
      const o = ctx.createOscillator(), e = ctx.createGain();
      o.type = type; o.frequency.value = freq * m;
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(vol * g, t + .006);
      e.gain.exponentialRampToValueAtTime(.0001, t + 1.3 / Math.sqrt(m));
      o.connect(e); e.connect(out); o.start(t); o.stop(t + 1.4);
    });
  }
  return {
    get on() { return on; },
    unlock() { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    set(v) { on = v; try { localStorage.setItem('mt-sound', v ? 'on' : 'off'); } catch (e) {} },
    note(i, vol = .2) { if (on && ctx) tone(scale[i % scale.length], ctx.currentTime, vol); },
    next() { this.note(step++); },
    chord(i) { [0, 2, 4].forEach(k => this.note(i + k, .1)); }
  };
})();

(function initSiteEntry() {
  const loader = $('site-loader'), toggle = $('sound-toggle');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function label() { toggle.textContent = Sound.on ? '♪ Sound on' : '♪ Sound off'; toggle.setAttribute('aria-pressed', Sound.on); }
  function enter(withSound) {
    Sound.set(withSound); if (withSound) Sound.unlock(); label();
    loader.classList.add('is-gone'); setTimeout(() => loader.remove(), 800);
    document.querySelectorAll('[data-key]').forEach((el, i) => setTimeout(() => { el.classList.add('keyed'); Sound.note(i); }, (reduced ? 0 : 350 + i * 150)));
  }
  $('enter-sound').addEventListener('click', () => enter(true));
  $('enter-quiet').addEventListener('click', () => enter(false));
  toggle.addEventListener('click', () => { Sound.set(!Sound.on); if (Sound.on) { Sound.unlock(); Sound.note(4); } label(); });
  document.addEventListener('click', event => { if (event.target.closest('.nav-item, .primary:not(#enter-sound)')) Sound.next(); });
  document.querySelectorAll('[data-hero-go]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault(); showPage(link.dataset.heroGo); $('app').scrollIntoView({behavior: 'smooth'});
  }));
  label();
  $('enter-sound').focus();
})();

// A perspective room and rocky terrain drawn on canvas. Scroll progress moves the camera
// through the environment and changes the terrain lighting, depth and chapter overlays.
(function initScrollScene(){
  const canvas = document.getElementById('rock-scene');
  const section = document.getElementById('immersive-intro');
  if (!canvas || !section) return;
  const ctx = canvas.getContext('2d');
  const copy = document.getElementById('scene-copy');
  const chapters = [...document.querySelectorAll('.scene-chapter')];
  let w = 0, h = 0, dpr = 1, progress = 0, raf = 0;
  const rocks = Array.from({length:190}, (_,i) => ({
    x: ((i * 73.17) % 997) / 997,
    z: ((i * 37.91) % 991) / 991,
    r: .35 + ((i * 13.7) % 100) / 100,
    tone: (i * 17) % 42
  }));
  // 180-frame sequence: scroll position picks the frame, eased so it plays smoothly.
  const seq = {ready: false, cur: 0, imgs: [], loaded: 0, count: 180}; let chain = 0;
  const bar = document.getElementById('loader-bar'), cap = document.getElementById('loader-caption');
  const url = n => `/assets/frames/frame_${String(n).padStart(4, '0')}.webp`;
  function tick() {
    seq.loaded++;
    if (bar) bar.style.width = (seq.loaded / seq.count * 100) + '%';
    if (cap) cap.textContent = seq.loaded < seq.count ? `Loading scene… ${Math.round(seq.loaded / seq.count * 100)}%` : 'Scene ready.';
  }
  const first = new Image();
  first.onload = () => {
    seq.imgs[0] = first; seq.ready = true; tick(); draw();
    for (let n = 2; n <= seq.count; n++) { const im = new Image(); im.onload = im.onerror = tick; im.src = url(n); seq.imgs[n - 1] = im; }
  };
  first.onerror = () => { section.querySelector('.scene-sticky').classList.add('no-frames'); if (cap) cap.textContent = 'Frames not found. Showing the basic scene.'; };
  first.src = url(1);
  function drawFrame() {
    let img = null;
    for (let k = Math.round(seq.cur); k >= 0; k--) { const c = seq.imgs[k]; if (c && c.complete && c.naturalWidth) { img = c; break; } }
    if (!img) return;
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight), dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
  function resize(){
    const rect = canvas.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 1.7);
    w = rect.width; h = rect.height; canvas.width = Math.round(w*dpr); canvas.height = Math.round(h*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0); draw();
  }
  function polygon(points, fill){ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();ctx.fillStyle=fill;ctx.fill();}
  function draw(){
    if(!w||!h)return;
    if(seq.ready){
      const t=progress*(seq.count-1); seq.cur+=(t-seq.cur)*.16; if(Math.abs(t-seq.cur)<.02)seq.cur=t;
      drawFrame();
      if(seq.cur!==t&&!chain){chain=1;requestAnimationFrame(()=>{chain=0;draw();});}
      return;
    }
    const p=progress, horizon=h*(.49-.10*p), drift=Math.sin(p*Math.PI*2)*w*.035, zoom=1+p*.58;
    const sky=ctx.createLinearGradient(0,0,0,horizon);sky.addColorStop(0,'#f2f0ed');sky.addColorStop(1,'#c9c8c5');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
    // Architectural white room with strong perspective lines.
    polygon([[0,0],[w,0],[w*.79,horizon],[w*.21,horizon]],'#efeeeb');
    polygon([[0,0],[w*.21,horizon],[w*.21,h],[0,h]],'#d7d6d3');
    polygon([[w,0],[w*.79,horizon],[w*.79,h],[w,h]],'#c9c8c5');
    polygon([[0,0],[w,horizon*.02],[w*.21,horizon],[0,horizon*.8]],'#f7f6f3');
    polygon([[w,0],[w,horizon*.8],[w*.79,horizon],[w*.98,0]],'#e7e6e3');
    // Back wall doorway changes scale and position as the camera advances.
    const doorW=w*(.075+.035*p), doorH=h*(.29+.12*p), doorX=w*(.5-.0375-.08*p)+drift*.25;
    ctx.fillStyle='#252a32';ctx.fillRect(doorX,horizon-doorH,doorW,doorH);
    ctx.fillStyle='#ffffff25';ctx.fillRect(doorX+doorW*.12,horizon-doorH,doorW*.08,doorH);
    // Floor plane.
    polygon([[0,horizon*.8],[w,horizon*.8],[w,h],[0,h]],'#45464a');
    const floorGrad=ctx.createLinearGradient(0,horizon,0,h);floorGrad.addColorStop(0,'#77777a');floorGrad.addColorStop(.32,'#3c3d41');floorGrad.addColorStop(1,'#101216');ctx.fillStyle=floorGrad;ctx.fillRect(0,horizon,w,h-horizon);
    // Perspective floor seams shift with scroll to make camera movement obvious.
    ctx.strokeStyle='#d8d5ce22';ctx.lineWidth=1;
    for(let i=0;i<12;i++){let x=w*i/11;ctx.beginPath();ctx.moveTo(w/2+(x-w/2)*.08,horizon);ctx.lineTo(x+drift,h);ctx.stroke();}
    for(let i=1;i<8;i++){let y=horizon+(h-horizon)*Math.pow(i/8,1.7);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    // Procedural jagged stones in perspective; the camera moves through them as scroll progresses.
    rocks.forEach((rock,i)=>{
      let z=(rock.z + p*.72)%1, perspective=.12+z*z*1.15;
      let x=(rock.x-.5)*w*perspective*1.75+w/2+drift*(.2+z);
      let y=horizon+(h-horizon)*(.12+z*.92);
      let size=(3+rock.r*20)*perspective*zoom;
      if(y<horizon||y>h+size||x<-size||x>w+size)return;
      const shade=Math.max(8,Math.min(65,25+rock.tone*.55+z*13-p*4));
      const color=`rgb(${shade+5},${shade+6},${shade+9})`;
      const points=[[x-size*1.2,y],[x-size*.55,y-size*.55],[x-size*.08,y-size*.9],[x+size*.55,y-size*.48],[x+size*1.15,y-size*.12],[x+size*.72,y+size*.42],[x-size*.55,y+size*.38]];
      polygon(points,color);
      ctx.strokeStyle=`rgba(225,225,220,${.05+z*.08})`;ctx.lineWidth=Math.max(.4,size*.035);ctx.beginPath();ctx.moveTo(x-size*.55,y-size*.55);ctx.lineTo(x-size*.08,y-size*.9);ctx.lineTo(x+size*.55,y-size*.48);ctx.stroke();
    });
    // Moving cinematic light sweep across the terrain.
    const lx=w*(.2+.65*p), ly=h*(.68-.12*Math.sin(p*Math.PI));const glow=ctx.createRadialGradient(lx,ly,1,lx,ly,w*.22);glow.addColorStop(0,'rgba(255,239,205,.22)');glow.addColorStop(1,'rgba(255,239,205,0)');ctx.fillStyle=glow;ctx.fillRect(0,horizon,w,h-horizon);
  }
  function update(){
    const rect=section.getBoundingClientRect(), total=section.offsetHeight-innerHeight;
    progress=Math.max(0,Math.min(1,-rect.top/Math.max(1,total)));
    if(copy){const fade=Math.max(0,1-Math.max(0,progress-.12)*5);copy.style.opacity=fade;copy.style.transform=`translate(-50%,calc(-50% + ${progress*38}px)) perspective(900px) rotateX(${progress*28}deg) rotateY(calc(var(--mx,0)*-3deg))`;}
    chapters.forEach((chapter,i)=>{const on=progress>=[.24,.54,.82][i]&&progress<=[.52,.80,1][i];if(on&&!chapter.classList.contains('visible'))Sound.chord(i*2);chapter.classList.toggle('visible',on);});
    if(!raf)raf=requestAnimationFrame(()=>{raf=0;draw();});
  }
  window.addEventListener('resize',resize,{passive:true});window.addEventListener('scroll',update,{passive:true});resize();update();
})();

// Page content presses in as it enters the viewport, one note per element.
(function initContentReveals(){
  const targets = document.querySelectorAll('.sidebar .brand, .sidebar .nav-item, .main .topbar, .main .welcome-row, .main .toolbar, .main .section-heading, .main .video-grid, .main .page-intro, .main #upload-form, .main .queue-list, .main .preset-grid, .main .settings-card, .main footer');
  targets.forEach((element) => element.classList.add('reveal-on-scroll'));
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    targets.forEach((element) => element.classList.add('is-revealed'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.filter(entry => entry.isIntersecting).forEach((entry, k) => {
      observer.unobserve(entry.target);
      setTimeout(() => { entry.target.classList.add('is-revealed'); Sound.next(); }, k * 120);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -35px 0px' });
  targets.forEach((element) => observer.observe(element));
})();

// 3D: mouse parallax on the hero scene, and tilt on cards.
(function init3D(){
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !window.matchMedia('(hover: hover)').matches) return;
  const stage = document.querySelector('.scene-sticky');
  const tiltable = '.video-card, .preset-card, .queue-card, .form-card, .storage-pill, .drop-zone';
  let active = null;
  function release() { if (active) { active.style.transform = ''; active.classList.remove('tilting'); active = null; } }
  window.addEventListener('pointermove', event => {
    stage.style.setProperty('--mx', ((event.clientX / innerWidth - .5) * 2).toFixed(3));
    stage.style.setProperty('--my', ((event.clientY / innerHeight - .5) * 2).toFixed(3));
    const el = event.target.closest && event.target.closest(tiltable);
    if (active && active !== el) release();
    if (!el) return;
    active = el; el.classList.add('tilting');
    const r = el.getBoundingClientRect(), x = (event.clientX - r.left) / r.width, y = (event.clientY - r.top) / r.height;
    el.style.setProperty('--gx', (x * 100) + '%'); el.style.setProperty('--gy', (y * 100) + '%');
    el.style.transform = `perspective(800px) rotateX(${((.5 - y) * 9).toFixed(2)}deg) rotateY(${((x - .5) * 11).toFixed(2)}deg) scale(1.02)`;
  }, {passive: true});
  document.addEventListener('pointerleave', release);
})();
