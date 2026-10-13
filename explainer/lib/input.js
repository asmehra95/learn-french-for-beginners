"use strict";
// Request body validation and text normalisation (design §4.3, steps 3-6; steps 1-2 are in
// lib/http-util.js readJsonBody). First failure wins.
const { AppError } = require("./errors");
const { splitSentences } = require("./sentences");

const TOP_KEYS = new Set(["text", "options"]);
const OPTION_KEYS = new Set(["literal"]);

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

/**
 * NFC, CRLF -> LF, strip C0/C1 controls except \n and \t, ’/ʼ -> ', collapse runs of spaces/tabs
 * (incl. no-break spaces) to one space, trim.
 */
function normaliseText(s) {
  return String(s)
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, "")
    .replace(/[\u2019\u02BC]/g, "'")
    .replace(/[ \t\u00A0\u202F]+/g, " ")
    .trim();
}

function codePointLength(s) {
  return [...s].length;
}

/**
 * Validate and normalise the input text and options, then split into sentences.
 * Shared by the HTTP layer and explain-service (so a future non-HTTP adapter gets the same rules).
 * @param {unknown} text
 * @param {unknown} options
 * @param {{maxChars: number, maxSentences: number}} limits
 * @returns {{text: string, options: {literal: boolean}, sentences: string[], charCount: number}}
 */
function prepareInput(text, options, limits) {
  if (typeof text !== "string") {
    throw new AppError("INVALID_REQUEST", text === undefined ? "Missing field: text" : "Field text must be a string.");
  }
  const norm = normaliseText(text);
  if (norm.length === 0) throw new AppError("EMPTY_INPUT");
  const charCount = codePointLength(norm);
  if (charCount > limits.maxChars) {
    throw new AppError("INPUT_TOO_LONG", `The text is too long. The limit is ${limits.maxChars} characters.`);
  }
  if (!/\p{L}/u.test(norm)) throw new AppError("EMPTY_INPUT");

  const opts = { literal: true };
  if (options !== undefined) {
    if (!isPlainObject(options)) throw new AppError("INVALID_REQUEST", "Field options must be an object.");
    for (const k of Object.keys(options)) {
      if (!OPTION_KEYS.has(k)) throw new AppError("INVALID_REQUEST", `Unknown option: ${k}`);
    }
    if (options.literal !== undefined) {
      if (typeof options.literal !== "boolean") throw new AppError("INVALID_REQUEST", "Option literal must be true or false.");
      opts.literal = options.literal;
    }
  }

  const sentences = splitSentences(norm);
  if (sentences.length > limits.maxSentences) {
    throw new AppError("TOO_MANY_SENTENCES", `Too many sentences. The limit is ${limits.maxSentences}.`);
  }
  return { text: norm, options: opts, sentences, charCount };
}

/**
 * Validate a parsed JSON request body ({text, options?}).
 * @returns {ReturnType<typeof prepareInput>}
 */
function validateBody(body, limits) {
  if (!isPlainObject(body)) throw new AppError("INVALID_REQUEST", "The request body must be a JSON object.");
  for (const k of Object.keys(body)) {
    if (!TOP_KEYS.has(k)) throw new AppError("INVALID_REQUEST", `Unknown field: ${k}`);
  }
  return prepareInput(body.text, body.options, limits);
}

module.exports = { normaliseText, prepareInput, validateBody, codePointLength };
