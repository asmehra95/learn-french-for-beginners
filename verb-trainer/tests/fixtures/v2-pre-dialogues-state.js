/* A realistic schema-v2 state as storage.js saved it before the Dialogues feature (repo HEAD 35ad97f): verb and
   expression stats, a lesson, a topic exercise, history and every v2 setting including selectedExpressionThemes and
   voiceSource, and no dialogues / dialogueShowEnglish fields. storage.test.js checks it loads with only those
   two defaults added. */
"use strict";
module.exports = {
  "version": 2,
  "stats": {
    "etre|conjugate|1s": {
      "box": 3,
      "seen": 4,
      "correct": 4,
      "wrong": 0,
      "last": 1760000000000
    },
    "parler|flash-inf-meaning|-": {
      "box": 1,
      "seen": 2,
      "correct": 1,
      "wrong": 1,
      "last": 1760000100000
    },
    "expr:laddition|flash-fr-en|-": {
      "box": 2,
      "seen": 3,
      "correct": 2,
      "wrong": 1,
      "last": 1760000200000
    },
    "expr:bonjour|flash-en-fr|-": {
      "box": 0,
      "seen": 1,
      "correct": 0,
      "wrong": 1,
      "last": 1760000300000
    }
  },
  "totals": {
    "answered": 10,
    "correct": 7,
    "bestStreak": 4,
    "streak": 1
  },
  "settings": {
    "accentTolerant": false,
    "selectedVerbIds": [
      "etre",
      "parler",
      "avoir"
    ],
    "selectedExpressionThemes": [
      "greetings",
      "shopping-restaurant"
    ],
    "flashDeck": "conj",
    "voiceNoticeDismissed": true,
    "voiceURI": "",
    "voiceName": "",
    "speechRate": 0.9,
    "preferNative": true,
    "voiceSource": "device",
    "theme": "dark",
    "dailyGoal": 30,
    "sessionLength": 15,
    "autoPlayWrong": true,
    "singleKeyShortcuts": false
  },
  "daily": {
    "date": "2026-10-15",
    "answered": 10,
    "correct": 7,
    "goalMet": false
  },
  "streak": {
    "current": 3,
    "best": 5,
    "lastDate": "2026-10-15"
  },
  "history": {
    "2026-10-13": 5,
    "2026-10-14": 12,
    "2026-10-15": 10
  },
  "lessons": {
    "1": {
      "learned": true,
      "practiced": true,
      "quizBest": 80,
      "quizPassed": true
    }
  },
  "topics": {
    "Q1-A": {
      "best": 75,
      "attempts": 2
    }
  },
  "onboarding": {
    "welcomeDismissed": true,
    "typingTipSeen": true,
    "importHintDismissed": false
  }
};
