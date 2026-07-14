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

Participa.pt UI labels (“Registo”, “Individual”, “Registar”, “Entrar”,
“Participar”, “Submeter”) stay in **Portuguese in every language** — the how-to
steps describe clicks on a Portuguese-only site. Translate the surrounding text,
never the quoted button names.

### ⚠️ Quote-corruption hazard when editing `index.html` (broke prod once)
The file mixes three quote styles: **straight `'`/`"` for JS string delimiters
and HTML attributes**, and **typographic `’` `“ ”` `„ “` `« »` only inside
visible text**. The Edit tool fuzzy-matches quotes: if `old_string` uses straight
quotes where the file has curly ones (or vice versa), it may still "succeed" and
silently swap quote styles in the written text. This has produced BOTH failure
modes: curly `”` inside HTML attributes (`href=”…”` — broken markup) and curly
`’` as JS string delimiters in `I18N` (`act1_h:’…’` — a syntax error that killed
the ENTIRE script: no translations, no countdown, no share buttons).

Rules:
1. Before editing any line containing quotes, Read/grep the exact bytes and copy
   them verbatim into `old_string` — never retype quotes from memory.
2. In `new_string`: straight quotes for code (JS delimiters, HTML attributes);
   curly quotes only inside human-visible text. An apostrophe inside a
   single-quoted JS string must be curly `’` (e.g. `'C’est'`), never straight.
3. After ANY edit touching the `<script>` block, verify it parses:
   `sed -n '/<script>/,/<\/script>/p' index.html | sed '1d;$d' | node --check /dev/stdin`
   and `grep -n '=”' index.html` must return nothing.

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
- `mapa-oficial.png` — the official ZAER map (Figura 39) with the Gardunha marked
  (regenerated from the PDF, page 69 of rt-espacializada; circle at the verified
  Gardunha location 40.18°N 7.34°W).
- `docs/` — local mirror of all 12 official consultation PDFs (so they outlive
  participa.pt), listed on the page in release-date order with quadrilingual
  summaries (i18n keys `sum_*`). Summaries were written from the actual PDFs —
  keep them faithful; don't invent numbers.
- `api/page.js` — serves index.html on /en /de /fr with language-swapped OG/meta
  tags (crawlers don't run JS); rewired in vercel.json. OG images are
  `img/og-{pt,en,de,fr}.jpg`.
- `img/` — campaign images: the "what they plan" gallery, the Marateca
  before/after slider pair, and `gardunha-hero.jpg` (hero background — CC BY-SA 4.0
  by Jocehcap11, Wikimedia Commons; credit link in the footer must stay).

## Facts
Every figure/quote comes from the official PSZAER consultation documents on
participa.pt (May 2026). Do not invent numbers.

**Petition thresholds** (verified against Lei 43/90, as amended by Lei 63/2020 —
an earlier version of this file had these backwards and wrong):
- **> 1 000** signatures → hearing of the petitioners is mandatory (Art. 21.º).
  Long since passed.
- **> 7 500** signatures → mandatory debate in Plenary (Art. 24.º(1)(a)). This is
  the live target the `.pet-band` progress bar counts toward.
- The old **4 000** debate threshold is obsolete (pre-Lei 63/2020). Don't use it.

## Live counters — participa.pt blocks datacenter IPs
`api/petition.js` (parliament) scrapes fine from Vercel. `api/participations.js`
(participa.pt consultation contribution count) does NOT: participa.pt firewalls
datacenter IPs, so a direct fetch from Vercel never connects. It goes through the
Webshare proxy (`WEBSHARE_PROXY_URL` env var on Vercel), and two things bite:
- undici **ignores credentials embedded in a proxy URL** — pass them explicitly as
  a `Proxy-Authorization` token on `ProxyAgent`.
- participa.pt serves an **incomplete cert chain** (leaf only), so Node throws
  "unable to verify the first certificate" — `requestTls.rejectUnauthorized:false`
  on that read-only request.
- Only *some* proxy exits get through, so the function retries across several
  pinned exits (`username-N`) and takes the first that answers.

**No fallback numbers.** If a count can't be read live, the endpoint returns
`count:null` and the page hides the counter. A stale number that looks live is
worse than no number.
