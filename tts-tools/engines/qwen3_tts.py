"""Qwen3-TTS (MLX via mlx-audio) adapter.

No Qwen3 preset speaker is a native French speaker, so (per plan) the VoiceDesign model
creates ONE synthetic reference voice per voice from a text description (no real person is
cloned), saved as <ref_dir>/reference.wav; the Base model then reuses that reference for every
string so the timbre stays consistent.

design() creates a candidate reference explicitly (generate.py --design-candidates); the chosen
one is copied to <ref_dir>/reference.wav (--design-pick). load() never designs implicitly unless
settings["design_repo"] is set (it is None for every voice in generate.py): with no reference it
raises FileNotFoundError.

settings: {"design_repo", "design_path", "base_repo", "ref_dir", "instruct", "ref_text", "temperature"}
"""
import gc
import os
import time

import numpy as np

from .common import write_wav


def _collect(results):
    chunks, sr = [], None
    for r in results:
        chunks.append(np.array(r.audio, dtype=np.float32).reshape(-1))
        sr = r.sample_rate
    return np.concatenate(chunks), sr


def design(design_path, instruct, ref_text, seed, out_wav):
    """Design ONE candidate reference voice with VoiceDesign (loaded from a pinned local snapshot path),
    write it to out_wav and unload the model. Returns {"sample_rate", "seconds", "wall_seconds"}."""
    import mlx.core as mx
    from mlx_audio.tts.utils import load_model

    t0 = time.perf_counter()
    mx.random.seed(seed)
    model = load_model(design_path)
    audio, sr = _collect(
        model.generate_voice_design(text=ref_text, instruct=instruct, language="french", temperature=0.7)
    )
    secs = write_wav(out_wav, audio, sr)
    del model
    gc.collect()
    mx.clear_cache()
    return {"sample_rate": sr, "seconds": secs, "wall_seconds": time.perf_counter() - t0}


def load(settings):
    import mlx.core as mx
    from mlx_audio.tts.utils import load_model

    ref_wav = os.path.join(settings["ref_dir"], "reference.wav")
    if not os.path.exists(ref_wav):
        if not settings.get("design_repo"):
            raise FileNotFoundError(f"reference voice missing: {ref_wav}; run --design-candidates then --design-pick")
        mx.random.seed(settings.get("ref_seed", 7))
        design = load_model(settings["design_repo"])
        audio, sr = _collect(
            design.generate_voice_design(
                text=settings["ref_text"], instruct=settings["instruct"], language="french", temperature=0.7
            )
        )
        write_wav(ref_wav, audio, sr)
        del design
        gc.collect()
        mx.clear_cache()
    base = load_model(settings["base_repo"])
    return {"model": base, "ref_audio": ref_wav, "ref_text": settings["ref_text"]}


def synth(handle, speak_text, out_wav_path, seed, settings):
    import mlx.core as mx

    mx.random.seed(seed)
    t0 = time.perf_counter()
    audio, sr = _collect(
        handle["model"].generate(
            text=speak_text,
            ref_audio=handle["ref_audio"],
            ref_text=handle["ref_text"],
            lang_code="french",
            temperature=settings.get("temperature", 0.7),
        )
    )
    wall = time.perf_counter() - t0
    secs = write_wav(out_wav_path, audio, sr)
    return {"sample_rate": sr, "seconds_generated": secs, "wall_seconds": wall}
