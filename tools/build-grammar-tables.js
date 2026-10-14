#!/usr/bin/env node
/* Builds the grammar tables Markdown (and, with --html, a print HTML for the PDF) from
   verb-trainer/js/reference-data.js, the single source of the tables.
     node tools/build-grammar-tables.js                 writes french-grammar-tables.md and
                                                        verb-trainer/reference/french-grammar-tables.md
     node tools/build-grammar-tables.js --html out.html also writes the print HTML (print it to PDF
                                                        with headless Chrome --print-to-pdf)
   No dependencies. The verb-trainer tests check that both .md files match markdown(). */
"use strict";
var fs = require("fs");
var path = require("path");

var REPO = path.join(__dirname, "..");
var SITE = path.join(REPO, "verb-trainer");

/* Same key as the topic guides (topics/01-asking-questions.md), including the liaison row. */
var KEY_MD = [
  "| Spelling | Sounds like |",
  "|---|---|",
  "| **zh** | the \"s\" in *measure* (French **j** / soft **g**) |",
  "| **uh** | the \"a\" in *about* |",
  "| **ew** | French **u**: say \"ee\" with your lips rounded like \"oo\" |",
  "| **N** (capital) | nasal vowel: hum the vowel through your nose, don't say the \"n\" |",
  "| **ahN** | nasal *an / en* (as in *France*) |",
  "| **ohN** | nasal *on* (as in *bon*) |",
  "| **aN** | nasal *in / ain / ien* (as in *vin*) |",
  "| **uhN** | nasal *un* (as in *un*) |",
  "| **r** | French throaty \"r\", made at the back of the throat |",
  "| **‿** | liaison: the silent final consonant is pronounced at the start of the next word (*vous‿avez* = voo zah-vay) |"
];
var TIPS = "Tips: final consonants are usually silent (*parlent* = \"parl\"). A hyphen joins syllables said as one word; a liaison consonant is written at the start of the next syllable (*les amis* = lay zah-mee).";
var LICENCE = "© 2026 Avtar Singh, CC BY-SA 4.0";
var LIAISON_HTML = { spellingHtml: "<strong>‿</strong>", soundsLikeHtml: "liaison: the silent final consonant is pronounced at the start of the next word (<em>vous‿avez</em> = voo zah-vay)" };

function cell(s) { return String(s == null ? "" : s).replace(/\|/g, "\\|"); }

function linkText(l) { return l.label; }

/* ---------- Markdown ---------- */
function markdown(ref) {
  var out = [];
  out.push("<!-- Generated from verb-trainer/js/reference-data.js by tools/build-grammar-tables.js. Do not edit by hand. -->");
  out.push("# French Grammar Tables");
  out.push(ref.intro + " " + ref.respellingNote);
  out.push("## Pronunciation key");
  out = out.concat(KEY_MD);
  out.push("", TIPS); // blank line: a plain line right after a table would become a table row
  out.push("## Contents");
  ref.categories.forEach(function (c) {
    out.push(c.number + ". **" + c.title + "**: " + c.tables.map(function (t) { return t.title + (t.preview ? " (Preview)" : ""); }).join(" · "));
  });
  out.push("---");
  ref.categories.forEach(function (c) {
    out.push("## " + c.number + ". " + c.title);
    if (c.intro) out.push(c.intro);
    if (c.links && c.links.length) out.push("", "See also: " + c.links.map(linkText).join(" · ") + ".");
    c.tables.forEach(function (t) {
      out.push("### " + t.title + (t.preview ? " (Preview)" : ""));
      out.push("*When:* " + t.when);
      if (t.kind === "grid") {
        out.push("| Person | " + t.columns.map(function (col) { return cell(col.label); }).join(" | ") + " |");
        out.push("|---|" + t.columns.map(function () { return "---|"; }).join(""));
        t.rows.forEach(function (row) {
          out.push("| " + cell(row.head) + " | " + row.cells.map(function (x) { return cell(x.fr) + " (" + cell(x.pron) + ")"; }).join(" | ") + " |");
        });
      } else {
        var info = !!t.infoLabel;
        out.push("| French | Pronunciation | English |" + (info ? " " + cell(t.infoLabel) + " |" : ""));
        out.push("|---|---|---|" + (info ? "---|" : ""));
        t.rows.forEach(function (row) {
          out.push("| " + cell(row.fr) + " | " + cell(row.pron) + " | " + cell(row.en) + " |" + (info ? " " + cell(row.info) + " |" : ""));
        });
      }
      t.examples.forEach(function (e) { out.push("- **" + e.fr + "** (" + e.pron + ") — *" + e.en + "*"); });
      out.push("> **Watch out**");
      t.watchOut.forEach(function (w) {
        if (w.note) out.push("> - " + w.note);
        else out.push("> - ✗ *" + w.wrong + "* → ✓ **" + w.right + "**" + (w.pron ? " (" + w.pron + ")" : "") + (w.why ? " — " + w.why : ""));
      });
      // blank line: otherwise the line would continue the Watch out quote
      if (t.links && t.links.length) out.push("", "See also: " + t.links.map(linkText).join(" · ") + ".");
    });
  });
  out.push("---");
  out.push(LICENCE + ". Part of *Say it in French*.");
  return out.join("\n") + "\n";
}

