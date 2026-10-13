// Demo page bootstrap (design §9.7). Kept out of index.html because the page CSP forbids inline script.
// apiBase "" = same origin: the page is served by the Explainer server itself.
(function () {
  "use strict";
  window.VT_EXPLAINER.mount(document.getElementById("app"), { apiBase: "" });
})();
