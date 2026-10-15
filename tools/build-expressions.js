#!/usr/bin/env node
/* Builds the everyday expressions Markdown (and, with --html, a print HTML for the PDF) from
   verb-trainer/js/expressions-data.js, the single source of the expressions.
     node tools/build-expressions.js                 writes french-expressions.md and
                                                     verb-trainer/reference/french-expressions.md
     node tools/build-expressions.js --html out.html also writes the print HTML (print it to PDF
                                                     with headless Chrome --print-to-pdf)
   Shares the pronunciation key, licence line and print CSS with tools/build-grammar-tables.js.
   No dependencies. The verb-trainer tests check that both .md files match markdown(). An unknown
   verb, table or expression link throws (with the expression id) before anything is written. */
"use strict";
var fs = require("fs");
var path = require("path");
var G = require("./build-grammar-tables.js");

var REPO = path.join(__dirname, "..");
var SITE = path.join(REPO, "verb-trainer");
var REGISTER = { formal: "Formal", neutral: "Neutral", informal: "Informal" };

/* The site data as the browser sees it: linked verbs such as s-appeler live in data-100.js and only reach
   VERB_DATA after merge-data.js. */
function loadSite() {
  global.window = global.window || {};
  ["data.js", "data-100.js", "verb-types.js", "reference-data.js", "merge-data.js", "expressions-data.js"]
    .forEach(function (f) { require(path.join(SITE, "js", f)); });
  var w = global.window;
  var verbsById = {};
  w.VERB_DATA.verbs.forEach(function (v) { verbsById[v.id] = v; });
  var tableById = {};
  w.VT_REFERENCE.categories.forEach(function (c) {
    c.tables.forEach(function (t) { tableById[t.id] = { categoryId: c.id, title: t.title }; });
  });
  return { data: w.VT_EXPRESSIONS, verbsById: verbsById, tableById: tableById, keyRows: w.VERB_DATA.pronunciationKey };
}

/* "See also" parts in order: verbs (infinitives, French), tables (titles), other expressions (French headwords). */
function seeAlsoParts(e, data, verbsById, tableById) {
  var byId = {};
  data.expressions.forEach(function (x) { byId[x.id] = x; });
  var out = [];
  (e.verbs || []).forEach(function (id) {
    if (!verbsById[id]) throw new Error(e.id + ": unknown verb " + id);
    out.push({ fr: true, text: verbsById[id].infinitive });
  });
  (e.tables || []).forEach(function (id) {
    if (!tableById[id]) throw new Error(e.id + ": unknown table " + id);
    out.push({ fr: false, text: tableById[id].title });
  });
  (e.see || []).forEach(function (id) {
    if (!byId[id]) throw new Error(e.id + ": unknown expression " + id);
    out.push({ fr: true, text: byId[id].fr });
  });
  return out;
}

function themeItems(data, t) { return data.expressions.filter(function (e) { return e.theme === t.id; }); }

function validate(data, verbsById, tableById) {
  var themes = {};
  data.themes.forEach(function (t) { themes[t.id] = true; });
  data.expressions.forEach(function (e) {
    ["id", "theme", "fr", "pron", "en", "register"].forEach(function (k) { if (!e[k]) throw new Error((e.id || "?") + ": missing " + k); });
    if (!themes[e.theme]) throw new Error(e.id + ": unknown theme " + e.theme);
    if (!e.example || !e.example.fr || !e.example.pron || !e.example.en) throw new Error(e.id + ": missing example");
    seeAlsoParts(e, data, verbsById, tableById);
  });
}

/* ---------- Markdown ---------- */
function markdown(data, verbsById, tableById) {
  validate(data, verbsById, tableById);
  var out = [];
  out.push("<!-- Generated from verb-trainer/js/expressions-data.js by tools/build-expressions.js. Do not edit by hand. -->");
  out.push("# French Everyday Expressions", "");
  out.push(data.intro + " " + data.respellingNote, "");
  out.push("## Pronunciation key", "");
  out = out.concat(G.KEY_MD);
  out.push("", G.TIPS, "");
  out.push("## Register", "");
  out.push(data.registerNote, "");
  out.push("## Contents", "");
  data.themes.forEach(function (t) {
    out.push(t.number + ". **" + t.title + "** (" + themeItems(data, t).length + "): *" + t.summary + "*");
  });
  out.push("", "---", "");
  data.themes.forEach(function (t) {
    out.push("## " + t.number + ". " + t.title, "");
    if (t.intro) out.push(t.intro, "");
    themeItems(data, t).forEach(function (e) {
      out.push("### " + e.fr + " · *" + REGISTER[e.register] + "*", "");
      out.push("**" + e.pron + "** — " + e.en, "");
      if (e.literal) out.push("*Literally:* " + e.literal, "");
      out.push("- Example: **" + e.example.fr + "** (" + e.example.pron + ") — *" + e.example.en + "*", "");
      if (e.note) out.push("> **Note:** " + e.note, "");
      var also = seeAlsoParts(e, data, verbsById, tableById);
      if (also.length) out.push("See also: " + also.map(function (p) { return p.fr ? "*" + p.text + "*" : p.text; }).join(" · ") + ".", "");
    });
  });
  out.push("---", "");
  out.push(G.LICENCE + ". Part of *Learn French for Beginners*.");
  return out.join("\n") + "\n";
}

