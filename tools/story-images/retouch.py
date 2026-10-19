#!/usr/bin/env python3
"""Small, deterministic retouches applied to two raw takes before the WebP step (needs Pillow and numpy).
  python3 tools/story-images/retouch.py --src path/to/raw
reads <id>__s<seed>.png and writes <id>__s<seed>r.png for each image whose manifest entry has
"raw_suffix": "r". Coordinates are for the 1344x768 raw PNGs.
  ep16 (seed 5216): the photo Jacques holds showed an invented portrait; it is painted over with the plain
        cream card colour so we see the back of the photo. Jacques's hand is kept (skin-tone mask).
  ep18 (seed 5318): a small cursive pseudo-word on the letter is painted over with the paper colour.
"""
import argparse
import os

import numpy as np
from PIL import Image, ImageFilter


def paper_fill(shape, colour, seed):
    """Flat paper colour with a slight vertical gradient and fine grain, softened like the paint around it."""
    h, w = shape[:2]
    rng = np.random.default_rng(seed)
    fill = np.ones((h, w, 3)) * colour + np.linspace(-5, 5, h)[:, None, None] + rng.normal(0, 2.0, (h, w, 1))
    img = Image.fromarray(np.clip(fill, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5))
    return np.asarray(img).astype(float)


def blend(a, mask, fill):
    k = np.asarray(mask).astype(float)[..., None] / 255
    return Image.fromarray((a * (1 - k) + fill * k).astype(np.uint8))


def ep16(im):
    a = np.asarray(im).astype(float)
    colour = a[600:700, 500:508].reshape(-1, 3).mean(0)  # the card's own white border
    x0, x1, y0, y1 = 311, 503, 552, 758  # the card, just inside its edge
    reg = a[y0:y1, x0:x1]
    r, g = reg[..., 0], reg[..., 1]
    xx = np.arange(x0, x1)[None, :].repeat(y1 - y0, 0)
    yy = np.arange(y0, y1)[:, None].repeat(x1 - x0, 1)
    skin = (xx < 380) & (yy > 628) & (r > 110) & (g < 0.8 * r)  # Jacques's fingers over the left edge
    s = Image.fromarray((skin * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(7))
    hand = np.asarray(s) > 0
    for row in range(hand.shape[0]):  # everything left of the fingertips on a row is hand
        cols = np.where(hand[row])[0]
        if len(cols):
            hand[row, :cols.max() + 1] = True
    mask = Image.new("L", im.size, 0)
    mask.paste(Image.fromarray((~hand).astype(np.uint8) * 255), (x0, y0))
    mask = mask.filter(ImageFilter.GaussianBlur(1.0))
    return blend(a, mask, paper_fill(a.shape, colour, 16))


def ep18(im):
    a = np.asarray(im).astype(float)
    x0, x1, y0, y1 = 324, 398, 497, 530  # the pseudo-word, inside the sheet
    reg = a[y0:y1, x0:x1]
    lum = reg.mean(-1)
    colour = np.median(reg[lum > np.percentile(lum, 60)], axis=0)
    mask = Image.new("L", im.size, 0)
    mask.paste(255, (x0, y0, x1, y1))
    mask = mask.filter(ImageFilter.GaussianBlur(2.0))
    fill = paper_fill(a.shape, colour, 18)
    fill = fill - np.linspace(-5, 5, a.shape[0])[:, None, None]  # keep it flat: no gradient on this sheet
    return blend(a, mask, fill)


RETOUCH = {"ep16": ep16, "ep18": ep18}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", required=True)
    ap.add_argument("--manifest", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "manifest.json"))
    args = ap.parse_args()
    import json
    with open(args.manifest, encoding="utf-8") as f:
        m = json.load(f)
    for img in m["images"]:
        if img.get("raw_suffix") != "r":
            continue
        src = os.path.join(args.src, "%s__s%d.png" % (img["id"], img["seed"]))
        dest = os.path.join(args.src, "%s__s%dr.png" % (img["id"], img["seed"]))
        with Image.open(src) as im:
            out = RETOUCH[img["id"]](im.convert("RGB"))
        out.save(dest)
        print(dest)


if __name__ == "__main__":
    main()
