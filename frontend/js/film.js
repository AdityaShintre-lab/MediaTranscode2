// Scroll-scrubbed film. The whole file is buffered up front, then currentTime follows
// scroll. Only one seek is ever in flight, so fast scrolling drops frames instead of
// queueing them, and the last decoded frame stays on screen until the next is ready.
const FPS = 30;

// Cross-fading stills: first paint, reduced motion, data saver, and any device that cannot
// play or seek the film. Times match tools/film/encode.sh.
export const STILLS = [0, 3.4, 6.2, 7.5, 8.9, 11.2, 14.4, 17, 19.6, 23.6];

export class Film {
  constructor({ video, holder, duration = 24 }) {
    this.video = video; this.holder = holder; this.duration = duration;
    this.ready = false; this.failed = false;
    this.want = 0; this.shown = -1; this.busy = false; this.busySince = 0;
    this.stills = [holder.querySelector('.stage-still')]; this.still = 0; this.stillsOn = false;
  }

  // Resolves once scrubbing is possible; rejects if it never will be.
  async load(url) {
    const v = this.video;
    v.addEventListener('seeked', () => { this.busy = false; this.reveal(); this.pump(); });
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('film ' + res.status);
      this.blobUrl = URL.createObjectURL(await res.blob());
      v.src = this.blobUrl;
    } catch (e) {
      v.src = url; // streaming fallback; the server supports range requests
    }
    v.preload = 'auto';
    v.load();
    await new Promise((ok, no) => {
      v.addEventListener('loadeddata', ok, { once: true });
      v.addEventListener('error', () => no(new Error('film cannot be decoded')), { once: true });
    });
    if (v.duration && isFinite(v.duration)) this.duration = v.duration;
    this.ready = true;
    this.prime();
    this.shown = -1; this.pump();
  }

  // iOS only paints seeked frames after playback has been started once.
  prime() {
    const kick = () => { const p = this.video.play(); if (p) p.then(() => { this.video.pause(); this.shown = -1; this.pump(); }).catch(() => {}); };
    kick();
    addEventListener('touchend', kick, { once: true, passive: true });
  }

  seek(t) { this.want = t; this.ready ? this.pump() : this.showStill(t); }

  pump() {
    if (!this.ready || this.failed) return;
    const now = performance.now();
    if (this.busy && now - this.busySince < 400) return;
    // aim for the middle of a frame so rounding never lands on its neighbour
    const last = Math.floor(this.duration * FPS) - 1;
    const frame = Math.max(0, Math.min(last, Math.round(this.want * FPS)));
    if (frame === this.shown) return;
    this.shown = frame; this.busy = true; this.busySince = now;
    this.video.currentTime = (frame + .5) / FPS;
  }

  reveal() { if (!this.live) { this.live = true; this.video.classList.add('is-live'); } }

  enableStills() {
    if (this.stillsOn) return; this.stillsOn = true;
    const video = this.video;
    STILLS.slice(1).forEach((_, i) => {
      const img = new Image(); img.className = 'stage-still'; img.alt = ''; img.decoding = 'async';
      img.src = `/assets/media/still-${String(i + 2).padStart(2, '0')}.webp`;
      this.holder.insertBefore(img, video); this.stills.push(img);
    });
  }
  showStill(t) {
    if (!this.stillsOn) return;
    let best = 0; STILLS.forEach((s, i) => { if (Math.abs(s - t) < Math.abs(STILLS[best] - t)) best = i; });
    if (best === this.still) return;
    this.stills[this.still].classList.remove('is-on'); this.stills[best].classList.add('is-on'); this.still = best;
  }
  destroy() { if (this.blobUrl) URL.revokeObjectURL(this.blobUrl); }
}