/* ---------- print HTML ---------- */
var CSS = G.CSS + "\n" + [
  ".reg { font-size: 8pt; font-weight: 700; border: 1px solid #1f2430; border-radius: 6pt; padding: 0 4pt; vertical-align: 1pt; color: #1f2430; }",
  ".theme { margin-top: 16pt; } .theme.first { page-break-before: always; margin-top: 0; }",
  ".theme > .intro { break-after: avoid; page-break-after: avoid; }",
  ".expr { margin: 0 0 7pt; padding: 0 0 5pt; border-bottom: 1px solid #d9dee7; break-inside: avoid; page-break-inside: avoid; }",
  ".expr h3 { margin: 6pt 0 1pt; }",
  ".expr p { margin: 1pt 0; }",
  ".en { font-weight: 700; }",
  ".lit, .note { color: #444; }",
  ".lit { font-style: italic; }",
  ".ex b { font-weight: 700; }"
].join("\n");

function printHtml(data, verbsById, tableById, keyRows) {
  validate(data, verbsById, tableById);
  var esc = G.esc;
  var h = [];
  h.push("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>French Everyday Expressions</title><style>" + CSS + "</style></head><body>");
  h.push("<section class=\"title-page\"><p class=\"brand\">Learn French for Beginners</p><h1>French Everyday Expressions</h1>" +
    "<p class=\"sub\">" + data.expressions.length + " useful phrases for English speakers, A1–B1</p><p class=\"lic\">" + esc(G.LICENCE) + "</p></section>");
  h.push("<section class=\"page toc\"><h2>Contents</h2><p class=\"intro\">" + esc(data.intro) + "</p><ol>");
  data.themes.forEach(function (t) {
    h.push("<li><b>" + esc(t.title) + "</b> (" + themeItems(data, t).length + ")<br><span class=\"tl\" lang=\"fr\">" + esc(t.summary) + "</span></li>");
  });
  h.push("</ol></section>");
  h.push("<section class=\"key\"><h2>Pronunciation key</h2><table><thead><tr><th>Spelling</th><th>Sounds like</th></tr></thead><tbody>");
  // keyRows are VERB_DATA.pronunciationKey: generator-escaped HTML from the verb guide, inserted as is.
  keyRows.concat([G.LIAISON_HTML]).forEach(function (k) { h.push("<tr><td>" + k.spellingHtml + "</td><td>" + k.soundsLikeHtml + "</td></tr>"); });
  h.push("</tbody></table><p>" + esc(data.respellingNote) + " Final consonants are usually silent (<em>parlent</em> = \"parl\"). A hyphen joins syllables said as one word; a liaison consonant is written at the start of the next syllable (<em>les amis</em> = lay zah-mee).</p>");
  h.push("<h2>Register</h2><p>" + data.themes.length + " themes, each phrase marked " +
    "<span class=\"reg\">Formal</span>, <span class=\"reg\">Neutral</span> or <span class=\"reg\">Informal</span>.</p><p>" + esc(data.registerNote) + "</p></section>");
  data.themes.forEach(function (t, ti) {
    h.push("<section class=\"theme" + (ti === 0 ? " first" : "") + "\"><h2>" + t.number + ". " + esc(t.title) + "</h2>");
    if (t.intro) h.push("<p class=\"intro\">" + esc(t.intro) + "</p>");
    themeItems(data, t).forEach(function (e) {
      h.push("<div class=\"expr\"><h3><span lang=\"fr\">" + esc(e.fr) + "</span> <span class=\"reg\">" + esc(REGISTER[e.register]) + "</span></h3>");
      h.push("<p><span class=\"pron\">" + esc(e.pron) + "</span> — <span class=\"en\">" + esc(e.en) + "</span></p>");
      if (e.literal) h.push("<p class=\"lit\">Literally: " + esc(e.literal) + "</p>");
      h.push("<p class=\"ex\">Example: <b lang=\"fr\">" + esc(e.example.fr) + "</b> <span class=\"pron\">(" + esc(e.example.pron) + ")</span> — <i>" + esc(e.example.en) + "</i></p>");
      if (e.note) h.push("<p class=\"note\"><b>Note:</b> " + esc(e.note) + "</p>");
      var also = seeAlsoParts(e, data, verbsById, tableById);
      if (also.length) {
        h.push("<p class=\"also\">See also: " + also.map(function (p) {
          return p.fr ? "<span lang=\"fr\">" + esc(p.text) + "</span>" : esc(p.text);
        }).join(" · ") + ".</p>");
      }
      h.push("</div>");
    });
    h.push("</section>");
  });
  h.push("<p class=\"also\">" + esc(G.LICENCE) + ". Part of <i>Learn French for Beginners</i>.</p>");
  h.push("</body></html>");
  return h.join("\n") + "\n";
}

if (require.main === module) {
  var site = loadSite();
  var md = markdown(site.data, site.verbsById, site.tableById);
  var html = null;
  var i = process.argv.indexOf("--html");
  if (i !== -1 && process.argv[i + 1]) html = printHtml(site.data, site.verbsById, site.tableById, site.keyRows);
  var targets = [path.join(REPO, "french-expressions.md"), path.join(SITE, "reference", "french-expressions.md")];
  fs.mkdirSync(path.join(SITE, "reference"), { recursive: true });
  targets.forEach(function (f) { fs.writeFileSync(f, md); console.log("wrote " + path.relative(REPO, f)); });
  if (html) {
    fs.writeFileSync(path.resolve(process.argv[i + 1]), html);
    console.log("wrote print HTML");
  }
}

module.exports = { loadSite: loadSite, markdown: markdown, printHtml: printHtml };
