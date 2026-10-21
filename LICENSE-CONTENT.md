# Content Licence — CC BY-SA 4.0

The following learning materials in this repository are copyright © 2026 Avtar Singh and are
licensed under the **Creative Commons Attribution-ShareAlike 4.0 International** licence
(CC BY-SA 4.0):

- Verb guides and workbooks (25-most-common-french-verbs.md/.pdf, french-verbs-workbook.pdf)
- Extended verb guide and workbook (100-more-common-french-verbs.md/.pdf, 100-more-french-verbs-workbook.pdf)
- Topic guides and workbooks (topics/01-asking-questions.*, topics/02-reflexive-verbs.*)
- Topic lesson data and exercises (verb-trainer/js/topics-data.js)
- Grammar tables (french-grammar-tables.md, verb-trainer/reference/french-grammar-tables.*, verb-trainer/js/reference-data.js)
- Everyday expressions (french-expressions.md, verb-trainer/reference/french-expressions.*, verb-trainer/js/expressions-data.js)
- Dialogues, all 20 everyday conversations (french-dialogues.md, verb-trainer/reference/french-dialogues.*, verb-trainer/js/dialogues-data.js)
- Story *La Lettre de Lyon*, 20 episodes (la-lettre-de-lyon.md, verb-trainer/reference/la-lettre-de-lyon.*, the story records in verb-trainer/js/dialogues-data.js)
- Story *Le Café des Questions*, 20 episodes (le-cafe-des-questions.md, verb-trainer/reference/le-cafe-des-questions.*, the story records in verb-trainer/js/dialogues-data.js)
- Any other written instructional content authored by Avtar Singh in this repository

**Deed:** <https://creativecommons.org/licenses/by-sa/4.0/>

You are free to share and adapt this material for any purpose, including commercially, provided
you give appropriate credit, link to the licence, and distribute your adaptations under the same
licence.

---

## Audio — separate licences

**Lingua Libre native-speaker recordings** (files in verb-trainer/audio/ excluding the tts/ subfolder)
keep their original per-clip licences: CC0, CC BY 4.0, CC BY-SA 3.0, or CC BY-SA 4.0, as recorded
by volunteer contributors on Lingua Libre / Wikimedia Commons. Full attribution — speaker names,
licence per clip, and source URLs — is in **verb-trainer/audio/CREDITS.md**.

**Qwen3-TTS synthetic voice clips** (files in verb-trainer/audio/tts/qwen3-fr-bf16/ and
verb-trainer/audio/tts/qwen3-fr-m-bf16/) were generated with the open text-to-speech model
`mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16` (Qwen3-TTS 1.7B Base, Qwen team / Alibaba Cloud) and are
provided under the **Apache License 2.0**, as stated in each folder's **CREDITS.md**. The second (male)
voice was designed from a text description; neither voice is a recording or clone of a real person.

---
## Illustrations — separate terms
The *La Lettre de Lyon* pictures (verb-trainer/images/story/cover.webp and ep*.webp, and the copies embedded in
verb-trainer/reference/la-lettre-de-lyon.pdf) are **not** covered by the CC BY-SA licence above. They were
AI-generated with Stability AI models via Amazon Bedrock (Stable Diffusion 3.5 Large for the cover and
episodes 1–19, including episode 8; Stable Image Ultra for episode 20), from prompts and character designs by the project
author. Episodes 16 and 18 have a small hand retouch (tools/story-images/retouch.py). Every prompt, negative
prompt, seed and model id is in tools/story-images/manifest.json. They show fictional characters only.
Episode 8 shows M. Brun alone (Stable Diffusion 3.5 Large).

**Public.** The site deploys to GitHub Pages (.github/workflows/pages.yml), so these pictures are
published publicly at https://asmehra95.github.io/learn-french-for-beginners/ and in the public repository.

