"""Shared helpers for TTS engine adapters.

Every adapter module exposes:
    load(settings: dict) -> handle
    synth(handle, speak_text: str, out_wav_path: str, seed: int, settings: dict)
        -> {"sample_rate": int, "seconds_generated": float, "wall_seconds": float}
"""
import numpy as np
import soundfile as sf


def write_wav(path, audio, sample_rate):
    """Write mono 16-bit PCM WAV (plays in every browser under file://)."""
    a = np.asarray(audio, dtype=np.float32).reshape(-1)
    a = np.clip(a, -1.0, 1.0)
    sf.write(path, a, int(sample_rate), subtype="PCM_16")
    return len(a) / float(sample_rate)
