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
var LYON = "la-lettre-de-lyon", CAFE = "le-cafe-des-questions", COLIS = "le-mauvais-colis";
var SI = ALL.series[LYON];
var SC = ALL.series[CAFE];
var MANIFEST = JSON.parse(fs.readFileSync(path.join(REPO, "tools", "story-images", "manifest.json"), "utf8"));
var MCAFE = JSON.parse(fs.readFileSync(path.join(REPO, "tools", "story-images", "manifest-cafe.json"), "utf8"));
var MCOLIS = JSON.parse(fs.readFileSync(path.join(REPO, "tools", "story-images", "manifest-colis.json"), "utf8"));
var D = require("../js/dialogues-data.js");
var MAX_BYTES = 250 * 1024;
// Dialogues 41-60 whose chosen take passed image QA: all 20. 12 from the first run (reviews/image-selection.json),
// 41, 43, 45, 51, 55, 60 from the regeneration (reviews/regen-selection.json), and 54 and 58 (whose regenerated
// takes had failed the site review) from the multi-image pass `multi`, which also painted the 40 scene images.
var CAFE_PASSED = Array.from({ length: 20 }, function (_, k) { return 41 + k; });
var CAFE_REGEN = [41, 43, 45, 51, 55, 60];
var CAFE_MULTI = [54, 58];
function cafeEp(n) { return MCAFE.images.filter(function (i) { return i.number === n && i.insert === undefined; })[0]; }
function cafeEpisodes() { return MCAFE.images.filter(function (i) { return i.insert === undefined; }); }
function cafeInserts() { return MCAFE.images.filter(function (i) { return i.insert !== undefined; }); }

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
  var both = published().concat(published(MCAFE), published(MCOLIS));
  assert.deepEqual(files, both.map(function (i) { return i.file; }).sort(), "exactly the published files of every illustrated series");
  both.forEach(function (i) {
    var buf = fs.readFileSync(path.join(ROOT, "images", "story", i.file));
    // 12 KB floor: a dark night scene (colis-ep18-i2, silhouettes on an unlit staircase) compresses to about 16 KB
    assert.ok(buf.length > 12 * 1024 && buf.length <= MAX_BYTES, i.file + " " + buf.length + " bytes");
    assert.deepEqual(webpSize(buf), { w: i.width, h: i.height }, i.file);
    var s = buf.toString("latin1");
    ["EXIF", "Exif", "XMP ", "ICCP", "prompt", "stability", "parameters", "Bedrock", "Qwen", "seed"].forEach(function (k) {
      assert.equal(s.indexOf(k), -1, i.file + " contains " + k);
    });
  });
});

