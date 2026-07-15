#!/usr/bin/env node
// One-off: add a short `blurb` (one line for the /read/ index) and a short `tag`
// (disambiguating kicker) to each content/docs/*.json. Idempotent — overwrites
// only these two fields. Run: node scripts/add-blurbs.js
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'content', 'docs');

const M = {
  'analise-pareceres': { tag: 'The Government’s reply', blurb: 'The Government’s response to the objections — two thirds changed nothing.' },
  'pareceres-entidades': { tag: 'The bodies’ opinions', blurb: 'The State’s own bodies’ formal opinions — not one gave unconditional approval.' },
  'abc-zaer': { tag: 'Start here', blurb: 'Plain-language intro: what the acceleration zones are, and the timeline.' },
  'proposta-pszaer': { tag: 'The proposal', blurb: 'The core plan: where solar and wind get fast-tracked, with the EIA waived.' },
  'aae-relatorio-preliminar': { tag: 'Environmental assessment', blurb: 'The 249-page assessment — admits the risks and that opposition is legitimate.' },
  'aae-resumo-nao-tecnico': { tag: 'Assessment · summary', blurb: 'The plain-language version of the environmental assessment.' },
  'rt-ecologia': { tag: 'Ecology', blurb: 'Wind kills raptors and bats; data on species outside protected areas is thin.' },
  'rt-espacializada': { tag: 'The maps', blurb: 'How the zone maps were drawn — and the limits the authors admit.' },
  'rt-paisagem': { tag: 'Landscape', blurb: 'Names the Gardunha in the country’s most-targeted landscape group.' },
  'rt-energia': { tag: 'Energy', blurb: 'The real brake isn’t land — it’s the grid and the licensing queue.' },
  'rt-juridico': { tag: 'Legal', blurb: 'The single-window licensing regime that replaces the full EIA.' },
  'rt-ordenamento': { tag: 'Territory & economy', blurb: 'Zones far exceed the 2030 needs; warns of land speculation in the interior.' },
};

for (const f of fs.readdirSync(SRC).filter((f) => f.endsWith('.json'))) {
  const p = path.join(SRC, f);
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  const m = M[d.slug];
  if (!m) { console.warn('no blurb for', d.slug); continue; }
  d.tag = m.tag;
  d.blurb = m.blurb;
  fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n');
  console.log('updated', d.slug);
}
