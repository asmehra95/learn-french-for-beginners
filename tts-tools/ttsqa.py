"""Automated QA for TTS clips (plan section 6), shared by Phase 1 and Phase 2.

- ASR: mlx-whisper large-v3-turbo, language=fr, temperature 0, no prompt.
- Text scores: strict (accents kept) and loose (accents stripped) WER/CER via jiwer, best over
  the target and its listed homophone spellings.
- Signal checks: truncation, leading/trailing/internal silence, all-silent, clipping, duration
  vs expected (per-voice calibrated).
"""
import math
import re
import unicodedata

import jiwer
import numpy as np
import soundfile as sf

ASR_REPO = "mlx-community/whisper-large-v3-turbo"
SIL_DB = -45.0
FRAME = 0.02


def norm_text(s, strip_accents):
    s = unicodedata.normalize("NFC", s).lower()
    s = s.replace("(e)", "")
    s = re.sub(r"[’ʼ‘'\-‐‑]", " ", s)
    s = re.sub(r"[^\w\s]", " ", s)
    if strip_accents:
        s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s).strip()


def scores(target, alts, hyp):
    """Return the best-matching reference and its strict/loose WER/CER."""
    best = None
    for ref in [target] + list(alts or []):
        r = {}
        for mode, strip in (("strict", False), ("loose", True)):
            a, b = norm_text(ref, strip), norm_text(hyp, strip)
            if not b:
                r[mode + "_wer"], r[mode + "_cer"] = 1.0, 1.0
            else:
                r[mode + "_wer"] = jiwer.wer(a, b)
                r[mode + "_cer"] = jiwer.cer(a, b)
        r["matched_ref"] = ref
        if best is None or (r["loose_cer"], r["strict_cer"]) < (best["loose_cer"], best["strict_cer"]):
            best = r
    best["matched_alt"] = best["matched_ref"] != target
    return best


def letters(s):
    return sum(1 for c in s if c.isalpha())


def expected_seconds(text):
    return 0.25 + 0.075 * letters(text)


def signal_stats(path):
    a, sr = sf.read(path, dtype="float32", always_2d=True)
    a = a.mean(axis=1)
    dur = len(a) / sr
    n = max(1, int(FRAME * sr))
    frames = len(a) // n
    if frames == 0:
        return {"duration": dur, "all_silent": True, "lead_sil": dur, "trail_sil": dur, "max_gap": 0.0, "clip_frac": 0.0, "peak_db": -120.0}
    fr = a[: frames * n].reshape(frames, n)
    rms = np.sqrt(np.mean(fr ** 2, axis=1) + 1e-12)
    db = 20 * np.log10(rms)
    voiced = db > SIL_DB
    peak = float(np.max(np.abs(a))) if len(a) else 0.0
    clip_frac = float(np.mean(np.abs(a) >= 0.999)) if len(a) else 0.0
    if not voiced.any():
        return {"duration": dur, "all_silent": True, "lead_sil": dur, "trail_sil": dur, "max_gap": 0.0, "clip_frac": clip_frac,
                "peak_db": 20 * math.log10(peak + 1e-12)}
    idx = np.where(voiced)[0]
    lead = idx[0] * FRAME
    trail = (frames - 1 - idx[-1]) * FRAME
    # longest internal unvoiced run between first and last voiced frame
    inner = voiced[idx[0]: idx[-1] + 1]
    gap = run = 0
    for v in inner:
        run = 0 if v else run + 1
        gap = max(gap, run)
    return {"duration": dur, "all_silent": False, "lead_sil": lead, "trail_sil": trail, "max_gap": gap * FRAME,
            "clip_frac": clip_frac, "peak_db": 20 * math.log10(peak + 1e-12)}


class ASR:
    """repo may be an HF repo id or a local snapshot directory (generate.py passes the pinned snapshot)."""
    def __init__(self, repo=ASR_REPO):
        import mlx_whisper  # noqa: F401
        self.repo = repo

    def transcribe(self, path):
        import mlx_whisper
        r = mlx_whisper.transcribe(path, path_or_hf_repo=self.repo, language="fr", temperature=0.0,
                                   condition_on_previous_text=False, initial_prompt=None, verbose=None)
        return r.get("text", "").strip()


def word_count(text):
    return len(norm_text(text, True).split())


