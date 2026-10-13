/* Derived teaching data for the verb trainer (design §8.1, §9.2). Hand-maintained; data.js stays generated.
   families: ending patterns in L.PERSONS order (1s 2s 3s 1p 2p 3p); endings null = no pattern.
   verbs:    per-verb ending family, and optionally type: "regular" | "irregular" (overrides regularEr).
   confusables: groups of bare, accent-stripped forms learners mix up, each with a note.
                In notes, **word** marks a French word shown in bold (rendered as text, never as HTML). */
window.VERB_META = {
  version: 1,
  families: {
    "er": {
      endings: ["e", "es", "e", "ons", "ez", "ent"], label: "Regular -er verb",
      hint: "Drop -er, add -e, -es, -e, -ons, -ez, -ent. The je, tu, il and ils forms all sound the same."
    },
    "s-t": {
      endings: ["s", "s", "t", "ons", "ez", "ent"], label: "-s, -s, -t pattern",
      hint: "Endings -s, -s, -t, -ons, -ez, -ent. Watch the stem: it often changes for nous and vous."
    },
    "x-t": {
      endings: ["x", "x", "t", "ons", "ez", "ent"], label: "-x, -x, -t pattern",
      hint: "Endings -x, -x, -t, -ons, -ez, -ent (like pouvoir and vouloir)."
    },
    "d": {
      endings: ["s", "s", "", "ons", "ez", "ent"], label: "-s, -s, no ending",
      hint: "Endings -s, -s, (nothing), -ons, -ez, -ent: il prend, il met."
    },
    "ir": {
      endings: ["is", "is", "it", "issons", "issez", "issent"], label: "Regular -ir verb",
      hint: "Drop -ir, add -is, -is, -it, -issons, -issez, -issent (like finir)."
    },
    "unique": {
      endings: null, label: "Irregular: learn by heart",
      hint: "This verb has its own forms. It's so common that it's worth learning by heart."
    },
    "none": { endings: null, label: "Pattern not described yet", hint: "" }
  },
  verbs: {
    etre: { family: "unique" }, avoir: { family: "unique" }, aller: { family: "unique" },
    faire: { family: "s-t" }, dire: { family: "s-t" }, voir: { family: "s-t" }, croire: { family: "s-t" },
    savoir: { family: "s-t" }, devoir: { family: "s-t" }, connaitre: { family: "s-t" },
    partir: { family: "s-t" }, venir: { family: "s-t" },
    pouvoir: { family: "x-t" }, vouloir: { family: "x-t" },
    prendre: { family: "d" }, comprendre: { family: "d" }, mettre: { family: "d" },
    parler: { family: "er" }, aimer: { family: "er" }, donner: { family: "er" }, trouver: { family: "er" },
    manger: { family: "er" }, passer: { family: "er" }, penser: { family: "er" }, demander: { family: "er" }
  },
  confusables: [
    {
      forms: ["sais", "sait", "savons", "savez", "savent", "connais", "connait", "connaissons", "connaissez", "connaissent"],
      note: "**savoir** = to know a fact or how to do something; **connaître** = to know a person or place (**Tu connais Marie ?**)."
    },
    {
      forms: ["est", "es", "et"],
      note: "**est** (he/she is) and **es** (you are) sound like **et** (and), but only est/es are verbs."
    },
    {
      forms: ["a", "as"],
      note: "**a** = he/she has, **as** = you have. (And **à** without the verb means 'to/at'.)"
    },
    {
      forms: ["vais", "vas", "va"],
      note: "aller: je **vais**, tu **vas**, il **va**."
    },
    {
      forms: ["fais", "fait", "faisons", "faites", "font", "faisez"],
      note: "faire: je/tu **fais**, il **fait**, vous **faites** (not 'faisez'), ils **font**."
    },
    {
      forms: ["dis", "dit", "disons", "dites", "disent", "disez"],
      note: "dire: je/tu **dis**, il **dit**, vous **dites** (not 'disez')."
    },
    {
      forms: ["prends", "prend", "prenons", "prennent"],
      note: "prendre: il **prend** keeps the d; ils **prennent** doubles the n."
    },
    {
      forms: ["vois", "voit", "voyons", "voyez", "voient"],
      note: "voir: the i becomes y in **nous voyons**, **vous voyez**."
    }
  ]
};
