import os
import re
import uuid
import threading
import subprocess
from pathlib import Path
from flask import Flask, jsonify, request, send_file, send_from_directory

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
UPLOADS = ROOT / "uploads"
CONVERTED = ROOT / "converted"
UPLOADS.mkdir(exist_ok=True)
CONVERTED.mkdir(exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 500 * 1024 * 1024

jobs = {}
lock = threading.Lock()
ALLOWED = {".mp4", ".mov", ".mkv"}
PRESETS = {
    "1080p": ["-vf", "scale=-2:1080"],
    "720p": ["-vf", "scale=-2:720"],
    "480p": ["-vf", "scale=-2:480"],
}


def video_info(path):
    command = [
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration:stream=width,height", "-of", "json", str(path)
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=True)
    import json
    data = json.loads(result.stdout)
    video = next((s for s in data.get("streams", []) if s.get("width")), {})
    duration = float(data.get("format", {}).get("duration", 0))
    return {
        "duration": round(duration, 1),
        "resolution": f'{video.get("width", "?")} × {video.get("height", "?")}'
    }


def convert(job_id, source, output, preset):
    with lock:
        jobs[job_id]["status"] = "Processing"
    try:
        info = video_info(source)
        command = [
            "ffmpeg", "-y", "-i", str(source),
            *PRESETS[preset], "-c:v", "libx264", "-preset", "veryfast",
            "-c:a", "aac", "-progress", "pipe:1", "-nostats", str(output)
        ]
        process = subprocess.Popen(
            command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, bufsize=1
        )
        total = max(info["duration"] * 1_000_000, 1)
        for line in process.stdout:
            if line.startswith("out_time_ms="):
                try:
                    current = int(line.split("=", 1)[1])
                    progress = min(99, int(current / total * 100))
                    with lock:
                        jobs[job_id]["progress"] = max(0, progress)
                except ValueError:
                    pass
        code = process.wait()
        if code != 0:
            raise RuntimeError("FFmpeg could not convert this video.")
        with lock:
            jobs[job_id].update(status="Done", progress=100, output=output.name)
    except FileNotFoundError:
        with lock:
            jobs[job_id].update(status="Failed", error="FFmpeg/FFprobe not found. Install FFmpeg and add it to PATH.")
    except Exception as error:
        with lock:
            jobs[job_id].update(status="Failed", error=str(error))


@app.get("/")
def home():
    return send_from_directory(FRONTEND, "index.html")


@app.get("/assets/<path:name>")
def assets(name):
    return send_from_directory(FRONTEND, name)


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "message": "MediaTranscode is running"})


@app.post("/api/upload")
def upload():
    video = request.files.get("video")
    preset = request.form.get("preset", "720p")
    if not video or not video.filename:
        return jsonify(error="Choose a video first."), 400
    if preset not in PRESETS:
        return jsonify(error="Choose a valid preset."), 400
    extension = Path(video.filename).suffix.lower()
    if extension not in ALLOWED:
        return jsonify(error="Only MP4, MOV and MKV files are supported."), 400

    job_id = uuid.uuid4().hex[:10]
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", Path(video.filename).name)
    source = UPLOADS / f"{job_id}_{safe_name}"
    output = CONVERTED / f"{job_id}_{Path(safe_name).stem}_{preset}.mp4"
    video.save(source)

    try:
        details = video_info(source)
    except FileNotFoundError:
        source.unlink(missing_ok=True)
        return jsonify(error="FFprobe not found. Install FFmpeg and add it to PATH."), 500
    except Exception:
        details = {"duration": 0, "resolution": "Unknown"}

    with lock:
        jobs[job_id] = {
            "id": job_id, "filename": safe_name, "size": round(source.stat().st_size / (1024 * 1024), 2),
            "preset": preset, "status": "Queued", "progress": 0,
            "duration": details["duration"], "resolution": details["resolution"],
            "error": "", "output": ""
        }

    thread = threading.Thread(target=convert, args=(job_id, source, output, preset), daemon=True)
    thread.start()
    return jsonify(jobs[job_id]), 201


@app.get("/api/jobs")
def get_jobs():
    with lock:
        return jsonify(list(jobs.values()))


@app.get("/api/download/<job_id>")
def download(job_id):
    with lock:
        job = jobs.get(job_id)
    if not job or job["status"] != "Done":
        return jsonify(error="This converted video is not ready."), 404
    return send_file(CONVERTED / job["output"], as_attachment=True)


@app.errorhandler(413)
def too_large(_error):
    return jsonify(error="File is larger than the 500 MB limit."), 413


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=True)