# ---------------------------------------------------------------------------------------------
# Phase 2 additions: automatic homophone awareness for the full corpus (Phase 1 used a hand-made
# "alt" list per test string; 1,608 strings need a rule instead).
# ---------------------------------------------------------------------------------------------
_UNITS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze",
          "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"]
_TENS = {2: "vingt", 3: "trente", 4: "quarante", 5: "cinquante", 6: "soixante"}


def fr_number(n):
    """French words for 0..999 (enough for anything Whisper may write as digits here)."""
    if n < 20:
        return _UNITS[n]
    if n < 70:
        t, u = divmod(n, 10)
        return _TENS[t] + ("" if u == 0 else (" et un" if u == 1 else "-" + _UNITS[u]))
    if n < 80:
        return "soixante" + (" et onze" if n == 71 else "-" + _UNITS[n - 60])
    if n < 100:
        u = n - 80
        return "quatre-vingt" + ("s" if u == 0 else "-" + _UNITS[u])
    h, r = divmod(n, 100)
    head = "cent" if h == 1 else _UNITS[h] + " cent" + ("s" if r == 0 else "")
    return head + ("" if r == 0 else " " + fr_number(r))


def spell_numbers(s):
    s = re.sub(r"(\d)\s*h\b", r"\1 heures", s)  # "à 8 h" is read "à huit heures"
    return re.sub(r"\d{1,3}", lambda m: " " + fr_number(int(m.group(0))) + " ", s)


def sound_key(word):
    """Rough French pronunciation key for ONE loose-normalized word (accents already stripped).
    Collapses silent endings and common equal-sounding spellings so homophones and silent
    gender/number/person endings compare equal: parle/parles/parlent, sais/sait/c'est, ont/on."""
    w = word
    if not w:
        return w
    w = re.sub(r"^h", "", w)
    w = w.replace("ph", "f").replace("qu", "k").replace("ch", "S")
    w = re.sub(r"(eau|au)", "o", w)
    if len(w) > 3 and w.endswith("ent") and not w.endswith("aient"):
        # verb -ent is silent and the stem's last consonant is heard: posent = pose = [poz]
        w = w[:-3]
    else:
        # "E" marks a final [e]/[ɛ] sound: -aient/-ais/-ait/-ai/-ez/-er/-est/-et/-é(e)(s)/-ès/-êt
        if len(w) > 1:
            w = re.sub(r"(aient|aies|aie|ais|ait|ai|ez|er|est|et|ées|ée|és|é|ès|êt|ê)$", "E", w)
        w = re.sub(r"(?<=.)[sxzdt]+$", "", w)
        w = re.sub(r"(?<=.)e$", "", w)
    w = re.sub(r"[éèêë]", "E", w)
    w = re.sub(r"(?<![iyE])en(?![aeiouy])", "an", w)  # "en"/"an" are the same nasal vowel: rends = rand
    w = "".join(c for c in unicodedata.normalize("NFD", w) if unicodedata.category(c) != "Mn")
    w = re.sub(r"(.)\1+", r"\1", w)
    return w


def sound_string(s):
    """Whole-string key: loose normalization, digits spelled out, words joined (liaison/elision
    make word boundaries unreliable in ASR output, e.g. "c'est" vs "sait"). c/g softening is applied
    after joining so an elided "c'" + "est" sounds like "sait"."""
    words = norm_text(spell_numbers(s), False).split()
    j = "".join(sound_key(w) for w in words)
    j = re.sub(r"c(?=[eiyE])", "s", j)
    j = re.sub(r"g(?=[eiyE])", "j", j)
    j = re.sub(r"(.)\1+", r"\1", j)
    return j.lower()


def phon_cer(target, hyp):
    a, b = sound_string(target), sound_string(hyp)
    if not a:
        return 0.0 if not b else 1.0
    if not b:
        return 1.0
    return jiwer.cer(a, b)


HARD_FLAGS = {"silent", "too-short", "clipping", "internal-gap", "duration-outlier"}


