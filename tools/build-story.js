#!/usr/bin/env node
/* Builds the story printable, La Lettre de Lyon, as Markdown (and, with --html, a print HTML for the PDF)
   from the story records in verb-trainer/js/dialogues-data.js (the records with series "la-lettre-de-lyon").
     node tools/build-story.js                 writes la-lettre-de-lyon.md and
                                               verb-trainer/reference/la-lettre-de-lyon.md (identical)
     node tools/build-story.js --html out.html also writes the print HTML (print it to PDF with headless
                                               Chrome --print-to-pdf, then strip the PDF metadata)
   A lighter layout than tools/build-dialogues.js: each line shows the speaker, the French and the English;
   respellings appear only in each episode's word list; questions and the answer key are in an appendix.
   Reuses loadSite() from build-dialogues.js and the key, licence, CSS and escaping of build-grammar-tables.js.
   No dependencies. VT_DLG.validate runs with the full refs and any error throws before anything is written.
   The verb-trainer tests check that both .md files match markdown(). */
"use strict";
var fs = require("fs");
var path = require("path");
var B = require("./build-dialogues.js");
var G = require("./build-grammar-tables.js");
var REPO = path.join(__dirname, "..");
var SITE = path.join(REPO, "verb-trainer");
var SERIES = "la-lettre-de-lyon";
var LETTERS = ["a", "b", "c", "d"];

