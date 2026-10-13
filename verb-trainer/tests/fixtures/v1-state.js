/* A version-1 profile in the pre-redesign shape (storage.js before schema v2), used by storage.test.js and the
   smoke "migration" section. Real verb ids so the selectedVerbIds byte-equal check is meaningful. */
"use strict";

module.exports = {
  version: 1,
  stats: {
    "etre|conjugate|1s": { box: 3, seen: 4, correct: 4, wrong: 0, last: 1717000000000 },
    "etre|conjugate|2p": { box: 0, seen: 3, correct: 1, wrong: 2, last: 1717000100000 },
    "parler|flash-inf-meaning|-": { box: 2, seen: 2, correct: 2, wrong: 0, last: 1717000200000 },
    "parler|choice-form|3p": { box: 1, seen: 2, correct: 1, wrong: 1, last: 1717000300000 },
    "manger|sentence|-": { box: 4, seen: 5, correct: 5, wrong: 0, last: 1717000400000 },
    "manger|choice-meaning|-": { box: 0, seen: 1, correct: 0, wrong: 1, last: 1717000500000 }
  },
  totals: { answered: 17, correct: 13, bestStreak: 6, streak: 2 },
  settings: {
    accentTolerant: false,
    selectedVerbIds: ["etre", "parler", "manger"],
    flashDeck: "conj",
    voiceNoticeDismissed: true,
    voiceURI: "com.apple.voice.premium.fr-CA.Amelie",
    voiceName: "Amélie (Premium)",
    speechRate: 0.9,
    preferNative: false
  }
};
