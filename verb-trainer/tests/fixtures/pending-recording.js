/* Story series whose clips are not recorded yet. The three clip-coverage tests (dialogues.test.js "every line has
   a clip…", tts.test.js "coverage…" and "coverage (second voice)…") skip texts that come only from these series'
   records; until then the device voice reads them. A guard test empties this list as soon as any of their lines or
   proverbs has a clip, so the coverage tests apply to them in full once recording starts. */
"use strict";
var series = [];
/* ttsKeys of the Listen texts (VT_DLG.listenEntries) in `voice` that only pending-series records use. */
function onlyPendingKeys(data, DLG, L, voice, defaultVoice) {
  var pending = {}, other = {};
  (data.dialogues || []).forEach(function (d) {
    var into = d.series && series.indexOf(d.series) !== -1 ? pending : other;
    DLG.listenEntries({ dialogues: [d] }).forEach(function (e) {
      if ((e.voice || defaultVoice) === voice) into[L.ttsKey(e.text)] = true;
    });
  });
  var out = {};
  Object.keys(pending).forEach(function (k) { if (!other[k]) out[k] = true; });
  return out;
}
module.exports = { series: series, onlyPendingKeys: onlyPendingKeys };
