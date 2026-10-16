#!/usr/bin/env node
/* Builds the dialogues Markdown (and, with --html, a print HTML for the PDF) from
   verb-trainer/js/dialogues-data.js, the single source of the dialogues.
     node tools/build-dialogues.js                 writes french-dialogues.md and
                                                   verb-trainer/reference/french-dialogues.md
     node tools/build-dialogues.js --html out.html also writes the print HTML (print it to PDF
                                                   with headless Chrome --print-to-pdf)
   Shares the pronunciation key, licence line and print CSS with tools/build-grammar-tables.js.
   No dependencies. VT_DLG.validate runs with the full refs (verbs, expressions, grammar tables, voices)
   and any error throws before anything is written. The verb-trainer tests check that both .md files
   match markdown(). */
"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var G = require("./build-grammar-tables.js");
var REPO = path.join(__dirname, "..");
var SITE = path.join(REPO, "verb-trainer");
var SCRIPTS = ["data.js", "data-100.js", "verb-types.js", "reference-data.js", "merge-data.js", "expressions-data.js",
  "logic.js", "dialogues-data.js", "dialogues.js", "tts-manifest.js"];

/* The site data as the browser sees it (a vm sandbox, so it never depends on the caller's globals), plus the
   voice ids of every shipped js/tts-manifest-<id>.js. */
function loadSite() {
  var sb = { console: console };
  sb.window = sb;
  vm.createContext(sb);
  var extra = fs.readdirSync(path.join(SITE, "js")).filter(function (f) { return /^tts-manifest-[a-z0-9-]+\.js$/.test(f); }).sort();
  SCRIPTS.concat(extra).forEach(function (f) {
    var file = path.join(SITE, "js", f);
    vm.runInContext(fs.readFileSync(file, "utf8"), sb, { filename: file });
  });
  var verbsById = {};
  sb.VERB_DATA.verbs.forEach(function (v) { verbsById[v.id] = v; });
  var tableById = {};
  sb.VT_REFERENCE.categories.forEach(function (c) {
    c.tables.forEach(function (t) { tableById[t.id] = { categoryId: c.id, title: t.title }; });
  });
  var exprById = {};
  sb.VT_EXPRESSIONS.expressions.forEach(function (e) { exprById[e.id] = e; });
  var voiceIds = [sb.VT_TTS.defaultVoice].concat(Object.keys(sb.VT_TTS_VOICES || {}));
  return { data: sb.VT_DIALOGUES, DLG: sb.VT_DLG, L: sb.VT_LOGIC, keyRows: sb.VERB_DATA.pronunciationKey,
    refs: { verbsById: verbsById, exprById: exprById, tableById: tableById, voiceIds: voiceIds } };
}