def evaluate_corpus(speak, wav_path, transcript, median_ratio):
    """QA one corpus clip (Phase 2). Same ASR, signal checks and thresholds as Phase 1, plus:
    - homophone-aware text score (`phon_cer`) replacing the hand-made alt lists;
    - stricter single-word rule: only an exact loose match or an identical sound key is "short-ok"
      (Phase 1 allowed loose CER <= 0.34); anything else is "short-unverified" and gets retried.
    Returns a dict with scores, flags and status in {pass, fail, short-ok, short-unverified, short-fail}."""
    target = re.sub(r"\s+", " ", spell_numbers(speak)).strip()  # digits / "8 h" as they are read
    item = {"text": target, "speak": target, "category": "corpus"}
    q = evaluate(item, wav_path, spell_numbers(transcript), median_ratio)
    q["transcript"] = transcript
    pc = phon_cer(target, transcript)
    q["phon_cer"] = pc
    flags = [f for f in q["flags"] if f != "last-word-missing"]
    ref_words = norm_text(target, False).split()
    if ref_words:
        last = sound_string(ref_words[-1])
        heard = sound_string(transcript)
        # the last word's sound must appear in the second half of what was heard
        tail = heard[max(0, len(heard) // 2 - len(last)):]
        if last and last not in tail:
            flags.append("last-word-missing")
    q["flags"] = flags
    wc = q["words"]
    lc = q["loose_cer"]
    signal_ok = not (HARD_FLAGS & set(flags))
    if wc <= 1:
        exact = lc == 0.0 or pc == 0.0
        q["status"] = "short-fail" if not signal_ok else ("short-ok" if exact else "short-unverified")
        return q
    if wc >= 4:
        text_ok = (lc <= 0.10 and q["loose_wer"] <= 0.20) or pc <= 0.05
    else:
        text_ok = lc <= 0.15 or pc == 0.0
    q["status"] = "pass" if (text_ok and signal_ok and "last-word-missing" not in flags) else "fail"
    return q


def evaluate(item, wav_path, transcript, median_ratio=None):
    """QA one clip. Returns dict with scores, flags and a status."""
    target = item.get("speak", item["text"])
    st = signal_stats(wav_path)
    sc = scores(target, item.get("alt"), transcript)
    exp = expected_seconds(target)
    ratio = st["duration"] / exp
    flags = []
    if st["all_silent"]:
        flags.append("silent")
    if st["lead_sil"] > 0.6:
        flags.append("lead-silence")
    if st["trail_sil"] > 0.6:
        flags.append("trail-silence")
    wc = word_count(target)
    if wc <= 6 and st["max_gap"] > 0.7:
        flags.append("internal-gap")
    if st["clip_frac"] >= 0.0005:
        flags.append("clipping")
    # truncation: last target word missing from transcript, or far too short
    ref_words = norm_text(sc["matched_ref"], True).split()
    hyp_words = norm_text(transcript, True).split()
    if ref_words and ref_words[-1] not in hyp_words:
        flags.append("last-word-missing")
    # "too-short" is judged against the voice's own calibrated rate (a fast voice like Amélie is
    # legitimately below 0.55 x the generic estimate); "duration-outlier" catches repeats/hallucinations.
    base = median_ratio or 1.0
    if ratio < 0.55 * base:
        flags.append("too-short")
    elif median_ratio and math.log(ratio / median_ratio) > math.log(1.8):
        flags.append("duration-outlier")

    short_input = item["category"] == "single"
    if wc >= 4:
        text_ok = sc["loose_cer"] <= 0.10 and sc["loose_wer"] <= 0.20
    elif wc >= 2:
        text_ok = sc["loose_cer"] <= 0.15
    else:
        text_ok = sc["loose_cer"] == 0.0 or sc["loose_cer"] <= 0.34
    # lead/trail silence is reported but not failing: Phase 2 trims it with ffmpeg silenceremove.
    hard = {"silent", "too-short", "clipping", "internal-gap", "duration-outlier"}
    signal_ok = not (hard & set(flags))
    if short_input:
        # Whisper is unreliable on isolated French words; a text miss is "short-unverified" (ear check), not a fail.
        if not signal_ok:
            status = "short-fail"
        elif text_ok:
            status = "short-ok"
        else:
            status = "short-unverified"
    else:
        if text_ok and signal_ok and "last-word-missing" not in flags:
            status = "pass"
        else:
            status = "fail"
    return {"transcript": transcript, **sc, "duration": st["duration"], "expected": exp, "ratio": ratio,
            "lead_sil": st["lead_sil"], "trail_sil": st["trail_sil"], "max_gap": st["max_gap"],
            "clip_frac": st["clip_frac"], "peak_db": st["peak_db"], "flags": flags, "status": status,
            "words": wc}
