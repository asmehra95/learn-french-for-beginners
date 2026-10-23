#!/usr/bin/env python3
"""Regenerate the La Lettre de Lyon illustrations from manifest.json (Amazon Bedrock, Stability AI models).

Every prompt, negative prompt, seed, aspect ratio and model id is in manifest.json next to this script, so
the images can be reproduced (the model is deterministic for a given seed, prompt and model version).

  # generate (calls Bedrock through the AWS CLI; needs model access in the chosen region)
  python3 tools/story-images/generate.py generate --out path/to/raw [--ids cover,ep01] \
      [--profile default] [--region us-west-2] [--seed ep01=1234] [--ledger path/to/ledger.jsonl] \
      [--max-calls 30] [--max-usd 3]

  # post-process (needs Pillow): resize, save WebP, drop all metadata
  python3 tools/story-images/generate.py webp --src path/to/raw --dest verb-trainer/images/story
  # write the site's image table (file, size, alt per series) to verb-trainer/js/story-images.js; reads
  # manifest.json and manifest-cafe.json (Le Café des Questions, Qwen-Image-Edit-2511 on the author's own AWS GPU;
  # its PNGs come from the gpu-batch kit, so only webp, site and printjpg apply to it, with --manifest)
  python3 tools/story-images/generate.py site
  # JPEG copies for the story PDF (keeps it small), then: node tools/build-story.js --html out.html --print-images DIR
  python3 tools/story-images/generate.py printjpg --dest path/to/print-jpg
Images with "published": false in the manifest are skipped by webp and site.

Only prompts are sent to AWS. Credentials come from the AWS CLI profile; nothing here reads, prints or stores
them, and error text is redacted before it is printed or logged. All paths are relative to the current
directory (run from the repository root).
"""
import argparse
import base64
import glob
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(HERE, "manifest.json")
CAFE_MANIFEST = os.path.join(HERE, "manifest-cafe.json")
# Conservative per-image estimates in USD (at or above the published Bedrock list prices).
PRICE = {
    "stability.sd3-5-large-v1:0": 0.08,
    "stability.stable-image-ultra-v1:1": 0.14,
    "stability.stable-image-core-v1:1": 0.04,
}


def load_manifest(path=MANIFEST):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def redact(text):
    text = re.sub(r"\b\d{12}\b", "<acct>", text)
    text = re.sub(r"arn:aws:[^\s\"']+", "<arn>", text)
    text = re.sub(r"(AKIA|ASIA)[A-Z0-9]{12,}", "<key>", text)
    return text[:400]


def ledger_totals(path):
    if not path or not os.path.exists(path):
        return 0, 0.0
    calls, usd = 0, 0.0
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                row = json.loads(line)
                calls += 1
                usd += row.get("est_usd", 0)
    return calls, usd


def log(path, row):
    if not path:
        return
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(row) + "\n")


def body_for(img, seed):
    body = {"prompt": img["prompt"], "negative_prompt": img["negative_prompt"], "seed": seed,
            "output_format": "png", "aspect_ratio": img["aspect"]}
    if img["model"].startswith("stability.sd3"):
        body["mode"] = "text-to-image"
    return body


def invoke(args, img, seed, out_png, run_calls):
    model = img["model"]
    calls, usd = ledger_totals(args.ledger)
    if (args.max_calls is not None and run_calls[0] + 1 > args.max_calls) or \
       (args.cap_calls is not None and calls + 1 > args.cap_calls) or \
       (args.max_usd is not None and usd + PRICE.get(model, 0.2) > args.max_usd):
        print("cap would be exceeded; stopping", file=sys.stderr)
        sys.exit(3)
    tmp = tempfile.mkdtemp(prefix="story-img-")
    req, res = os.path.join(tmp, "req.json"), os.path.join(tmp, "res.json")
    with open(req, "w", encoding="utf-8") as f:
        json.dump(body_for(img, seed), f)
    delay, row = 4, None
    try:
        for attempt in range(6):
            t0 = time.time()
            p = subprocess.run(
                ["aws", "bedrock-runtime", "invoke-model", "--profile", args.profile, "--region", args.region,
                 "--model-id", model, "--content-type", "application/json", "--accept", "application/json",
                 "--cli-binary-format", "raw-in-base64-out", "--cli-read-timeout", "180",
                 "--body", "fileb://" + req, res],
                capture_output=True, text=True, env=dict(os.environ, AWS_PAGER=""))
            row = {"ts": datetime.now(timezone.utc).isoformat(timespec="seconds"), "model": model,
                   "prompt_id": img["id"], "seed": seed, "attempt": attempt + 1,
                   "secs": round(time.time() - t0, 1), "phase": "B"}
            if p.returncode == 0:
                with open(res, encoding="utf-8") as f:
                    data = json.load(f)
                reasons = [r for r in (data.get("finish_reasons") or []) if r]
                images = data.get("images") or []
                ok = bool(images) and not reasons
                row.update(status="ok" if ok else "filtered:" + ",".join(map(str, reasons)),
                           est_usd=PRICE.get(model, 0.2))
                log(args.ledger, row)
                run_calls[0] += 1
                if ok:
                    with open(out_png, "wb") as f:
                        f.write(base64.b64decode(images[0]))
                return row
            err = redact(p.stderr)
            throttled = any(k in err for k in ("Throttl", "TooManyRequests", "ServiceUnavailable"))
            # Rejected or throttled requests are not billed: logged at $0 so the call count stays honest.
            row.update(status="throttled" if throttled else "error", est_usd=0.0, error=err)
            log(args.ledger, row)
            if not throttled:
                print(err, file=sys.stderr)
                return row
            time.sleep(delay)
            delay *= 2
        return row
    finally:
        for pth in (req, res):
            if os.path.exists(pth):
                os.remove(pth)
        os.rmdir(tmp)


