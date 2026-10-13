/* Synthetic VERB_DATA for the data-driven tests (design §17): 3 non-contiguous lessons (7, 12, 30), 8 verbs
   including an impersonal one-row verb (falloir) and a pronominal verb (se lever). build(realData) copies four
   real verbs from data.js. duplicateLessons(realData) returns a dataset whose lesson id 7 appears twice. */
"use strict";

function rows(list) {
  var persons = ["1s", "2s", "3s", "1p", "2p", "3p"];
  return list.map(function (r, i) {
    return { person: r[3] || persons[i], pronoun: r[0], form: r[1], french: r[0].slice(-1) === "'" ? r[0] + r[1] : r[0] + " " + r[1], pronunciation: r[2], english: "" };
  });
}

function clone(x) { return JSON.parse(JSON.stringify(x)); }

function build(realData) {
  var pick = function (id) { return clone(realData.verbs.filter(function (v) { return v.id === id; })[0]); };
  var chanter = {
    id: "chanter", number: 101, infinitive: "chanter", meaning: "to sing", pronunciation: "shahN-tay", regularEr: true,
    present: rows([["je", "chante", "zhuh shahNt"], ["tu", "chantes", "tew shahNt"], ["il/elle", "chante", "eel/el shahNt"],
      ["nous", "chantons", "noo shahN-tohN"], ["vous", "chantez", "voo shahN-tay"], ["ils/elles", "chantent", "eel/el shahNt"]]),
    past: { french: "j'ai chanté", pronunciation: "zhay shahN-tay", english: "I sang", auxiliary: "avoir", participle: "chanté" },
    future: { french: "je chanterai", pronunciation: "zhuh shahN-tuh-ray", english: "I will sing" },
    sentence: { french: "Je chante sous la douche.", pronunciation: "zhuh shahNt soo lah doosh", english: "I sing in the shower.", verbForm: "chante" },
    tips: []
  };
  var finir = {
    id: "finir", number: 102, infinitive: "finir", meaning: "to finish", pronunciation: "fee-neer", regularEr: false,
    type: "Regular (-ir, 2nd group)",
    present: rows([["je", "finis", "zhuh fee-nee"], ["tu", "finis", "tew fee-nee"], ["il/elle", "finit", "eel/el fee-nee"],
      ["nous", "finissons", "noo fee-nee-sohN"], ["vous", "finissez", "voo fee-nee-say"], ["ils/elles", "finissent", "eel/el fee-neess"]]),
    past: { french: "j'ai fini", pronunciation: "zhay fee-nee", english: "I finished", auxiliary: "avoir", participle: "fini" },
    sentence: { french: "Nous finissons à midi.", pronunciation: "noo fee-nee-sohN ah mee-dee", english: "We finish at noon.", verbForm: "finissons" },
    tips: []
  };
  var falloir = {
    id: "falloir", number: 103, infinitive: "falloir", meaning: "to be necessary", pronunciation: "fahl-wahr", regularEr: false,
    type: "Irregular (impersonal: il form only)",
    present: rows([["il", "faut", "eel foh", "3s"]]),
    past: { french: "il a fallu", pronunciation: "eel ah fah-lew", english: "it was necessary", auxiliary: "avoir", participle: "fallu" }
  };
  var seLever = {
    id: "se-lever", number: 104, infinitive: "se lever", meaning: "to get up", pronunciation: "suh luh-vay", regularEr: false,
    type: "Regular (-er, spelling change: e→è), Pronominal",
    present: rows([["je me", "lève", "zhuh muh lev"], ["tu te", "lèves", "tew tuh lev"], ["il/elle se", "lève", "eel/el suh lev"],
      ["nous nous", "levons", "noo noo luh-vohN"], ["vous vous", "levez", "voo voo luh-vay"], ["ils/elles se", "lèvent", "eel/el suh lev"]]),
    past: { french: "je me suis levé(e)", pronunciation: "zhuh muh swee luh-vay", english: "I got up", auxiliary: "être", participle: "levé" },
    sentence: { french: "Je me lève à sept heures.", pronunciation: "zhuh muh lev ah set uhr", english: "I get up at seven.", verbForm: "lève" },
    tips: []
  };
  return {
    source: "synthetic-verbs.md",
    pronunciationKey: [], introTipsHtml: "", grammarNotes: [],
    lessons: [
      { id: 7, title: "Synthetic A", verbIds: ["chanter", "finir", "etre"] },
      { id: 12, title: "Synthetic B", verbIds: ["falloir", "se-lever", "avoir"] },
      { id: 30, title: "Synthetic C", verbIds: ["parler", "aller"] }
    ],
    verbs: [chanter, finir, falloir, seLever, pick("etre"), pick("avoir"), pick("parler"), pick("aller")]
  };
}

function duplicateLessons(realData) {
  var d = build(realData);
  d.lessons.push({ id: 7, title: "Duplicate of 7", verbIds: ["parler"] });
  return d;
}

module.exports = { build: build, duplicateLessons: duplicateLessons };