**Which terms apply.** The models were used as a service through Amazon Bedrock, not downloaded. So the
governing terms are the
[Stability AI Amazon Bedrock End User License Agreement](https://aws.amazon.com/legal/bedrock/third-party-models/)
(Stability AI sells its Bedrock models; using them means agreeing to this EULA), together with the
[AWS Service Terms](https://aws.amazon.com/service-terms/) (section 50.12, Amazon Bedrock) and the
[AWS Responsible AI Policy](https://aws.amazon.com/ai/responsible-ai/policy/). The
[Stability AI Community License](https://stability.ai/community-license-agreement) covers self-hosting the
model weights and does not govern these outputs.

**In plain language** (a summary, not legal advice):

- *Ownership.* As between the user and Stability AI, the user owns the generated images to the extent
  applicable law allows. Stability AI keeps the models. Purely AI-generated images may have little or no
  copyright protection in some countries, so others may be free to reuse them.
- *Public and commercial redistribution.* Neither the Stability EULA nor the AWS terms forbid publishing,
  sharing or commercial use of outputs. The user is responsible for how they are shared ("Content Sharing").
- *Conditions.* No attribution is required. Outputs and sharing must not break the law, infringe
  intellectual-property, privacy or publicity rights, depict real people's likeness without consent, harass,
  deceive or mislead, or include sensitive personal data (Stability "Prohibited Uses", AWS Responsible AI
  Policy). Under AWS Service Terms 50.12.6, provenance data (metadata, signatures or watermarks marking an
  output as AI-generated) that Bedrock adds must not be removed or altered.

**What was checked and what was not.** Checked on 19 October 2026: the Stability AI section of the Bedrock
third-party model terms page (EULA "Last Updated: April 29, 2024"), AWS Service Terms section 50.12
(page "Last Updated: October 13, 2026"), the AWS Responsible AI Policy (January 13, 2025) and the Bedrock
model cards for both models, which link to the third-party terms page. The raw PNGs from Bedrock carry no
metadata besides an `fdEC` chunk written by the fpng encoder (no C2PA, XMP or text chunks), so stripping
metadata removed no provenance data. Not checked: whether the images carry an invisible watermark in the pixels
(the resize, WebP compression and the two retouches could weaken one), copyright law in any particular country, and any terms the terms
pages incorporate by reference beyond those named here. The terms can change; the links above are the
current versions.

### Le Café des Questions
The *Le Café des Questions* pictures (verb-trainer/images/story/cafe-ep*.webp and the copies embedded in
verb-trainer/reference/le-cafe-des-questions.pdf) are **not** covered by the CC BY-SA licence above. They were
AI-generated with the open image-editing model
[Qwen-Image-Edit-2511](https://huggingface.co/Qwen/Qwen-Image-Edit-2511) (Qwen team, Alibaba Cloud), released
under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0), run on the author's own AWS GPU
(an Amazon EC2 GPU instance in the author's account), from prompts and character designs by the project
author. Each episode picture is an edit of a cast sheet of the recurring characters, which the same model
painted from text descriptions on a blank canvas. Every prompt, negative prompt, seed, reference-sheet hash and
the model revision is in tools/story-images/manifest-cafe.json. They show fictional characters only.
12 of the 20 episodes have a picture (dialogues 42, 44, 46, 47, 48, 49, 50, 52, 53, 56, 57 and 59); the other
8 had no take that passed review and have none.

**Public.** Like the other pictures, they are published publicly with the site on GitHub Pages and in the
public repository.

**Which terms apply.** The model weights were downloaded and run by the author, not used through a hosted
model service, so the governing licence is the Apache License 2.0 of the model, which covers the model
weights and code.

**In plain language** (a summary, not legal advice):

- *Ownership.* The Apache License 2.0 places no conditions on images made with the model. Purely
  AI-generated images may have little or no copyright protection in some countries, so others may be free to
  reuse them.
- *Public and commercial redistribution.* Not restricted by the model licence. No attribution is required for
  the pictures; the Credits page names the model anyway.
- *Conditions.* The author is responsible for how the pictures are shared; they show fictional characters
  only.

**What was checked and what was not.** Checked on 21 October 2026: the model card at
huggingface.co/Qwen/Qwen-Image-Edit-2511 states that Qwen-Image is licensed under Apache 2.0. The WebPs were
written from fresh pixel buffers with no metadata. Not checked: copyright law in any particular country.