function check(site) {
  var errs = site.DLG.validate(site.data, site.refs);
  if (errs.length) throw new Error("dialogues-data.js is invalid:\n" + errs.join("\n"));
}
function sorted(site, d) { return site.DLG.index(site.data).list; }
function speaker(d, id) { return d.speakers.filter(function (s) { return s.id === id; })[0]; }
/* "See" text: verb infinitive, expression French, table title; "–" for no link. */
function seeText(site, v) {
  if (!v.link) return { text: "–", fr: false };
  var r = site.refs;
  if (v.link.kind === "verb") return { text: r.verbsById[v.link.id].infinitive, fr: true };
  if (v.link.kind === "expression") return { text: r.exprById[v.link.id].fr, fr: true };
  return { text: "Grammar tables: " + r.tableById[v.link.id].title, fr: false };
}
/* Options a–d in a deterministic order: answer + distractors sorted by L.normalize. */
function options(site, q) {
  var L = site.L;
  return [q.answer].concat(q.distractors).slice().sort(function (a, b) {
    var x = L.normalize(a), y = L.normalize(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}
var LETTERS = ["a", "b", "c", "d"];
var LIAISON_LINE = "In the dialogues, **‿** marks a liaison inside a respelling (*vous avez* = voo‿zah-vay): the linked consonant starts the next word. It never appears in the French text.";

/* ---------- Markdown ---------- */
function markdown(site) {
  site = site || loadSite();
  check(site);
  var cell = G.cell;
  var D = site.data;
  var out = [];
  out.push("<!-- Generated from verb-trainer/js/dialogues-data.js by tools/build-dialogues.js. Do not edit by hand. -->");
  out.push("# French Dialogues", "");
  out.push(D.intro + " " + D.respellingNote, "");
  out.push("## Pronunciation key", "");
  out = out.concat(G.KEY_MD);
  out.push("", G.TIPS, "", LIAISON_LINE, "");
  out.push("---", "");
  var answers = [];
  sorted(site).forEach(function (d) {
    out.push("## " + d.number + ". " + d.title + " (" + d.titleFr + ") · " + d.level, "");
    out.push("*Scene:* " + d.scene, "");
    out.push("Speakers: " + d.speakers.map(function (s) { return "**" + s.name + "**, " + s.role; }).join(" · "), "");
    out.push("| Speaker | French | Pronunciation | English |");
    out.push("|---|---|---|---|");
    d.lines.forEach(function (l) {
      out.push("| " + cell(speaker(d, l.speaker).name) + " | " + cell(l.fr) + " | " + cell(l.pron) + " | " + cell(l.en) + " |");
    });
    out.push("", "### Key vocabulary", "");
    out.push("| French | Pronunciation | English | See |");
    out.push("|---|---|---|---|");
    d.vocab.forEach(function (v) {
      var s = seeText(site, v);
      out.push("| " + cell(v.fr) + " | " + cell(v.pron) + " | " + cell(v.en) + " | " + cell(s.fr ? "*" + s.text + "*" : s.text) + " |");
    });
    out.push("", "### Notice this: " + d.notice.title, "");
    out.push(d.notice.text, "");
    d.notice.examples.forEach(function (x) { out.push("- **" + x.fr + "** (" + x.pron + ") — *" + x.en + "*"); });
    if (d.notice.table) out.push("", "See the table: Grammar tables, " + site.refs.tableById[d.notice.table].title + ".");
    out.push("", "### Comprehension questions", "");
    d.questions.forEach(function (q, qi) {
      var opts = options(site, q);
      out.push((qi + 1) + ". " + q.prompt);
      opts.forEach(function (o, oi) { out.push("   " + LETTERS[oi] + ") " + o); });
      answers.push(d.number + "." + (qi + 1) + " " + LETTERS[opts.indexOf(q.answer)] + ") " + q.answer);
    });
    out.push("", "---", "");
  });
  out.push("## Answer key", "");
  answers.forEach(function (a) { out.push("- " + a); });
  out.push("", "---", "");
  out.push(G.LICENCE + ". Part of *Learn French for Beginners*.");
  return out.join("\n") + "\n";
}

/* ---------- print HTML ---------- */
var CSS = G.CSS + "\n" + [
  ".dia { margin-top: 0; } .dia + .dia { page-break-before: always; }",
  ".scene { margin: 0 0 4pt; } .cast { margin: 0 0 6pt; color: #444; }",
  "table.lines td { vertical-align: top; } table.lines tr { break-inside: avoid; page-break-inside: avoid; }",
  "table.lines td.who { width: 18%; font-weight: 700; white-space: nowrap; }",
  "table.lines .fr { font-weight: 700; } table.lines .en { color: #333; }",
  "table.lines tr.end td.who { color: #23408e; }",
  ".notice { border-left: 3px solid #23408e; padding: 2pt 0 2pt 8pt; margin: 6pt 0; break-inside: avoid; page-break-inside: avoid; }",
  ".notice p { margin: 1pt 0; }",
  "ol.qs { padding-left: 16pt; } ol.qs > li { margin: 0 0 4pt; break-inside: avoid; page-break-inside: avoid; }",
  "ol.qs ol { list-style: lower-alpha; padding-left: 16pt; margin: 1pt 0 0; }",
  ".answers { page-break-before: always; }"
].join("\n");

function printHtml(site) {
  site = site || loadSite();
  check(site);
  var esc = G.esc;
  var D = site.data;
  var list = sorted(site);
  var h = [];
  h.push("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>French Dialogues</title><style>" + CSS + "</style></head><body>");
  h.push("<section class=\"title-page\"><p class=\"brand\">Learn French for Beginners</p><h1>French Dialogues</h1>" +
    "<p class=\"sub\">" + list.length + (list.length === 1 ? " everyday conversation" : " everyday conversations") +
    " with pronunciation, vocabulary and questions</p><p class=\"lic\">" + esc(G.LICENCE) + "</p></section>");
  h.push("<section class=\"page key\"><h2>Pronunciation key</h2><p class=\"intro\">" + esc(D.intro) + "</p><table><thead><tr><th>Spelling</th><th>Sounds like</th></tr></thead><tbody>");
  // keyRows are VERB_DATA.pronunciationKey: generator-escaped HTML from the verb guide, inserted as is.
  site.keyRows.concat([G.LIAISON_HTML]).forEach(function (k) { h.push("<tr><td>" + k.spellingHtml + "</td><td>" + k.soundsLikeHtml + "</td></tr>"); });
  h.push("</tbody></table><p>" + esc(D.respellingNote) + "</p></section>");
  var answers = [];
  list.forEach(function (d) {
    h.push("<section class=\"dia\"><h2>" + d.number + ". " + esc(d.title) + " <span lang=\"fr\">(" + esc(d.titleFr) + ")</span> · " + esc(d.level) + "</h2>");
    h.push("<p class=\"scene\"><b>Scene:</b> " + esc(d.scene) + "</p>");
    h.push("<p class=\"cast\">" + d.speakers.map(function (s) { return "<b>" + esc(s.name) + "</b>, " + esc(s.role); }).join(" · ") + "</p>");
    h.push("<table class=\"lines\"><thead><tr><th>Speaker</th><th>Line</th></tr></thead><tbody>");
    d.lines.forEach(function (l) {
      var sp = speaker(d, l.speaker);
      h.push("<tr class=\"" + esc(sp.side) + "\"><td class=\"who\">" + esc(sp.name) + "</td><td><span class=\"fr\" lang=\"fr\">" + esc(l.fr) +
        "</span><br><span class=\"pron\">" + esc(l.pron) + "</span><br><span class=\"en\">" + esc(l.en) + "</span></td></tr>");
    });
    h.push("</tbody></table>");
    h.push("<h3>Key vocabulary</h3><table><thead><tr><th>French</th><th>Pronunciation</th><th>English</th><th>See</th></tr></thead><tbody>");
    d.vocab.forEach(function (v) {
      var s = seeText(site, v);
      h.push("<tr><td lang=\"fr\">" + esc(v.fr) + "</td><td class=\"pron\">" + esc(v.pron) + "</td><td>" + esc(v.en) + "</td><td" +
        (s.fr ? " lang=\"fr\"" : "") + ">" + esc(s.text) + "</td></tr>");
    });
    h.push("</tbody></table>");
    h.push("<div class=\"notice\"><h3>Notice this: " + esc(d.notice.title) + "</h3><p>" + esc(d.notice.text) + "</p><ul>");
    d.notice.examples.forEach(function (x) {
      h.push("<li><b lang=\"fr\">" + esc(x.fr) + "</b> <span class=\"pron\">(" + esc(x.pron) + ")</span> — <i>" + esc(x.en) + "</i></li>");
    });
    h.push("</ul>" + (d.notice.table ? "<p class=\"also\">See the table: Grammar tables, " + esc(site.refs.tableById[d.notice.table].title) + ".</p>" : "") + "</div>");
    h.push("<h3>Comprehension questions</h3><ol class=\"qs\">");
    d.questions.forEach(function (q, qi) {
      var opts = options(site, q);
      h.push("<li>" + esc(q.prompt) + "<ol>" + opts.map(function (o) { return "<li" + (q.lang === "fr" ? " lang=\"fr\"" : "") + ">" + esc(o) + "</li>"; }).join("") + "</ol></li>");
      answers.push(d.number + "." + (qi + 1) + " " + LETTERS[opts.indexOf(q.answer)] + ") " + q.answer);
    });
    h.push("</ol></section>");
  });
  h.push("<section class=\"answers\"><h2>Answer key</h2><ul>" + answers.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>");
  h.push("<p class=\"also\">" + esc(G.LICENCE) + ". Part of <i>Learn French for Beginners</i>.</p></section>");
  h.push("</body></html>");
  return h.join("\n") + "\n";
}

if (require.main === module) {
  var site = loadSite();
  var md = markdown(site);
  var html = null;
  var i = process.argv.indexOf("--html");
  if (i !== -1 && process.argv[i + 1]) html = printHtml(site);
  var targets = [path.join(REPO, "french-dialogues.md"), path.join(SITE, "reference", "french-dialogues.md")];
  fs.mkdirSync(path.join(SITE, "reference"), { recursive: true });
  targets.forEach(function (f) { fs.writeFileSync(f, md); console.log("wrote " + path.relative(REPO, f)); });
  if (html) {
    fs.writeFileSync(path.resolve(process.argv[i + 1]), html);
    console.log("wrote print HTML");
  }
}

module.exports = { loadSite: loadSite, markdown: markdown, printHtml: printHtml };
