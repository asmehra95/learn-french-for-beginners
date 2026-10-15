/* The #audio-status message (VT_UI.toast): hides a few seconds after the sound ends, has a safety timeout,
   resets on a new Listen, pauses on hover/focus, closes on Escape, announces once (node --test, fake DOM + clock). */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var ROOT = path.join(__dirname, "..");

function Node(tag) {
  this.tagName = tag;
  this.children = [];
  this.attrs = {};
  this.listeners = {};
  this.className = "";
  this.textContent = "";
  var self = this;
  this.classList = {
    remove: function (c) { self.className = self.className.split(" ").filter(function (x) { return x && x !== c; }).join(" "); },
    contains: function (c) { return self.className.split(" ").indexOf(c) !== -1; }
  };
}
Object.defineProperty(Node.prototype, "firstChild", { get: function () { return this.children[0] || null; } });
Node.prototype.appendChild = function (c) { this.children.push(c); this.appended = (this.appended || 0) + 1; return c; };
Node.prototype.removeChild = function (c) { this.children.splice(this.children.indexOf(c), 1); return c; };
Node.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
Node.prototype.addEventListener = function (t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); };
Node.prototype.fire = function (t, ev) { (this.listeners[t] || []).forEach(function (fn) { fn(ev || {}); }); };
Node.prototype.text = function () {
  return this.children.map(function (c) { return c.textContent || (c.children ? c.text() : ""); }).join("");
};

function setup() {
  var box = new Node("p");
  box.className = "audio-status";
  var doc = new Node("#document");
  doc.getElementById = function (id) { return id === "audio-status" ? box : null; };
  doc.createElement = function (t) { return new Node(t); };
  doc.createElementNS = function (ns, t) { return new Node(t); };
  doc.createTextNode = function (s) { var n = new Node("#text"); n.textContent = s; return n; };
  var clock = { now: 0, timers: [], seq: 0 };
  var win = {
    VT_SPEECH: {},
    setTimeout: function (fn, ms) { var id = ++clock.seq; clock.timers.push({ id: id, at: clock.now + ms, fn: fn }); return id; },
    clearTimeout: function (id) { clock.timers = clock.timers.filter(function (t) { return t.id !== id; }); }
  };
  clock.tick = function (ms) {
    var end = clock.now + ms;
    for (;;) {
      var due = clock.timers.filter(function (t) { return t.at <= end; }).sort(function (a, b) { return a.at - b.at; })[0];
      if (!due) break;
      clock.timers.splice(clock.timers.indexOf(due), 1);
      clock.now = due.at;
      due.fn();
    }
    clock.now = end;
  };
  global.window = win;
  global.document = doc;
  delete require.cache[require.resolve("../js/ui.js")];
  require("../js/ui.js");
  return { UI: win.VT_UI, box: box, doc: doc, clock: clock };
}
function visible(t) { return t.box.classList.contains("is-visible"); }

test("timing constants", function () {
  var T = setup().UI.TOAST_TIMING;
  assert.deepEqual(Object.assign({}, T), { afterEnd: 3000, noAudio: 4000, safetyBase: 4000, safetyCap: 15000, fade: 250 });
  assert.ok(Object.isFrozen(T));
});

test("shown on Listen, hidden 3 s after the sound ends, emptied after the fade", function () {
  var t = setup();
  var id = t.UI.toast("Recorded voice (synthetic): vous avez.", "recorded", { awaitEnd: true, durationMs: 900 });
  assert.ok(visible(t));
  assert.equal(t.box.className, "audio-status is-recorded is-visible");
  assert.match(t.box.text(), /vous avez/);
  t.clock.tick(800);
  t.UI.toastEnded(id);
  t.clock.tick(2999);
  assert.ok(visible(t), "still visible just before 3 s");
  t.clock.tick(1);
  assert.ok(!visible(t), "hidden at 3 s");
  assert.match(t.box.text(), /vous avez/, "text kept during the fade");
  t.clock.tick(250);
  assert.equal(t.box.children.length, 0, "emptied after the fade");
  assert.equal(t.box.className, "audio-status is-recorded");
});

test("safety: no end event -> hidden after 4 s + the clip length; capped at 15 s", function () {
  var t = setup();
  t.UI.toast("Native speaker: X, CC0.", "native", { awaitEnd: true, durationMs: 1500 });
  t.clock.tick(5499);
  assert.ok(visible(t));
  t.clock.tick(1);
  assert.ok(!visible(t));
  t.UI.toast("Device voice: long.", "computer", { awaitEnd: true, durationMs: 60000 });
  t.clock.tick(14999);
  assert.ok(visible(t));
  t.clock.tick(1);
  assert.ok(!visible(t));
});

test("messages with nothing playing (errors) hide after 4 s; toastEnded does not shorten them", function () {
  var t = setup();
  var id = t.UI.toast("Audio isn't available in this browser.", null, { awaitEnd: false });
  t.UI.toastEnded(id);
  t.clock.tick(3999);
  assert.ok(visible(t));
  t.clock.tick(1);
  assert.ok(!visible(t));
  t.UI.toast("Audio isn't available in this browser.", null); // no opts at all (Preview fallback)
  t.clock.tick(4000);
  assert.ok(!visible(t));
});