def cmd_generate(args):
    m = load_manifest(args.manifest)
    ids = args.ids.split(",") if args.ids else [i["id"] for i in m["images"]]
    seeds = dict(s.split("=", 1) for s in (args.seed or []))
    os.makedirs(args.out, exist_ok=True)
    run_calls = [0]
    for img in m["images"]:
        if img["id"] not in ids:
            continue
        seed = int(seeds.get(img["id"], img["seed"]))
        out_png = os.path.join(args.out, "%s__s%d.png" % (img["id"], seed))
        if os.path.exists(out_png) and not args.force:
            print("skip (exists) " + out_png)
            continue
        row = invoke(args, img, seed, out_png, run_calls)
        print("%s seed %d: %s (%ss)" % (img["id"], seed, row["status"], row["secs"]), flush=True)


def cmd_webp(args):
    from PIL import Image  # Pillow is only needed for this step
    m = load_manifest(args.manifest)
    os.makedirs(args.dest, exist_ok=True)
    for img in m["images"]:
        if img.get("published") is False:
            continue
        # "raw_suffix": "r" means the retouched take written by retouch.py
        src = os.path.join(args.src, "%s__s%d%s.png" % (img["id"], img["seed"], img.get("raw_suffix", "")))
        with Image.open(src) as im:
            im = im.convert("RGB")
            w, h = img["width"], img["height"]
            # Centre-crop to the target aspect first so nothing is stretched.
            sw, sh = im.size
            if sw * h > sh * w:
                cw = sh * w // h
                im = im.crop(((sw - cw) // 2, 0, (sw - cw) // 2 + cw, sh))
            elif sw * h < sh * w:
                ch = sw * h // w
                im = im.crop((0, (sh - ch) // 2, sw, (sh - ch) // 2 + ch))
            im = im.resize((w, h), Image.LANCZOS)
            # A fresh image carries no EXIF/XMP/ICC/text chunks; save without any metadata.
            clean = Image.new("RGB", im.size)
            clean.paste(im)
            dest = os.path.join(args.dest, img["file"])
            clean.save(dest, "WEBP", quality=img.get("webp_quality", args.quality), method=6)
        print("%s %dx%d %d KB" % (dest, w, h, os.path.getsize(dest) // 1024))


def cmd_printjpg(args):
    """Baseline JPEG copies of the published WebPs for the PDF: Chrome embeds JPEG as is, but re-encodes WebP
    losslessly (about 1.5 MB a picture)."""
    from PIL import Image
    m = load_manifest(args.manifest)
    os.makedirs(args.dest, exist_ok=True)
    for img in m["images"]:
        if img.get("published") is False:
            continue
        with Image.open(os.path.join(args.src, img["file"])) as im:
            im = im.convert("RGB")
            im.thumbnail((args.max_px, args.max_px), Image.LANCZOS)
            clean = Image.new("RGB", im.size)
            clean.paste(im)
            dest = os.path.join(args.dest, img["id"] + ".jpg")
            clean.save(dest, "JPEG", quality=args.quality, optimize=True)
        print("%s %dx%d %d KB" % (dest, clean.size[0], clean.size[1], os.path.getsize(dest) // 1024))
def site_manifests(args):
    """--manifest, --cafe-manifest (unless ''), then every other manifest-*.json next to this script, sorted by name.
    A globbed file is skipped when it is --manifest, --cafe-manifest or the default café manifest (so
    --cafe-manifest '' still leaves manifest-cafe.json out)."""
    paths, seen = [], {os.path.realpath(CAFE_MANIFEST)}
    for p in [args.manifest] + ([args.cafe_manifest] if args.cafe_manifest else []):
        if not any(os.path.realpath(p) == os.path.realpath(q) for q in paths):
            paths.append(p)
    seen.update(os.path.realpath(p) for p in paths)
    for p in sorted(glob.glob(os.path.join(HERE, "manifest-*.json"))):
        if os.path.realpath(p) not in seen:
            paths.append(p)
    return paths


def cmd_site(args):
    """Write verb-trainer/js/story-images.js: per series, the credit and the file, size and alt text of each
    published image (manifest.json for La Lettre de Lyon, manifest-cafe.json for Le Café des Questions, and any other
    manifest-<slug>.json, whose own "credit" is used)."""
    loaded = []
    for path in site_manifests(args):
        m = load_manifest(path)
        sid = m.get("series", "la-lettre-de-lyon")
        if any(sid == s for s, _ in loaded):
            print("two manifests for series " + sid, file=sys.stderr)
            sys.exit(2)
        loaded.append((sid, m))
    series = {}
    for sid, m in loaded:
        cover, eps = None, {}
        for img in m["images"]:
            if img.get("published") is False:
                continue
            rec = {"src": "images/story/" + img["file"], "width": img["width"], "height": img["height"], "alt": img["alt"]}
            if img["id"] == "cover":
                cover = rec
            else:
                eps[str(img["episode"])] = rec
        series[sid] = {"credit": m.get("credit") or CREDITS[sid], "cover": cover, "episodes": eps}
        print("%s: cover %s, %d episodes" % (sid, "yes" if cover else "no", len(eps)))
    data = json.dumps({"series": series}, indent=1, ensure_ascii=False)
    with open(args.dest, "w", encoding="utf-8") as f:
        f.write("/* Story illustrations (VT_STORY_IMAGES), generated by tools/story-images/generate.py site from\n"
                "   tools/story-images/manifest.json and manifest-cafe.json. Do not edit by hand. series[<series id>] holds\n"
                "   that series' credit, cover (or null) and episodes; episodes without an entry have no picture.\n"
                "   Used by views-dialogues.js, views-home.js, app.js (credits), tools/build-story.js and the tests. */\n"
                "(function (root) {\n  \"use strict\";\n  var api = " + data.replace("\n", "\n  ") + ";\n"
                "  if (typeof module !== \"undefined\" && module.exports) module.exports = api;\n"
                "  if (root) root.VT_STORY_IMAGES = api;\n"
                "})(typeof window !== \"undefined\" ? window : null);\n")
    print("wrote " + args.dest)
CREDITS = {
    "la-lettre-de-lyon": ("Illustrations: AI-generated with Stability AI models via Amazon Bedrock (Stable Diffusion 3.5 Large and "
                          "Stable Image Ultra); character designs by the project author. Not covered by the CC BY-SA licence of the text."),
    "le-cafe-des-questions": ("Illustrations: AI-generated with Qwen-Image-Edit-2511 (Apache-2.0), run on the author's own AWS GPU; "
                              "character designs by the project author. Not covered by the CC BY-SA licence of the text."),
}
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manifest", default=MANIFEST)
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("generate")
    g.add_argument("--out", required=True)
    g.add_argument("--ids")
    g.add_argument("--profile", default="default")
    g.add_argument("--region", default="us-west-2")
    g.add_argument("--seed", action="append", help="ID=SEED to try another seed for one image")
    g.add_argument("--ledger", help="append one JSON line per call (no secrets)")
    g.add_argument("--max-calls", type=int, help="limit for this run")
    g.add_argument("--cap-calls", type=int, help="limit for all calls in the ledger")
    g.add_argument("--max-usd", type=float, help="limit for the estimated spend in the ledger")
    g.add_argument("--force", action="store_true")
    w = sub.add_parser("webp")
    w.add_argument("--src", required=True)
    w.add_argument("--dest", default=os.path.join("verb-trainer", "images", "story"))
    w.add_argument("--quality", type=int, default=80)
    s = sub.add_parser("site")
    s.add_argument("--dest", default=os.path.join("verb-trainer", "js", "story-images.js"))
    s.add_argument("--cafe-manifest", default=CAFE_MANIFEST,
                   help="second series' manifest (Le Café des Questions); pass '' to leave it out. Every other "
                        "manifest-*.json in this folder is read too (sorted; two manifests for one series is exit 2)")
    pj = sub.add_parser("printjpg")
    pj.add_argument("--src", default=os.path.join("verb-trainer", "images", "story"))
    pj.add_argument("--dest", required=True)
    pj.add_argument("--max-px", type=int, default=1000)
    pj.add_argument("--quality", type=int, default=72)
    args = ap.parse_args()
    {"generate": cmd_generate, "webp": cmd_webp, "site": cmd_site, "printjpg": cmd_printjpg}[args.cmd](args)


if __name__ == "__main__":
    main()
