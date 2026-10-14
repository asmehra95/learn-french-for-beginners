/* Grammar tables quick reference: window.VT_REFERENCE (and module.exports for the tests and
   tools/build-grammar-tables.js, which writes the Markdown and the print HTML from this file).
   Written content © 2026 Avtar Singh, CC BY-SA 4.0 (see LICENSE-CONTENT.md).
   Plain text only: every string is rendered with textContent. Pronunciations use the respelling of the
   verb guides (zh, uh, ew, capital N for nasals, r), never IPA. `say` is what Listen speaks when `fr`
   is not speakable on its own; `verbId` links a row to its verb card. */
(function (root) {
  "use strict";

  /* row(fr, pron, en, info, extra) */
  function r(fr, pron, en, info, extra) {
    var o = { fr: fr, pron: pron, en: en };
    if (info) o.info = info;
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  function ex(fr, pron, en) { return { fr: fr, pron: pron, en: en }; }
  function wo(wrong, right, pron, why) {
    var o = { wrong: wrong, right: right };
    if (pron) o.pron = pron;
    if (why) o.why = why;
    return o;
  }
  function note(text) { return { note: text }; }
  function topic(label, href) { return { label: label, href: href }; }
  function verb(label, id) { return { label: label, verbId: id }; }

  var categories = [
    /* ---------------------------------------------------------------- 1 */
    {
      id: "articles", number: 1, title: "Articles",
      summary: "le, la, les · un, une, des · du, de la · au, aux · pas de",
      intro: "Almost every French noun comes with a small word in front of it. These tables show which one to use.",
      tables: [
        {
          id: "definite-articles", title: "Definite articles: the",
          when: "For a specific thing (\"the book\"), and for things in general after verbs of liking: J'aime le café = I like coffee.",
          caption: "Definite articles: le, la, l', les", infoLabel: "Gender / number",
          rows: [
            r("le", "luh", "the", "m. sing."),
            r("la", "lah", "the", "f. sing."),
            r("l'", "l", "the", "sing., before a vowel or mute h", { say: "l'hôtel" }),
            r("les", "lay", "the", "pl. (m. and f.)")
          ],
          examples: [
            ex("Le train arrive.", "luh traN ah-reev", "The train is arriving."),
            ex("La gare est loin.", "lah gar eh lwaN", "The station is far."),
            ex("L'hôtel est petit.", "loh-tel eh puh-tee", "The hotel is small."),
            ex("J'aime les chats.", "zhem lay shah", "I like cats.")
          ],
          watchOut: [
            wo("J'aime café.", "J'aime le café.", "zhem luh kah-fay", "French keeps the article for things in general."),
            wo("le ami", "l'ami", "lah-mee", "le and la become l' before a vowel or a mute h."),
            note("les before a vowel makes a liaison z: les amis (lay zah-mee).")
          ],
          keywords: ["le", "la", "les", "l'", "definite article", "the"]
        },
        {
          id: "indefinite-articles", title: "Indefinite articles: a, an, some",
          when: "For one thing that isn't specific (\"a book\"), and des for \"some\" with things you can count.",
          caption: "Indefinite articles: un, une, des", infoLabel: "Gender / number",
          rows: [
            r("un", "uhN", "a, an", "m. sing."),
            r("une", "ewn", "a, an", "f. sing."),
            r("des", "day", "some", "pl. (m. and f.)")
          ],
          examples: [
            ex("J'ai un frère.", "zhay uhN frair", "I have a brother."),
            ex("Elle a une voiture.", "el ah ewn vwah-tewr", "She has a car."),
            ex("Il y a des pommes.", "eel ee ah day pum", "There are (some) apples."),
            ex("Je suis professeur.", "zhuh swee proh-feh-suhr", "I am a teacher. (no article for a job after être)")
          ],
          watchOut: [
            wo("Je suis un professeur.", "Je suis professeur.", "zhuh swee proh-feh-suhr", "no un/une before a job after être."),
            wo("J'ai pommes.", "J'ai des pommes.", "zhay day pum", "English can drop \"some\"; French can't drop des.")
          ],
          keywords: ["un", "une", "des", "indefinite article", "a", "an"]
        },
        {
          id: "partitive-articles", title: "Partitive articles: some",
          when: "For an amount of something you can't count: some bread, some water. Very common with food and drink, after manger, boire, prendre and vouloir.",
          caption: "Partitive articles: du, de la, de l', des", infoLabel: "Gender / number",
          rows: [
            r("du", "dew", "some", "m."),
            r("de la", "duh lah", "some", "f."),
            r("de l'", "duh l", "some", "before a vowel or mute h", { say: "de l'eau" }),
            r("des", "day", "some", "pl.")
          ],
          examples: [
            ex("Je voudrais du pain.", "zhuh voo-dreh dew paN", "I'd like some bread."),
            ex("Tu bois de la bière ?", "tew bwah duh lah byair", "Do you drink beer?"),
            ex("Il prend de l'eau.", "eel prahN duh loh", "He's having some water."),
            ex("Nous mangeons des légumes.", "noo mahN-zhohN day lay-gewm", "We eat vegetables.")
          ],
          watchOut: [
            wo("Je mange pain.", "Je mange du pain.", "zhuh mahNzh dew paN", "an amount of something always takes du / de la / de l'."),
            wo("J'aime du café.", "J'aime le café.", "zhem luh kah-fay", "after aimer, adorer, détester and préférer use le/la/les (things in general).")
          ],
          links: [verb("manger", "manger"), verb("boire", "boire"), verb("prendre", "prendre")],
          keywords: ["du", "de la", "de l'", "partitive", "partitive article", "some", "any"]
        },
        {
          id: "contractions", title: "À and de + the article: au, aux, du, des",
          when: "à (to, at) and de (of, from) melt together with le and les. They do not change with la or l'.",
          caption: "à and de with le, la, l', les", infoLabel: "Made from",
          rows: [
            r("au", "oh", "to the, at the", "à + le"),
            r("à la", "ah lah", "to the, at the", "à + la (no change)"),
            r("à l'", "ah l", "to the, at the", "à + l' (no change)", { say: "à l'hôtel" }),
            r("aux", "oh", "to the, at the", "à + les"),
            r("du", "dew", "of the, from the", "de + le"),
            r("de la", "duh lah", "of the, from the", "de + la (no change)"),
            r("de l'", "duh l", "of the, from the", "de + l' (no change)", { say: "de l'hôtel" }),
            r("des", "day", "of the, from the", "de + les")
          ],
          examples: [
            ex("Je vais au cinéma.", "zhuh veh oh see-nay-mah", "I'm going to the cinema."),
            ex("Elle est à la gare.", "el eh tah lah gar", "She is at the station."),
            ex("Il parle aux enfants.", "eel parl oh zahN-fahN", "He is talking to the children."),
            ex("Je reviens du marché.", "zhuh ruh-vyaN dew mar-shay", "I'm coming back from the market.")
          ],
          watchOut: [
            wo("Je vais à le parc.", "Je vais au parc.", "zhuh veh oh park", "à + le is always au."),
            wo("la porte de le garage", "la porte du garage", "lah port dew gah-rahzh", "de + le is always du.")
          ],
          keywords: ["au", "aux", "a le", "a les", "de le", "de les", "contraction", "contractions"]
        },
        {
          id: "negative-de", title: "Pas de: after a negative",
          when: "After a negative, un, une, du, de la, de l' and des all become de (d' before a vowel). Exception: after être, keep the article.",
          caption: "de after a negative: pas de, pas d', plus de, jamais de", infoLabel: "Use",
          rows: [
            r("pas de", "pah duh", "no, not any", "before a consonant", { say: "pas de voiture" }),
            r("pas d'", "pah d", "no, not any", "before a vowel or mute h", { say: "pas d'alcool" }),
            r("plus de", "plew duh", "no more", "ne ... plus", { say: "plus de pain" }),
            r("jamais de", "zhah-meh duh", "never any", "ne ... jamais", { say: "jamais de viande" })
          ],
          examples: [
            ex("Je n'ai pas de voiture.", "zhuh nay pah duh vwah-tewr", "I don't have a car."),
            ex("Il ne boit pas d'alcool.", "eel nuh bwah pah dahl-kohl", "He doesn't drink alcohol."),
            ex("Nous n'avons plus de pain.", "noo nah-vohN plew duh paN", "We have no more bread."),
            ex("Ce n'est pas un problème.", "suh neh pah zuhN proh-blem", "It isn't a problem. (after être, keep un)")
          ],
          watchOut: [
            wo("Je n'ai pas une voiture.", "Je n'ai pas de voiture.", "zhuh nay pah duh vwah-tewr", "un/une/des become de after pas."),
            wo("Je n'aime pas de café.", "Je n'aime pas le café.", "zhuh nem pah luh kah-fay", "le/la/les don't change.")
          ],
          links: [{ label: "Negative words", href: "#tables/negation/negative-words" }],
          keywords: ["pas de", "pas d'", "plus de", "jamais de", "negative article"]
        },
        {
          id: "which-article", title: "Which article?",
          when: "A quick decision guide: what you mean decides the article.",
          caption: "Choosing between le, un, du and de", infoLabel: "Example", infoLang: "fr",
          rows: [
            r("le, la, les", "luh, lah, lay", "the, things in general", "J'aime le thé."),
            r("un, une", "uhN, ewn", "one countable thing", "Je veux une pomme."),
            r("des", "day", "several countable things", "Je veux des pommes."),
            r("du, de la", "dew, duh lah", "an amount you can't count", "Je veux du thé."),
            r("de", "duh", "after a negative", "Je ne veux pas de thé.")
          ],
          examples: [
            ex("Je prends un café et de l'eau.", "zhuh prahN uhN kah-fay ay duh loh", "I'll have a coffee and some water."),
            ex("Le café est chaud.", "luh kah-fay eh shoh", "The coffee is hot.")
          ],
          watchOut: [
            note("In English you can often say nothing (\"I eat bread\"); in French a noun almost always needs an article.")
          ],
          keywords: ["which article", "article", "articles"]
        }
      ]
    },
    /* ---------------------------------------------------------------- 2 */
    {
      id: "pronouns", number: 2, title: "Pronouns",
      summary: "je, tu, il · moi, toi · le, la, lui, leur · me, se · y, en · qui, que",
      tables: [
        {
          id: "subject-pronouns", title: "Subject pronouns",
          when: "Who does the action. They come before the verb.",
          caption: "Subject pronouns: je, tu, il, elle, on, nous, vous, ils, elles", infoLabel: "Use",
          rows: [
            r("je", "zhuh", "I", "j' before a vowel"),
            r("tu", "tew", "you", "one person, informal"),
            r("il", "eel", "he, it", "m."),
            r("elle", "el", "she, it", "f."),
            r("on", "ohN", "we, one, people", "il/elle verb form"),
            r("nous", "noo", "we", ""),
            r("vous", "voo", "you", "formal, or more than one person"),
            r("ils", "eel", "they", "m. or mixed group"),
            r("elles", "el", "they", "f. only")
          ],
          examples: [
            ex("On va au cinéma ?", "ohN vah oh see-nay-mah", "Shall we go to the cinema?"),
            ex("Vous êtes prêts ?", "voo zet preh", "Are you (all) ready?"),
            ex("Ils arrivent demain.", "eel zah-reev duh-maN", "They arrive tomorrow.")
          ],
          watchOut: [
            wo("On allons au parc.", "On va au parc.", "ohN vah oh park", "on means \"we\" but takes the il/elle form."),
            note("A group of nine women and one man is ils, not elles.")
          ],
          keywords: ["subject pronoun", "subject pronouns", "je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles"]
        },
        {
          id: "stressed-pronouns", title: "Stressed pronouns: moi, toi...",
          when: "On their own (Moi !), after a preposition (avec moi, chez toi), after c'est, and for emphasis (Moi, je reste.).",
          caption: "Stressed pronouns: moi, toi, lui, elle, nous, vous, eux, elles", infoLabel: "Gender / number",
          rows: [
            r("moi", "mwah", "me"),
            r("toi", "twah", "you"),
            r("lui", "lwee", "him", "m."),
            r("elle", "el", "her", "f."),
            r("nous", "noo", "us"),
            r("vous", "voo", "you"),
            r("eux", "uh", "them", "m. or mixed"),
            r("elles", "el", "them", "f.")
          ],
          examples: [
            ex("Tu viens avec moi ?", "tew vyaN ah-vek mwah", "Are you coming with me?"),
            ex("C'est pour lui.", "seh poor lwee", "It's for him."),
            ex("Moi, je préfère le thé.", "mwah, zhuh pray-fair luh tay", "Me, I prefer tea."),
            ex("On mange chez eux.", "ohN mahNzh shay zuh", "We're eating at their place.")
          ],
          watchOut: [
            wo("avec je", "avec moi", "ah-vek mwah", "after a preposition use the stressed form."),
            wo("Je aussi.", "Moi aussi.", "mwah oh-see", "on its own, use moi.")
          ],
          keywords: ["stressed pronoun", "disjunctive", "emphatic", "moi", "toi", "lui", "eux"]
        },
        {
          id: "direct-object-pronouns", title: "Direct object pronouns: me, le, la...",
          when: "They replace the thing or person that receives the action directly (no à): Je vois Marie → Je la vois. They go before the verb.",
          caption: "Direct object pronouns: me, te, le, la, nous, vous, les", infoLabel: "Use",
          rows: [
            r("me", "muh", "me", "m' before a vowel"),
            r("te", "tuh", "you", "t' before a vowel"),
            r("le", "luh", "him, it", "m.; l' before a vowel"),
            r("la", "lah", "her, it", "f.; l' before a vowel"),
            r("nous", "noo", "us"),
            r("vous", "voo", "you"),
            r("les", "lay", "them", "pl.")
          ],
          examples: [
            ex("Je le vois.", "zhuh luh vwah", "I see him / it."),
            ex("Tu la connais ?", "tew lah koh-neh", "Do you know her?"),
            ex("Il m'aime.", "eel mem", "He loves me."),
            ex("Je les achète.", "zhuh lay zah-shet", "I'm buying them.")
          ],
          watchOut: [
            wo("Je vois le.", "Je le vois.", "zhuh luh vwah", "the pronoun goes before the verb."),
            wo("Je regarde lui.", "Je le regarde.", "zhuh luh ruh-gard", "regarder takes a direct object: le, not lui.")
          ],
          links: [{ label: "Order of object pronouns", href: "#tables/pronouns/pronoun-order" }],
          keywords: ["direct object", "direct object pronoun", "object pronoun", "cod"]
        },
        {
          id: "indirect-object-pronouns", title: "Indirect object pronouns: me, lui, leur...",
          when: "They replace à + a person: Je parle à Paul → Je lui parle. Common with parler à, donner à, dire à, téléphoner à, écrire à and demander à.",
          caption: "Indirect object pronouns: me, te, lui, nous, vous, leur", infoLabel: "Use",
          rows: [
            r("me", "muh", "to me", "m' before a vowel"),
            r("te", "tuh", "to you", "t' before a vowel"),
            r("lui", "lwee", "to him, to her", "m. and f."),
            r("nous", "noo", "to us"),
            r("vous", "voo", "to you"),
            r("leur", "luhr", "to them", "m. and f.; never leurs")
          ],
          examples: [
            ex("Je lui parle.", "zhuh lwee parl", "I'm talking to him / to her."),
            ex("Tu leur téléphones ?", "tew luhr tay-lay-fohn", "Are you phoning them?"),
            ex("Elle m'écrit.", "el may-kree", "She writes to me.")
          ],
          watchOut: [
            wo("Je leurs donne.", "Je leur donne.", "zhuh luhr dun", "the pronoun leur never takes an s."),
            wo("Je la téléphone.", "Je lui téléphone.", "zhuh lwee tay-lay-fohn", "téléphoner à: indirect.")
          ],
          links: [verb("parler", "parler"), verb("donner", "donner"), verb("dire", "dire")],
          keywords: ["indirect object", "indirect object pronoun", "coi", "lui", "leur"]
        },
        {
          id: "reflexive-pronouns", title: "Reflexive pronouns",
          when: "With pronominal verbs (se lever, s'appeler) the action comes back to the subject. The full lessons are in the Reflexive verbs topic.",
          caption: "Reflexive pronouns: me, te, se, nous, vous, se", infoLabel: "With",
          rows: [
            r("me", "muh", "myself", "je; m' before a vowel"),
            r("te", "tuh", "yourself", "tu; t' before a vowel"),
            r("se", "suh", "himself, herself, itself", "il, elle, on; s' before a vowel"),
            r("nous", "noo", "ourselves", "nous"),
            r("vous", "voo", "yourself, yourselves", "vous"),
            r("se", "suh", "themselves", "ils, elles; s' before a vowel")
          ],
          examples: [
            ex("Je me lève à sept heures.", "zhuh muh lev ah set uhr", "I get up at seven."),
            ex("Comment tu t'appelles ?", "koh-mahN tew tah-pel", "What's your name?"),
            ex("Nous nous habillons.", "noo noo zah-bee-yohN", "We're getting dressed.")
          ],
          watchOut: [
            wo("Je lève à sept heures.", "Je me lève à sept heures.", "zhuh muh lev ah set uhr", "keep the pronoun even when English has no \"myself\".")
          ],
          links: [topic("Reflexive verbs, lesson 1", "#topics/reflexive/R1"), verb("se lever", "se-lever"), verb("s'appeler", "s-appeler")],
          keywords: ["reflexive pronoun", "reflexive pronouns", "pronominal pronoun", "se", "me", "te"]
        },
        {
          id: "y-and-en", title: "Y and en",
          when: "y replaces à + a place or thing (there, about it); en replaces de + a thing, and any quantity (some, of it, of them).",
          caption: "The pronouns y and en", infoLabel: "Use",
          rows: [
            r("y", "ee", "there, about it", "replaces à + place / thing", { say: "j'y vais" }),
            r("en", "ahN", "some, any, of it, of them, from there", "replaces de + thing, or a quantity", { say: "j'en veux" }),
            r("il y a", "eel ee ah", "there is, there are", "fixed phrase"),
            r("j'en ai deux", "zhahN nay duh", "I have two (of them)", "en + number")
          ],
          examples: [
            ex("Tu vas à Paris ? Oui, j'y vais.", "tew vah zah pah-ree / wee, zhee veh", "Are you going to Paris? Yes, I'm going (there)."),
            ex("Je pense à mon travail. J'y pense.", "zhuh pahNs ah mohN trah-vahy / zhee pahNs", "I'm thinking about my work. I'm thinking about it."),
            ex("Tu veux du café ? Oui, j'en veux.", "tew vuh dew kah-fay / wee, zhahN vuh", "Do you want some coffee? Yes, I want some."),
            ex("Combien de frères as-tu ? J'en ai deux.", "kohN-byaN duh frair ah-tew / zhahN nay duh", "How many brothers do you have? I have two.")
          ],
          watchOut: [
            wo("Oui, je vais.", "Oui, j'y vais.", "wee, zhee veh", "aller needs a place: use y."),
            wo("J'ai deux.", "J'en ai deux.", "zhahN nay duh", "with a number and no noun, add en."),
            note("For people, use lui/leur or à + a stressed pronoun, not y: Je pense à elle (zhuh pahNs ah el).")
          ],
          keywords: ["y", "en", "j'y", "j'en", "il y a", "adverbial pronoun"]
        },
        {
          id: "pronoun-order", title: "Order of object pronouns", preview: true,
          when: "When two object pronouns go before the verb, they follow this order (B1).",
          caption: "Order of object pronouns before the verb", infoLabel: "Position",
          rows: [
            r("me, te, se, nous, vous", "muh, tuh, suh, noo, voo", "me, you, oneself, us, you", "1st"),
            r("le, la, les", "luh, lah, lay", "him, her, it, them", "2nd"),
            r("lui, leur", "lwee, luhr", "to him / her, to them", "3rd"),
            r("y", "ee", "there", "4th"),
            r("en", "ahN", "some, of it", "5th")
          ],
          examples: [
            ex("Il me le donne.", "eel muh luh dun", "He gives it to me."),
            ex("Je le lui donne.", "zhuh luh lwee dun", "I give it to him / her."),
            ex("Je vous en prie.", "zhuh voo zahN pree", "You're welcome. (set phrase)"),
            ex("Il y en a trois.", "eel ee ahN nah trwah", "There are three (of them).")
          ],
          watchOut: [
            wo("Je lui le donne.", "Je le lui donne.", "zhuh luh lwee dun", "le/la/les come before lui/leur."),
            note("In a compound tense the pronouns go before avoir/être: Je le lui ai donné (zhuh luh lwee ay doh-nay).")
          ],
          keywords: ["pronoun order", "double pronouns", "order of pronouns"]
        },
        {
          id: "relative-pronouns", title: "Relative pronouns: qui, que, où, dont",
          when: "They join two sentences about the same noun (\"the man who...\", \"the film that...\").",
          caption: "Relative pronouns: qui, que, où, dont", infoLabel: "Replaces",
          rows: [
            r("qui", "kee", "who, which, that", "the subject (a verb follows)"),
            r("que", "kuh", "whom, which, that", "the object (a subject follows); qu' before a vowel"),
            r("où", "oo", "where, when", "a place or a time"),
            r("dont", "dohN", "whose, of which, about which", "de + noun (B1)")
          ],
          examples: [
            ex("L'homme qui parle est mon père.", "lum kee parl eh mohN pair", "The man who is talking is my father."),
            ex("Le film que je regarde est long.", "luh feelm kuh zhuh ruh-gard eh lohN", "The film (that) I'm watching is long."),
            ex("La ville où j'habite est petite.", "lah veel oo zhah-beet eh puh-teet", "The town where I live is small."),
            ex("Le livre dont je parle est ici.", "luh leevr dohN zhuh parl eh tee-see", "The book I'm talking about is here.")
          ],
          watchOut: [
            wo("le film qui je regarde", "le film que je regarde", "luh feelm kuh zhuh ruh-gard", "a subject (je) follows, so que."),
            note("English often drops \"that\"; French never drops que.")
          ],
          keywords: ["relative pronoun", "relative pronouns", "dont", "who", "that"]
        }
      ]
    },
    /* ---------------------------------------------------------------- 3 */
    {
      id: "possessives", number: 3, title: "Possessives",
      summary: "mon, ma, mes · notre, nos · leur · le mien, la mienne",
      tables: [
        {
          id: "possessive-adjectives", title: "Possessive adjectives: my, your, his...",
          when: "Before a noun. They agree with the THING owned, not the owner: sa voiture = his car or her car.",
          caption: "Possessive adjectives: mon, ma, mes, ton, ta, tes, son, sa, ses, notre, nos, votre, vos, leur, leurs", infoLabel: "With",
          rows: [
            r("mon", "mohN", "my", "m. sing.; f. before a vowel"),
            r("ma", "mah", "my", "f. sing."),
            r("mes", "may", "my", "pl."),
            r("ton", "tohN", "your", "m. sing.; f. before a vowel"),
            r("ta", "tah", "your", "f. sing."),
            r("tes", "tay", "your", "pl."),
            r("son", "sohN", "his, her, its", "m. sing.; f. before a vowel"),
            r("sa", "sah", "his, her, its", "f. sing."),
            r("ses", "say", "his, her, its", "pl."),
            r("notre", "noh-truh", "our", "sing."),
            r("nos", "noh", "our", "pl."),
            r("votre", "voh-truh", "your", "sing."),
            r("vos", "voh", "your", "pl."),
            r("leur", "luhr", "their", "sing."),
            r("leurs", "luhr", "their", "pl.")
          ],
          examples: [
            ex("C'est mon amie Claire.", "seh mohN nah-mee klair", "This is my friend Claire. (amie is f., but mon before a vowel)"),
            ex("Paul aime sa mère.", "pohl em sah mair", "Paul loves his mother."),
            ex("Marie aime son père.", "mah-ree em sohN pair", "Marie loves her father."),
            ex("Ils vendent leur maison.", "eel vahNd luhr meh-zohN", "They're selling their house.")
          ],
          watchOut: [
            wo("ma amie", "mon amie", "mohN nah-mee", "ma, ta, sa become mon, ton, son before a vowel."),
            wo("Marie aime sa père.", "Marie aime son père.", "mah-ree em sohN pair", "agree with père (m.), not with Marie.")
          ],
          keywords: ["mon", "ma", "mes", "ton", "ta", "tes", "son", "sa", "ses", "notre", "nos", "votre", "vos", "leurs", "possessive", "possessive adjective", "possessive adjectives", "my", "your", "his", "her", "their"]
        },
        {
          id: "possessive-pronouns", title: "Possessive pronouns: mine, yours...",
          when: "They replace possessive + noun: mon livre → le mien (mine). They agree with the thing owned.",
          caption: "Possessive pronouns: le mien, le tien, le sien, le nôtre, le vôtre, le leur", infoLabel: "Gender / number",
          rows: [
            r("le mien", "luh myaN", "mine", "m. sing."),
            r("la mienne", "lah myen", "mine", "f. sing."),
            r("les miens", "lay myaN", "mine", "m. pl."),
            r("les miennes", "lay myen", "mine", "f. pl."),
            r("le tien", "luh tyaN", "yours", "m. sing."),
            r("la tienne", "lah tyen", "yours", "f. sing."),
            r("les tiens", "lay tyaN", "yours", "m. pl."),
            r("les tiennes", "lay tyen", "yours", "f. pl."),
            r("le sien", "luh syaN", "his, hers", "m. sing."),
            r("la sienne", "lah syen", "his, hers", "f. sing."),
            r("les siens", "lay syaN", "his, hers", "m. pl."),
            r("les siennes", "lay syen", "his, hers", "f. pl."),
            r("le nôtre", "luh noh-truh", "ours", "m. sing."),
            r("la nôtre", "lah noh-truh", "ours", "f. sing."),
            r("les nôtres", "lay noh-truh", "ours", "pl."),
            r("le vôtre", "luh voh-truh", "yours", "m. sing."),
            r("la vôtre", "lah voh-truh", "yours", "f. sing."),
            r("les vôtres", "lay voh-truh", "yours", "pl."),
            r("le leur", "luh luhr", "theirs", "m. sing."),
            r("la leur", "lah luhr", "theirs", "f. sing."),
            r("les leurs", "lay luhr", "theirs", "pl.")
          ],
          examples: [
            ex("Ce n'est pas ton stylo, c'est le mien.", "suh neh pah tohN stee-loh, seh luh myaN", "It's not your pen, it's mine."),
            ex("Ta voiture est rouge, la mienne est bleue.", "tah vwah-tewr eh roozh, lah myen eh bluh", "Your car is red; mine is blue."),
            ex("Nos enfants jouent avec les leurs.", "noh zahN-fahN zhoo ah-vek lay luhr", "Our children play with theirs.")
          ],
          watchOut: [
            wo("C'est mien.", "C'est le mien.", "seh luh myaN", "keep the article. Casual alternative: C'est à moi (seh tah mwah)."),
            note("notre and votre (no accent) vs le nôtre and le vôtre (with an accent, a longer o). Both are respelled noh / voh.")
          ],
          keywords: ["le mien", "la mienne", "le tien", "le sien", "le notre", "le votre", "le leur", "mine", "yours", "possessive pronoun", "possessive pronouns"]
        }
      ]
    },
    /* ---------------------------------------------------------------- 4 */
    {
      id: "demonstratives", number: 4, title: "Demonstratives",
      summary: "ce, cet, cette, ces · celui, celle · c'est or il est?",
      tables: [
        {
          id: "demonstrative-adjectives", title: "Demonstrative adjectives: this, that, these",
          when: "Before a noun to point at it: this / that / these / those. Add -ci (here) or -là (there) to contrast.",
          caption: "Demonstrative adjectives: ce, cet, cette, ces", infoLabel: "With",
          rows: [
            r("ce", "suh", "this, that", "m. sing.", { say: "ce livre" }),
            r("cet", "set", "this, that", "m. sing. before a vowel or mute h", { say: "cet hôtel" }),
            r("cette", "set", "this, that", "f. sing."),
            r("ces", "say", "these, those", "pl."),
            r("ce livre-ci", "suh leevr-see", "this book (here)", "-ci = here"),
            r("ce livre-là", "suh leevr-lah", "that book (there)", "-là = there")
          ],
          examples: [
            ex("Ce café est délicieux.", "suh kah-fay eh day-lee-syuh", "This coffee is delicious."),
            ex("Cet hôtel est cher.", "set oh-tel eh shair", "This hotel is expensive."),
            ex("Cette semaine, je travaille.", "set suh-men, zhuh trah-vahy", "This week I'm working."),
            ex("Tu préfères cette robe-ci ou cette robe-là ?", "tew pray-fair set rob-see oo set rob-lah", "Do you prefer this dress or that one?")
          ],
          watchOut: [
            wo("ce homme", "cet homme", "set um", "before a vowel or mute h, the masculine is cet."),
            wo("cet femme", "cette femme", "set fahm", "cet and cette sound the same, but cet is only masculine."),
            note("Liaison: ces amis (say zah-mee).")
          ],
          keywords: ["ce", "cet", "cette", "ces", "this", "that", "these", "those", "-ci", "-la", "demonstrative", "demonstrative adjective"]
        },
        {
          id: "demonstrative-pronouns", title: "Demonstrative pronouns: this one, that one", preview: true,
          when: "They replace ce/cette/ces + noun. Never alone: always followed by -ci / -là, qui / que, or de (B1).",
          caption: "Demonstrative pronouns: celui, celle, ceux, celles", infoLabel: "Gender / number",
          rows: [
            r("celui", "suh-lwee", "the one, this one", "m. sing."),
            r("celle", "sel", "the one, this one", "f. sing."),
            r("ceux", "suh", "the ones, these", "m. pl."),
            r("celles", "sel", "the ones, these", "f. pl."),
            r("celui-ci", "suh-lwee-see", "this one (here)", "m. sing."),
            r("celle-là", "sel-lah", "that one (there)", "f. sing.")
          ],
          examples: [
            ex("Je prends celui-ci.", "zhuh prahN suh-lwee-see", "I'll take this one. (un pull)"),
            ex("C'est celle de ma sœur.", "seh sel duh mah suhr", "It's my sister's. (la voiture)"),
            ex("Ceux qui veulent venir sont les bienvenus.", "suh kee vuhl vuh-neer sohN lay byaN-vuh-new", "Those who want to come are welcome."),
            ex("Quelle robe ? Celle que tu portes.", "kel rob / sel kuh tew port", "Which dress? The one you're wearing.")
          ],
          watchOut: [
            wo("Je prends celui.", "Je prends celui-ci.", "zhuh prahN suh-lwee-see", "celui needs -ci, -là, qui, que or de after it."),
            note("\"Paul's\" is celui de Paul (suh-lwee duh pohl): French has no 's.")
          ],
          keywords: ["celui", "celle", "ceux", "celles", "celui-ci", "celle-la", "this one", "that one", "the one", "demonstrative pronoun"]
        },
        {
          id: "cest-vs-il-est", title: "C'est or il est?",
          when: "c'est + a noun with its article or a name (C'est un ami, C'est Marie). il est / elle est + an adjective or a job on its own (Il est grand, Elle est médecin).",
          caption: "c'est, ce sont, il est, elle est", infoLabel: "Followed by",
          rows: [
            r("c'est", "seh", "it is, this is, he is, she is", "article + noun, a name, a stressed pronoun"),
            r("ce sont", "suh sohN", "they are, these are", "plural noun"),
            r("il est", "eel eh", "he is, it is", "adjective or job, no article"),
            r("elle est", "el eh", "she is, it is", "adjective or job, no article")
          ],
          examples: [
            ex("C'est un bon restaurant.", "seh tuhN bohN res-toh-rahN", "It's a good restaurant."),
            ex("Il est médecin.", "eel eh mayd-saN", "He's a doctor."),
            ex("C'est un médecin célèbre.", "seh tuhN mayd-saN say-lebr", "He's a famous doctor."),
            ex("C'est beau !", "seh boh", "That's beautiful! (about an idea or a view in general)")
          ],
          watchOut: [
            wo("Il est un ami.", "C'est un ami.", "seh tuhN nah-mee", "un/une + noun after \"he is\" → c'est."),
            wo("C'est médecin.", "Il est médecin.", "eel eh mayd-saN", "a job with no article → il est / elle est.")
          ],
          keywords: ["c'est", "ce sont", "il est", "elle est", "c'est or il est"]
        }
      ]
    },
    /* ---------------------------------------------------------------- 5 */
    {
      id: "questions", number: 5, title: "Questions",
      summary: "qui, que, où, quand, comment, combien, pourquoi · quel · lequel",
      intro: "A quick reference. For the full lessons with exercises, see the Asking questions topic.",
      links: [topic("Asking questions (topic)", "#topics/questions"), topic("Where, when, how, why (lesson 3)", "#topics/questions/Q3"),
        topic("Who and what (lesson 4)", "#topics/questions/Q4"), topic("Which: quel (lesson 5)", "#topics/questions/Q5")],
      tables: [
        {
          id: "question-words", title: "Question words",
          when: "To ask for information. Put est-ce que after the word for the standard style: Où est-ce que tu vas ?",
          caption: "Question words: qui, que, quoi, où, quand, comment, combien, pourquoi", infoLabel: "Example", infoLang: "fr",
          rows: [
            r("qui", "kee", "who", "Qui vient ce soir ?"),
            r("que", "kuh", "what (formal, + inversion)", "Que fais-tu ?"),
            r("qu'est-ce que", "kes-kuh", "what (standard)", "Qu'est-ce que tu fais ?"),
            r("quoi", "kwah", "what (casual, at the end or after a preposition)", "Tu fais quoi ?"),
            r("où", "oo", "where", "Où est-ce que tu habites ?"),
            r("quand", "kahN", "when", "Tu pars quand ?"),
            r("comment", "koh-mahN", "how", "Comment vas-tu ?"),
            r("combien", "kohN-byaN", "how much, how many", "C'est combien ?"),
            r("combien de", "kohN-byaN duh", "how many (+ noun)", "Combien de frères as-tu ?"),
            r("pourquoi", "poor-kwah", "why", "Pourquoi tu pars ?"),
            r("parce que", "pars-kuh", "because", "Parce qu'il pleut.")
          ],
          examples: [
            ex("Où est-ce que tu habites ?", "oo es-kuh tew ah-beet", "Where do you live?"),
            ex("Quand est-ce que tu pars ?", "kahN-tes-kuh tew par", "When are you leaving?"),
            ex("Qu'est-ce que c'est ?", "kes-kuh seh", "What is it?"),
            ex("Pourquoi est-ce que tu apprends le français ?", "poor-kwah es-kuh tew ah-prahN luh frahN-seh", "Why are you learning French?")
          ],
          watchOut: [
            wo("Quoi tu fais ?", "Qu'est-ce que tu fais ?", "kes-kuh tew feh", "quoi goes at the end or after a preposition."),
            wo("Combien des frères as-tu ?", "Combien de frères as-tu ?", "kohN-byaN duh frair ah-tew", "combien de + noun, no article.")
          ],
          links: [topic("Asking questions, lesson 3", "#topics/questions/Q3"), topic("Asking questions, lesson 4", "#topics/questions/Q4")],
          keywords: ["question words", "question word", "qui", "que", "qu'est-ce que", "quoi", "ou", "quand", "comment", "combien", "pourquoi", "parce que", "who", "what", "where", "when", "how", "why"]
        },
        {
          id: "quel", title: "Quel, quelle, quels, quelles: which, what",
          when: "\"Which\" or \"what\" with a noun, or with être + noun. It agrees with the noun.",
          caption: "quel, quelle, quels, quelles", infoLabel: "Gender / number",
          rows: [
            r("quel", "kel", "which, what", "m. sing.", { say: "quel film" }),
            r("quelle", "kel", "which, what", "f. sing.", { say: "quelle heure" }),
            r("quels", "kel", "which, what", "m. pl.; kel z before a vowel", { say: "quels amis" }),
            r("quelles", "kel", "which, what", "f. pl.; kel z before a vowel", { say: "quelles idées" })
          ],
          examples: [
            ex("Quelle heure est-il ?", "kel uhr eh-teel", "What time is it?"),
            ex("Quel âge as-tu ?", "kel ahzh ah-tew", "How old are you?"),
            ex("Quels amis viennent ?", "kel zah-mee vyen", "Which friends are coming?"),
            ex("Quel est ton nom ?", "kel eh tohN nohN", "What is your name?")
          ],
          watchOut: [
            wo("Quelle est ton nom ?", "Quel est ton nom ?", "kel eh tohN nohN", "nom is masculine."),
            wo("Quel est-ce que tu veux ?", "Qu'est-ce que tu veux ?", "kes-kuh tew vuh", "quel needs a noun or être.")
          ],
          links: [topic("Asking questions, lesson 5", "#topics/questions/Q5")],
          keywords: ["quel", "quelle", "quels", "quelles", "which", "what"]
        },
        {
          id: "lequel", title: "Lequel, laquelle: which one", preview: true,
          when: "\"Which one(s)?\" when the noun is already clear. It agrees with that noun.",
          caption: "lequel, laquelle, lesquels, lesquelles", infoLabel: "Gender / number",
          rows: [
            r("lequel", "luh-kel", "which one", "m. sing."),
            r("laquelle", "lah-kel", "which one", "f. sing."),
            r("lesquels", "lay-kel", "which ones", "m. pl."),
            r("lesquelles", "lay-kel", "which ones", "f. pl.")
          ],
          examples: [
            ex("Lequel préfères-tu ?", "luh-kel pray-fair-tew", "Which one do you prefer? (a film)"),
            ex("Laquelle veux-tu ?", "lah-kel vuh-tew", "Which one do you want? (une tarte)"),
            ex("Lesquels sont à toi ?", "lay-kel sohN tah twah", "Which ones are yours? (des livres)")
          ],
          watchOut: [
            wo("Quel préfères-tu ? (with no noun)", "Lequel préfères-tu ?", "luh-kel pray-fair-tew", "no noun after it: use lequel.")
          ],
          links: [topic("Asking questions, lesson 5", "#topics/questions/Q5")],
          keywords: ["lequel", "laquelle", "lesquels", "lesquelles", "which one"]
        }
      ]
    },
    /* ---------------------------------------------------------------- 6 */
    {
      id: "negation", number: 6, title: "Negation",
      summary: "ne ... pas, jamais, plus, rien, personne, que · where the negative goes",
      tables: [
        {
          id: "negative-words", title: "Negative words",
          when: "ne goes before the verb and the second word after it; ne becomes n' before a vowel. In casual speech the ne is often dropped.",
          caption: "Negative words: ne ... pas, jamais, plus, rien, personne, que, ni ... ni", infoLabel: "Example", infoLang: "fr",
          rows: [
            r("ne ... pas", "nuh ... pah", "not", "Je ne parle pas espagnol.", { say: "Je ne parle pas espagnol." }),
            r("ne ... jamais", "nuh ... zhah-meh", "never", "Il ne mange jamais de viande.", { say: "Il ne mange jamais de viande." }),
            r("ne ... plus", "nuh ... plew", "no longer, not any more", "Je n'habite plus ici.", { say: "Je n'habite plus ici." }),
            r("ne ... rien", "nuh ... ryaN", "nothing, not anything", "Je ne vois rien.", { say: "Je ne vois rien." }),
            r("ne ... personne", "nuh ... pair-sun", "nobody, not anyone", "Je ne connais personne.", { say: "Je ne connais personne." }),
            r("ne ... que", "nuh ... kuh", "only", "Je n'ai que dix euros.", { say: "Je n'ai que dix euros." }),
            r("ne ... ni ... ni", "nuh ... nee ... nee", "neither ... nor", "Je ne bois ni thé ni café.", { say: "Je ne bois ni thé ni café." })
          ],
          examples: [
            ex("Je n'ai jamais vu Paris.", "zhuh nay zhah-meh vew pah-ree", "I've never seen Paris."),
            ex("Il n'y a personne.", "eel nee ah pair-sun", "There's nobody there."),
            ex("Rien ne va.", "ryaN nuh vah", "Nothing is going right. (rien as the subject comes first)"),
            ex("Je ne bois que de l'eau.", "zhuh nuh bwah kuh duh loh", "I only drink water.")
          ],
          watchOut: [
            wo("Je ne vois pas rien.", "Je ne vois rien.", "zhuh nuh vwah ryaN", "one negative word with ne, not pas + rien."),
            note("ne ... que is not really negative, so the article stays: Je n'ai que des pommes (zhuh nay kuh day pum).")
          ],
          links: [{ label: "Pas de: after a negative", href: "#tables/articles/negative-de" }],
          keywords: ["ne pas", "ne jamais", "ne plus", "ne rien", "ne personne", "ne que", "ne ni ni", "negation", "negative", "not", "never", "nothing", "nobody"]
        },
        {
          id: "negation-placement", title: "Where the negative goes",
          when: "In compound tenses and with pronouns, ne ... pas wraps around the first verb and the pronouns in front of it.",
          caption: "Word order with ne ... pas", infoLabel: "Rule",
          rows: [
            r("Je ne parle pas.", "zhuh nuh parl pah", "I don't speak.", "ne + verb + pas"),
            r("Je n'ai pas mangé.", "zhuh nay pah mahN-zhay", "I didn't eat.", "ne + avoir/être + pas + participle"),
            r("Je ne suis pas allé.", "zhuh nuh swee pah zah-lay", "I didn't go.", "same with être"),
            r("Je ne le vois pas.", "zhuh nuh luh vwah pah", "I don't see him.", "ne + pronoun + verb + pas"),
            r("Je ne me lève pas.", "zhuh nuh muh lev pah", "I don't get up.", "ne + reflexive pronoun + verb + pas"),
            r("Je ne veux pas partir.", "zhuh nuh vuh pah par-teer", "I don't want to leave.", "ne ... pas around the first verb"),
            r("Je n'ai vu personne.", "zhuh nay vew pair-sun", "I didn't see anyone.", "personne goes after the participle")
          ],
          examples: [
            ex("Elle n'est pas encore arrivée.", "el neh pah zahN-kor ah-ree-vay", "She hasn't arrived yet."),
            ex("Je ne l'ai jamais vu.", "zhuh nuh lay zhah-meh vew", "I've never seen it."),
            ex("Ne pas toucher.", "nuh pah too-shay", "Do not touch. (before an infinitive both words go together)")
          ],
          watchOut: [
            wo("Je n'ai mangé pas.", "Je n'ai pas mangé.", "zhuh nay pah mahN-zhay", "pas goes right after avoir / être."),
            wo("Je ne vois le pas.", "Je ne le vois pas.", "zhuh nuh luh vwah pah", "the pronoun stays glued to the verb.")
          ],
          links: [topic("Reflexive verbs, lesson 3 (negatives)", "#topics/reflexive/R3")],
          keywords: ["negative word order", "where does pas go", "negation placement"]
        }
      ]
    },
    /* ---------------------------------------------------------------- 7 */
    {
      id: "adjectives", number: 7, title: "Adjectives",
      summary: "agreement · beau, bel, belle · BAGS: before or after the noun",
      tables: [
        {
          id: "adjective-agreement", title: "Regular agreement patterns",
          when: "Adjectives agree with the noun: add -e for feminine, -s for plural, -es for feminine plural. Some endings change.",
          caption: "Adjective agreement: masculine and feminine forms", infoLabel: "Pattern (m. → f.)",
          rows: [
            r("grand, grande", "grahN, grahNd", "tall, big", "+ e"),
            r("petit, petite", "puh-tee, puh-teet", "small", "+ e (the t is now said)"),
            r("jeune", "zhuhn", "young", "ends in e: no change"),
            r("grands, grandes", "grahN, grahNd", "tall, big", "pl. + s / + es"),
            r("heureux, heureuse", "uh-ruh, uh-ruhz", "happy", "-eux → -euse"),
            r("sportif, sportive", "spor-teef, spor-teev", "sporty", "-if → -ive"),
            r("cher, chère", "shair, shair", "expensive, dear", "-er → -ère"),
            r("premier, première", "pruh-myay, pruh-myair", "first", "-ier → -ière"),
            r("naturel, naturelle", "nah-tew-rel, nah-tew-rel", "natural", "-el → -elle"),
            r("bon, bonne", "bohN, bun", "good", "-on → -onne"),
            r("italien, italienne", "ee-tah-lyaN, ee-tah-lyen", "Italian", "-ien → -ienne")
          ],
          examples: [
            ex("Ma sœur est grande.", "mah suhr eh grahNd", "My sister is tall."),
            ex("Elles sont heureuses.", "el sohN tuh-ruhz", "They are happy."),
            ex("C'est une bonne idée.", "seh tewn bun ee-day", "It's a good idea."),
            ex("Les chaussures sont chères.", "lay shoh-sewr sohN shair", "The shoes are expensive.")
          ],
          watchOut: [
            wo("une maison petit", "une petite maison", "ewn puh-teet meh-zohN", "agree, and petit goes before the noun (BAGS)."),
            note("Adding -e often makes a silent final consonant heard: petit (puh-tee) → petite (puh-teet).")
          ],
          keywords: ["adjective agreement", "agreement", "feminine", "plural", "adjectives"]
        },
        {
          id: "irregular-adjectives", title: "Common irregular adjectives",
          when: "These change more. beau, nouveau and vieux have a special masculine form before a vowel or mute h. Plurals: beaux, belles · nouveaux, nouvelles · vieux, vieilles.",
          caption: "Irregular adjectives: beau, nouveau, vieux, blanc, long, gentil", infoLabel: "Forms",
          rows: [
            r("beau", "boh", "beautiful, handsome", "m."),
            r("bel", "bel", "beautiful, handsome", "m. before a vowel: un bel homme", { say: "un bel homme" }),
            r("belle", "bel", "beautiful", "f."),
            r("nouveau", "noo-voh", "new", "m."),
            r("nouvel", "noo-vel", "new", "m. before a vowel: un nouvel ami", { say: "un nouvel ami" }),
            r("nouvelle", "noo-vel", "new", "f."),
            r("vieux", "vyuh", "old", "m. (pl. vieux)"),
            r("vieil", "vyehy", "old", "m. before a vowel: un vieil homme", { say: "un vieil homme" }),
            r("vieille", "vyehy", "old", "f."),
            r("blanc", "blahN", "white", "m."),
            r("blanche", "blahNsh", "white", "f."),
            r("long", "lohN", "long", "m."),
            r("longue", "lohNg", "long", "f."),
            r("gentil", "zhahN-tee", "kind, nice", "m."),
            r("gentille", "zhahN-teey", "kind, nice", "f.")
          ],
          examples: [
            ex("C'est un bel appartement.", "seh tuhN bel ah-par-tuh-mahN", "It's a beautiful flat."),
            ex("J'ai un nouvel ordinateur.", "zhay uhN noo-vel or-dee-nah-tuhr", "I have a new computer."),
            ex("Ma grand-mère est une vieille dame.", "mah grahN-mair eh tewn vyehy dahm", "My grandmother is an old lady."),
            ex("Elle porte une robe blanche.", "el port ewn rob blahNsh", "She's wearing a white dress.")
          ],
          watchOut: [
            wo("un beau homme", "un bel homme", "uhN bel um", "bel, nouvel, vieil before a vowel or mute h (singular only)."),
            wo("une robe blance", "une robe blanche", "ewn rob blahNsh")
          ],
          keywords: ["beau", "bel", "belle", "nouveau", "nouvel", "nouvelle", "vieux", "vieil", "vieille", "blanc", "blanche", "long", "longue", "irregular adjectives"]
        },
        {
          id: "bags-adjectives", title: "Adjectives that go before the noun: BAGS",
          when: "Most adjectives go after the noun (une voiture rouge). A short list of common ones goes before: Beauty, Age, Goodness, Size.",
          caption: "BAGS adjectives and adjective position", infoLabel: "BAGS",
          rows: [
            r("beau, joli", "boh, zhoh-lee", "beautiful, pretty", "Beauty"),
            r("jeune, vieux, nouveau", "zhuhn, vyuh, noo-voh", "young, old, new", "Age"),
            r("bon, mauvais", "bohN, moh-veh", "good, bad", "Goodness"),
            r("grand, petit, gros", "grahN, puh-tee, groh", "big or tall, small, fat or big", "Size"),
            r("une jolie maison", "ewn zhoh-lee meh-zohN", "a pretty house", "before"),
            r("une voiture rouge", "ewn vwah-tewr roozh", "a red car", "after (colour)"),
            r("un film intéressant", "uhN feelm aN-tay-reh-sahN", "an interesting film", "after (most adjectives)")
          ],
          examples: [
            ex("C'est un petit village.", "seh tuhN puh-tee vee-lahzh", "It's a small village."),
            ex("J'ai un bon ami.", "zhay uhN bohN nah-mee", "I have a good friend."),
            ex("Il a une voiture noire.", "eel ah ewn vwah-tewr nwahr", "He has a black car.")
          ],
          watchOut: [
            wo("une rouge voiture", "une voiture rouge", "ewn vwah-tewr roozh", "colours and nationalities go after."),
            note("Before an adjective in the plural, des usually becomes de: de bons amis (duh bohN zah-mee). This is a B1 detail; casual speech often keeps des.")
          ],
          keywords: ["bags", "before the noun", "adjective position", "word order adjectives"]
        }
      ]
    },
    /* ---------------------------------------------------------------- 8 */
    {
      id: "prepositions", number: 8, title: "Prepositions",
      summary: "sur, sous, devant, à côté de · à Paris, en France, au Canada",
      tables: [
        {
          id: "prepositions-of-place", title: "Prepositions of place",
          when: "To say where something is. Remember à + le = au and de + le = du: à côté du lit, près de la gare.",
          caption: "Prepositions of place", infoLabel: "With le, la, les",
          rows: [
            r("sur", "sewr", "on"),
            r("sous", "soo", "under"),
            r("devant", "duh-vahN", "in front of"),
            r("derrière", "dair-yair", "behind"),
            r("dans", "dahN", "in, inside"),
            r("entre", "ahN-truh", "between"),
            r("à côté de", "ah koh-tay duh", "next to", "du / de la / des"),
            r("près de", "preh duh", "near", "du / de la / des"),
            r("loin de", "lwaN duh", "far from", "du / de la / des"),
            r("en face de", "ahN fahs duh", "opposite", "du / de la / des")
          ],
          examples: [
            ex("Le chat est sous la table.", "luh shah eh soo lah tah-bluh", "The cat is under the table."),
            ex("La banque est à côté de la poste.", "lah bahNk eh tah koh-tay duh lah post", "The bank is next to the post office."),
            ex("J'habite près du parc.", "zhah-beet preh dew park", "I live near the park."),
            ex("Le café est en face de l'hôtel.", "luh kah-fay eh tahN fahs duh loh-tel", "The café is opposite the hotel.")
          ],
          watchOut: [
            wo("près de le parc", "près du parc", "preh dew park", "de + le = du."),
            wo("à côté la gare", "à côté de la gare", "ah koh-tay duh lah gar", "keep the de.")
          ],
          links: [{ label: "à and de + the article", href: "#tables/articles/contractions" }],
          keywords: ["prepositions", "preposition", "place", "sur", "sous", "devant", "derriere", "dans", "entre", "a cote de", "pres de", "loin de", "en face de"]
        },
        {
          id: "cities-and-countries", title: "Cities and countries: à, en, au, aux",
          when: "\"In\" or \"to\" a place. Most countries ending in -e are feminine (la France); a few are not (le Mexique, le Cambodge).",
          caption: "à, en, au, aux with cities and countries", infoLabel: "Use with",
          rows: [
            r("à Paris", "ah pah-ree", "in / to Paris", "à + city"),
            r("en France", "ahN frahNs", "in / to France", "en + f. country"),
            r("en Italie", "ahN nee-tah-lee", "in / to Italy", "en + country starting with a vowel"),
            r("au Canada", "oh kah-nah-dah", "in / to Canada", "au + m. country"),
            r("au Japon", "oh zhah-pohN", "in / to Japan", "au + m. country"),
            r("aux États-Unis", "oh zay-tah-zew-nee", "in / to the United States", "aux + pl. country"),
            r("de France", "duh frahNs", "from France", "de + f. country"),
            r("du Canada", "dew kah-nah-dah", "from Canada", "du + m. country")
          ],
          examples: [
            ex("J'habite à Londres.", "zhah-beet ah lohN-druh", "I live in London."),
            ex("Nous allons en Espagne.", "noo zah-lohN ahN nes-pahny", "We're going to Spain."),
            ex("Il travaille au Portugal.", "eel trah-vahy oh por-tew-gahl", "He works in Portugal."),
            ex("Elle revient des États-Unis.", "el ruh-vyaN day zay-tah-zew-nee", "She's coming back from the United States.")
          ],
          watchOut: [
            wo("à France", "en France", "ahN frahNs", "à is for cities; countries take en / au / aux."),
            wo("en Canada", "au Canada", "oh kah-nah-dah", "masculine countries take au.")
          ],
          keywords: ["country", "countries", "city", "cities", "en france", "au canada", "aux etats unis", "in", "to"]
        }
      ]
    },
    /* ---------------------------------------------------------------- 9 */
    {
      id: "verbs", number: 9, title: "Verb reference",
      summary: "present endings · verbs with être · future stems",
      intro: "A summary only. The full verb tables, with every form and a Listen button, are in Learn.",
      links: [{ label: "Learn: all verbs", href: "#browse" }, { label: "Lesson 2: regular -er verbs", href: "#browse/lesson/2" },
        verb("parler", "parler"), verb("finir", "finir"), verb("attendre", "attendre"), verb("aller", "aller"), verb("venir", "venir"),
        verb("se lever", "se-lever"), topic("Reflexive verbs, lesson 4 (past and future)", "#topics/reflexive/R4")],
      tables: [
        {
          id: "present-endings", title: "Present-tense endings", kind: "grid",
          when: "Regular verbs: drop -er, -ir or -re and add the endings. -er: -e, -es, -e, -ons, -ez, -ent · -ir: -is, -is, -it, -issons, -issez, -issent · -re: -s, -s, (nothing), -ons, -ez, -ent.",
          caption: "Present tense of parler, finir and attendre",
          columns: [{ label: "-er: parler", verbId: "parler" }, { label: "-ir: finir", verbId: "finir" }, { label: "-re: attendre", verbId: "attendre" }],
          rows: [
            { head: "je", cells: [{ fr: "je parle", pron: "zhuh parl" }, { fr: "je finis", pron: "zhuh fee-nee" }, { fr: "j'attends", pron: "zhah-tahN" }] },
            { head: "tu", cells: [{ fr: "tu parles", pron: "tew parl" }, { fr: "tu finis", pron: "tew fee-nee" }, { fr: "tu attends", pron: "tew ah-tahN" }] },
            { head: "il/elle", cells: [{ fr: "il parle", pron: "eel parl" }, { fr: "il finit", pron: "eel fee-nee" }, { fr: "il attend", pron: "eel ah-tahN" }] },
            { head: "nous", cells: [{ fr: "nous parlons", pron: "noo par-lohN" }, { fr: "nous finissons", pron: "noo fee-nee-sohN" }, { fr: "nous attendons", pron: "noo zah-tahN-dohN" }] },
            { head: "vous", cells: [{ fr: "vous parlez", pron: "voo par-lay" }, { fr: "vous finissez", pron: "voo fee-nee-say" }, { fr: "vous attendez", pron: "voo zah-tahN-day" }] },
            { head: "ils/elles", cells: [{ fr: "ils parlent", pron: "eel parl" }, { fr: "ils finissent", pron: "eel fee-nees" }, { fr: "ils attendent", pron: "eel zah-tahNd" }] }
          ],
          examples: [
            ex("Nous finissons à cinq heures.", "noo fee-nee-sohN ah saN kuhr", "We finish at five."),
            ex("Il attend le bus.", "eel ah-tahN luh bews", "He's waiting for the bus.")
          ],
          watchOut: [
            note("The je, tu, il and ils forms of -er verbs all sound the same: parle, parles, parle, parlent = parl."),
            note("-ir verbs like partir, sortir and dormir do NOT follow finir: je pars, nous partons.")
          ],
          links: [verb("parler", "parler"), verb("finir", "finir"), verb("attendre", "attendre"), verb("partir", "partir")],
          keywords: ["present tense", "present endings", "endings", "conjugation", "er verbs", "ir verbs", "re verbs"]
        },
        {
          id: "etre-verbs", title: "Verbs that take être in the passé composé",
          when: "These verbs (mostly movement or change of state) and ALL pronominal verbs form the passé composé with être, and the participle agrees with the subject. Memory aid: DR & MRS VANDERTRAMPP.",
          caption: "Verbs with être in the passé composé (DR & MRS VANDERTRAMPP)", infoLabel: "Past (je)",
          rows: [
            r("devenir", "duh-vuh-neer", "to become", "je suis devenu(e)", { verbId: "devenir" }),
            r("revenir", "ruh-vuh-neer", "to come back", "je suis revenu(e)", { verbId: "revenir" }),
            r("monter", "mohN-tay", "to go up", "je suis monté(e)", { verbId: "monter" }),
            r("rester", "res-tay", "to stay", "je suis resté(e)", { verbId: "rester" }),
            r("sortir", "sor-teer", "to go out", "je suis sorti(e)", { verbId: "sortir" }),
            r("venir", "vuh-neer", "to come", "je suis venu(e)", { verbId: "venir" }),
            r("aller", "ah-lay", "to go", "je suis allé(e)", { verbId: "aller" }),
            r("naître", "neh-truh", "to be born", "je suis né(e)", { verbId: "naitre" }),
            r("descendre", "deh-sahN-druh", "to go down", "je suis descendu(e)", { verbId: "descendre" }),
            r("entrer", "ahN-tray", "to enter", "je suis entré(e)", { verbId: "entrer" }),
            r("rentrer", "rahN-tray", "to go home", "je suis rentré(e)", { verbId: "rentrer" }),
            r("tomber", "tohN-bay", "to fall", "je suis tombé(e)", { verbId: "tomber" }),
            r("retourner", "ruh-toor-nay", "to return", "je suis retourné(e)"),
            r("arriver", "ah-ree-vay", "to arrive", "je suis arrivé(e)", { verbId: "arriver" }),
            r("mourir", "moo-reer", "to die", "je suis mort(e)", { verbId: "mourir" }),
            r("partir", "par-teer", "to leave", "je suis parti(e)", { verbId: "partir" }),
            r("passer", "pah-say", "to pass by", "je suis passé(e)", { verbId: "passer" }),
            r("se lever (and all reflexive verbs)", "suh luh-vay", "to get up", "je me suis levé(e)", { verbId: "se-lever", say: "se lever" })
          ],
          examples: [
            ex("Elle est arrivée hier.", "el eh tah-ree-vay yair", "She arrived yesterday."),
            ex("Nous sommes allés au cinéma.", "noo sum zah-lay oh see-nay-mah", "We went to the cinema."),
            ex("Je me suis levé à sept heures.", "zhuh muh swee luh-vay ah set uhr", "I got up at seven.")
          ],
          watchOut: [
            wo("J'ai allé", "Je suis allé(e)", "zhuh swee zah-lay"),
            note("With a direct object, monter, descendre, sortir, rentrer and passer take avoir: J'ai monté les valises (zhay mohN-tay lay vah-leez).")
          ],
          links: [topic("Reflexive verbs, lesson 4 (past)", "#topics/reflexive/R4")],
          keywords: ["etre verbs", "auxiliary", "dr mrs vandertrampp", "vandertrampp", "passe compose", "etre or avoir"]
        },
        {
          id: "future", title: "Futur simple: endings and irregular stems",
          when: "\"Will\". Regular verbs: the infinitive (drop the final e of -re) + -ai, -as, -a, -ons, -ez, -ont. Irregular verbs use a special stem with the same endings.",
          caption: "Future endings (parler) and irregular future stems", infoLabel: "Ending / stem",
          rows: [
            r("je parlerai", "zhuh par-luh-ray", "I will speak", "-ai", { verbId: "parler" }),
            r("tu parleras", "tew par-luh-rah", "you will speak", "-as"),
            r("il parlera", "eel par-luh-rah", "he will speak", "-a"),
            r("nous parlerons", "noo par-luh-rohN", "we will speak", "-ons"),
            r("vous parlerez", "voo par-luh-ray", "you will speak", "-ez"),
            r("ils parleront", "eel par-luh-rohN", "they will speak", "-ont"),
            r("je serai", "zhuh suh-ray", "I will be", "être: ser-", { verbId: "etre" }),
            r("j'aurai", "zhoh-ray", "I will have", "avoir: aur-", { verbId: "avoir" }),
            r("j'irai", "zhee-ray", "I will go", "aller: ir-", { verbId: "aller" }),
            r("je ferai", "zhuh fuh-ray", "I will do", "faire: fer-", { verbId: "faire" }),
            r("je pourrai", "zhuh poo-ray", "I will be able to", "pouvoir: pourr-", { verbId: "pouvoir" }),
            r("je voudrai", "zhuh voo-dray", "I will want", "vouloir: voudr-", { verbId: "vouloir" }),
            r("je devrai", "zhuh duh-vray", "I will have to", "devoir: devr-", { verbId: "devoir" }),
            r("je saurai", "zhuh soh-ray", "I will know", "savoir: saur-", { verbId: "savoir" }),
            r("je verrai", "zhuh veh-ray", "I will see", "voir: verr-", { verbId: "voir" }),
            r("je viendrai", "zhuh vyaN-dray", "I will come", "venir: viendr-", { verbId: "venir" }),
            r("je tiendrai", "zhuh tyaN-dray", "I will hold", "tenir: tiendr-", { verbId: "tenir" }),
            r("je recevrai", "zhuh ruh-suh-vray", "I will receive", "recevoir: recevr-", { verbId: "recevoir" }),
            r("j'enverrai", "zhahN-veh-ray", "I will send", "envoyer: enverr-", { verbId: "envoyer" }),
            r("je courrai", "zhuh koor-ray", "I will run", "courir: courr-", { verbId: "courir" }),
            r("je mourrai", "zhuh moor-ray", "I will die", "mourir: mourr-", { verbId: "mourir" }),
            r("il faudra", "eel foh-drah", "it will be necessary", "falloir: faudr-", { verbId: "falloir" }),
            r("il pleuvra", "eel pluh-vrah", "it will rain", "pleuvoir: pleuvr-", { verbId: "pleuvoir" })
          ],
          examples: [
            ex("Demain, il fera beau.", "duh-maN, eel fuh-rah boh", "Tomorrow the weather will be nice."),
            ex("Nous irons en France.", "noo zee-rohN ahN frahNs", "We will go to France.")
          ],
          watchOut: [
            note("The endings are the present of avoir (ai, as, a, ons, ez, ont); the stem always ends in r."),
            wo("je allerai", "j'irai", "zhee-ray"),
            note("The near future is more common in speech: aller + infinitive, Je vais partir (zhuh veh par-teer).")
          ],
          links: [topic("Reflexive verbs, lesson 4 (future)", "#topics/reflexive/R4")],
          keywords: ["future", "futur simple", "future tense", "future stems", "will"]
        }
      ]
    },
    /* ---------------------------------------------------------------- 10 */
    {
      id: "basics", number: 10, title: "Everyday basics",
      summary: "numbers 0–100 · first, second · days, months · the time · today, tomorrow",
      tables: [
        {
          id: "numbers-0-20", title: "Numbers 0–20",
          when: "Counting, prices, ages and phone numbers. Learn 0–16 by heart; 17, 18 and 19 are 10 + 7, 8, 9.",
          caption: "Numbers from 0 to 20",
          rows: [
            r("zéro", "zay-roh", "0"), r("un", "uhN", "1 (une with a f. noun: ewn)"), r("deux", "duh", "2"), r("trois", "trwah", "3"),
            r("quatre", "kah-truh", "4"), r("cinq", "saNk", "5"), r("six", "sees", "6"), r("sept", "set", "7"), r("huit", "weet", "8"),
            r("neuf", "nuhf", "9"), r("dix", "dees", "10"), r("onze", "ohNz", "11"), r("douze", "dooz", "12"), r("treize", "trez", "13"),
            r("quatorze", "kah-torz", "14"), r("quinze", "kaNz", "15"), r("seize", "sez", "16"), r("dix-sept", "dee-set", "17"),
            r("dix-huit", "deez-weet", "18"), r("dix-neuf", "deez-nuhf", "19"), r("vingt", "vaN", "20")
          ],
          examples: [
            ex("J'ai trois enfants.", "zhay trwah zahN-fahN", "I have three children."),
            ex("Il a dix-huit ans.", "eel ah deez-wee tahN", "He is eighteen.")
          ],
          watchOut: [
            note("Before a consonant, cinq, six, huit and dix often lose their final sound: six livres (see leevr). Before a vowel they link: six ans (see zahN)."),
            wo("Il est dix-huit.", "Il a dix-huit ans.", "eel ah deez-wee tahN", "age uses avoir and always ans.")
          ],
          keywords: ["numbers", "number", "counting", "zero", "un", "deux", "trois", "dix", "vingt"]
        },
        {
          id: "numbers-21-100", title: "Numbers 21–100",
          when: "From 70, French counts in twenties: 70 = 60 + 10, 80 = 4 × 20, 90 = 4 × 20 + 10. Use et un for 21, 31, 41, 51 and 61, and et onze for 71; there is no et in 81 or 91.",
          caption: "Numbers from 21 to 100", infoLabel: "Built as",
          rows: [
            r("vingt et un", "vaN-tay-uhN", "21", "20 et 1"),
            r("vingt-deux", "vaNt-duh", "22", "20-2"),
            r("trente", "trahNt", "30"),
            r("trente et un", "trahN-tay-uhN", "31", "30 et 1"),
            r("quarante", "kah-rahNt", "40"),
            r("cinquante", "saN-kahNt", "50"),
            r("soixante", "swah-sahNt", "60"),
            r("soixante-dix", "swah-sahNt-dees", "70", "60 + 10"),
            r("soixante et onze", "swah-sahN-tay-ohNz", "71", "60 et 11"),
            r("soixante-douze", "swah-sahNt-dooz", "72", "60 + 12"),
            r("quatre-vingts", "kah-truh-vaN", "80", "4 × 20 (with s)"),
            r("quatre-vingt-un", "kah-truh-vaN-uhN", "81", "4 × 20 + 1 (no s, no et)"),
            r("quatre-vingt-dix", "kah-truh-vaN-dees", "90", "4 × 20 + 10"),
            r("quatre-vingt-onze", "kah-truh-vaN-ohNz", "91", "4 × 20 + 11"),
            r("quatre-vingt-dix-neuf", "kah-truh-vaN-deez-nuhf", "99", "4 × 20 + 19"),
            r("cent", "sahN", "100")
          ],
          examples: [
            ex("Ma grand-mère a quatre-vingts ans.", "mah grahN-mair ah kah-truh-vaN zahN", "My grandmother is eighty."),
            ex("Ça coûte soixante-quinze euros.", "sah koot swah-sahNt-kaNz uh-roh", "It costs seventy-five euros."),
            ex("Il y a trente et un jours en mai.", "eel ee ah trahN-tay-uhN zhoor ahN meh", "There are thirty-one days in May.")
          ],
          watchOut: [
            wo("quatre-vingts-un", "quatre-vingt-un", "kah-truh-vaN-uhN", "quatre-vingts keeps its s only when nothing follows."),
            wo("quatre-vingt et un", "quatre-vingt-un", "kah-truh-vaN-uhN", "no et in 81 or 91."),
            note("In Belgium and Switzerland you'll also hear septante (70) and nonante (90); in Switzerland huitante (80).")
          ],
          keywords: ["soixante-dix", "quatre-vingts", "quatre-vingt", "quatre-vingt-dix", "et un", "seventy", "eighty", "ninety", "numbers", "hundred"]
        },
        {
          id: "ordinals", title: "Ordinal numbers: first, second...",
          when: "Add -ième to the number (drop a final e). Dates use le premier, then plain numbers: le deux mai.",
          caption: "Ordinal numbers", infoLabel: "Note",
          rows: [
            r("premier", "pruh-myay", "first", "m.; 1er"),
            r("première", "pruh-myair", "first", "f.; 1re"),
            r("deuxième", "duh-zyem", "second", "2e"),
            r("troisième", "trwah-zyem", "third", "3e"),
            r("quatrième", "kah-tree-yem", "fourth", "drop the e"),
            r("cinquième", "saN-kyem", "fifth", "add u"),
            r("neuvième", "nuh-vyem", "ninth", "f → v"),
            r("dixième", "dee-zyem", "tenth"),
            r("vingtième", "vaN-tyem", "twentieth")
          ],
          examples: [
            ex("J'habite au troisième étage.", "zhah-beet oh trwah-zyem ay-tahzh", "I live on the third floor."),
            ex("C'est le premier mai.", "seh luh pruh-myay meh", "It's the first of May."),
            ex("C'est le deux mai.", "seh luh duh meh", "It's the second of May.")
          ],
          watchOut: [
            wo("le deuxième mai", "le deux mai", "luh duh meh", "only the 1st takes premier in dates.")
          ],
          keywords: ["ordinal", "ordinals", "first", "second", "third", "premier", "deuxieme", "dates"]
        },
        {
          id: "days", title: "Days of the week",
          when: "No capital letters in French. Use le for a regular day: le lundi = on Mondays. For one day, no word for \"on\": lundi = on Monday.",
          caption: "Days of the week",
          rows: [
            r("lundi", "luhN-dee", "Monday"), r("mardi", "mar-dee", "Tuesday"), r("mercredi", "mair-kruh-dee", "Wednesday"),
            r("jeudi", "zhuh-dee", "Thursday"), r("vendredi", "vahN-druh-dee", "Friday"), r("samedi", "sahm-dee", "Saturday"),
            r("dimanche", "dee-mahNsh", "Sunday")
          ],
          examples: [
            ex("Je travaille le lundi.", "zhuh trah-vahy luh luhN-dee", "I work on Mondays."),
            ex("On se voit samedi ?", "ohN suh vwah sahm-dee", "Shall we meet on Saturday?")
          ],
          watchOut: [
            wo("Lundi", "lundi", "luhN-dee", "no capital letter."),
            wo("sur lundi", "lundi", "luhN-dee", "no word for \"on\" with a single day.")
          ],
          keywords: ["days", "days of the week", "week", "monday", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
        },
        {
          id: "months", title: "Months",
          when: "No capital letters. In a month: en mai or au mois de mai.",
          caption: "Months of the year",
          rows: [
            r("janvier", "zhahN-vyay", "January"), r("février", "fay-vree-yay", "February"), r("mars", "mars", "March"),
            r("avril", "ah-vreel", "April"), r("mai", "meh", "May"), r("juin", "zhwaN", "June"), r("juillet", "zhwee-yeh", "July"),
            r("août", "oot", "August"), r("septembre", "sep-tahN-bruh", "September"), r("octobre", "ok-toh-bruh", "October"),
            r("novembre", "noh-vahN-bruh", "November"), r("décembre", "day-sahN-bruh", "December")
          ],
          examples: [
            ex("Mon anniversaire est en juillet.", "mohN nah-nee-vair-sair eh tahN zhwee-yeh", "My birthday is in July."),
            ex("Je pars en août.", "zhuh par ahN noot", "I'm leaving in August."),
            ex("Il fait froid en décembre.", "eel feh frwah ahN day-sahN-bruh", "It's cold in December.")
          ],
          watchOut: [
            wo("Juillet", "juillet", "zhwee-yeh", "no capital letter."),
            wo("dans mai", "en mai", "ahN meh", "use en (or au mois de) with a month.")
          ],
          keywords: ["months", "month", "janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"]
        },
        {
          id: "telling-time", title: "Telling the time",
          when: "Il est + number + heure(s). Schedules, trains and shops use the 24-hour clock.",
          caption: "Telling the time", infoLabel: "Time",
          rows: [
            r("Quelle heure est-il ?", "kel uhr eh-teel", "What time is it?"),
            r("Il est une heure.", "eel eh tewn uhr", "It's one o'clock.", "1:00"),
            r("Il est deux heures.", "eel eh duh zuhr", "It's two o'clock.", "2:00"),
            r("Il est trois heures cinq.", "eel eh trwah zuhr saNk", "It's five past three.", "3:05"),
            r("Il est quatre heures et quart.", "eel eh kah-truhr ay kar", "It's quarter past four.", "4:15"),
            r("Il est cinq heures et demie.", "eel eh saN kuhr ay duh-mee", "It's half past five.", "5:30"),
            r("Il est six heures moins le quart.", "eel eh see zuhr mwaN luh kar", "It's quarter to six.", "5:45"),
            r("Il est sept heures moins dix.", "eel eh set uhr mwaN dees", "It's ten to seven.", "6:50"),
            r("Il est midi.", "eel eh mee-dee", "It's noon.", "12:00"),
            r("Il est minuit.", "eel eh mee-nwee", "It's midnight.", "0:00"),
            r("Il est dix-huit heures trente.", "eel eh deez-wee tuhr trahNt", "It's 6:30 pm.", "18:30 (24-hour)"),
            r("à huit heures", "ah wee tuhr", "at eight o'clock", "at")
          ],
          examples: [
            ex("Le film commence à vingt heures.", "luh feelm koh-mahNs ah vaN tuhr", "The film starts at 8 pm."),
            ex("On se retrouve à midi et demi ?", "ohN suh ruh-troov ah mee-dee ay duh-mee", "Shall we meet at half past twelve?")
          ],
          watchOut: [
            wo("Il est deux.", "Il est deux heures.", "eel eh duh zuhr", "always say heure(s)."),
            note("et demie after heure(s) (f.), but midi et demi and minuit et demi (no e).")
          ],
          links: [topic("Asking questions, lesson 5 (Quelle heure est-il ?)", "#topics/questions/Q5")],
          keywords: ["time", "telling the time", "what time", "heure", "heures", "quelle heure", "o'clock", "midi", "minuit"]
        },
        {
          id: "time-expressions", title: "Common time expressions",
          when: "Words for when and how often. They usually go at the start or the end of the sentence.",
          caption: "Common time expressions",
          rows: [
            r("aujourd'hui", "oh-zhoor-dwee", "today"), r("demain", "duh-maN", "tomorrow"), r("hier", "yair", "yesterday"),
            r("maintenant", "maNt-nahN", "now"), r("ce matin", "suh mah-taN", "this morning"), r("ce soir", "suh swahr", "this evening, tonight"),
            r("cette semaine", "set suh-men", "this week"), r("le week-end", "luh wee-kend", "at the weekend"),
            r("la semaine prochaine", "lah suh-men proh-shen", "next week"), r("l'année dernière", "lah-nay dair-nyair", "last year"),
            r("tous les jours", "too lay zhoor", "every day"), r("souvent", "soo-vahN", "often"), r("toujours", "too-zhoor", "always, still"),
            r("parfois", "par-fwah", "sometimes"), r("il y a deux jours", "eel ee ah duh zhoor", "two days ago"), r("depuis", "duh-pwee", "since, for")
          ],
          examples: [
            ex("J'apprends le français depuis un an.", "zhah-prahN luh frahN-seh duh-pwee uhN nahN", "I've been learning French for a year."),
            ex("Je suis arrivé il y a deux jours.", "zhuh swee zah-ree-vay eel ee ah duh zhoor", "I arrived two days ago.")
          ],
          watchOut: [
            wo("J'apprends le français pour un an.", "J'apprends le français depuis un an.", "zhah-prahN luh frahN-seh duh-pwee uhN nahN", "depuis + present for something still going on.")
          ],
          keywords: ["today", "tomorrow", "yesterday", "aujourd'hui", "demain", "hier", "depuis", "il y a", "ago", "time expressions"]
        }
      ]
    }
  ];

  var DATA = {
    version: 1,
    title: "French grammar tables",
    intro: "One place for the small words and patterns you need every day: articles, pronouns, possessives, this and that, question words, negatives, adjectives, prepositions, a verb summary, and numbers, dates and the time. Each table says when to use it, gives every French item with its pronunciation and a Listen button, then examples and the mistakes to watch out for.",
    respellingNote: "Pronunciations use the same English-style respelling as the verb guides (no IPA). Tables marked Preview go a little beyond A2.",
    categories: categories
  };

  if (typeof module !== "undefined" && module.exports) module.exports = DATA;
  if (root) root.VT_REFERENCE = DATA;
})(typeof window !== "undefined" ? window : null);