/* ---------- print HTML ---------- */
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

var CSS = [
  "@page { size: Letter; margin: 14mm 14mm 16mm; @bottom-center { content: counter(page) \" / \" counter(pages); font: 9pt Times, serif; color: #555; } }",
  "body { font-family: \"Helvetica Neue\", Helvetica, Arial, sans-serif; font-size: 10pt; line-height: 1.35; color: #1f2430; margin: 0; }",
  "h1, h2 { color: #23408e; }",
  "h2 { font-size: 17pt; border-bottom: 1px solid #23408e; padding-bottom: 3pt; margin: 0 0 8pt; }",
  "h3 { font-size: 12pt; color: #1f2430; margin: 10pt 0 3pt; break-after: avoid; }",
  ".title-page { height: 230mm; display: flex; flex-direction: column; justify-content: center; text-align: center; page-break-after: always; }",
  ".title-page h1 { font-size: 34pt; margin: 0 0 10pt; }",
  ".title-page .sub { font-size: 14pt; margin: 0 0 30pt; }",
  ".title-page .brand { font-size: 12pt; font-weight: 700; color: #23408e; margin: 0 0 6pt; }",
  ".title-page .lic { font-size: 9.5pt; color: #555; }",
  ".page { page-break-after: always; }",
  ".cat { margin-top: 16pt; } .cat.first { page-break-before: always; margin-top: 0; }",
  "h2 { break-after: avoid; page-break-after: avoid; } .cat > .intro, .cat > .also { break-after: avoid; page-break-after: avoid; }",
  ".toc ol { padding-left: 18pt; } .toc li { margin: 0 0 6pt; } .toc .tl { color: #444; font-size: 9.5pt; }",
  ".card { margin: 0 0 10pt; } .card table, .card > ul, .watch { break-inside: avoid; page-break-inside: avoid; } .card h3, .when { break-after: avoid; page-break-after: avoid; }",
  ".when { margin: 0 0 4pt; } .when b { color: #23408e; }",
  ".preview { font-size: 8pt; font-weight: 700; border: 1px solid #1f2430; border-radius: 6pt; padding: 0 4pt; vertical-align: 2pt; }",
  "table { border-collapse: collapse; width: 100%; margin: 3pt 0 4pt; font-size: 9pt; }",
  "caption { text-align: left; font-size: 8.5pt; color: #555; padding-bottom: 2pt; }",
  "th, td { border: 1px solid #d9dee7; padding: 1.5pt 5pt; text-align: left; vertical-align: top; }",
  "thead th { background: #e8eef7; font-weight: 700; }",
  "tbody tr:nth-child(even) { background: #f7f9fc; }",
  "tbody th { font-weight: 700; }",
  "tr { break-inside: avoid; }",
  ".pron { font-style: italic; color: #555; }",
  "ul { margin: 2pt 0 4pt; padding-left: 14pt; } li { margin: 1pt 0; }",
  ".watch { border-left: 3px solid #a93a1f; padding: 2pt 0 2pt 8pt; margin: 4pt 0; }",
  ".watch p { margin: 0; font-weight: 700; }",
  ".wrong { text-decoration: line-through; }",
  ".also { font-size: 9pt; color: #444; margin: 2pt 0 0; }",
  ".intro { margin: 0 0 6pt; }",
  ".key td:first-child { white-space: nowrap; }"
].join("\n");

