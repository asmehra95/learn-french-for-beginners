"""Generate the verb trainer's pre-recorded ("Recorded voice") clips: incremental, idempotent, QA'd.

Pipeline for every corpus string that has no up-to-date clip yet:
  1. node extract-corpus.js  -> corpus.json (rebuilt from the live site data, normalization v1)
  2. synthesize with the pinned voice (Qwen3-TTS 1.7B Base bf16 + the designed reference voice)
  3. ASR QA (Whisper large-v3-turbo, French) + signal checks; retry with new seeds / lower
     temperatures (single words get more attempts and a stricter text rule); keep the best attempt
  4. trim silence (-45 dBFS, 80 ms kept), two-pass loudnorm to -16 LUFS / -1.5 dBTP, MP3 64 kbps
     mono 24 kHz -> verb-trainer/audio/tts/<voice-id>/<hash>.mp3
  5. write verb-trainer/audio/tts/<voice-id>/manifest.json (full QA records, saved every 25 items so a
     killed run resumes), verb-trainer/js/tts-manifest.js (what the site loads), the voice's CREDITS.md
     and the review page (.agents/tts/clip-review/index.html by default).

Usage (after `source <venv>/bin/activate`, see README.md):
  python generate.py --voice qwen3-fr-bf16               # generate whatever is missing or changed
  python generate.py --dry-run                           # list what would be generated
  python generate.py --limit 20                          # stop after 20 new items
  python generate.py --retry-failed                      # retry failed/unverified items with new seeds
  python generate.py --marks tts-marks.json              # regenerate the clips marked bad on the review page
  python generate.py --marks tts-marks.json --exclude-marked   # drop them instead (site uses device voice)
  python generate.py --only <hash> [<hash> ...]          # force regeneration of these hashes
  python generate.py --report-only                       # rebuild tts-manifest.js, credits, review page
  python generate.py --prune                             # delete mp3s no longer in the corpus
"""
import argparse
import datetime as dt
import hashlib
import html
import importlib
import json
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
REPO = os.path.dirname(HERE)
SITE = os.path.join(REPO, "verb-trainer")
DEFAULT_REVIEW = os.path.join(REPO, ".agents", "tts", "clip-review")
DEFAULT_WORK = os.path.join(HERE, "work")

import ttsqa  # noqa: E402

ASR_REPO = "mlx-community/whisper-large-v3-turbo"
ASR_REVISION = "a4aaeec0636e6fef84abdcbe3544cb2bf7e9f6fb"

VOICES = {
    "qwen3-fr-bf16": {
        "engine": "qwen3_tts",
        "label": "Recorded voice (synthetic French, Qwen3-TTS)",
        "model": "Qwen3-TTS-12Hz-1.7B-Base (bf16, MLX build mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16)",
        "repo": "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16",
        "revision": "a6eb4f68e4b056f1215157bb696209bc82a6db48",
        "license": "Apache-2.0",
        "licenseUrl": "https://www.apache.org/licenses/LICENSE-2.0",
        "modelUrl": "https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16",
        "upstreamUrl": "https://github.com/QwenLM/Qwen3-TTS",
        "voiceNote": "One synthetic voice designed from a text description with Qwen3-TTS VoiceDesign "
                     "(\"native Parisian female voice, clear and calm, teacher's diction\"); no real person was cloned.",
        "settings": {
            "design_repo": None,
            "ref_dir": os.path.join(HERE, "voices", "qwen3-fr-bf16"),
            "ref_text": "Bonjour à tous. Aujourd'hui, nous allons apprendre les verbes les plus utiles "
                        "de la langue française, lentement et clairement.",
            "temperature": 0.7,
        },
        # Phase 1 calibration: median actual/expected duration ratio of this voice on the test set.
        "median_ratio": 1.309,
        # retry ladder: attempt n uses seed base + 7919*n and this temperature
        "temperatures": [0.7, 0.6, 0.5, 0.8, 0.6, 0.45, 0.7, 0.55],
    }
}
SEED_BASE = 1234
SEED_STEP = 7919
KEEP = ("pass", "short-unverified", "failed-kept")
RANK = {"pass": 0, "short-ok": 0, "short-unverified": 1, "fail": 2, "short-fail": 3}


def now():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def sha256_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def gen_text(speak):
    """Generation-only tweak (Phase 1): add a final period when there is no terminal punctuation."""
    s = speak.strip()
    # joined topic answers ("A ? · B" -> speak "A ?. B"): drop the extra period after ? or !
    s = re.sub(r"([!?])\.(\s)", r"\1\2", s)
    return s if s[-1:] in ".!?" else s + "."


