"use strict";
// Sentence splitter (design §4.5).
//
// Choice for quoted speech: « Tu viens ? » dit-elle. is ONE sentence. After terminal punctuation that
// ends with a closing quote (» " ” )), a following lowercase letter is an incise ("dit-elle"), so the
// split is skipped there. Plain sentences are still split before lowercase text, so a learner who
// types "je suis là. tu viens ?" still gets 2 sentences.
const MARK = "\uE000"; // private-use stand-in for protected dots (cannot appear after input normalisation)
const SPACE = "[ \\t\\u00A0\\u202F]";

const PROTECT = [
  // p. ex.
  [/(^|[\s(«"'\u00A0\u202F-])p\. ex\./gu, `$1p${MARK} ex${MARK}`],
  // M. Mme. Mlle. Dr. St. etc.
  [/(^|[\s(«"'\u00A0\u202F-])(Mme|Mlle|M|Dr|St|etc)\./gu, `$1$2${MARK}`],
  // single capital initials: J. K. Rowling
  [/(^|[\s(«"'\u00A0\u202F-])(\p{Lu})\./gu, `$1$2${MARK}`],
  // decimals: 3.5 (3,5 has no dot to protect)
  [/(\d)\.(?=\d)/gu, `$1${MARK}`],
];

// A run of terminal marks, optionally followed by closing quotes/brackets (» may have a space before it).
const TERMINAL = new RegExp(`[.!?…]+(?:${SPACE}*»|["\u201D)])*`, "gu");
const LEADING_SPACE = new RegExp(`^${SPACE}+`, "u");
const CLOSER_END = /[»"\u201D)]$/u;

function protect(s) {
  let out = s;
  // Run each pattern twice so adjacent matches sharing a boundary character (e.g. "J. K.") are caught.
  for (const [re, rep] of PROTECT) out = out.replace(re, rep).replace(re, rep);
  return out;
}
function restore(s) {
  return s.split(MARK).join(".");
}

function splitBlock(block) {
  const s = protect(block);
  const pieces = [];
  let start = 0;
  TERMINAL.lastIndex = 0;
  let m;
  while ((m = TERMINAL.exec(s)) !== null) {
    const end = m.index + m[0].length;
    const ws = LEADING_SPACE.exec(s.slice(end));
    if (!ws) continue; // not followed by whitespace (end of block, or e.g. "?!" mid-token)
    const next = s.slice(end + ws[0].length);
    if (CLOSER_END.test(m[0]) && /^\p{Ll}/u.test(next)) continue; // incise after quoted speech
    pieces.push(s.slice(start, end));
    start = end;
  }
  pieces.push(s.slice(start));
  return pieces.map((p) => restore(p).trim()).filter(Boolean);
}

/** @param {string} text normalised input @returns {string[]} */
function splitSentences(text) {
  return String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap(splitBlock);
}

module.exports = { splitSentences };
