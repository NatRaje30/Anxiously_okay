"""Placeholder app icon, splash and privacy-screen art in the app's palette.
Run:  python3 scripts/make-placeholder-art.py   (then: npm run assets)
Replace the files in assets/ with final artwork before release."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math, os

CREAM, CREAM_D = (255, 251, 245), (26, 18, 8)
SAGE, SAGE_DK, INK = (122, 160, 112), (74, 106, 64), (42, 28, 14)
SERIF = 'www/assets/fonts/dm-serif-display-latin-400-italic.woff2'

def leaf(size, scale=0.62, color=SAGE, vein=CREAM):
    """A single sage leaf with a midrib, drawn at 4x then downsampled for smooth edges."""
    S = size * 4
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    L = S * scale; cx, cy = S / 2, S / 2
    pts = []
    for i in range(0, 361, 2):
        t = math.radians(i)
        x = math.sin(t) * L * 0.30 * (1 - 0.25 * math.cos(t))
        y = -math.cos(t) * L / 2
        pts.append((x, y))
    rot = math.radians(-35)
    P = [(cx + x * math.cos(rot) - y * math.sin(rot), cy + x * math.sin(rot) + y * math.cos(rot)) for x, y in pts]
    d.polygon(P, fill=color)
    a = (cx + (L / 2 * 1.05) * math.sin(rot), cy - (L / 2 * 1.05) * math.cos(rot))
    b = (cx - (L / 2 * 1.25) * math.sin(rot), cy + (L / 2 * 1.25) * math.cos(rot))
    d.line([a, b], fill=vein, width=int(S * 0.018))
    return im.resize((size, size), Image.LANCZOS)

def canvas(w, h, bg):
    return Image.new('RGBA', (w, h), bg + (255,))

os.makedirs('assets', exist_ok=True)
# Icons
icon = canvas(1024, 1024, CREAM); icon.alpha_composite(leaf(1024)); icon.convert('RGB').save('assets/icon-only.png')
fg = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0)); fg.alpha_composite(leaf(1024, 0.48)); fg.save('assets/icon-foreground.png')
canvas(1024, 1024, CREAM).convert('RGB').save('assets/icon-background.png')

def splash(bg, ink, path, w=2732, h=2732, name=True):
    im = canvas(w, h, bg)
    lf = leaf(int(min(w, h) * 0.22)); im.alpha_composite(lf, ((w - lf.width) // 2, int(h * 0.36)))
    if name:
        f = ImageFont.truetype(SERIF, int(min(w, h) * 0.06))
        d = ImageDraw.Draw(im); t = 'Anxiously Okay'
        tw = d.textlength(t, font=f); d.text(((w - tw) / 2, h * 0.36 + lf.height + min(w, h) * 0.03), t, font=f, fill=ink)
    im.convert('RGB').save(path)

splash(CREAM, INK, 'assets/splash.png')
splash(CREAM_D, (240, 224, 192), 'assets/splash-dark.png')

# iOS app-switcher privacy image: soft cream, app name only (no content)
w, h = 1290, 2796
im = canvas(w, h, CREAM)
glow = Image.new('RGBA', (w, h), (0, 0, 0, 0)); ImageDraw.Draw(glow).ellipse((w*0.1, h*0.25, w*0.9, h*0.6), fill=(232, 200, 122, 70))
im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(160)))
f = ImageFont.truetype(SERIF, 96); d = ImageDraw.Draw(im); t = 'Anxiously Okay'
d.text(((w - d.textlength(t, font=f)) / 2, h * 0.46), t, font=f, fill=INK)
os.makedirs('ios/App/App/Assets.xcassets/PrivacyScreen.imageset', exist_ok=True)
im.convert('RGB').save('ios/App/App/Assets.xcassets/PrivacyScreen.imageset/privacy-screen.png')
open('ios/App/App/Assets.xcassets/PrivacyScreen.imageset/Contents.json', 'w').write(
    '{\n  "images" : [ { "filename" : "privacy-screen.png", "idiom" : "universal" } ],\n  "info" : { "author" : "xcode", "version" : 1 }\n}\n')
print('placeholder art written')
