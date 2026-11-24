"""Renders 180 frames of a 3D camera flight through floating film frames.
Output: frontend/frames/frame_0001.webp ... frame_0180.webp
To use your OWN video instead, see README ("Use your own video")."""
import math, os, random
from PIL import Image, ImageDraw, ImageChops

W, H, S, N = 1280, 720, 2, 180
OUT = os.path.join(os.path.dirname(__file__), "..", "frontend", "frames")
os.makedirs(OUT, exist_ok=True)
rnd = random.Random(7)
BG = (14, 15, 13); GOLD = (214, 166, 93)
HUES = [(88, 124, 98), (214, 166, 93), (110, 168, 186), (196, 112, 96), (146, 138, 204)]

lerp = lambda a, b, t: tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
cards = []
for k in range(46):
    th = k * 0.9 + rnd.random() * .3
    r = 2.2 + rnd.random() * 1.7
    cards.append(dict(c=(r * math.cos(th) * 1.3, r * math.sin(th) * .75, 3 + k * 1.35),
                      yaw=-math.cos(th) * .6, roll=rnd.uniform(-.25, .25), col=HUES[k % 5], play=k % 3 == 0))
dust = [(rnd.uniform(-6, 6), rnd.uniform(-3.5, 3.5), rnd.uniform(0, 64)) for _ in range(220)]

# static layers
bg = Image.new("RGB", (W * S, H * S), BG)
d = ImageDraw.Draw(bg)
for i in range(40):  # soft radial backdrop
    t = i / 39
    rad = int(W * S * .75 * (1 - t))
    d.ellipse([W * S / 2 - rad, H * S / 2 - rad * .7, W * S / 2 + rad, H * S / 2 + rad * .7], fill=lerp((8, 9, 8), (34, 36, 31), t))
glow_mask = Image.radial_gradient("L").resize((W, H))  # white edge, black centre
glow_mask = ImageChops.invert(glow_mask)
vig = Image.radial_gradient("L").resize((W, H)).point(lambda v: int(v * .75))

def render(n):
    p = n / (N - 1)
    e = p * p * (3 - 2 * p) * .35 + p * .65
    cam = (.6 * math.sin(p * 6.28), .3 * math.cos(p * 4.7), e * 50)
    roll = .14 * math.sin(p * 6.28 + .5)
    cx, cy, f = W * S / 2, H * S / 2, W * S * .85
    img = bg.copy(); dr = ImageDraw.Draw(img)

    def proj(P):
        dx, dy, dz = P[0] - cam[0], P[1] - cam[1], P[2] - cam[2]
        if dz < .45: return None, dz
        x, y = f * dx / dz, -f * dy / dz
        return (cx + x * math.cos(roll) - y * math.sin(roll), cy + x * math.sin(roll) + y * math.cos(roll)), dz

    for z0 in range(len(dust)):  # speed streaks
        x, y, z = dust[z0]
        a, da = proj((x, y, z)); b, _ = proj((x, y, z + .5))
        if a and b and da < 30:
            dr.line([a, b], fill=lerp(BG, (230, 210, 170), max(0, 1 - da / 30) * .8), width=S)

    for c in sorted(cards, key=lambda c: -c["c"][2]):
        ca, sa = math.cos(c["roll"]), math.sin(c["roll"]); cy_, sy_ = math.cos(c["yaw"]), math.sin(c["yaw"])
        def Q(u, v):
            x, y = u * 1.6, v * .9
            x, y = x * ca - y * sa, x * sa + y * ca
            return proj((c["c"][0] + x * cy_, c["c"][1] + y, c["c"][2] + x * sy_))
        mid, dz = Q(0, 0)
        if not mid: continue
        fog = max(0, min(1, 1 - (dz - 2) / 24)) ** 1.3
        col = lambda rgb: lerp(BG, rgb, fog)
        def quad(u0, v0, u1, v1, rgb):
            pts = [Q(u0, v0)[0], Q(u1, v0)[0], Q(u1, v1)[0], Q(u0, v1)[0]]
            if all(pts): dr.polygon(pts, fill=col(rgb))
        quad(-1, -1, 1, 1, (70, 62, 46))
        for s in range(12):  # gradient picture area
            u0, u1 = -.94 + 1.88 * s / 12, -.94 + 1.88 * (s + 1) / 12
            quad(u0, -.78, u1 + .01, .78, lerp(tuple(int(x * .3) for x in c["col"]), tuple(int(x * .95) for x in c["col"]), s / 11))
        for s in range(11):  # film sprocket holes
            u = -.88 + s * .176
            quad(u, .84, u + .09, .95, BG); quad(u, -.95, u + .09, -.84, BG)
        if c["play"]:
            tri = [Q(-.14, .24)[0], Q(.24, 0)[0], Q(-.14, -.24)[0]]
            if all(tri): dr.polygon(tri, fill=col((245, 236, 214)))
        o = [Q(-1, -1)[0], Q(1, -1)[0], Q(1, 1)[0], Q(-1, 1)[0]]
        if all(o): dr.line(o + [o[0]], fill=col(GOLD), width=max(1, int(S * 2.2 * fog + 1)))

    img = img.resize((W, H), Image.LANCZOS)
    g = glow_mask.point(lambda v: int(v * (.05 + .5 * p ** 2)))  # tunnel-end light grows
    img = Image.composite(Image.new("RGB", (W, H), (255, 226, 170)), img, g)
    img = Image.composite(Image.new("RGB", (W, H), (6, 6, 6)), img, vig)
    img.save(os.path.join(OUT, f"frame_{n + 1:04d}.webp"), quality=70, method=4)

for n in range(N): render(n)
print("done", N, "frames")