def write_json_atomic(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(tmp, path)


def snapshot(repo, revision):
    from huggingface_hub import snapshot_download
    try:
        return snapshot_download(repo, revision=revision, local_files_only=True)
    except Exception:  # not cached yet: download the pinned revision
        return snapshot_download(repo, revision=revision)


# ------------------------------------------------------------------ corpus + manifest
def extract(corpus_path):
    subprocess.run(["node", os.path.join(HERE, "extract-corpus.js"), "--site", SITE, "--out", corpus_path],
                   check=True, stdout=subprocess.DEVNULL)
    return json.load(open(corpus_path, encoding="utf-8"))


def settings_id(voice_id):
    v = VOICES[voice_id]
    ref = os.path.join(v["settings"]["ref_dir"], "reference.wav")
    blob = json.dumps({"repo": v["repo"], "rev": v["revision"], "ref": sha256_file(ref), "norm": "v1",
                       "ref_text": v["settings"]["ref_text"]}, sort_keys=True)
    return hashlib.sha256(blob.encode()).hexdigest()[:12]


def load_manifest(path, voice_id):
    if os.path.exists(path):
        return json.load(open(path, encoding="utf-8"))
    return {"voice": voice_id, "normalization": "v1", "items": {}, "runs": []}


def needs_work(rec, item, sid, audio_dir, args):
    if rec is None:
        return "new"
    if rec.get("excludedByUser"):
        return None
    if rec.get("settingsId") != sid or rec.get("genText") != gen_text(item["speak"]):
        return "changed"
    if rec["status"] in KEEP and not os.path.exists(os.path.join(audio_dir, rec["hash"] + ".mp3")):
        return "missing-file"
    if args.retry_failed and rec["status"] in ("failed-excluded", "failed-kept", "short-unverified"):
        return "retry"
    return None


# ------------------------------------------------------------------ audio post-processing
def trim(raw_wav, out_wav, pad=0.08, fade=0.008):
    import numpy as np
    import soundfile as sf
    a, sr = sf.read(raw_wav, dtype="float32", always_2d=True)
    a = a.mean(axis=1)
    n = max(1, int(ttsqa.FRAME * sr))
    frames = len(a) // n
    if frames:
        rms = np.sqrt(np.mean(a[: frames * n].reshape(frames, n) ** 2, axis=1) + 1e-12)
        voiced = np.where(20 * np.log10(rms) > ttsqa.SIL_DB)[0]
        if len(voiced):
            start = max(0, voiced[0] * n - int(pad * sr))
            end = min(len(a), (voiced[-1] + 1) * n + int(pad * sr))
            a = a[start:end].copy()
    k = min(int(fade * sr), len(a) // 2)
    if k > 0:
        ramp = np.linspace(0.0, 1.0, k, dtype=np.float32)
        a[:k] *= ramp
        a[-k:] *= ramp[::-1]
    sf.write(out_wav, a, sr, subtype="PCM_16")
    return len(a) / float(sr)


def _loudnorm_json(stderr):
    m = re.findall(r"\{[^{}]*\"input_i\"[^{}]*\}", stderr, re.S)
    return json.loads(m[-1]) if m else None


def encode(trimmed_wav, out_mp3):
    """Two-pass EBU R128 loudnorm (-16 LUFS, -1.5 dBTP) then MP3 64 kbps mono 24 kHz."""
    target = "I=-16:TP=-1.5:LRA=11"
    p1 = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", trimmed_wav, "-af",
                         f"loudnorm={target}:print_format=json", "-f", "null", "-"],
                        capture_output=True, text=True, check=True)
    m = _loudnorm_json(p1.stderr)
    if m and m.get("input_i") not in (None, "-inf") and float(m["input_i"]) > -70:
        af = (f"loudnorm={target}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
              f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:"
              "linear=true:print_format=summary")
    else:
        af = "volume=0dB"
    tmp = out_mp3 + ".tmp.mp3"
    subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-loglevel", "error", "-y", "-i", trimmed_wav, "-af", af,
                    "-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "64k", "-map_metadata", "-1",
                    "-id3v2_version", "0", "-write_xing", "1", tmp], check=True)
    os.replace(tmp, out_mp3)
    return {"input_lufs": float(m["input_i"]) if m and m.get("input_i") not in (None, "-inf") else None}


# ------------------------------------------------------------------ generation
def final_status(q):
    st = q["status"]
    if st in ("pass", "short-ok"):
        return "pass"
    if st == "short-unverified":
        return "short-unverified"
    severe = {"silent", "too-short"} & set(q["flags"]) or "last-word-missing" in q["flags"] \
        or min(q["loose_cer"], q["phon_cer"]) > 0.5 or st == "short-fail"
    return "failed-excluded" if severe else "failed-kept"


def attempt_summary(n, seed, temp, q, wall):
    keys = ("status", "transcript", "loose_cer", "loose_wer", "strict_cer", "phon_cer", "duration", "ratio", "flags")
    d = {k: q[k] for k in keys}
    d.update({"n": n, "seed": seed, "temperature": temp, "wall": round(wall, 3)})
    return d


