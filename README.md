# MediaTranscode

A small local video-conversion web app built with HTML, CSS, JavaScript, Python Flask and FFmpeg.

## Run on Windows

1. Install FFmpeg and add its `bin` folder to Windows PATH.
2. Open this folder in VS Code.
3. In PowerShell, run:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python backend/app.py
```

If PowerShell says running scripts is disabled, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` first. It only affects that window.

4. Open http://127.0.0.1:8000 in Chrome, Edge or Firefox.

Check that FFmpeg is available:

```powershell
ffmpeg -version
ffprobe -version
```

## Features

- MP4, MOV and MKV upload (maximum 500 MB)
- 1080p, 720p and 480p MP4 output
- FFmpeg conversion with progress updates
- Queue status and converted-file download
- Responsive layout

## The scroll story

The page opens on a wall of ivory and obsidian slabs that is played like a phrase, then parts onto a single star. From there scrolling drives everything: the star swells, explodes, its debris scatters and settles into a galaxy, and the camera dives into it and arrives at the workspace.

- **Film:** `frontend/media/cosmos-1080.mp4` (phones get `cosmos-720.mp4`). It sits behind the whole page. Scrolling sets its `currentTime`, so it plays forward and backward with you. It is an original render, so there is nothing to license.
- **Lettering:** every line is assembled from particles that share the page's 3D perspective, on the same clock as the film.
- **Sound:** off by default. *Enter with sound* or the **Sound** button turns it on; all notes are synthesized in the browser.
- **Fallbacks:** stills replace the film when video cannot play, when the browser asks to save data, and for visitors who prefer reduced motion. Without WebGL the slabs are drawn in CSS and the particles are skipped. The workspace works in every case.
- Three.js, GSAP and the Mona Sans font are in `frontend/vendor/` and `frontend/fonts/`, so the page works offline.

### Change the story

Text is in `frontend/index.html` (look for `data-line`). When each line appears is in `frontend/js/story.js` (`LINES`), and which moment of the film plays at which scroll position is in `frontend/js/director.js` (`CUES`).

### Use your own video

```powershell
cd tools/film
node encode.mjs --in myvideo.mp4
```

This stretches the video to the 24 seconds the story is cued to, and writes both film sizes and the fallback stills. It needs Node.js and FFmpeg. Re-encoding matters: a normal MP4 has too few keyframes to scrub smoothly.

### Render the film again

```powershell
cd tools/film
npm install
node render.mjs      # about 40 minutes on a recent GPU; stop and restart any time
node encode.mjs
```

`node render.mjs --stills 0,6.2,8.4,19 --w 960` renders single moments to check a change first. Needs Google Chrome or Microsoft Edge, which it finds on its own; set `CHROME` to the browser's path if it doesn't. On Windows, run these in PowerShell the same way.

The earlier film-frame flight (`frontend/frames/`, `tools/make_frames.py`) is kept in the repository but the page no longer loads it.

## Simple project structure

- `backend/app.py` — Flask routes, upload checks and FFmpeg conversion
- `frontend/index.html` — page structure and all copy
- `frontend/style.css` — base styles and the workspace
- `frontend/cinema.css` — film stage, entrance and story scenes
- `frontend/script.js` — workspace: navigation, upload, queue and progress
- `frontend/js/main.js` — starts the cinematic layers and their fallbacks
- `frontend/js/director.js` — turns scroll into one smoothed timeline
- `frontend/js/film.js` — buffers and scrubs the video
- `frontend/js/story.js` — text choreography
- `frontend/js/cosmos.js` — WebGL dust, glow and particle lettering
- `frontend/js/overture.js` — the entrance
- `frontend/js/sound.js` — synthesized sound
- `tools/film/` — renders and encodes the film

Uploaded and converted files are created automatically in `uploads/` and `converted/`.
Jobs are kept in memory, so the queue clears when the server restarts. This is a local demo version, not a production deployment.
