"""Unit tests for the text side of ttsqa (number/time normalization, --strict-short single-word rule).
Run: cd tts-tools && python -m unittest -v test_ttsqa   (needs the venv: jiwer, numpy, soundfile)."""
import os
import tempfile
import unittest

import numpy as np
import soundfile as sf

import ttsqa

MEDIAN_RATIO = 1.309  # qwen3-fr-bf16 calibration (generate.py)


def tone(path, seconds):
    t = np.arange(int(24000 * seconds)) / 24000.0
    sf.write(path, (0.3 * np.sin(2 * np.pi * 220 * t)).astype(np.float32), 24000, subtype="PCM_16")


class Spelling(unittest.TestCase):
    def test_numbers(self):
        self.assertEqual(ttsqa.norm_text(ttsqa.spell_numbers("21"), True), "vingt et un")
        self.assertEqual(ttsqa.norm_text(ttsqa.spell_numbers("80"), True), "quatre vingts")

    def test_ordinals(self):
        self.assertEqual(ttsqa.norm_text(ttsqa.spell_numbers("3e"), False), "troisième")
        self.assertEqual(ttsqa.norm_text(ttsqa.spell_numbers("5ème"), False), "cinquième")
        self.assertEqual(ttsqa.norm_text(ttsqa.spell_numbers("9e"), False), "neuvième")
        self.assertEqual(ttsqa.norm_text(ttsqa.spell_numbers("20e"), False), "vingtième")
        self.assertEqual(ttsqa.norm_text(ttsqa.spell_numbers("1er mai"), False), "premier mai")
        self.assertEqual(ttsqa.norm_text(ttsqa.spell_numbers("1re"), False), "première")

    def test_clock_and_euros(self):
        for heard in ("Il est 18 h 30.", "Il est 18h30.", "Il est 18:30."):
            self.assertEqual(ttsqa.norm_text(ttsqa.spell_numbers(heard), True), "il est dix huit heures trente")
        self.assertEqual(ttsqa.norm_text(ttsqa.spell_numbers("À 8 h."), True), "a huit heures")
        self.assertEqual(ttsqa.norm_text(ttsqa.spell_numbers("75 €"), True), "soixante quinze euros")


class Evaluate(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.TemporaryDirectory()

    @classmethod
    def tearDownClass(cls):
        cls.dir.cleanup()

    def wav(self, text):
        p = os.path.join(self.dir.name, f"{abs(hash(text))}.wav")
        if not os.path.exists(p):
            tone(p, ttsqa.expected_seconds(text) * MEDIAN_RATIO)
        return p

    def status(self, speak, heard, strict=False):
        return ttsqa.evaluate_corpus(speak, self.wav(speak), heard, MEDIAN_RATIO, strict)["status"]

    def test_clock_readings_pass(self):
        cases = [
            ("Il est dix-huit heures trente.", "Il est 18 h 30."),
            ("Il est dix-huit heures trente.", "Il est 18h30."),
            ("Il est quatre heures et quart.", "Il est 4 h 15."),
            ("Il est cinq heures et demie.", "Il est 5 h 30."),
            ("Il est six heures moins le quart.", "Il est 5 h 45."),
            ("Il est sept heures moins dix.", "Il est 6 h 50."),
            ("On se retrouve à midi et demi ?", "On se retrouve à 12 h 30 ?"),
            ("à huit heures", "À 8 h."),
            ("Il est une heure.", "Il est 1 h."),
            ("Ça coûte soixante-quinze euros.", "Ça coûte 75 €."),
            ("vingt et un", "21"),
        ]
        for speak, heard in cases:
            with self.subTest(speak=speak, heard=heard):
                self.assertEqual(self.status(speak, heard), "pass")

    def test_wrong_time_still_fails(self):
        self.assertEqual(self.status("Il est quatre heures et quart.", "Il est 5 h 15."), "fail")

    def test_single_numbers(self):
        self.assertEqual(self.status("quatre-vingts", "80", strict=True), "short-ok")
        self.assertEqual(self.status("troisième", "3e", strict=True), "short-ok")

    def test_strict_single(self):
        self.assertEqual(self.status("dix-sept", "Dix-sept.", strict=True), "short-ok")
        self.assertEqual(self.status("dix-sept", "Disset.", strict=True), "short-unverified")
        # without the flag a hyphenated token is two words and keeps the multiword rule
        self.assertEqual(self.status("dix-sept", "Disset."), "fail")

    def test_single_word_homophones(self):
        # what Whisper wrote for correct isolated readings in the Grammar tables run
        for speak, heard in (("cette", "7"), ("sa", "Ça."), ("ses", "C'est"), ("y", "I")):
            with self.subTest(speak=speak, heard=heard):
                self.assertEqual(self.status(speak, heard, strict=True), "short-ok")
        self.assertEqual(self.status("à la", "Allah"), "pass")
        # not homophones: still unverified
        for speak, heard in (("tes", "...des."), ("ceux", "S"), ("longue", "Longe"), ("mes", "May"), ("le", "les")):
            with self.subTest(speak=speak, heard=heard):
                self.assertEqual(self.status(speak, heard, strict=True), "short-unverified")

    def test_multiword_unchanged_by_flag(self):
        for strict in (False, True):
            self.assertEqual(self.status("Je vais au cinéma.", "Je vais au cinéma.", strict), "pass")
            self.assertEqual(self.status("Je vais au cinéma.", "Je vais à la plage.", strict), "fail")


class MedianF0(unittest.TestCase):
    def test_sine_120(self):
        t = np.arange(24000) / 24000.0
        f0 = ttsqa.median_f0((0.3 * np.sin(2 * np.pi * 120 * t)).astype(np.float32), 24000)
        self.assertIsNotNone(f0)
        self.assertAlmostEqual(f0, 120.0, delta=5.0)

    def test_sine_wav_220(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "t.wav")
            tone(p, 1.0)
            self.assertAlmostEqual(ttsqa.median_f0(p), 220.0, delta=5.0)

    def test_silence(self):
        self.assertIsNone(ttsqa.median_f0(np.zeros(24000, dtype=np.float32), 24000))


if __name__ == "__main__":
    unittest.main()
