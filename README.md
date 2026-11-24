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

4. Open http://127.0.0.1:8000

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

## Scroll story, sound and 3D

- The site opens with an "Enter" screen. Entering plays a short run of soft notes as each part of the page drops in like a pressed key, and every new section does the same as you scroll. There is no piano on screen; the sounds are synthesized in the browser. Use the **Sound** button at the bottom to mute.
- The hero background is a **180-frame image sequence** (`frontend/frames/frame_0001.webp` to `frame_0180.webp`). Scrolling picks the frame, so the "video" plays forward and backward as you scroll.
- 3D: mouse parallax on the hero, the hero text tilts back as you scroll, and cards tilt toward your cursor.

### Use your own video

Put your video next to the project and run this (it creates exactly 180 frames):

```powershell
ffmpeg -i myvideo.mp4 -vf "fps=180/$(ffprobe -v error -show_entries format=duration -of csv=p=0 myvideo.mp4),scale=1280:-2" -frames:v 180 -c:v libwebp -quality 70 frontend/frames/frame_%04d.webp
```

To regenerate the built-in film-frame flight instead: `pip install pillow` then `python tools/make_frames.py`.

## Simple project structure

- `backend/app.py` — Flask routes, upload checks and FFmpeg conversion
- `frontend/index.html` — page structure
- `frontend/style.css` — design and responsive styling
- `frontend/script.js` — page navigation, upload and progress updates, key-press sound, frame scrubbing, 3D tilt
- `frontend/frames/` — the 180 scroll frames
- `tools/make_frames.py` — renders the 180 frames

Uploaded and converted files are created automatically in `uploads/` and `converted/`.
Jobs are kept in memory, so the queue clears when the server restarts. This is a local demo version, not a production deployment.