test("a new Listen resets the timer; the old toast's end is ignored", function () {
  var t = setup();
  var a = t.UI.toast("A", "recorded", { awaitEnd: true, durationMs: 0 });
  t.clock.tick(3500);
  var b = t.UI.toast("B", "computer", { awaitEnd: true, durationMs: 0 });
  assert.notEqual(a, b);
  t.clock.tick(3000);
  assert.ok(visible(t), "A's safety did not hide B");
  t.UI.toastEnded(a);
  t.clock.tick(900);
  assert.ok(visible(t), "a stale end does not start B's 3 s");
  t.UI.toastEnded(b);
  t.clock.tick(3000);
  assert.ok(!visible(t));
  assert.equal(t.box.text(), "B");
});

test("a new Listen during the fade keeps the new text", function () {
  var t = setup();
  var a = t.UI.toast("A", "recorded", { awaitEnd: true });
  t.UI.toastEnded(a);
  t.clock.tick(3100);
  t.UI.toast("B", "recorded", { awaitEnd: true });
  t.clock.tick(300);
  assert.ok(visible(t));
  assert.equal(t.box.text(), "B");
});

test("hover and focus pause hiding (WCAG 2.2.1); leaving restarts the delay", function () {
  var t = setup();
  var id = t.UI.toast("A", "recorded", { awaitEnd: true });
  t.UI.toastEnded(id);
  t.clock.tick(2000);
  t.box.fire("pointerenter");
  t.clock.tick(60000);
  assert.ok(visible(t), "kept while hovered");
  t.box.fire("pointerleave");
  t.clock.tick(2999);
  assert.ok(visible(t));
  t.clock.tick(1);
  assert.ok(!visible(t));
  var id2 = t.UI.toast("B", "computer", { awaitEnd: true });
  t.box.fire("focusin");
  t.UI.toastEnded(id2);
  t.clock.tick(60000);
  assert.ok(visible(t), "kept while focused");
  t.box.fire("focusout");
  t.clock.tick(3000);
  assert.ok(!visible(t));
});

test("Escape hides it at once without stopping the event; other keys do nothing", function () {
  var t = setup();
  t.UI.toast("A", "native", { awaitEnd: true });
  var stopped = false;
  var ev = { key: "Enter", preventDefault: function () { stopped = true; }, stopPropagation: function () { stopped = true; } };
  t.doc.fire("keydown", ev);
  assert.ok(visible(t));
  ev.key = "Escape";
  t.doc.fire("keydown", ev);
  assert.ok(!visible(t));
  assert.equal(stopped, false, "the conjugation sheet and search still get Escape");
  t.clock.tick(250);
  assert.equal(t.box.children.length, 0);
  assert.equal(t.clock.timers.length, 0, "no timers left");
});

test("announced once: one text node per toast, nothing re-added on hide; listeners bound once", function () {
  var t = setup();
  var id = t.UI.toast("A", "recorded", { awaitEnd: true });
  assert.equal(t.box.appended, 2, "icon + text span");
  t.UI.toastEnded(id);
  t.clock.tick(10000);
  assert.equal(t.box.appended, 2, "hiding adds nothing");
  t.UI.toast("B", null);
  assert.equal(t.box.appended, 3, "no icon for kind null, one span");
  assert.equal(t.box.listeners.pointerenter.length, 1);
  assert.equal(t.doc.listeners.keydown.length, 1);
});

test("CSS: 390px placement above the sticky bar and the sheet is kept; hover-only pointer events", function () {
  var css = fs.readFileSync(path.join(ROOT, "css", "styles.css"), "utf8");
  assert.ok(css.indexOf("#browse-scoped-footer:not([hidden])) .audio-status { bottom: calc(64px + var(--scoped-footer-h") !== -1);
  assert.ok(css.indexOf(".peek:not([hidden])) .audio-status { bottom: calc(57px + var(--peek-h") !== -1);
  assert.match(css, /@media \(hover: hover\) \{ \.audio-status\.is-visible \{ pointer-events: auto; \} \}/);
  assert.match(css, /\.audio-status \{[^}]*pointer-events: none;[^}]*transition: opacity var\(--dur\)/);
});

test("app.js passes the end signal for every Listen and the Preview", function () {
  var app = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
  assert.match(app, /SPEECH\.play\(text, native \? key : null, function \(res\) \{/);
  assert.match(app, /\}, function \(\) \{ window\.VT_UI\.toastEnded\(id\); \}\);/);
  assert.match(app, /SPEECH\.preview\(function \(\) \{ window\.VT_UI\.toastEnded\(id\); \}\)/);
  assert.equal((app.match(/VT_UI\.toast\(/g) || []).length, 1, "one toast wrapper; no other writer of #audio-status");
});
