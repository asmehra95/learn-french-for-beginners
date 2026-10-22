/* Story illustrations: images/story/*.webp, js/story-images.js (generated from tools/story-images/manifest.json)
   and their use in the episode pages, the series card, Home, Credits and the story PDF (node --test). */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var ROOT = path.join(__dirname, "..");
var REPO = path.join(ROOT, "..");
var ALL = require("../js/story-images.js");
var LYON = "la-lettre-de-lyon", CAFE = "le-cafe-des-questions";
var SI = ALL.series[LYON];
var SC = ALL.series[CAFE];
var MANIFEST = JSON.parse(fs.readFileSync(path.join(REPO, "tools", "story-images", "manifest.json"), "utf8"));
var MCAFE = JSON.parse(fs.readFileSync(path.join(REPO, "tools", "story-images", "manifest-cafe.json"), "utf8"));
var D = require("../js/dialogues-data.js");
var MAX_BYTES = 250 * 1024;
// Dialogues 41-60 whose chosen take passed image QA: 12 from the first run (reviews/image-selection.json) and
// 41, 43, 45, 51, 55, 60 from the regeneration (reviews/regen-selection.json). 54 and 58 were regenerated too, but
// their takes failed the site review (pseudo-lettering), so they have no picture.
var CAFE_PASSED = [41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 55, 56, 57, 59, 60];
var CAFE_REGEN = [41, 43, 45, 51, 54, 55, 58, 60];

