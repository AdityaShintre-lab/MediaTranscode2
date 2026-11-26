// Turns the rendered segments into the files the site loads:
//   frontend/media/cosmos-1080.mp4, cosmos-720.mp4   scrub-friendly H.264 (keyframe every few frames, no B-frames)
//   frontend/media/still-01..10.webp                 first paint, reduced motion and no-video fallback
// Use your own footage instead:  node encode.mjs --in myvideo.mp4
import { spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const here = path.dirname(fileURLToPath(import.meta.url)), media = path.resolve(here, arg('media', '../../frontend/media')), segs = path.resolve(here, arg('segments', 'out'));
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const run = args => { const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' }); if (r.status) process.exit(r.status || 1); };
const SECONDS = 24, FPS = 30, STILLS = [0, 3.4, 6.2, 7.5, 8.9, 11.2, 14.4, 17, 19.6, 23.6]; // keep in step with js/film.js
mkdirSync(media, { recursive: true });

let input = ['-i', arg('in', '')], retime = '';
if (!arg('in')) {
  const list = readdirSync(segs).filter(f => /^seg_\d+\.mkv$/.test(f)).sort();
  if (list.length * +arg('segment', 30) < SECONDS * FPS) { console.error(`only ${list.length} segments in ${segs}; run node render.mjs first`); process.exit(1); }
  const txt = path.join(segs, 'list.txt'); // forward slashes: FFmpeg reads backslashes in this list as escapes, which breaks Windows paths
  writeFileSync(txt, list.map(f => `file '${path.join(segs, f).split(path.sep).join('/').replace(/'/g, "'\\''")}'`).join('\n'));
  input = ['-f', 'concat', '-safe', '0', '-i', txt];
} else {
  const probe = spawnSync(process.env.FFPROBE || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', arg('in')], { encoding: 'utf8' });
  retime = `setpts=PTS*${SECONDS / parseFloat(probe.stdout)},`; // stretch to the 24 s the story is cued to
}
const tags = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv'];
const encode = (w, crf, gop, file) => {
  run([...input, '-an', '-vf', `${retime}fps=${FPS},scale=${w}:-2:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-crf', String(crf), '-g', String(gop), '-keyint_min', String(gop), '-sc_threshold', '0', '-bf', '0', '-x264-params', 'aq-mode=3:aq-strength=0.9:deblock=1,1:ref=2', ...tags, '-movflags', '+faststart', path.join(media, file)]);
  console.log(file, (statSync(path.join(media, file)).size / 1e6).toFixed(1), 'MB');
};
encode(1920, +arg('crf', 25), +arg('gop', 4), 'cosmos-1080.mp4');
encode(1280, +arg('crf720', 26), +arg('gop', 4), 'cosmos-720.mp4');
STILLS.forEach((t, i) => run(['-ss', String(t), '-i', path.join(media, 'cosmos-1080.mp4'), '-frames:v', '1', '-vf', 'scale=1600:-2:flags=lanczos', '-c:v', 'libwebp', '-quality', '78', path.join(media, `still-${String(i + 1).padStart(2, '0')}.webp`)]));
console.log('stills written');
