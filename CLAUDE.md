# salvargardunha.com — "Salvar a Gardunha" campaign

Static campaign page opposing the PSZAER solar/wind "acceleration zones" over the
Serra da Gardunha / Beira Baixa. Hosted on Vercel, auto-deploys on push to `main`
of this GitHub repo (hexgeta/salvargardunha). Canonical domain **salvargardunha.com**
(Porkbun: apex A → 76.76.21.21, www CNAME → cname.vercel-dns.com). Old hosts
(salvargardunha.hexgeta.com, salvaragardunha.hexgeta.com, no-farms.hexgeta.com, www)
308-redirect to it via `vercel.json`.

## ⚠️ QUADRILINGUAL — always keep PT / EN / DE / FR in sync
The page is quadrilingual: **Portuguese (default), English, German, French**, driven
by a `data-i18n` dictionary in `index.html` (the `I18N` object) plus a language
switcher. `data-i18n-alt` / `data-i18n-aria` translate `alt` and `aria-label`
attributes through the same dictionaries.

**Any change to visible content — new text, edited text, a new section — MUST be
applied to all four languages.** The PT string lives in the HTML itself; add the
translation to `I18N.en`, `I18N.de` AND `I18N.fr` (plus `STR.*` for JS-generated
strings). Never ship PT-only text. Image captions and alt text count too.
The AI "gerar contributo" endpoint (`api/generate.js`) also generates in the
selected language — keep its `lang` handling in sync.

## Structure
- `index.html` — the page: i18n dict + switcher, countdown to 15 Jul 2026, the
  draggable Marateca before/after slider + campaign gallery (under the hero), the
  map, the AI "gerar contributo" box, PDF downloads, share buttons, and the
  `.pet-band` petition progress band repeated 3× as a section divider (live count,
  progress bar to 7 500, milestone note; primary CTA = consultation, secondary = petition).
- `api/generate.js` — OpenAI gpt-mini serverless function that returns a UNIQUE
  objection text (per selected language). Env var `OPENAI_API_KEY` is set on Vercel.
- `api/petition.js` — scrapes the live online-signature count from
  participacao.parlamento.pt/initiatives/5569 (edge-cached 30 min; hardcoded
  fallback count — bump it occasionally).
- `mapa-oficial.png` — the official ZAER map (Figura 39) with the Gardunha marked.
- `img/` — campaign images: the "what they plan" gallery, the Marateca
  before/after slider pair, and `gardunha-hero.jpg` (hero background — CC BY-SA 4.0
  by Jocehcap11, Wikimedia Commons; credit link in the footer must stay).

## Facts
Every figure/quote comes from the official PSZAER consultation documents on
participa.pt (May 2026). Do not invent numbers. Petition milestones used on the
page: 4 000 signatures = debate guaranteed (already passed), 7 500 = mandatory
hearing of the petitioners.