function published(m) { return (m || MANIFEST).images.filter(function (i) { return i.published !== false; }); }
function webpSize(buf) {
  // RIFF....WEBP then VP8 (lossy), VP8L or VP8X; returns { w, h }.
  assert.equal(buf.slice(0, 4).toString("latin1"), "RIFF");
  assert.equal(buf.slice(8, 12).toString("latin1"), "WEBP");
  var kind = buf.slice(12, 16).toString("latin1");
  if (kind === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (kind === "VP8L") { var b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
  if (kind === "VP8X") return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
  throw new Error("unknown WebP chunk " + kind);
}

test("manifest: 21 entries (cover + 20 episodes), each with model, seed, prompt and alt", function () {
  assert.equal(MANIFEST.images.length, 21);
  assert.equal(MANIFEST.model, "stability.sd3-5-large-v1:0");
  var ids = MANIFEST.images.map(function (i) { return i.id; });
  assert.deepEqual(ids, ["cover"].concat(Array.from({ length: 20 }, function (_, k) { return "ep" + String(k + 1).padStart(2, "0"); })));
  MANIFEST.images.forEach(function (i) {
    assert.ok(Object.prototype.hasOwnProperty.call(MANIFEST.models, i.model), i.id + " model " + i.model);
    // A retouched take is read from <id>__s<seed>r.png and says what was changed.
    if (i.raw_suffix !== undefined) assert.ok(i.raw_suffix === "r" && i.retouch.length > 20, i.id + " retouch");
    assert.ok(Number.isInteger(i.seed) && i.seed > 0, i.id + " seed");
    assert.ok(i.prompt.length > 100 && i.negative_prompt.length > 20, i.id + " prompt");
    assert.ok(i.alt.length > 20 && i.alt.length < 200, i.id + " alt");
    assert.ok(Number.isInteger(i.attempts) && i.attempts >= 1, i.id + " attempts");
  });
  // Every image is published, episode 8 included (M. Brun alone, SD3.5 Large, seed 5708).
  assert.deepEqual(MANIFEST.images.filter(function (i) { return i.published === false; }), []);
  assert.deepEqual(MANIFEST.images[0].people, ["maya"], "only Maya is on the cover");
  var byId = {};
  MANIFEST.images.forEach(function (i) { byId[i.id] = i; });
  assert.equal(byId.ep20.model, "stability.stable-image-ultra-v1:1");
  assert.equal(byId.ep08.model, "stability.sd3-5-large-v1:0");
  assert.equal(byId.ep08.seed, 5708);
  assert.deepEqual(byId.ep08.people, ["brun"], "episode 8 shows M. Brun alone");
  assert.doesNotMatch(byId.ep08.alt, /Maya/, "ep08 alt describes only what is painted");
  assert.match(byId.ep16.alt, /back/, "ep16 alt describes the back of the photo that is painted");
});

test("every published image exists as a WebP at its manifest size, under the size cap, with no metadata", function () {
  var files = fs.readdirSync(path.join(ROOT, "images", "story")).sort();
  var both = published().concat(published(MCAFE));
  assert.deepEqual(files, both.map(function (i) { return i.file; }).sort(), "exactly the published files of both series");
  both.forEach(function (i) {
    var buf = fs.readFileSync(path.join(ROOT, "images", "story", i.file));
    assert.ok(buf.length > 20 * 1024 && buf.length <= MAX_BYTES, i.file + " " + buf.length + " bytes");
    assert.deepEqual(webpSize(buf), { w: i.width, h: i.height }, i.file);
    var s = buf.toString("latin1");
    ["EXIF", "Exif", "XMP ", "ICCP", "prompt", "stability", "parameters", "Bedrock", "Qwen", "seed"].forEach(function (k) {
      assert.equal(s.indexOf(k), -1, i.file + " contains " + k);
    });
  });
});

test("story-images.js matches the manifest: cover + one entry per published episode", function () {
  assert.deepEqual(Object.keys(ALL), ["series"]);
  assert.deepEqual(Object.keys(ALL.series), [LYON, CAFE]);
  assert.match(SI.credit, /Stable Diffusion 3\.5 Large and Stable Image Ultra/);
  assert.match(SI.credit, /Not covered by the CC BY-SA/);
  var cover = MANIFEST.images[0];
  assert.deepEqual(SI.cover, { src: "images/story/cover.webp", width: cover.width, height: cover.height, alt: cover.alt });
  var eps = published().filter(function (i) { return i.id !== "cover"; });
  assert.deepEqual(Object.keys(SI.episodes).sort(function (a, b) { return a - b; }), eps.map(function (i) { return String(i.episode); }));
  eps.forEach(function (i) {
    assert.deepEqual(SI.episodes[String(i.episode)], { src: "images/story/" + i.file, width: i.width, height: i.height, alt: i.alt });
  });
  assert.equal(Object.keys(SI.episodes).length, 20, "all 20 episodes have a picture");
  assert.equal(SI.episodes["8"].src, "images/story/ep08.webp");
  var story = D.dialogues.filter(function (d) { return d.series === LYON; }).map(function (d) { return d.episode; });
  Object.keys(SI.episodes).forEach(function (n) { assert.ok(story.indexOf(Number(n)) !== -1, "episode " + n + " exists"); });
});

test("index.html loads story-images.js (versioned) before the views", function () {
  var html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  var a = html.indexOf('<script src="js/story-images.js?v=__BUILD__"></script>');
  assert.ok(a !== -1 && a < html.indexOf('<script src="js/views-dialogues.js?v=__BUILD__"></script>'));
  assert.ok(a < html.indexOf('<script src="js/views-home.js?v=__BUILD__"></script>'));
});

test("views: header picture has alt + width/height; thumbnails and the Home cover are decorative (alt \"\")", function () {
  var v = fs.readFileSync(path.join(ROOT, "js", "views-dialogues.js"), "utf8");
  assert.match(v, /el\("img", \{ className: cls, src: rec\.src, width: String\(rec\.width\), height: String\(rec\.height\), alt: alt/);
  assert.match(v, /imgNode\(storyImage\(d\), "dia-illus-img", storyImage\(d\)\.alt, false\)/);
  assert.match(v, /imgNode\(pic, "dia-episode-thumb", "", true\)/);
  assert.match(v, /imgNode\(cover, "dia-series-cover", cover\.alt, true\)/);
  var h = fs.readFileSync(path.join(ROOT, "js", "views-home.js"), "utf8");
  assert.match(h, /className: "dia-home-cover", src: cov\.src, width: String\(cov\.width\), height: String\(cov\.height\), alt: ""/);
  var a = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
  assert.match(a, /Illustrations \(La Lettre de Lyon\)/);
  assert.match(a, /not covered by the CC BY-SA licence/);
});

test("the story PDF embeds the pictures and the credit, and the licence file has a separate Illustrations section", function () {
  var B = require(path.join(REPO, "tools", "build-story.js"));
  var html = B.printHtml();
  assert.equal((html.match(/<img class="ep-img" src="data:image\//g) || []).length, Object.keys(SI.episodes).length);
  assert.equal((html.match(/<img class="cover" src="data:image\//g) || []).length, 1);
  assert.ok(html.indexOf(SI.credit) !== -1 || html.indexOf(SI.credit.replace(/'/g, "&#39;")) !== -1);
  assert.ok(!/src="(?!data:)/.test(html), "no file paths in the print HTML");
  var pdf = fs.readFileSync(path.join(ROOT, "reference", "la-lettre-de-lyon.pdf"));
  assert.ok(pdf.length < 15 * 1024 * 1024, "PDF under 15 MB");
  assert.ok((pdf.toString("latin1").match(/\/Subtype\s*\/Image/g) || []).length >= Object.keys(SI.episodes).length + 1, "images in the PDF");
  var lic = fs.readFileSync(path.join(REPO, "LICENSE-CONTENT.md"), "utf8");
  assert.match(lic, /## Illustrations — separate terms/);
  assert.match(lic, /aws\.amazon\.com\/legal\/bedrock\/third-party-models/);
  assert.match(lic, /Stable Image Ultra/);
  assert.match(lic, /Episode 8 shows M\. Brun alone/);
  assert.match(lic, /GitHub Pages/);
  assert.match(lic, /\*In plain language\*|\*\*In plain language\*\*/);
});

/* ---------- Le Café des Questions (dialogues 41-60): Qwen-Image-Edit-2511, tools/story-images/manifest-cafe.json ---------- */
test("café manifest: 20 entries (cafe-ep01..20, dialogues 41-60) with model, revision, seed, prompt, refs and alt; only QA-passed takes published", function () {
  assert.equal(MCAFE.series, CAFE);
  assert.equal(MCAFE.model, "Qwen/Qwen-Image-Edit-2511");
  assert.equal(MCAFE.license, "Apache-2.0");
  assert.match(MCAFE.revision, /^[0-9a-f]{40}$/);
  assert.deepEqual(MCAFE.images.map(function (i) { return i.id; }), Array.from({ length: 20 }, function (_, k) { return "cafe-ep" + String(k + 1).padStart(2, "0"); }));
  MCAFE.images.forEach(function (i, k) {
    assert.equal(i.episode, k + 1);
    assert.equal(i.number, 41 + k);
    assert.equal(i.file, i.id + ".webp");
    assert.equal(i.model, MCAFE.model);
    assert.equal(i.revision, MCAFE.revision);
    assert.ok(Object.prototype.hasOwnProperty.call(MCAFE.models, i.model), i.id + " model");
    assert.ok(Number.isInteger(i.seed) && i.seed > 0, i.id + " seed");
    assert.ok(i.prompt.length > 100 && i.negative_prompt.length > 20, i.id + " prompt");
    assert.ok(i.refs.length >= 1 && i.refs.every(function (r) { return /^[0-9a-f]{64}$/.test(r.sha256); }), i.id + " refs");
    assert.ok(i.alt.length > 20 && i.alt.length < 200, i.id + " alt");
    assert.ok(Number.isInteger(i.attempts) && i.attempts >= 1, i.id + " attempts");
    assert.deepEqual([i.width, i.height], [1200, 686]);
    if (i.published === false) assert.ok(/no take passed QA/.test(i.note), i.id + " says why it is not published");
    else assert.ok(/^(pass|PASS|PASS-notes)$/.test(i.qa) && i.accepted === true, i.id + " passed QA");
  });
  assert.deepEqual(published(MCAFE).map(function (i) { return i.number; }), CAFE_PASSED);
  // the regenerated episodes come from the regen batches; episode 20 is a multi-image edit (3 refs)
  CAFE_REGEN.forEach(function (n) { assert.match(MCAFE.images[n - 41].batch, /^cafe-regen/, n + " batch"); });
  assert.equal(MCAFE.images[19].mode, "multi-image-edit");
  assert.equal(MCAFE.images[19].refs.length, 3);
});

test("café: every dialogue 41-60 with a QA-passed take maps to an existing image with English alt text; the others have none", function () {
  for (var n = 41; n <= 60; n++) {
    var d = D.dialogues.filter(function (x) { return x.number === n; })[0];
    assert.ok(d, "dialogue " + n);
    assert.equal(d.series, CAFE);
    assert.equal(d.episode, n - 40);
    var rec = SC.episodes[String(d.episode)];
    if (CAFE_PASSED.indexOf(n) === -1) { assert.equal(rec, undefined, "dialogue " + n + " has no placeholder"); continue; }
    assert.ok(rec, "dialogue " + n + " has a picture");
    var m = MCAFE.images[n - 41];
    assert.deepEqual(rec, { src: "images/story/" + m.file, width: 1200, height: 686, alt: m.alt });
    var buf = fs.readFileSync(path.join(ROOT, rec.src));
    assert.deepEqual(webpSize(buf), { w: 1200, h: 686 }, rec.src);
    assert.ok(buf.length > 20 * 1024 && buf.length <= 180 * 1024, rec.src + " " + buf.length + " bytes");
    assert.ok(rec.alt.trim().length > 20 && rec.alt.length < 200, rec.src + " alt");
    assert.match(rec.alt, /\b(the|a|an|at|with|while|his|her)\b/, "alt is English: " + rec.alt);
    assert.match(rec.alt, /[.]$/);
  }
  assert.equal(Object.keys(SC.episodes).length, CAFE_PASSED.length);
  assert.equal(SC.cover, null, "the café has no cover picture");
});

test("café credits: story-images.js, Credits page, LICENSE-CONTENT.md and both READMEs name Qwen-Image-Edit-2511 (Apache-2.0) on the author's own AWS GPU", function () {
  assert.equal(SC.credit, "Illustrations: AI-generated with Qwen-Image-Edit-2511 (Apache-2.0), run on the author's own AWS GPU; character designs by the project author. Not covered by the CC BY-SA licence of the text.");
  var a = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
  assert.match(a, /Illustrations \(Le Café des Questions\)/);
  assert.match(a, /huggingface\.co\/Qwen\/Qwen-Image-Edit-2511/);
  assert.match(a, /Apache License 2\.0/);
  assert.match(a, /run on the author's own AWS GPU/);
  assert.match(a, /tools\/story-images\/manifest-cafe\.json/);
  assert.match(a, /SIS\["la-lettre-de-lyon"\]/);
  assert.match(a, /SIS\["le-cafe-des-questions"\]/);
  var lic = fs.readFileSync(path.join(REPO, "LICENSE-CONTENT.md"), "utf8");
  assert.match(lic, /### Le Café des Questions/);
  assert.match(lic, /Qwen-Image-Edit-2511/);
  assert.match(lic, /Apache License 2\.0/);
  assert.match(lic, /own AWS GPU/);
  assert.match(lic, /manifest-cafe\.json/);
  [path.join(REPO, "README.md"), path.join(ROOT, "README.md")].forEach(function (p) {
    var t = fs.readFileSync(p, "utf8");
    assert.match(t, /Qwen-Image-Edit-2511 \(Apache-2\.0\)/, p);
    assert.match(t, /own AWS GPU/, p);
  });
});

test("café: views read story-images.js by series id, and the café PDF embeds its pictures and credit", function () {
  var v = fs.readFileSync(path.join(ROOT, "js", "views-dialogues.js"), "utf8");
  assert.match(v, /function storySet\(id\)/);
  assert.match(v, /S\.series\[id\]/);
  var B = require(path.join(REPO, "tools", "build-story.js"));
  var html = B.printHtml(undefined, CAFE);
  assert.equal((html.match(/<img class="ep-img" src="data:image\//g) || []).length, CAFE_PASSED.length);
  assert.equal((html.match(/<img class="cover"/g) || []).length, 0);
  assert.ok(html.indexOf(SC.credit.replace(/'/g, "&#39;")) !== -1 || html.indexOf(SC.credit) !== -1, "credit on the title page");
  var pdf = fs.readFileSync(path.join(ROOT, "reference", "le-cafe-des-questions.pdf"));
  assert.ok(pdf.length < 15 * 1024 * 1024, "PDF under 15 MB");
  assert.ok((pdf.toString("latin1").match(/\/Subtype\s*\/Image/g) || []).length >= CAFE_PASSED.length, "images in the café PDF");
});
