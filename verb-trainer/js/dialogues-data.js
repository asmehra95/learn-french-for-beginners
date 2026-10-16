/* Dialogues: window.VT_DIALOGUES (and module.exports for the tests, tools/build-dialogues.js and
   tts-tools/extract-corpus.js). Written content © 2026 Avtar Singh, CC BY-SA 4.0 (LICENSE-CONTENT.md).
   Plain text only: every string is rendered with textContent. Respellings follow the verb guides
   (zh, uh, ew, capital N nasals, r), never IPA; "‿" joins two words that are linked by a liaison
   (the carried consonant starts the next syllable: voo‿zah-vay). French text (`fr`) never contains "‿".
   Each speaker's `voice` picks the recorded voice for their lines (js/tts-manifest*.js); `accept` lists the
   natural alternatives role-play accepts (accept[0] is always `fr`; punctuation, case, hyphens and, with
   accent tolerance on, accents are handled by the checker, so variants differing only in those are not listed). */
(function (root) {
  "use strict";
  function line(id, speaker, fr, pron, en, alts) { return { id: id, speaker: speaker, fr: fr, pron: pron, en: en, accept: [fr].concat(alts || []) }; }
  // kind === null means "no link" (link: null): not every word has a verb, expression or table to point at.
  function word(id, fr, pron, en, lineId, kind, targetId) { return { id: id, fr: fr, pron: pron, en: en, line: lineId, link: kind ? { kind: kind, id: targetId } : null }; }
  function q(id, prompt, answer, distractors, lang, lineId) { return { id: id, prompt: prompt, answer: answer, distractors: distractors, lang: lang, line: lineId }; }
  function eg(fr, pron, en) { return { fr: fr, pron: pron, en: en }; }
  var dialogues = [
    {
      id: "at-the-cafe", number: 1, level: "A1", title: "At the café", titleFr: "Au café",
      summary: "Ordering a coffee and a croissant, then asking for the bill.",
      scene: "Camille walks into a small Paris café in the morning and sits at a table. Julien, the server, comes over to take her order. Later she asks for the bill and pays by card.",
      keywords: ["cafe", "café", "coffee", "croissant", "ordering", "order", "bill", "check", "l'addition", "paying", "restaurant", "waiter", "server"],
      speakers: [
        { id: "server", name: "Julien", role: "server", initial: "J", side: "start", voice: "qwen3-fr-m-bf16" },
        { id: "customer", name: "Camille", role: "customer", initial: "C", side: "end", voice: "qwen3-fr-bf16" }
      ],
      lines: [
        line("l1", "server", "Bonjour, madame ! Vous avez choisi ?", "bohN-zhoor, mah-dahm. voo‿zah-vay shwah-zee",
          "Hello! Have you decided?",
          ["Bonjour, vous avez choisi ?", "Vous avez choisi ?", "Bonjour madame, vous avez fait votre choix ?",
            "Bonjour madame, est-ce que vous avez choisi ?"]),
        line("l2", "customer", "Bonjour ! Oui, je voudrais un café, s'il vous plaît.", "bohN-zhoor. wee, zhuh voo-dreh uhN kah-fay, seel voo pleh",
          "Hello! Yes, I'd like a coffee, please.",
          ["Bonjour monsieur ! Oui, je voudrais un café, s'il vous plaît.", "Oui, je voudrais un café, s'il vous plaît.",
            "Bonjour, je voudrais un café, s'il vous plaît.", "Bonjour ! Oui, un café, s'il vous plaît.",
            "Bonjour ! Oui, je vais prendre un café, s'il vous plaît.", "Bonjour ! Oui, je prends un café, s'il vous plaît.",
            "Oui, un café, s'il vous plaît."]),
        line("l3", "server", "Un café. Et avec ça ?", "uhN kah-fay. ay ah-vek sah",
          "A coffee. Anything else? (literally: and with that?)",
          ["Et avec ça ?", "Un café, très bien. Et avec ça ?", "D'accord, un café. Et avec ça ?",
            "Un café, d'accord. Et avec ceci ?", "Et avec ceci ?"]),
        line("l4", "customer", "Un croissant aussi, s'il vous plaît.", "uhN krwah-sahN oh-see, seel voo pleh",
          "A croissant too, please.",
          ["Et un croissant, s'il vous plaît.", "Aussi un croissant, s'il vous plaît.",
            "Je voudrais aussi un croissant, s'il vous plaît.", "Un croissant, s'il vous plaît.", "Un croissant aussi, merci."]),
        line("l5", "server", "Sur place ou à emporter ?", "sewr plahs oo ah ahN-por-tay",
          "To eat in or to take away? (US: for here or to go?)",
          ["C'est sur place ou à emporter ?", "Sur place ou pour emporter ?", "Vous mangez sur place ou à emporter ?"]),
        line("l6", "customer", "Sur place, merci.", "sewr plahs, mair-see",
          "Eat in, thanks.",
          ["Sur place, s'il vous plaît.", "Sur place.", "Je mange sur place, merci.", "Sur place, merci beaucoup."]),
        line("l7", "server", "Très bien. Je vous apporte ça tout de suite.", "treh byaN. zhuh voo‿zah-port sah too duh sweet",
          "Very good. I'll bring it to you right away.",
          ["Très bien, je vous apporte ça.", "D'accord, je vous apporte ça tout de suite.",
            "Très bien, je vous l'apporte tout de suite.", "Très bien. Tout de suite.", "Je vous apporte ça tout de suite."]),
        line("l8", "customer", "Excusez-moi ! L'addition, s'il vous plaît.", "eks-kew-zay mwah. lah-dee-syohN, seel voo pleh",
          "Excuse me! The bill, please. (US: the check)",
          ["L'addition, s'il vous plaît.", "Pardon ! L'addition, s'il vous plaît.",
            "Excusez-moi, monsieur ! L'addition, s'il vous plaît.", "Excusez-moi, je voudrais l'addition, s'il vous plaît."]),
        line("l9", "server", "Oui, bien sûr. Ça fait six euros cinquante.", "wee, byaN sewr. sah feh see‿zuh-roh saN-kahNt",
          "Yes, of course. That's six euros fifty.",
          ["Bien sûr. Ça fait six euros cinquante.", "Ça fait six euros cinquante.", "Oui, ça fait six euros cinquante.",
            "Oui, bien sûr. Ça fait 6,50 €.", "Ça fait 6 euros 50.",
            "Oui, bien sûr. Ça fait six euros cinquante, s'il vous plaît."]),
        line("l10", "customer", "Je peux payer par carte ?", "zhuh puh peh-yay par kart",
          "Can I pay by card?",
          ["Est-ce que je peux payer par carte ?", "Je peux payer avec une carte ?", "Je peux payer par carte bancaire ?",
            "Je peux payer par carte, s'il vous plaît ?", "Par carte, c'est possible ?"]),
        line("l11", "server", "Oui, pas de problème. Voilà. Bonne journée !", "wee, pah duh proh-blem. vwah-lah. bun zhoor-nay",
          "Yes, no problem. Here you are. Have a nice day!",
          ["Oui, pas de problème. Bonne journée !", "Pas de problème. Voilà. Bonne journée !",
            "Oui, bien sûr. Voilà. Bonne journée !", "Oui, pas de souci. Voilà. Bonne journée !", "Pas de problème, bonne journée !"]),
        line("l12", "customer", "Merci, au revoir !", "mair-see, oh ruh-vwahr",
          "Thanks, goodbye!",
          ["Merci beaucoup, au revoir !", "Merci, bonne journée, au revoir !", "Merci, vous aussi. Au revoir !",
            "Merci, à vous aussi. Au revoir !", "Au revoir, merci !"])
      ],
      vocab: [
        word("v1", "Vous avez choisi ?", "voo‿zah-vay shwah-zee", "Have you decided? / Ready to order?", "l1", "verb", "choisir"),
        word("v2", "je voudrais", "zhuh voo-dreh", "I'd like (polite)", "l2", "expression", "je-voudrais"),
        word("v3", "un café", "uhN kah-fay", "a coffee (un: masculine)", "l2", "table", "indefinite-articles"),
        word("v4", "Sur place ou à emporter ?", "sewr plahs oo ah ahN-por-tay", "Eat in or take away?", "l5", "expression", "sur-place-ou-a-emporter"),
        word("v5", "je vous apporte", "zhuh voo‿zah-port", "I'll bring you", "l7", "verb", "apporter"),
        word("v6", "Excusez-moi", "eks-kew-zay mwah", "Excuse me", "l8", "expression", "excusez-moi"),
        word("v7", "l'addition", "lah-dee-syohN", "the bill (US: the check)", "l8", "expression", "laddition"),
        word("v8", "six euros cinquante", "see‿zuh-roh saN-kahNt", "six euros fifty (€6.50)", "l9", "table", "numbers-21-100"),
        word("v9", "Je peux payer par carte ?", "zhuh puh peh-yay par kart", "Can I pay by card?", "l10", "expression", "je-peux-payer-par-carte")
      ],
      questions: [
        q("q1", "What does Camille order to drink?", "A coffee", ["A tea", "A hot chocolate", "An orange juice"], "en", "l2"),
        q("q2", "Where does Camille have her breakfast?", "In the café (eat in)", ["She takes it away", "At home", "On a park bench"], "en", "l6"),
        q("q3", "How much does Camille pay?", "€6.50", ["€5.60", "€16.50", "€7.50"], "en", "l9"),
        q("q4", "How does Camille ask for the bill?", "L'addition, s'il vous plaît.", ["Le menu, s'il vous plaît.", "La carte, s'il vous plaît.", "Un café, s'il vous plaît."], "fr", "l8")
      ],
      notice: {
        title: "Vous: the polite 'you'",
        text: "Julien and Camille don't know each other, so they both use vous, the polite 'you': Vous avez choisi ? and Je vous apporte ça. With a friend you would say tu: Tu as choisi ?",
        examples: [
          eg("Vous avez choisi ?", "voo‿zah-vay shwah-zee", "Have you decided? (polite)"),
          eg("Tu as choisi ?", "tew ah shwah-zee", "Have you decided? (to a friend)")
        ],
        table: "subject-pronouns"
      }
    }
  ];
  var data = {
    version: 1,
    intro: "Short everyday conversations between two people, each with its own recorded voice. Read and listen, take one of the roles, then check you understood.",
    respellingNote: "The pronunciation under each line is an English-style respelling, not IPA: zh as in 'measure', uh as in 'the', ew as French u, a capital N for a nasal vowel (ahN, ohN, aN, uhN). ‿ links two words with a liaison: the consonant starts the next word (vous avez = voo‿zah-vay).",
    dialogues: dialogues
  };
  if (typeof module !== "undefined" && module.exports) module.exports = data;
  if (root) root.VT_DIALOGUES = data;
})(typeof window !== "undefined" ? window : null);