test("story-images.js matches the manifest: cover + one entry per published episode", function () {
  assert.deepEqual(Object.keys(ALL), ["series"]);
  assert.deepEqual(Object.keys(ALL.series), [LYON, CAFE, COLIS]);
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

/* generate.py site writing to stdout (no file is written); returns the story-images.js text it would write. */
function genSite(args, input) {
  var out = require("child_process").execFileSync("python3", [path.join(REPO, "tools", "story-images", "generate.py")].concat(args)
    .concat(["site", "--dest", "/dev/stdout"]), { cwd: REPO, encoding: "utf8", input: input || "" });
  var a = out.indexOf("/* Story illustrations"), b = out.indexOf("})(typeof window !== \"undefined\" ? window : null);\n");
  assert.ok(a !== -1 && b > a, "generate.py site output");
  return out.slice(a, b + "})(typeof window !== \"undefined\" ? window : null);\n".length);
}
test("generate.py site: story-images.js is byte-identical to a regeneration from the current manifests; inserts = published scene images", function () {
  assert.equal(genSite([]), fs.readFileSync(path.join(ROOT, "js", "story-images.js"), "utf8"));
  assert.ok(!("inserts" in SI), LYON + " has no scene images");
  [[CAFE, MCAFE, 40], [COLIS, MCOLIS, 39]].forEach(function (x) {
    var want = {};
    published(x[1]).filter(function (i) { return i.insert !== undefined; }).forEach(function (i) {
      want[i.id] = { src: "images/story/" + i.file, width: i.width, height: i.height };
    });
    assert.equal(Object.keys(want).length, x[2], x[0] + " scene images");
    assert.deepEqual(JSON.parse(JSON.stringify(ALL.series[x[0]].inserts)), want, x[0]);
  });
});
test("generate.py site: manifest entries with an insert key become series[<id>].inserts[<image id>] = { src, width, height } (published only)", function () {
  var m = { series: "fake-x", credit: "Illustrations: test credit.", images: [
    { id: "fake-x-ep01", episode: 1, file: "fake-x-ep01.webp", width: 1200, height: 686, alt: "An episode picture for the test." },
    { id: "fake-x-ep01-i1", episode: 1, insert: 1, afterLine: "l4", file: "fake-x-ep01-i1.webp", width: 1200, height: 686, alt: "A scene image for the test." },
    { id: "fake-x-ep01-i2", episode: 1, insert: 2, afterLine: "l8", file: "fake-x-ep01-i2.webp", width: 1200, height: 686, alt: "Not published.", published: false }] };
  var sb = {};
  require("vm").runInNewContext(genSite(["--manifest", "/dev/stdin"], JSON.stringify(m)), { window: sb, module: undefined });
  var S = sb.VT_STORY_IMAGES.series["fake-x"];
  assert.ok(S, "fake-x series");
  assert.deepEqual(Object.keys(S.episodes), ["1"], "an insert is not an episode picture");
  assert.deepEqual(JSON.parse(JSON.stringify(S.inserts)), { "fake-x-ep01-i1": { src: "images/story/fake-x-ep01-i1.webp", width: 1200, height: 686 } });
  m.images = m.images.slice(0, 1);
  sb = {};
  require("vm").runInNewContext(genSite(["--manifest", "/dev/stdin"], JSON.stringify(m)), { window: sb, module: undefined });
  assert.ok(!("inserts" in sb.VT_STORY_IMAGES.series["fake-x"]), "no inserts key without scene images");
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

test("story printables: a published scene image follows its line in the Markdown and the print HTML; an unpublished one is skipped", function () {
  var B = require(path.join(REPO, "tools", "build-story.js"));
  var BD = require(path.join(REPO, "tools", "build-dialogues.js"));
  var src = SC.episodes["1"];
  var alt = "Synthetic scene image: the café terrace at dusk.";
  function site() {
    var s = BD.loadSite();
    var d = s.DLG.episodes(s.data, CAFE)[0];
    d.sceneImages = [{ afterLine: d.lines[3].id, image: "cafe-ep01-i1", alt: alt }, { afterLine: d.lines[7].id, image: "cafe-ep01-i2", alt: alt }];
    return { site: s, d: d };
  }
  // the real scene images are set aside, so only the test's own inserts change the output
  var realInserts = SC.inserts;
  delete SC.inserts;
  try {
  var plainMd = B.markdown(undefined, CAFE), plainHtml = B.printHtml(undefined, CAFE);
  var t = site();
  assert.equal(B.markdown(t.site, CAFE), plainMd, "no inserts in story-images.js: output unchanged");
  SC.inserts = { "cafe-ep01-i1": { src: src.src, width: src.width, height: src.height } };
    t = site();
    var md = B.markdown(t.site, CAFE);
    var line = t.d.lines[3];
    var pic = "![" + alt + "](../" + src.src + ")";
    assert.equal(md.split(pic).length - 1, 1, "one picture in the Markdown");
    assert.ok(md.indexOf("> *" + line.en + "*") < md.indexOf(pic), "after its line");
    assert.equal(md.replace(pic + "\n\n", ""), plainMd, "only the picture is added");
    var html = B.printHtml(site().site, CAFE);
    var figs = html.match(/<figure class="ins"><img class="ins-img" src="data:image\/webp;base64,[A-Za-z0-9+/=]+" width="1200" height="686" alt="([^"]*)"><\/figure>/g) || [];
    assert.equal(figs.length, 1, "one figure in the print HTML");
    assert.ok(figs[0].indexOf("alt=\"" + alt + "\"") !== -1);
    assert.ok(html.indexOf(".ins-img {") !== -1 && plainHtml.indexOf(".ins-img {") === -1, "scene CSS only when needed");
    assert.ok(html.indexOf(require(path.join(REPO, "tools", "build-grammar-tables.js")).esc(line.en)) < html.indexOf(figs[0]), "after its line");
  } finally { if (realInserts) SC.inserts = realInserts; else delete SC.inserts; }
});

/* ---------- Le Café des Questions (dialogues 41-60): Qwen-Image-Edit-2511, tools/story-images/manifest-cafe.json ---------- */
test("café manifest: 20 episode entries (cafe-ep01..20, dialogues 41-60) and 40 scene images with model, revision, seed, prompt, refs and alt; only QA-passed takes published", function () {
  assert.equal(MCAFE.series, CAFE);
  assert.equal(MCAFE.model, "Qwen/Qwen-Image-Edit-2511");
  assert.equal(MCAFE.license, "Apache-2.0");
  assert.match(MCAFE.revision, /^[0-9a-f]{40}$/);
  assert.deepEqual(cafeEpisodes().map(function (i) { return i.id; }), Array.from({ length: 20 }, function (_, k) { return "cafe-ep" + String(k + 1).padStart(2, "0"); }));
  cafeEpisodes().forEach(function (i, k) {
    assert.equal(i.episode, k + 1);
    assert.equal(i.number, 41 + k);
  });
  var ins = cafeInserts();
  assert.equal(ins.length, 40, "two scene images per episode");
  ins.forEach(function (i) {
    assert.equal(i.id, "cafe-ep" + String(i.episode).padStart(2, "0") + "-i" + i.insert);
    assert.equal(i.number, 40 + i.episode);
    assert.match(i.afterLine, /^l\d+$/);
    assert.equal(i.batch, "cafe-multi");
    // an insert with one person and no portrait is a single-reference edit of its anchor (cafe-ep07-i2)
    assert.equal(i.mode, i.refs.length === 1 ? "image-edit" : "multi-image-edit", i.id + " mode");
  });
  MCAFE.images.forEach(function (i) {
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
  assert.deepEqual(published(MCAFE).filter(function (i) { return i.insert === undefined; }).map(function (i) { return i.number; }), CAFE_PASSED);
  assert.equal(published(MCAFE).length, 60, "every episode picture and scene image is published");
  // the regenerated episodes come from the regen batches; episode 20 is a multi-image edit (3 refs);
  // episodes 14 and 18 come from the multi-image pass
  CAFE_REGEN.forEach(function (n) { assert.match(cafeEp(n).batch, /^cafe-regen/, n + " batch"); });
  CAFE_MULTI.forEach(function (n) { assert.equal(cafeEp(n).batch, "cafe-multi", n + " batch"); assert.equal(cafeEp(n).mode, "multi-image-edit"); });
  assert.equal(cafeEp(60).mode, "multi-image-edit");
  assert.equal(cafeEp(60).refs.length, 3);
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
    var m = cafeEp(n);
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

test("colis credits: Credits page and LICENSE-CONTENT.md name Qwen-Image-Edit-2511 and manifest-colis.json", function () {
  assert.equal(MCOLIS.series, COLIS);
  assert.equal(ALL.series[COLIS].credit, MCOLIS.credit);
  var a = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
  assert.match(a, /SIS\["le-mauvais-colis"\]/);
  assert.match(a, /Illustrations \(Le Mauvais Colis\)/);
  assert.match(a, /tools\/story-images\/manifest-colis\.json/);
  var lic = fs.readFileSync(path.join(REPO, "LICENSE-CONTENT.md"), "utf8");
  assert.match(lic, /### Le Mauvais Colis/);
  assert.match(lic, /manifest-colis\.json/);
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
