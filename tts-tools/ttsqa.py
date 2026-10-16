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


def median_f0(path_or_array, sr=None, fmin=70.0, fmax=300.0, frame=0.04):
    """Median fundamental frequency (Hz) over voiced 40 ms frames, by normalized autocorrelation in the
    fmin..fmax range. A frame is voiced when its RMS is above the silence floor (SIL_DB) and its best
    autocorrelation peak is clear (>= 0.5). Returns None when no frame is voiced. Pure numpy."""
    if isinstance(path_or_array, str):
        a, sr = sf.read(path_or_array, dtype="float32", always_2d=True)
        a = a.mean(axis=1)
    else:
        a = np.asarray(path_or_array, dtype=np.float32).reshape(-1)
    if not sr:
        raise ValueError("median_f0: sr is required for an array")
    n = int(frame * sr)
    lo, hi = int(sr / fmax), int(sr / fmin)
    if n <= hi or len(a) < n:
        return None
    f0s = []
    for i in range(len(a) // n):
        x = a[i * n:(i + 1) * n].astype(np.float64)
        if 20 * math.log10(math.sqrt(float(np.mean(x ** 2))) + 1e-12) <= SIL_DB:
            continue
        x = x - x.mean()
        ac = np.correlate(x, x, mode="full")[n - 1:]
        if ac[0] <= 0:
            continue
        ac = ac / ac[0]
        seg = ac[lo:hi + 1]
        k = int(np.argmax(seg))
        if seg[k] < 0.5:
            continue
        lag = lo + k
        # parabolic interpolation around the peak for sub-sample precision
        if 0 < lag < len(ac) - 1:
            y0, y1, y2 = ac[lag - 1], ac[lag], ac[lag + 1]
            d = y0 - 2 * y1 + y2
            lag = lag + (0.5 * (y0 - y2) / d if d != 0 else 0.0)
        f0s.append(sr / lag)
    return float(np.median(f0s)) if f0s else None


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
# "alt" list per test string; the full corpus needs a rule instead).
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


def fr_ordinal(n, fem=False):
    """French ordinal words: 1 -> premier/première, 3 -> troisième, 21 -> vingt et unième."""
    if n == 1:
        return "première" if fem else "premier"
    w = fr_number(n)
    if w.endswith("cinq"):
        w += "u"
    elif w.endswith("neuf"):
        w = w[:-1] + "v"
    elif w.endswith("s") and (w.endswith("vingts") or w.endswith("cents")):
        w = w[:-1]
    if w.endswith("e"):
        w = w[:-1]
    return w + "ième"


def _clock(s):
    """Whisper's clock notations -> "<H> heures <MM>" / "<H> heures" (digits kept)."""
    s = re.sub(r"\b(\d{1,2})\s*(?:h|:)\s*(\d{2})\b", r"\1 heures \2", s)  # 18h30, 18:30, 18 h 30
    return re.sub(r"(\d)\s*h\b", r"\1 heures", s)  # "à 8 h" is read "à huit heures"


def spell_numbers(s):
    s = re.sub(r"(\d)\s*€", r"\1 euros", s).replace("€", " euros ")
    s = re.sub(r"\b(\d{1,3})(er|re|ère)\b", lambda m: " " + fr_ordinal(int(m.group(1)), m.group(2) != "er") + " ", s)
    s = re.sub(r"\b(\d{1,3})(?:ème|eme|e|è|ᵉ)\b", lambda m: " " + fr_ordinal(int(m.group(1))) + " ", s)
    s = _clock(s)
    return re.sub(r"\d{1,3}", lambda m: " " + fr_number(int(m.group(0))) + " ", s)


def _hour_names(h):
    """Ways to say hour h on the clock (digits for spell_numbers): 13 -> 13 heures; 12 -> midi too."""
    names = [f"{h} heures"]
    if h == 1 or h == 13:
        names.append("une heure")
    if h == 12:
        names.append("midi")
    if h in (0, 24):
        names.append("minuit")
    return names


def clock_variants(transcript):
    """Other correct readings of the clock times Whisper wrote as digits, spelled out:
    "4 h 15" also matches "quatre heures et quart", "5 h 45" "six heures moins le quart",
    "6 h 50" "sept heures moins dix", "12 h 30" "midi et demi(e)". The plain reading is not included."""
    s = _clock(transcript)
    pat = re.compile(r"\b(\d{1,2}) heures(?: (\d{1,2})\b)?")
    m = pat.search(s)
    if not m:
        return []
    h, mm = int(m.group(1)), int(m.group(2)) if m.group(2) else 0
    alts = []
    for name in _hour_names(h):
        if mm == 0:
            alts.append(name)
        else:
            alts.append(f"{name} {mm}")
        if mm == 15:
            alts.append(f"{name} et quart")
        if mm == 30:
            alts += [f"{name} et demie", f"{name} et demi"]
    if 35 <= mm <= 55:
        for name in _hour_names(h + 1):
            alts.append(f"{name} moins {60 - mm}")
            if mm == 45:
                alts.append(f"{name} moins le quart")
    plain = f"{h} heures" + (f" {mm}" if m.group(2) else "")
    out = []
    for a in alts:
        if a == plain:
            continue
        v = re.sub(r"\s+", " ", spell_numbers(s[:m.start()] + a + s[m.end():])).strip()
        if v not in out:
            out.append(v)
    return out


_WORD_SOUNDS = {"sept": "set", "y": "i", "les": "lE", "des": "dE", "mes": "mE", "tes": "tE", "ses": "sE", "ces": "sE"}


def sound_key(word):
    """Rough French pronunciation key for ONE loose-normalized word (accents already stripped).
    Collapses silent endings and common equal-sounding spellings so homophones and silent
    gender/number/person endings compare equal: parle/parles/parlent, sais/sait/c'est, ont/on."""
    w = word
    if not w:
        return w
    # true homophones Whisper writes for isolated words (Grammar tables run): sept = cette, y = i,
    # ses/ces/mes/... end in [e] (ses = c'est), "Allah" = "à la" (final h after a vowel is silent)
    if w in _WORD_SOUNDS:
        return _WORD_SOUNDS[w]
    w = w.replace("ç", "s")  # ça = sa
    w = re.sub(r"(?<=[aeiou])h$", "", w)
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


_RANK = {"pass": 0, "short-ok": 0, "short-unverified": 1, "fail": 2, "short-fail": 3}


def is_single(speak, strict_single=False):
    """One word for QA: one normalized word, or (strict) no whitespace at all ("dix-sept", "l'hôtel")."""
    return word_count(speak) <= 1 or (strict_single and not re.search(r"\s", speak.strip()))


def evaluate_corpus(speak, wav_path, transcript, median_ratio, strict_single=False):
    """QA one corpus clip against Whisper's transcript and the other correct readings of any clock
    time it wrote as digits (clock_variants); keeps the best-scoring reading. See _evaluate_one."""
    best = None
    for hyp in [spell_numbers(transcript)] + clock_variants(transcript):
        q = _evaluate_one(speak, wav_path, hyp, median_ratio, strict_single)
        if best is None or (_RANK[q["status"]], q["phon_cer"], q["loose_cer"], len(q["flags"])) < \
                (_RANK[best["status"]], best["phon_cer"], best["loose_cer"], len(best["flags"])):
            best = q
    best["transcript"] = transcript
    return best


def _evaluate_one(speak, wav_path, transcript, median_ratio, strict_single=False):
    """QA one corpus clip (Phase 2). Same ASR, signal checks and thresholds as Phase 1, plus:
    - homophone-aware text score (`phon_cer`) replacing the hand-made alt lists;
    - stricter single-word rule: only an exact loose match or an identical sound key is "short-ok"
      (Phase 1 allowed loose CER <= 0.34); anything else is "short-unverified" and gets retried.
      With strict_single, any string without whitespace ("dix-sept", "l'hôtel") counts as one word.
    `transcript` is already number-spelled (spell_numbers / clock_variants).
    Returns a dict with scores, flags and status in {pass, fail, short-ok, short-unverified, short-fail}."""
    target = re.sub(r"\s+", " ", spell_numbers(speak)).strip()  # digits / "8 h" as they are read
    item = {"text": target, "speak": target, "category": "corpus"}
    q = evaluate(item, wav_path, transcript, median_ratio)
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
    if wc <= 1 or is_single(speak, strict_single):
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