function printHtml(ref, keyRows) {
  var h = [];
  h.push("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>French Grammar Tables</title><style>" + CSS + "</style></head><body>");
  h.push("<section class=\"title-page\"><p class=\"brand\">Say it in French</p><h1>French Grammar Tables</h1>" +
    "<p class=\"sub\">Quick reference for English speakers, A1–B1</p><p class=\"lic\">" + esc(LICENCE) + "</p></section>");
  h.push("<section class=\"page toc\"><h2>Contents</h2><p class=\"intro\">" + esc(ref.intro) + "</p><ol>");
  ref.categories.forEach(function (c) {
    h.push("<li><b>" + esc(c.title) + "</b><br><span class=\"tl\">" +
      c.tables.map(function (t) { return esc(t.title) + (t.preview ? " (Preview)" : ""); }).join(" · ") + "</span></li>");
  });
  h.push("</ol></section>");
  h.push("<section class=\"key\"><h2>Pronunciation key</h2><table><thead><tr><th>Spelling</th><th>Sounds like</th></tr></thead><tbody>");
  // keyRows are VERB_DATA.pronunciationKey: generator-escaped HTML from the verb guide, inserted as is.
  keyRows.concat([LIAISON_HTML]).forEach(function (k) { h.push("<tr><td>" + k.spellingHtml + "</td><td>" + k.soundsLikeHtml + "</td></tr>"); });
  h.push("</tbody></table><p>" + esc(ref.respellingNote) + " Final consonants are usually silent (<em>parlent</em> = \"parl\"). A hyphen joins syllables said as one word; a liaison consonant is written at the start of the next syllable (<em>les amis</em> = lay zah-mee).</p></section>");
  ref.categories.forEach(function (c, ci) {
    h.push("<section class=\"cat" + (ci === 0 ? " first" : "") + "\"><h2>" + c.number + ". " + esc(c.title) + "</h2>");
    if (c.intro) h.push("<p class=\"intro\">" + esc(c.intro) + "</p>");
    if (c.links && c.links.length) h.push("<p class=\"also\">See also: " + c.links.map(function (l) { return esc(l.label); }).join(" · ") + ".</p>");
    c.tables.forEach(function (t) {
      h.push("<div class=\"card\"><h3>" + esc(t.title) + (t.preview ? " <span class=\"preview\">Preview</span>" : "") + "</h3>");
      h.push("<p class=\"when\"><b>When:</b> " + esc(t.when) + "</p>");
      h.push("<table><caption>" + esc(t.caption) + "</caption>");
      if (t.kind === "grid") {
        h.push("<thead><tr><th scope=\"col\">Person</th>" + t.columns.map(function (col) { return "<th scope=\"col\">" + esc(col.label) + "</th>"; }).join("") + "</tr></thead><tbody>");
        t.rows.forEach(function (row) {
          h.push("<tr><th scope=\"row\" lang=\"fr\">" + esc(row.head) + "</th>" + row.cells.map(function (x) {
            return "<td><span lang=\"fr\">" + esc(x.fr) + "</span><br><span class=\"pron\">" + esc(x.pron) + "</span></td>";
          }).join("") + "</tr>");
        });
      } else {
        var info = !!t.infoLabel;
        h.push("<thead><tr><th scope=\"col\">French</th><th scope=\"col\">Pronunciation</th><th scope=\"col\">English</th>" +
          (info ? "<th scope=\"col\">" + esc(t.infoLabel) + "</th>" : "") + "</tr></thead><tbody>");
        t.rows.forEach(function (row) {
          h.push("<tr><th scope=\"row\" lang=\"fr\">" + esc(row.fr) + "</th><td class=\"pron\">" + esc(row.pron) + "</td><td>" + esc(row.en) + "</td>" +
            (info ? "<td" + (t.infoLang && row.info ? " lang=\"fr\"" : "") + ">" + esc(row.info) + "</td>" : "") + "</tr>");
        });
      }
      h.push("</tbody></table><ul>");
      t.examples.forEach(function (e) {
        h.push("<li><b lang=\"fr\">" + esc(e.fr) + "</b> <span class=\"pron\">(" + esc(e.pron) + ")</span> — <i>" + esc(e.en) + "</i></li>");
      });
      h.push("</ul><div class=\"watch\"><p>Watch out</p><ul>");
      t.watchOut.forEach(function (w) {
        if (w.note) h.push("<li>" + esc(w.note) + "</li>");
        else h.push("<li>✗ <span class=\"wrong\" lang=\"fr\">" + esc(w.wrong) + "</span> → ✓ <b lang=\"fr\">" + esc(w.right) + "</b>" +
          (w.pron ? " <span class=\"pron\">(" + esc(w.pron) + ")</span>" : "") + (w.why ? " — " + esc(w.why) : "") + "</li>");
      });
      h.push("</ul></div>");
      if (t.links && t.links.length) h.push("<p class=\"also\">See also: " + t.links.map(function (l) { return esc(l.label); }).join(" · ") + ".</p>");
      h.push("</div>");
    });
    h.push("</section>");
  });
  h.push("</body></html>");
  return h.join("\n") + "\n";
}

function loadReference() {
  global.window = global.window || {};
  return require(path.join(SITE, "js", "reference-data.js"));
}

function loadKey() {
  global.window = global.window || {};
  require(path.join(SITE, "js", "data.js"));
  return global.window.VERB_DATA.pronunciationKey;
}

if (require.main === module) {
  var ref = loadReference();
  var md = markdown(ref);
  var targets = [path.join(REPO, "french-grammar-tables.md"), path.join(SITE, "reference", "french-grammar-tables.md")];
  fs.mkdirSync(path.join(SITE, "reference"), { recursive: true });
  targets.forEach(function (f) { fs.writeFileSync(f, md); console.log("wrote " + path.relative(REPO, f)); });
  var i = process.argv.indexOf("--html");
  if (i !== -1 && process.argv[i + 1]) {
    var out = path.resolve(process.argv[i + 1]);
    fs.writeFileSync(out, printHtml(ref, loadKey()));
    console.log("wrote print HTML");
  }
}

module.exports = {
  markdown: markdown, printHtml: printHtml,
  // shared with tools/build-expressions.js
  KEY_MD: KEY_MD, TIPS: TIPS, LICENCE: LICENCE, LIAISON_HTML: LIAISON_HTML, CSS: CSS, esc: esc, cell: cell
};