def new_job(item, position, prev, reason, args):
    """In-flight state of one corpus item across rounds (persisted in work/inflight-<voice>.json)."""
    single = ttsqa.word_count(item["speak"]) <= 1
    cont = bool(prev) and reason in ("retry", "marked")
    # re-runs (retry / user marks) continue the seed ladder instead of repeating earlier seeds
    first_n = len(prev.get("attempts", [])) if cont else 0
    return {"item": item, "position": position, "reason": reason,
            "seedBase": prev.get("seedBase", SEED_BASE + position) if cont else SEED_BASE + position,
            "firstN": first_n, "nextN": first_n,
            "maxAttempts": 1 + (args.max_retries_short if single else args.max_retries),
            "prevAttempts": prev.get("attempts", []) if cont else [],
            "userMarked": (prev or {}).get("userMarked"),
            "attempts": [], "best": None, "bestWav": None, "pending": None}


def synth_pending(ctx, job):
    """Synthesize the job's next attempt to a raw wav (QA happens later, in the ASR stage)."""
    v, item = ctx["voice"], job["item"]
    n = job["nextN"]
    seed = job["seedBase"] + SEED_STEP * n
    temp = v["temperatures"][n % len(v["temperatures"])]
    raw = os.path.join(ctx["work"], f"{item['hash']}-a{n}.wav")
    try:
        r = ctx["mod"].synth(ctx["handle"], gen_text(item["speak"]), raw, seed, dict(v["settings"], temperature=temp))
    except ValueError as err:  # the model emitted no audio frames at all for this seed
        import numpy as np
        import soundfile as sf
        sf.write(raw, np.zeros(2400, dtype=np.float32), 24000, subtype="PCM_16")  # QA flags it "silent" -> retry
        r = {"wall_seconds": 0.0}
        print(f"  synth a{n} produced no audio ({err}); recorded as silent", flush=True)
    ctx["synth_wall"] += r["wall_seconds"]
    job["pending"] = {"n": n, "seed": seed, "temperature": temp, "raw": raw, "wall": r["wall_seconds"]}
    print(f"  synth a{n} seed={seed} T={temp} {r['wall_seconds']:.1f}s {item['key']!r}", flush=True)


def qa_pending(ctx, job):
    """Transcribe + score the pending attempt; keep it if it beats the best so far. True when the job is done."""
    v, item, p = ctx["voice"], job["item"], job["pending"]
    transcript = ctx["asr"].transcribe(p["raw"])
    q = ttsqa.evaluate_corpus(item["speak"], p["raw"], transcript, v["median_ratio"])
    job["attempts"].append(attempt_summary(p["n"], p["seed"], p["temperature"], q, p["wall"]))
    best = job["best"]
    better = best is None or (RANK[q["status"]], q["phon_cer"], q["loose_cer"], len(q["flags"])) < \
        (RANK[best["status"]], best["phon_cer"], best["loose_cer"], len(best["flags"]))
    if better:
        if job["bestWav"] and os.path.exists(job["bestWav"]):
            os.remove(job["bestWav"])
        job["best"], job["bestWav"] = q, p["raw"]
    elif os.path.exists(p["raw"]):
        os.remove(p["raw"])
    print(f"  qa a{p['n']} {q['status']:<16} heard={transcript!r} cer={q['loose_cer']:.2f} "
          f"phon={q['phon_cer']:.2f} {','.join(q['flags'])} {item['key']!r}", flush=True)
    job["pending"] = None
    job["nextN"] += 1
    return RANK[q["status"]] == 0 or job["nextN"] - job["firstN"] >= job["maxAttempts"]


def finalize(ctx, job):
    """Post-process the best attempt and return the manifest record."""
    item, best, best_wav = job["item"], job["best"], job["bestWav"]
    status = final_status(best)
    rec = {
        "hash": item["hash"], "key": item["key"], "speak": item["speak"], "genText": gen_text(item["speak"]),
        "texts": item["texts"], "categories": item["categories"], "words": best["words"], "status": status,
        "qaStatus": best["status"], "transcript": best["transcript"], "loose_cer": best["loose_cer"],
        "phon_cer": best["phon_cer"], "flags": best["flags"], "seedBase": job["seedBase"], "position": job["position"],
        "attempts": job["prevAttempts"] + job["attempts"],
        "chosenAttempt": int(re.search(r"-a(\d+)\.wav$", best_wav).group(1)),
        "settingsId": ctx["sid"], "generatedAt": now(), "reason": job["reason"],
    }
    if job.get("userMarked"):
        rec["userMarked"] = job["userMarked"]
    mp3 = os.path.join(ctx["audio_dir"], item["hash"] + ".mp3")
    if status in KEEP:
        trimmed = best_wav[:-4] + "-trim.wav"
        rec["durationSec"] = round(trim(best_wav, trimmed), 3)
        rec.update(encode(trimmed, mp3))
        rec["bytes"] = os.path.getsize(mp3)
        os.remove(trimmed)
        if status == "pass":
            os.remove(best_wav)  # keep raw wavs only for clips that need a listen
            rec["reviewWav"] = None
        else:
            rec["reviewWav"] = os.path.relpath(best_wav, REPO)
    else:
        if os.path.exists(mp3):
            os.remove(mp3)
        rec["reviewWav"] = os.path.relpath(best_wav, REPO)
    return rec


