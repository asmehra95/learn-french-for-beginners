/* Silent headless Chrome: every headless Chrome argument list in explainer/, tools/, verb-trainer/ and tts-tools/
   (.js and .mjs, node_modules and dot dirs skipped) also passes the mute flag, so no check plays sound on the
   machine. A list is the bracketed text around a quoted headless flag; the flag strings are built from parts here
   so this file is not a match itself (node --test). */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var REPO = path.join(__dirname, "..", "..");
var DIRS = ["explainer", "tools", "verb-trainer", "tts-tools"];

var HEADLESS = "--head" + "less", MUTE = "--mute" + "-audio";
var QUOTED = new RegExp("[\"'`]" + HEADLESS);
var LIMIT = 3000;

/* The bracketed list around index i ("[" … "]"), else the line. */
function argList(text, i) {
  var a = -1, b = -1, depth = 0, k;
  for (k = i; k >= 0 && i - k < LIMIT; k--) {
    if (text[k] === "]") depth++;
    else if (text[k] === "[") { if (depth === 0) { a = k; break; } depth--; }
  }
  depth = 0;
  for (k = i; k < text.length && k - i < LIMIT; k++) {
    if (text[k] === "[") depth++;
    else if (text[k] === "]") { if (depth === 0) { b = k; break; } depth--; }
  }
  if (a !== -1 && b !== -1) return text.slice(a, b + 1);
  var s = text.lastIndexOf("\n", i) + 1, e = text.indexOf("\n", i);
  return text.slice(s, e === -1 ? text.length : e);
}
/* "<file>:<line>" of every quoted headless flag whose argument list lacks the mute flag. */
function unmuted(text, name) {
  var bad = [], re = new RegExp(QUOTED.source, "g"), m;
  while ((m = re.exec(text))) {
    if (argList(text, m.index).indexOf(MUTE) === -1) bad.push(name + ":" + text.slice(0, m.index).split("\n").length);
  }
  return bad;
}
function jsFiles(dir, out) {
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir).sort().forEach(function (n) {
    if (n === "node_modules" || n[0] === ".") return;
    var p = path.join(dir, n), st = fs.lstatSync(p);
    if (st.isDirectory()) jsFiles(p, out);
    else if (st.isFile() && /\.(js|mjs)$/.test(n)) out.push(p);
  });
  return out;
}

test("the scanner: a headless list without the mute flag is found, with it (any order, other line) is not", function () {
  var q = function (x) { return "\"" + x + "\""; };
  assert.deepEqual(unmuted("spawn(c, [" + q(HEADLESS + "=new") + ", " + q("--disable-gpu") + "]);", "a.js"), ["a.js:1"]);
  assert.deepEqual(unmuted("spawn(c, [\n  " + q(HEADLESS + "=new") + ",\n  " + q(MUTE) + "\n]);", "b.js"), []);
  assert.deepEqual(unmuted("x([" + q(MUTE) + ", [1, 2], " + q(HEADLESS) + "])", "c.js"), []);
  assert.deepEqual(unmuted("var re = /" + HEADLESS + "/; var s = \"Chrome " + HEADLESS + " --x\";", "d.js"), []);
});

test("every headless Chrome argument list in the site's scripts passes the mute flag", function () {
  var bad = [], lists = 0;
  DIRS.forEach(function (d) {
    jsFiles(path.join(REPO, d), []).forEach(function (f) {
      var text = fs.readFileSync(f, "utf8"), rel = path.relative(REPO, f);
      lists += (text.match(new RegExp(QUOTED.source, "g")) || []).length;
      bad = bad.concat(unmuted(text, rel));
    });
  });
  assert.ok(lists >= 2, "found the explainer and native-audio headless checks (" + lists + ")");
  assert.deepEqual(bad, [], "headless Chrome without " + MUTE);
});
