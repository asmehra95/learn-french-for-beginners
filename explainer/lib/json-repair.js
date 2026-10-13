"use strict";
// Local (no-model) JSON repair for model output (design §7.3 step 2).
// Output is only ever JSON.parse'd; it is never evaluated.

const FENCE = /```[a-zA-Z]*\s*([\s\S]*?)```/;

// Remove commas that directly precede } or ], skipping anything inside JSON strings.
function removeTrailingCommas(s) {
  let out = "";
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      out += c;
      if (c === "\\") {
        out += s[i + 1] ?? "";
        i++;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === ",") {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      if (s[j] === "}" || s[j] === "]") continue; // drop the trailing comma
    }
    out += c;
  }
  return out;
}

// Smart double quotes used where JSON expects a delimiter: after { [ , : or before : , } ].
// Smart quotes inside string content are left alone.
function fixSmartQuotes(s) {
  return s
    .replace(/([{\[,:]\s*)[\u201c\u201d\u201e]/g, '$1"')
    .replace(/[\u201c\u201d\u201e](\s*[:,}\]])/g, '"$1');
}

function tryParse(s) {
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * @param {string} text raw model output
 * @returns {{ok: true, value: object} | {ok: false, error: string}}
 */
function repairJson(text) {
  if (typeof text !== "string") return { ok: false, error: "output is not text" };
  let s = text.trim();
  const fence = FENCE.exec(s);
  if (fence) s = fence[1];
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end <= start) return { ok: false, error: "no JSON object found" };
  s = s.slice(start, end + 1);

  let r = tryParse(s);
  if (r.ok) return r;
  r = tryParse(removeTrailingCommas(fixSmartQuotes(s)));
  if (!r.ok) return { ok: false, error: `could not parse JSON: ${r.error}` };
  return r;
}

module.exports = { repairJson };