def rescore(ctx, man, live):
    """Re-apply the current QA rules to the kept best attempt of every non-pass clip, using its stored
    Whisper transcript and raw wav (no model needed). Used after a scoring-rule fix."""
    changed = 0
    for h, rec in man["items"].items():
        if h not in live or rec["status"] == "pass" or rec.get("excludedByUser") or not rec.get("reviewWav"):
            continue
        wav = os.path.join(REPO, rec["reviewWav"])
        if not os.path.exists(wav):
            continue
        q = ttsqa.evaluate_corpus(rec["speak"], wav, rec["transcript"], ctx["voice"]["median_ratio"])
        status = final_status(q)
        if status == rec["status"]:
            continue
        print(f"  rescore {rec['status']} -> {status} {rec['key']!r} heard={rec['transcript']!r}", flush=True)
        rec.update({"status": status, "qaStatus": q["status"], "loose_cer": q["loose_cer"], "phon_cer": q["phon_cer"],
                    "flags": q["flags"], "rescoredAt": now()})
        mp3 = os.path.join(ctx["audio_dir"], h + ".mp3")
        if status in KEEP and not os.path.exists(mp3):
            trimmed = wav[:-4] + "-trim.wav"
            rec["durationSec"] = round(trim(wav, trimmed), 3)
            rec.update(encode(trimmed, mp3))
            rec["bytes"] = os.path.getsize(mp3)
            os.remove(trimmed)
        elif status not in KEEP and os.path.exists(mp3):
            os.remove(mp3)
        if status == "pass":
            os.remove(wav)
            rec["reviewWav"] = None
        changed += 1
    return changed


def free_mlx():
    import gc
    import mlx.core as mx
    gc.collect()
    mx.clear_cache()


def run_rounds(ctx, jobs, man, man_path, inflight_path, run):
    """Rounds of: synthesize every open job's next attempt with ONLY the TTS model in memory, then QA them
    with ONLY Whisper in memory (this Mac swaps heavily with both resident). Jobs that pass or run out of
    attempts are finalized; the rest get another round. State is saved so a killed run resumes."""
    v = ctx["voice"]

    def save_state():
        write_json_atomic(inflight_path, {"settingsId": ctx["sid"], "jobs": jobs})
        man["updatedAt"] = now()
        write_json_atomic(man_path, man)

    rnd = 0
    while jobs:
        rnd += 1
        need = [h for h, j in jobs.items() if j["pending"] is None or not os.path.exists(j["pending"]["raw"])]
        if need:
            t0 = time.perf_counter()
            ctx["handle"] = ctx["mod"].load(dict(v["settings"], base_repo=snapshot(v["repo"], v["revision"])))
            print(f"round {rnd}: TTS model loaded in {time.perf_counter() - t0:.1f}s; synthesizing {len(need)}", flush=True)
            for i, h in enumerate(need):
                print(f"[r{rnd} synth {i + 1}/{len(need)}]", flush=True)
                synth_pending(ctx, jobs[h])
                if (i + 1) % 25 == 0:
                    save_state()
                if (i + 1) % 100 == 0:
                    free_mlx()
            ctx["handle"] = None
            save_state()
            free_mlx()
        mwt = importlib.import_module("mlx_whisper.transcribe")  # the module (the package exports a same-named function)
        open_jobs = list(jobs)
        print(f"round {rnd}: QA of {len(open_jobs)} clips", flush=True)
        for i, h in enumerate(open_jobs):
            job = jobs[h]
            print(f"[r{rnd} qa {i + 1}/{len(open_jobs)}]", flush=True)
            if qa_pending(ctx, job):
                rec = finalize(ctx, job)
                man["items"][h] = rec
                del jobs[h]
                run["items"] += 1
                print(f"  -> {rec['status']} after {len(job['attempts'])} attempt(s)", flush=True)
            if (i + 1) % 25 == 0:
                save_state()
        mwt.ModelHolder.model = None  # unload Whisper before the next TTS round
        mwt.ModelHolder.model_path = None
        save_state()
        free_mlx()
    if os.path.exists(inflight_path):
        os.remove(inflight_path)