function check(site) {
  var errs = site.DLG.validate(site.data, site.refs);
  if (errs.length) throw new Error("dialogues-data.js is invalid:\n" + errs.join("\n"));
  if (!site.DLG.seriesById(site.data, SERIES) || !site.DLG.episodes(site.data, SERIES).length) throw new Error("no " + SERIES + " episodes");
}
function story(site) {
  var ser = site.DLG.seriesById(site.data, SERIES);
  var eps = site.DLG.episodes(site.data, SERIES);
  return { ser: ser, eps: eps, acts: ser.acts.map(function (a) {
    return { act: a, eps: eps.filter(function (d) { return d.act === a.number; }) };
  }).filter(function (g) { return g.eps.length; }) };
}
function speaker(d, id) { return d.speakers.filter(function (s) { return s.id === id; })[0]; }
/* The people: every speaker id once, with the role of their first episode and the episodes they speak in. */
function cast(eps) {
  var order = [], by = {};
  eps.forEach(function (d) {
    d.speakers.forEach(function (s) {
      if (!by[s.id]) { by[s.id] = { name: s.name, role: s.role, eps: [] }; order.push(s.id); }
      by[s.id].eps.push(d.episode);
    });
  });
  return order.map(function (id) { return by[id]; });
}
function epList(ns) { return (ns.length === 1 ? "episode " : "episodes ") + ns.join(", "); }
function seeTable(site, d) { return d.notice.table ? "See the table: Grammar tables, " + endStop(site.refs.tableById[d.notice.table].title) : ""; }
function endStop(t) { return /[.?!…]$/.test(t) ? t : t + "."; }
/* Options a–d in a deterministic order (the same rule as build-dialogues.js). */
function options(site, q) {
  var L = site.L;
  return [q.answer].concat(q.distractors).slice().sort(function (a, b) {
    var x = L.normalize(a), y = L.normalize(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}
function actHeading(a) { return "Act " + a.number + " · " + a.titleFr + " (" + a.title + ")"; }
function epHeading(d) { return "Episode " + d.episode + " · " + d.titleFr + " (" + d.title + ")"; }
/* GitHub's heading anchor: lowercase, drop everything but letters, digits, spaces, "-" and "_", spaces to "-". */
function slug(text) { return text.toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, "").replace(/ /g, "-"); }
var HOW_TO_READ = "Each line gives the speaker and the French, then the English in italics. The respellings (English-style pronunciation, not IPA) are only in the word list at the end of each episode; **‿** marks a liaison there (*vous avez* = voo‿zah-vay). The questions for every episode and the answer key are at the end.";

/* ---------- Markdown ---------- */
function markdown(site) {
  site = site || B.loadSite();
  check(site);
  var S = story(site);
  var out = [];
  out.push("<!-- Generated from verb-trainer/js/dialogues-data.js by tools/build-story.js. Do not edit by hand. -->");
  out.push("# " + S.ser.titleFr, "", "*" + S.ser.title + "*", "");
  out.push(S.ser.summary + " " + S.ser.intro, "");
  out.push("## How to read", "", HOW_TO_READ, "");
  out.push("### Pronunciation key", "");
  out = out.concat(G.KEY_MD);
  out.push("", G.TIPS, "");
  out.push("## The people", "");
  cast(S.eps).forEach(function (c) { out.push("- **" + c.name + "**, " + c.role + " (" + epList(c.eps) + ")"); });
  out.push("", "## Contents", "");
  S.acts.forEach(function (g) {
    out.push("### Act " + g.act.number + " · " + g.act.titleFr + " (" + g.act.title + ") · " + g.act.level, "");
    g.eps.forEach(function (d) { out.push("- [" + epHeading(d) + "](#" + slug(epHeading(d)) + ")"); });
    out.push("");
  });
  out.push("---", "");
  S.acts.forEach(function (g) {
    out.push("## " + actHeading(g.act), "", "*Level " + g.act.level + "*", "");
    g.eps.forEach(function (d) {
      out.push("### " + epHeading(d), "");
      out.push("*" + d.scene + "*", "");
      d.lines.forEach(function (l) {
        out.push("**" + speaker(d, l.speaker).name + ":** " + l.fr, "> *" + l.en + "*", "");
      });
      out.push("#### Words from this episode", "");
      d.vocab.forEach(function (v) { out.push("- **" + v.fr + "** (" + v.pron + ") — " + v.en); });
      out.push("", "#### Notice: " + d.notice.title, "");
      out.push(d.notice.text + (d.notice.table ? " " + seeTable(site, d) : ""), "");
      out.push("---", "");
    });
  });
  out.push("## Questions", "");
  var answers = [];
  S.eps.forEach(function (d) {
    out.push("### Questions for episode " + d.episode + " · " + d.titleFr, "");
    d.questions.forEach(function (q, qi) {
      var opts = options(site, q);
      out.push((qi + 1) + ". " + q.prompt);
      opts.forEach(function (o, oi) { out.push("   " + LETTERS[oi] + ") " + o); });
      answers.push(d.episode + "." + (qi + 1) + " " + LETTERS[opts.indexOf(q.answer)] + ") " + q.answer);
    });
    out.push("");
  });
  out.push("## Answer key", "");
  answers.forEach(function (a) { out.push("- " + a); });
  out.push("", "---", "");
  out.push(G.LICENCE + ". Part of *Learn French for Beginners*.");
  return out.join("\n") + "\n";
}

/* ---------- print HTML ---------- */
var CSS = G.CSS + "\n" + [
  ".front h2 { margin-top: 10pt; } .front .cast { list-style: none; padding-left: 0; } .front .cast li { margin: 0 0 2pt; }",
  ".toc { page-break-before: always; } .toc h3 { margin: 8pt 0 2pt; } .toc ul { list-style: none; padding-left: 0; margin: 0; }",
  ".toc li { margin: 1pt 0; } .toc a { color: inherit; text-decoration: none; }",
  ".act { page-break-before: always; } .act > h2 { margin-bottom: 2pt; } .act > .lvl { margin: 0 0 8pt; color: #555; }",
  ".ep + .ep { page-break-before: always; }",
  ".ep h3 { font-size: 14pt; color: #23408e; margin: 6pt 0 4pt; }",
  ".scene { font-style: italic; margin: 0 0 8pt; }",
  "p.ln { margin: 0 0 5pt; break-inside: avoid; page-break-inside: avoid; } p.ln b { color: #23408e; } p.ln i { color: #333; }",
  ".box { border: 1px solid #d9dee7; border-left: 3px solid #23408e; padding: 4pt 8pt; margin: 8pt 0 0; font-size: 9pt; break-inside: avoid; page-break-inside: avoid; }",
  ".box h4 { font-size: 10pt; margin: 2pt 0; } .box ul { margin: 1pt 0 4pt; } .box p { margin: 1pt 0 3pt; }",
  ".qs-page { page-break-before: always; } .qs-page h3 { margin: 8pt 0 2pt; }",
  "ol.qs { padding-left: 16pt; margin: 0; } ol.qs > li { margin: 0 0 4pt; break-inside: avoid; page-break-inside: avoid; }",
  "ol.qs ol { list-style: lower-alpha; padding-left: 16pt; margin: 1pt 0 0; }",
  ".answers { page-break-before: always; } .answers ul { columns: 2; list-style: none; padding-left: 0; }"
].join("\n");

function printHtml(site) {
  site = site || B.loadSite();
  check(site);
  var esc = G.esc;
  var S = story(site);
  var h = [];
  h.push("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>" + esc(S.ser.titleFr) + "</title><style>" + CSS + "</style></head><body>");
  h.push("<section class=\"title-page\"><p class=\"brand\">Learn French for Beginners</p><h1 lang=\"fr\">" + esc(S.ser.titleFr) + "</h1>" +
    "<p class=\"sub\">A story in " + S.eps.length + " episodes · A2–B1</p><p class=\"lic\">" + esc(G.LICENCE) + "</p></section>");
  h.push("<section class=\"front\"><h2>" + esc(S.ser.title) + "</h2><p class=\"intro\">" + esc(S.ser.summary + " " + S.ser.intro) + "</p>");
  h.push("<h2>How to read</h2><p>Each line gives the speaker and the French, then the English in italics. The respellings (English-style pronunciation, not IPA) are only in the word list at the end of each episode; <b>‿</b> marks a liaison there (<em>vous avez</em> = voo‿zah-vay). The questions for every episode and the answer key are at the end.</p>");
  h.push("<table class=\"key\"><thead><tr><th>Spelling</th><th>Sounds like</th></tr></thead><tbody>");
  // keyRows are VERB_DATA.pronunciationKey: generator-escaped HTML from the verb guide, inserted as is.
  site.keyRows.concat([G.LIAISON_HTML]).forEach(function (k) { h.push("<tr><td>" + k.spellingHtml + "</td><td>" + k.soundsLikeHtml + "</td></tr>"); });
  h.push("</tbody></table>");
  h.push("<h2>The people</h2><ul class=\"cast\">" + cast(S.eps).map(function (c) {
    return "<li><b>" + esc(c.name) + "</b>, " + esc(c.role) + " (" + esc(epList(c.eps)) + ")</li>";
  }).join("") + "</ul></section>");
  h.push("<nav class=\"toc\" aria-labelledby=\"toc-h\"><h2 id=\"toc-h\">Contents</h2>");
  S.acts.forEach(function (g) {
    h.push("<h3>Act " + g.act.number + " · <span lang=\"fr\">" + esc(g.act.titleFr) + "</span> (" + esc(g.act.title) + ") · " + esc(g.act.level) + "</h3><ul>" +
      g.eps.map(function (d) {
        return "<li><a href=\"#e-" + esc(d.id) + "\">Episode " + d.episode + " · <span lang=\"fr\">" + esc(d.titleFr) + "</span> (" + esc(d.title) + ")</a></li>";
      }).join("") + "</ul>");
  });
  h.push("</nav>");
  S.acts.forEach(function (g) {
    h.push("<section class=\"act\"><h2>Act " + g.act.number + " · <span lang=\"fr\">" + esc(g.act.titleFr) + "</span> (" + esc(g.act.title) + ")</h2>" +
      "<p class=\"lvl\">Level " + esc(g.act.level) + "</p>");
    g.eps.forEach(function (d) {
      h.push("<section class=\"ep\" id=\"e-" + esc(d.id) + "\"><h3>Episode " + d.episode + " · <span lang=\"fr\">" + esc(d.titleFr) + "</span> (" + esc(d.title) + ")</h3>");
      h.push("<p class=\"scene\">" + esc(d.scene) + "</p>");
      d.lines.forEach(function (l) {
        h.push("<p class=\"ln\"><b>" + esc(speaker(d, l.speaker).name) + "</b> <span lang=\"fr\">" + esc(l.fr) + "</span><br><i>" + esc(l.en) + "</i></p>");
      });
      h.push("<div class=\"box\"><h4>Words from this episode</h4><ul>" + d.vocab.map(function (v) {
        return "<li><b lang=\"fr\">" + esc(v.fr) + "</b> <span class=\"pron\">(" + esc(v.pron) + ")</span> — " + esc(v.en) + "</li>";
      }).join("") + "</ul>");
      h.push("<h4>Notice: " + esc(d.notice.title) + "</h4><p>" + esc(d.notice.text) + "</p>" +
        (d.notice.table ? "<p class=\"also\">" + esc(seeTable(site, d)) + "</p>" : "") + "</div></section>");
    });
    h.push("</section>");
  });
  var answers = [];
  h.push("<section class=\"qs-page\"><h2>Questions</h2>");
  S.eps.forEach(function (d) {
    h.push("<h3>Episode " + d.episode + " · <span lang=\"fr\">" + esc(d.titleFr) + "</span></h3><ol class=\"qs\">");
    d.questions.forEach(function (q, qi) {
      var opts = options(site, q);
      h.push("<li>" + esc(q.prompt) + "<ol>" + opts.map(function (o) { return "<li" + (q.lang === "fr" ? " lang=\"fr\"" : "") + ">" + esc(o) + "</li>"; }).join("") + "</ol></li>");
      answers.push(d.episode + "." + (qi + 1) + " " + LETTERS[opts.indexOf(q.answer)] + ") " + q.answer);
    });
    h.push("</ol>");
  });
  h.push("</section>");
  h.push("<section class=\"answers\"><h2>Answer key</h2><ul>" + answers.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>");
  h.push("<p class=\"also\">" + esc(G.LICENCE) + ". Part of <i>Learn French for Beginners</i>.</p></section>");
  h.push("</body></html>");
  return h.join("\n") + "\n";
}

if (require.main === module) {
  var site = B.loadSite();
  var md = markdown(site);
  var html = null;
  var i = process.argv.indexOf("--html");
  if (i !== -1 && process.argv[i + 1]) html = printHtml(site);
  var targets = [path.join(REPO, "la-lettre-de-lyon.md"), path.join(SITE, "reference", "la-lettre-de-lyon.md")];
  fs.mkdirSync(path.join(SITE, "reference"), { recursive: true });
  targets.forEach(function (f) { fs.writeFileSync(f, md); console.log("wrote " + path.relative(REPO, f)); });
  if (html) {
    fs.writeFileSync(path.resolve(process.argv[i + 1]), html);
    console.log("wrote print HTML");
  }
}

module.exports = { markdown: markdown, printHtml: printHtml };
