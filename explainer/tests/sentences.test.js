"use strict";
// lib/sentences.js (design §4.5).
const test = require("node:test");
const assert = require("node:assert/strict");
const { splitSentences } = require("../lib/sentences");

test("question with French spacing stays one sentence", () => {
  assert.deepEqual(splitSentences("Est-ce que tu viens ce soir ?"), ["Est-ce que tu viens ce soir ?"]);
});

test("abbreviation M. does not split", () => {
  assert.deepEqual(splitSentences("M. Dupont est là. Il parle."), ["M. Dupont est là.", "Il parle."]);
});

test("mark runs ?! and … split once", () => {
  assert.deepEqual(splitSentences("Quoi ?! Non…"), ["Quoi ?!", "Non…"]);
});

test("pinned choice: « Tu viens ? » dit-elle. is ONE sentence (incise after a closing quote)", () => {
  assert.deepEqual(splitSentences("« Tu viens ? » dit-elle."), ["« Tu viens ? » dit-elle."]);
  // A capitalised sentence after the closing quote still splits.
  assert.deepEqual(splitSentences("« Tu viens ? » Elle part."), ["« Tu viens ? »", "Elle part."]);
});

test("other protected dots: Mme., etc., p. ex., initials, decimals", () => {
  assert.deepEqual(splitSentences("Mme. Martin arrive. Bonjour."), ["Mme. Martin arrive.", "Bonjour."]);
  assert.deepEqual(splitSentences("Des fruits, p. ex. des pommes. Oui."), ["Des fruits, p. ex. des pommes.", "Oui."]);
  assert.deepEqual(splitSentences("J. K. Rowling écrit. Dr. Simon lit."), ["J. K. Rowling écrit.", "Dr. Simon lit."]);
  assert.deepEqual(splitSentences("Ça coûte 3.5 euros. Ou 3,5 euros."), ["Ça coûte 3.5 euros.", "Ou 3,5 euros."]);
});

test("newlines split blocks; a block without terminal punctuation is one sentence", () => {
  assert.deepEqual(splitSentences("Bonjour\nJe m'appelle Paul. J'habite à Lyon"), ["Bonjour", "Je m'appelle Paul.", "J'habite à Lyon"]);
  assert.deepEqual(splitSentences("\n\n  \nOui\n"), ["Oui"]);
});

test("lowercase plain sentences still split", () => {
  assert.deepEqual(splitSentences("je suis là. tu viens ?"), ["je suis là.", "tu viens ?"]);
});

test("closing quote and bracket stay with their sentence", () => {
  assert.deepEqual(splitSentences('Il a dit "Bonjour." Puis il part.'), ['Il a dit "Bonjour."', "Puis il part."]);
  assert.deepEqual(splitSentences("Il vient (enfin.) Bon."), ["Il vient (enfin.)", "Bon."]);
});