# ------------------------------------------------------------------ outputs
def write_site_manifest(voice_id, man, corpus):
    v = VOICES[voice_id]
    items, by_cat, total_by_cat = {}, {}, {}
    keys = {it["hash"]: it for it in corpus["items"]}
    for it in corpus["items"]:
        c = it["categories"][0]
        total_by_cat[c] = total_by_cat.get(c, 0) + 1
    for h, rec in man["items"].items():
        if h not in keys or rec["status"] not in KEEP or rec.get("excludedByUser"):
            continue
        if not os.path.exists(os.path.join(SITE, "audio", "tts", voice_id, h + ".mp3")):
            continue
        items[rec["key"]] = {"file": f"audio/tts/{voice_id}/{h}.mp3", "voiceId": voice_id,
                             "duration": round(rec.get("durationSec", 0), 2)}
        c = keys[h]["categories"][0]
        by_cat[c] = by_cat.get(c, 0) + 1
    doc = {
        "version": 1, "normalization": "v1", "defaultVoice": voice_id,
        "voices": {voice_id: {"id": voice_id, "label": v["label"], "model": v["model"], "license": v["license"],
                              "licenseUrl": v["licenseUrl"], "modelUrl": v["modelUrl"], "synthetic": True,
                              "note": v["voiceNote"], "credits": f"audio/tts/{voice_id}/CREDITS.md",
                              "generatedAt": man.get("updatedAt")}},
        "coverage": {"total": len(corpus["items"]), "recorded": len(items),
                     "byCategory": {c: {"recorded": by_cat.get(c, 0), "total": n} for c, n in sorted(total_by_cat.items())}},
        "items": dict(sorted(items.items())),
    }
    body = json.dumps(doc, ensure_ascii=False, indent=1)
    js = ("/* Generated by tts-tools/generate.py. Do not edit by hand.\n"
          "   Pre-recorded \"Recorded voice\" clips: normalized text (VT_LOGIC.ttsKey, rule v1) -> { file, voiceId, duration }.\n"
          "   Text without an entry is spoken by the device voice. */\n"
          "window.VT_TTS = " + body + ";\n")
    path = os.path.join(SITE, "js", "tts-manifest.js")
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(js)
    os.replace(tmp, path)
    return doc["coverage"]


def write_credits(voice_id, cov):
    v = VOICES[voice_id]
    text = f"""# Recorded voice: credits and license

The clips in this folder (`audio/tts/{voice_id}/*.mp3`) are **synthetic speech**: computer-generated
text-to-speech, not recordings of a person. They were generated once, offline, with a local model and
are played by the verb trainer's Listen buttons.

- Model: {v['model']}, revision `{v['revision']}` ({v['modelUrl']}). Upstream: Qwen3-TTS by the Qwen team, Alibaba Cloud ({v['upstreamUrl']}).
- Model license: {v['license']} ({v['licenseUrl']}).
- Voice: {v['voiceNote']}
- Run: mlx-audio 0.5.8 on Apple Silicon; temperature 0.7 (retries 0.45 to 0.8), seed 1234 + item position.
- Post-processing: silence trimmed, loudness normalized to -16 LUFS, MP3 64 kbps mono 24 kHz.
- Quality check: every clip was transcribed by Whisper large-v3-turbo (MIT) and compared with its text;
  clips that failed after retries are not shipped and the site uses the device voice for them.
- Coverage: {cov['recorded']} of {cov['total']} Listen texts.
- Regenerate or extend: see `tts-tools/README.md`.

`manifest.json` next to this file lists every clip with its text, QA transcript and scores.
"""
    with open(os.path.join(SITE, "audio", "tts", voice_id, "CREDITS.md"), "w", encoding="utf-8") as f:
        f.write(text)


STATUS_TEXT = {"failed-excluded": "Failed: not shipped (device voice)", "failed-kept": "Minor issue: shipped",
               "short-unverified": "Single word: listen", "pass": "Pass", "excluded-by-user": "Removed by you"}
STATUS_ORDER = {"failed-excluded": 0, "failed-kept": 1, "short-unverified": 2, "pass": 3, "excluded-by-user": 4}


