# no-farms.hexgeta.com — "Salvar a Gardunha" campaign

Static campaign page opposing the PSZAER solar/wind "acceleration zones" over the
Serra da Gardunha / Beira Baixa. Hosted on Vercel, auto-deploys on push to `main`
of this GitHub repo (hexgeta/no-farms). Custom domain via Porkbun CNAME.

## ⚠️ TRILINGUAL — always keep PT / DE / FR in sync
The page is trilingual: **Portuguese (default), German, French**, driven by a
`data-i18n` dictionary in `index.html` (the `I18N` object) plus a language switcher.

**Any change to visible content — new text, edited text, a new section — MUST be
applied to all three languages.** Add/translate the string in `I18N.pt`, `I18N.de`
AND `I18N.fr`. Never ship PT-only text. Image captions and alt text count too.
The AI "gerar contributo" endpoint (`api/generate.js`) also generates in the
selected language — keep its `lang` handling in sync.

## Structure
- `index.html` — the page: i18n dict + switcher, countdown to 15 Jul 2026, share
  buttons, the AI "gerar contributo" box, the map, the images gallery, PDF downloads.
- `api/generate.js` — OpenAI gpt-mini serverless function that returns a UNIQUE
  objection text (per selected language). Env var `OPENAI_API_KEY` is set on Vercel.
- `mapa-oficial.png` — the official ZAER map (Figura 39) with the Gardunha marked.
- `img/` — campaign images (the "what they plan" gallery + the Marateca before/after slider).

## Facts
Every figure/quote comes from the official PSZAER consultation documents on
participa.pt (May 2026). Do not invent numbers.
