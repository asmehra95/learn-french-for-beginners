/* The respelling alphabet shared by the Grammar tables and the everyday expressions tests:
   letters (capital N for nasals), spaces, hyphens, slashes, apostrophes and light punctuation. No IPA. */
"use strict";
module.exports = { PRON_RE: /^[A-Za-z \-\/'(),.?!…]+$/ };