def write_review(voice_id, man, corpus, review_dir):
    e = html.escape
    os.makedirs(review_dir, exist_ok=True)
    live = {it["hash"] for it in corpus["items"]}
    recs = [r for h, r in man["items"].items() if h in live]

    def st(r):
        return "excluded-by-user" if r.get("excludedByUser") else r["status"]
    recs.sort(key=lambda r: (STATUS_ORDER[st(r)], -max(r["phon_cer"], r["loose_cer"]), -len(r["flags"]), r["key"]))
    counts = {}
    for r in recs:
        counts[st(r)] = counts.get(st(r), 0) + 1
    h = ["<!doctype html>", '<html lang="en">', "<head>", '<meta charset="utf-8">',
         '<meta name="viewport" content="width=device-width, initial-scale=1">',
         f"<title>Recorded voice clip review ({e(voice_id)})</title>", "<style>",
         "body{font:15px/1.45 system-ui,-apple-system,sans-serif;margin:1.5rem;color:#1a1a1a;background:#fff}",
         "h1{font-size:1.5rem}h2{font-size:1.2rem;margin-top:2rem}",
         "table{border-collapse:collapse;margin:.5rem 0 1.5rem;width:100%}",
         "th,td{border:1px solid #bbb;padding:.35rem .5rem;vertical-align:top;text-align:left}",
         "thead th{background:#eef1f5;position:sticky;top:0}",
         "th[scope=row]{background:#f7f7f7;font-weight:600;min-width:11rem}",
         "audio{width:11rem;height:2rem}audio:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #0b57d0;outline-offset:2px}",
         ".ok{color:#0a6b2c;font-weight:600}.bad{color:#a4161a;font-weight:600}.warn{color:#7a4b00;font-weight:600}",
         ".asr{display:block;font-size:.85rem;color:#333}.flags{display:block;font-size:.8rem;color:#555}",
         ".bar{display:flex;flex-wrap:wrap;gap:.75rem;align-items:center;position:sticky;top:0;background:inherit;padding:.5rem 0;z-index:2}",
         "button,select{font:inherit;padding:.3rem .7rem}textarea{width:100%;min-height:4rem;font:12px ui-monospace,monospace}",
         "tr.marked th,tr.marked td{background:#fde8e8}code{font-size:.85rem}",
         "@media (prefers-color-scheme:dark){body{background:#121212;color:#eee}thead th{background:#263042}"
         "th[scope=row]{background:#1e1e1e}th,td{border-color:#444}.ok{color:#6fdc8c}.bad{color:#ff8a8a}.warn{color:#ffc56b}"
         ".asr{color:#ccc}.flags{color:#aaa}tr.marked th,tr.marked td{background:#4a1f1f}}",
         "</style>", "</head>", "<body>",
         f"<h1>Recorded voice clip review: <code>{e(voice_id)}</code></h1>",
         f"<p>{len(recs)} clips, worst first. "
         + ", ".join(f"{e(STATUS_TEXT[k])}: {n}" for k, n in sorted(counts.items(), key=lambda kv: STATUS_ORDER[kv[0]]))
         + ". The player plays exactly what the site plays (the MP3); clips that were not shipped play the best raw attempt.</p>",
         "<p>Tick <strong>Bad</strong> on any clip that sounds wrong, then use <strong>Export marked</strong>. "
         "Save the file and run <code>python tts-tools/generate.py --marks &lt;file&gt;</code> to regenerate those clips "
         "(add <code>--exclude-marked</code> to drop them so the site uses the device voice). Ticks are remembered in this browser.</p>",
         '<div class="bar"><label>Show <select id="filter"><option value="">all</option>'
         + "".join(f'<option value="{k}">{e(STATUS_TEXT[k])}</option>' for k in STATUS_ORDER)
         + '<option value="marked">marked bad</option></select></label>'
         '<button type="button" id="export">Export marked</button><button type="button" id="clear">Clear marks</button>'
         '<span id="count" aria-live="polite"></span></div>',
         '<label for="out" class="flags">Marked clips (JSON, also downloaded by Export):</label><textarea id="out" readonly></textarea>',
         "<table><caption class=\"flags\">Status, text, audio, what Whisper heard, scores</caption><thead><tr>"
         "<th scope=\"col\">Bad</th><th scope=\"col\">Text</th><th scope=\"col\">Audio</th><th scope=\"col\">Status</th>"
         "<th scope=\"col\">Heard (Whisper)</th><th scope=\"col\">Category</th><th scope=\"col\">Attempts</th></tr></thead><tbody>"]
    for r in recs:
        s = st(r)
        if r["status"] in KEEP and not r.get("excludedByUser"):
            src = os.path.relpath(os.path.join(SITE, "audio", "tts", voice_id, r["hash"] + ".mp3"), review_dir)
        elif r.get("reviewWav"):
            src = os.path.relpath(os.path.join(REPO, r["reviewWav"]), review_dir)
        else:
            src = ""
        cls = {"pass": "ok", "failed-excluded": "bad", "failed-kept": "warn", "short-unverified": "warn"}.get(s, "")
        audio = (f'<audio controls preload="none" src="{e(src)}" aria-label="Clip saying {e(r["key"])}"></audio>'
                 if src else "<span class=\"flags\">no audio</span>")
        h.append(f'<tr data-hash="{e(r["hash"])}" data-status="{e(s)}">'
                 f'<td><input type="checkbox" class="mark" aria-label="Mark “{e(r["key"])}” as bad"></td>'
                 f'<th scope="row">{e(r["key"])}<span class="flags"><code>{e(r["hash"])}</code></span></th>'
                 f"<td>{audio}</td><td class=\"{cls}\">{e(STATUS_TEXT[s])}</td>"
                 f'<td><span class="asr">“{e(r["transcript"])}”</span><span class="flags">CER {r["loose_cer"]:.2f} · '
                 f'sound {r["phon_cer"]:.2f}{(" · " + e(", ".join(r["flags"]))) if r["flags"] else ""}</span></td>'
                 f'<td>{e(", ".join(r["categories"]))}</td><td>{len(r["attempts"])}</td></tr>')
    h += ["</tbody></table>", "<script>", f"var VOICE={json.dumps(voice_id)};", r"""
(function(){
  var KEY="tts-review-marks-"+VOICE, marks={};
  try{marks=JSON.parse(localStorage.getItem(KEY)||"{}")||{};}catch(e){marks={};}
  var rows=[].slice.call(document.querySelectorAll("tbody tr"));
  function save(){try{localStorage.setItem(KEY,JSON.stringify(marks));}catch(e){}}
  function render(){
    var bad=Object.keys(marks).filter(function(h){return marks[h];}).sort();
    document.getElementById("out").value=JSON.stringify({voice:VOICE,bad:bad,exportedAt:new Date().toISOString()},null,1);
    document.getElementById("count").textContent=bad.length+" marked bad";
    var f=document.getElementById("filter").value;
    rows.forEach(function(tr){
      var h=tr.getAttribute("data-hash"), m=!!marks[h];
      tr.classList.toggle("marked",m); tr.querySelector(".mark").checked=m;
      tr.hidden=!!f&&(f==="marked"?!m:tr.getAttribute("data-status")!==f);
    });
  }
  document.querySelector("tbody").addEventListener("change",function(ev){
    if(!ev.target.classList.contains("mark"))return;
    var h=ev.target.closest("tr").getAttribute("data-hash");
    if(ev.target.checked)marks[h]=true;else delete marks[h];
    save();render();
  });
  document.getElementById("filter").addEventListener("change",render);
  document.getElementById("clear").addEventListener("click",function(){marks={};save();render();});
  document.getElementById("export").addEventListener("click",function(){
    render();
    var blob=new Blob([document.getElementById("out").value+"\n"],{type:"application/json"});
    var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="tts-marks-"+VOICE+".json";
    document.body.appendChild(a);a.click();a.remove();
  });
  render();
})();
""", "</script>", "</body>", "</html>"]
    with open(os.path.join(review_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write("\n".join(h) + "\n")


def summarize(man, corpus, voice_id):
    live = {it["hash"]: it for it in corpus["items"]}
    out = {"total": len(live), "byStatus": {}, "byCategory": {}, "flagged": []}
    size = 0
    for h, it in live.items():
        rec = man["items"].get(h)
        s = "missing" if rec is None else ("excluded-by-user" if rec.get("excludedByUser") else rec["status"])
        out["byStatus"][s] = out["byStatus"].get(s, 0) + 1
        c = it["categories"][0]
        bc = out["byCategory"].setdefault(c, {"total": 0, "pass": 0, "shipped": 0})
        bc["total"] += 1
        bc["pass"] += s == "pass"
        bc["shipped"] += s in KEEP
        if s not in ("pass", "missing"):
            out["flagged"].append({"hash": h, "key": it["key"], "status": s, "heard": rec["transcript"]})
        p = os.path.join(SITE, "audio", "tts", voice_id, h + ".mp3")
        if s in KEEP and os.path.exists(p):
            size += os.path.getsize(p)
    out["mp3Bytes"] = size
    return out


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--voice", default="qwen3-fr-bf16", choices=sorted(VOICES))
    ap.add_argument("--corpus", default=os.path.join(HERE, "corpus.json"))
    ap.add_argument("--no-extract", action="store_true", help="use the existing corpus.json as is")
    ap.add_argument("--limit", type=int, default=0, help="stop after N generated items")
    ap.add_argument("--only", nargs="*", default=[], help="force regeneration of these hashes")
    ap.add_argument("--retry-failed", action="store_true")
    ap.add_argument("--marks", help="JSON exported by the review page: {voice, bad:[hash...]}")
    ap.add_argument("--exclude-marked", action="store_true", help="with --marks: drop instead of regenerate")
    ap.add_argument("--max-retries", type=int, default=3)
    ap.add_argument("--max-retries-short", type=int, default=5, help="retries for single words (stricter QA)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--report-only", action="store_true")
    ap.add_argument("--rescore", action="store_true", help="re-apply the QA rules to non-pass clips (stored transcripts, no model)")
    ap.add_argument("--prune", action="store_true", help="delete mp3s and records no longer in the corpus")
    ap.add_argument("--work", default=DEFAULT_WORK)
    ap.add_argument("--review-dir", default=DEFAULT_REVIEW)
    args = ap.parse_args()

    voice_id = args.voice
    v = VOICES[voice_id]
    corpus = json.load(open(args.corpus, encoding="utf-8")) if args.no_extract else extract(args.corpus)
    audio_dir = os.path.join(SITE, "audio", "tts", voice_id)
    os.makedirs(audio_dir, exist_ok=True)
    work = os.path.join(args.work, voice_id)
    os.makedirs(work, exist_ok=True)
    man_path = os.path.join(audio_dir, "manifest.json")
    man = load_manifest(man_path, voice_id)
    sid = settings_id(voice_id)
    live = {it["hash"] for it in corpus["items"]}

    marked = set()
    if args.marks:
        mk = json.load(open(args.marks, encoding="utf-8"))
        if mk.get("voice") not in (None, voice_id):
            sys.exit(f"marks file is for voice {mk.get('voice')}, not {voice_id}")
        marked = set(mk.get("bad", [])) & live
        for h in marked:
            rec = man["items"].get(h)
            if rec is None:
                continue
            rec["userMarked"] = rec.get("userMarked", 0) + 1
            if args.exclude_marked:
                rec["excludedByUser"] = True
                p = os.path.join(audio_dir, h + ".mp3")
                if os.path.exists(p):
                    os.remove(p)
        if args.exclude_marked:
            marked = set()

    if args.rescore and not args.dry_run:
        n = rescore({"voice": v, "audio_dir": audio_dir}, man, live)
        man["updatedAt"] = now()
        write_json_atomic(man_path, man)
        print(f"rescored: {n} clip(s) changed status", flush=True)

    stale = sorted(set(man["items"]) - live)
    if args.prune:
        for h in stale:
            p = os.path.join(audio_dir, h + ".mp3")
            if os.path.exists(p):
                os.remove(p)
            del man["items"][h]
        stale = []

    todo = []
    for pos, it in enumerate(corpus["items"]):
        rec = man["items"].get(it["hash"])
        reason = "forced" if it["hash"] in args.only else ("marked" if it["hash"] in marked else needs_work(rec, it, sid, audio_dir, args))
        if reason:
            todo.append((pos, it, reason))
    todo.sort(key=lambda t: (t[2] not in ("forced", "marked"), t[0]))  # explicit requests first
    if args.limit:
        todo = todo[: args.limit]
    print(f"corpus {len(corpus['items'])} items; {len(todo)} to generate; {len(stale)} stale records "
          f"(not in corpus{', use --prune' if stale else ''})", flush=True)
    if args.dry_run:
        for pos, it, reason in todo:
            print(f"  {reason:<12} {it['hash']} {it['key']}")
        return

    run = {"started": now(), "items": 0, "synthWallSec": 0.0}
    t_run = time.perf_counter()
    if todo and not args.report_only:
        mod = importlib.import_module("engines." + v["engine"])
        asr = ttsqa.ASR(snapshot(ASR_REPO, ASR_REVISION))  # loads lazily on the first transcription
        ctx = {"voice": v, "mod": mod, "handle": None, "asr": asr, "work": work, "args": args, "sid": sid,
               "audio_dir": audio_dir, "synth_wall": 0.0}
        inflight_path = os.path.join(args.work, f"inflight-{voice_id}.json")
        jobs = {}
        if os.path.exists(inflight_path):
            saved = json.load(open(inflight_path, encoding="utf-8"))
            if saved.get("settingsId") == sid:
                wanted = {it["hash"] for _, it, _ in todo}
                jobs = {h: j for h, j in saved["jobs"].items() if h in wanted}
                print(f"resuming {len(jobs)} in-flight items from {inflight_path}", flush=True)
        for pos, it, reason in todo:
            if it["hash"] not in jobs:
                jobs[it["hash"]] = new_job(it, pos, man["items"].get(it["hash"]), reason, args)
        try:
            run_rounds(ctx, jobs, man, man_path, inflight_path, run)
        finally:
            run["synthWallSec"] = round(ctx["synth_wall"], 1)
            run["wallSec"] = round(time.perf_counter() - t_run, 1)
            run["finished"] = now()
            man.setdefault("runs", []).append(run)
            man["updatedAt"] = now()
            man["settingsId"] = sid
            write_json_atomic(man_path, man)
    elif args.marks and args.exclude_marked:
        man["updatedAt"] = now()
        write_json_atomic(man_path, man)
    elif args.prune:
        write_json_atomic(man_path, man)

    cov = write_site_manifest(voice_id, man, corpus)
    write_credits(voice_id, cov)
    write_review(voice_id, man, corpus, args.review_dir)
    s = summarize(man, corpus, voice_id)
    s["coverage"] = cov
    s["runs"] = man.get("runs", [])
    s["totalWallSec"] = round(sum(r.get("wallSec", 0) for r in s["runs"]), 1)
    write_json_atomic(os.path.join(args.work, f"summary-{voice_id}.json"), s)
    print(json.dumps({k: s[k] for k in ("total", "byStatus", "mp3Bytes", "totalWallSec")}, ensure_ascii=False), flush=True)
    print(f"flagged: {len(s['flagged'])} (see {os.path.join(args.review_dir, 'index.html')})", flush=True)


if __name__ == "__main__":
    main()
