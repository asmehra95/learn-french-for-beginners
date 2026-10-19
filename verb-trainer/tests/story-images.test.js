/* Story illustrations: images/story/*.webp, js/story-images.js (generated from tools/story-images/manifest.json)
   and their use in the episode pages, the series card, Home, Credits and the story PDF (node --test). */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var ROOT = path.join(__dirname, "..");
var REPO = path.join(ROOT, "..");
var SI = require("../js/story-images.js");
var MANIFEST = JSON.parse(fs.readFileSync(path.join(REPO, "tools", "story-images", "manifest.json"), "utf8"));
var D = require("../js/dialogues-data.js");
var MAX_BYTES = 250 * 1024;

function published() { return MANIFEST.images.filter(function (i) { return i.published !== false; }); }
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
    assert.equal(i.model, MANIFEST.model, i.id);
    assert.ok(Number.isInteger(i.seed) && i.seed > 0, i.id + " seed");
    assert.ok(i.prompt.length > 100 && i.negative_prompt.length > 20, i.id + " prompt");
    assert.ok(i.alt.length > 20 && i.alt.length < 200, i.id + " alt");
    assert.ok(Number.isInteger(i.attempts) && i.attempts >= 1, i.id + " attempts");
  });
  // Episode 8 is the only image without a usable take.
  assert.deepEqual(MANIFEST.images.filter(function (i) { return i.published === false; }).map(function (i) { return i.id; }), ["ep08"]);
});

test("every published image exists as a WebP at its manifest size, under the size cap, with no metadata", function () {
  var files = fs.readdirSync(path.join(ROOT, "images", "story")).sort();
  assert.deepEqual(files, published().map(function (i) { return i.file; }).sort(), "exactly the published files");
  published().forEach(function (i) {
    var buf = fs.readFileSync(path.join(ROOT, "images", "story", i.file));
    assert.ok(buf.length > 20 * 1024 && buf.length <= MAX_BYTES, i.file + " " + buf.length + " bytes");
    assert.deepEqual(webpSize(buf), { w: i.width, h: i.height }, i.file);
    var s = buf.toString("latin1");
    ["EXIF", "Exif", "XMP ", "ICCP", "prompt", "stability", "parameters", "Bedrock"].forEach(function (k) {
      assert.equal(s.indexOf(k), -1, i.file + " contains " + k);
    });
  });
});

test("story-images.js matches the manifest: cover + one entry per published episode", function () {
  assert.equal(SI.series, "la-lettre-de-lyon");
  assert.match(SI.credit, /Stable Diffusion 3\.5 Large/);
  assert.match(SI.credit, /Not covered by the CC BY-SA/);
  var cover = MANIFEST.images[0];
  assert.deepEqual(SI.cover, { src: "images/story/cover.webp", width: cover.width, height: cover.height, alt: cover.alt });
  var eps = published().filter(function (i) { return i.id !== "cover"; });
  assert.deepEqual(Object.keys(SI.episodes).sort(function (a, b) { return a - b; }), eps.map(function (i) { return String(i.episode); }));
  eps.forEach(function (i) {
    assert.deepEqual(SI.episodes[String(i.episode)], { src: "images/story/" + i.file, width: i.width, height: i.height, alt: i.alt });
  });
  assert.equal(SI.episodes["8"], undefined);
  var story = D.dialogues.filter(function (d) { return d.series === SI.series; }).map(function (d) { return d.episode; });
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
});
