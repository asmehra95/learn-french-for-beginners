/* Merge the next 100 verbs (data-100.js) and the verb types (verb-types.js) into VERB_DATA.
   Runs after data.js, data-100.js, verb-types.js and topics-data.js, before the app scripts.
   data.js itself stays untouched; this only extends the in-memory object.
   A classic script (not inline) so the page keeps its strict CSP. */
(function (root) {
  "use strict";

  function merge(D, X, T) {
    if (!D || !D.verbs || !D.lessons) return D;
    if (D.merged) return D;
    D.sources = [D.source];
    if (X && X.verbs && X.lessons) {
      var ids = {};
      D.verbs.forEach(function (v) { ids[v.id] = true; });
      var lessonIds = {};
      D.lessons.forEach(function (l) { lessonIds[l.id] = true; });
      D.lessons = D.lessons.concat(X.lessons.filter(function (l) { return !lessonIds[l.id]; }));
      D.verbs = D.verbs.concat(X.verbs.filter(function (v) { return !ids[v.id]; }));
      if (Array.isArray(X.grammarNotes)) D.grammarNotes = (D.grammarNotes || []).concat(X.grammarNotes);
      if (X.source) D.sources.push(X.source);
    }
    D.verbs.forEach(function (v) {
      var t = T && T.verbs && T.verbs[v.id];
      if (!t) return;
      if (!v.type) v.type = t.type;
      v.typeCategory = t.category;
      v.pronominal = !!t.pronominal;
    });
    D.merged = true;
    return D;
  }

  if (root) merge(root.VERB_DATA, root.VERB_DATA_100, root.VERB_TYPES);
  if (typeof module !== "undefined" && module.exports) module.exports = { merge: merge };
})(typeof window !== "undefined" ? window : null);
