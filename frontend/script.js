// The workspace: navigation, uploads, conversion queue. Independent of the cinematic
// layers (js/main.js), so it keeps working if WebGL, video or GSAP are unavailable.
import { Sound } from './js/sound.js';

const pages = ["library", "upload", "queue", "presets", "settings"];
const jobs = new Map();
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const icon = (name, cls = "ico") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

function showPage(name) {
  pages.forEach(page => {
    $(`${page}-page`).classList.toggle("active-page", page === name);
    const item = document.querySelector(`[data-page="${page}"]`);
    item?.classList.toggle("active", page === name);
    page === name ? item?.setAttribute("aria-current", "page") : item?.removeAttribute("aria-current");
  });
  const titles = {library:"Video Library",upload:"Upload Clip",queue:"Queue Tracker",presets:"Preset Profiles",settings:"Settings"};
  $("page-title").textContent = titles[name];
}

// Delegated, so buttons that are re-rendered later (empty states) keep working.
document.addEventListener("click", event => {
  const nav = event.target.closest("[data-page], [data-go]");
  if (nav) showPage(nav.dataset.page || nav.dataset.go);
  const hero = event.target.closest("[data-hero-go]");
  if (hero) {
    event.preventDefault();
    showPage(hero.dataset.heroGo);
    $("app").scrollIntoView();
  }
  if (event.target.closest(".nav-item, .primary")) Sound.next();
});

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
  $("clip-total").textContent = `${list.length} ${list.length === 1 ? "clip" : "clips"}`;
  const filter = $("status-filter").value;
  const search = $("search").value.toLowerCase();
  const visible = list.filter(job =>
    (filter === "All" || job.status === filter) && job.filename.toLowerCase().includes(search)
  );

  $("video-grid").innerHTML = visible.length ? visible.map(job => `
    <article class="video-card">
      <div class="video-thumb">${icon("play")}</div>
      <h4 title="${esc(job.filename)}">${esc(job.filename)}</h4>
      <div class="video-meta">${readableSize(job.size)} · ${esc(job.resolution || "Video")}</div>
      <div class="progress-track"><div class="progress-fill" style="width:${job.progress}%"></div></div>
      <span class="status ${esc(job.status)}">${esc(job.status)}</span>
      <span class="video-meta"> · ${esc(job.preset)}</span>
      ${job.status === "Done" ? `<p><a class="job-link" href="/api/download/${esc(job.id)}">Download MP4</a></p>` : ""}
      ${job.error ? `<p class="job-error">${esc(job.error)}</p>` : ""}
    </article>`).join("") : list.length
    ? `<div class="empty-state">${icon("library", "empty-icon")}<h3>No clips found</h3><p>Try another search or upload a new video.</p><button class="primary" data-go="upload">Upload a clip</button></div>`
    : `<div class="empty-state">${icon("library", "empty-icon")}<h3>Your library is waiting</h3><p>Upload a video to start your first conversion.</p><button class="primary" data-go="upload">Upload a clip</button></div>`;

  $("queue-list").innerHTML = list.length ? list.map(job => `
    <article class="queue-card">
      <div class="queue-icon">${icon("play")}</div><div class="queue-info"><h4>${esc(job.filename)}</h4><p>${esc(job.preset)} MP4 · ${readableSize(job.size)}</p><div class="progress-track"><div class="progress-fill" style="width:${job.progress}%"></div></div><span class="status ${esc(job.status)}">${esc(job.status)}</span>${job.error ? `<p class="job-error">${esc(job.error)}</p>` : ""}</div>
      <div class="queue-right"><b>${job.progress}%</b><p>${job.status === "Done" ? `<a class="job-link" href="/api/download/${esc(job.id)}">Download</a>` : ""}</p></div>
    </article>`).join("") : `<div class="empty-state compact">${icon("clock", "empty-icon")}<h3>No active conversions</h3><p>When you upload a clip, its progress will appear here.</p><button class="primary" data-go="upload">Upload a clip</button></div>`;
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
    $("upload-button").textContent = "Start conversion";
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

// Workspace content presses in as it enters the viewport, one note per element.
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
      setTimeout(() => { entry.target.classList.add('is-revealed'); Sound.next(); }, k * 90);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -35px 0px' });
  targets.forEach((element) => observer.observe(element));
})();

// Cards tilt toward the cursor.
(function initTilt(){
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !window.matchMedia('(hover: hover)').matches) return;
  const tiltable = '.video-card, .preset-card, .queue-card, .form-card, .storage-pill, .drop-zone';
  let active = null;
  function release() { if (active) { active.style.transform = ''; active.classList.remove('tilting'); active = null; } }
  $('app').addEventListener('pointermove', event => {
    const el = event.target.closest(tiltable);
    if (active && active !== el) release();
    if (!el) return;
    active = el; el.classList.add('tilting');
    const r = el.getBoundingClientRect(), x = (event.clientX - r.left) / r.width, y = (event.clientY - r.top) / r.height;
    el.style.setProperty('--gx', (x * 100) + '%'); el.style.setProperty('--gy', (y * 100) + '%');
    el.style.transform = `perspective(900px) rotateX(${((.5 - y) * 7).toFixed(2)}deg) rotateY(${((x - .5) * 9).toFixed(2)}deg) scale(1.012)`;
  }, {passive: true});
  $('app').addEventListener('pointerleave', release);
})();
