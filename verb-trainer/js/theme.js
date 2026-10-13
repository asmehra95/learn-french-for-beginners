/* Theme (design §5.2, D4). Loaded in <head> so the stored theme is on <html> before first paint.
   Reads settings.theme straight from localStorage; never writes (app.js saves through VT_STORAGE). */
(function () {
  "use strict";

  var MODES = ["system", "light", "dark"];
  var mode = "system";

  function stored() {
    try {
      var raw = window.localStorage.getItem("verbTrainer.v1");
      if (!raw) return "system";
      var s = JSON.parse(raw);
      var t = s && s.settings && s.settings.theme;
      return t === "light" || t === "dark" ? t : "system";
    } catch (e) {
      return "system";
    }
  }

  function apply(m) {
    mode = m === "light" || m === "dark" ? m : "system";
    var root = document.documentElement;
    if (mode === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", mode);
    return mode;
  }

  function cycle() {
    return apply(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
  }

  function current() {
    return mode;
  }

  apply(stored());
  window.VT_THEME = { apply: apply, cycle: cycle, current: current, MODES: MODES.slice() };
})();
