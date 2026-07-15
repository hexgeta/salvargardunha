#!/usr/bin/env node
// Generates the English reading pages under /read/ from content/docs/*.json.
// Run: node scripts/build-doc-pages.js
//
// Each JSON is a faithful English rendering of one official PSZAER consultation
// document: summary, key figures, section-by-section content and quoted passages.
// The original Portuguese PDF is always linked (mirrored under /docs/).

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'content', 'docs');
const OUT = path.join(ROOT, 'read');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Content may arrive with real tags (<b>) or entity-escaped ones (&lt;b&gt;),
// so decode first, then escape everything, then re-allow just the safe tags.
const decode = (s) => String(s == null ? '' : s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const rich = (s) => esc(decode(s))
  .replace(/&lt;(\/?)(b|i|em|strong)&gt;/g, '<$1$2>');

// For meta tags / titles: no markup at all.
const plain = (s) => esc(decode(s).replace(/<[^>]+>/g, ''));

const CSS = `
  :root{--bg:#0a0d0a;--panel:#141a14;--line:#243024;--ink:#f3f5f1;--muted:#9aa79a;--green:#4ade80;--green-d:#22c55e;--amber:#fbbf24;--max:820px}
  *{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  body{background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.7;-webkit-font-smoothing:antialiased}
  .wrap{max-width:var(--max);margin:0 auto;padding:0 22px}
  a{color:var(--green)}
  .top{border-bottom:1px solid var(--line);padding:16px 0;font-size:14px}
  .top a{text-decoration:none;color:var(--muted)}.top a:hover{color:var(--green)}
  header{padding:40px 0 30px;border-bottom:1px solid var(--line)}
  .eyebrow{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--green);font-weight:700;margin-bottom:12px}
  h1{font-size:clamp(26px,4.4vw,40px);line-height:1.1;font-weight:900;letter-spacing:-.02em}
  .meta{margin-top:14px;color:var(--muted);font-size:14px}
  .meta .pt{color:#c3cbbf;font-style:italic}
  .sum{margin-top:26px;background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--green);border-radius:12px;padding:18px 20px}
  .sum h2{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--green);font-weight:700;margin-bottom:9px}
  .sum p{color:#dfe6da;font-size:16.5px}
  .figs{display:flex;gap:12px;flex-wrap:wrap;margin-top:20px}
  .figs .f{flex:1;min-width:140px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
  .figs .n{font-size:23px;font-weight:900;color:var(--green);line-height:1.1;font-variant-numeric:tabular-nums}
  .figs .l{font-size:12.5px;color:var(--muted);margin-top:6px;line-height:1.4}
  .cta{margin-top:24px;display:flex;gap:10px;flex-wrap:wrap}
  .btn{display:inline-flex;align-items:center;gap:8px;font-weight:700;font-size:14.5px;padding:11px 17px;border-radius:11px;text-decoration:none;border:1px solid transparent}
  .btn-primary{background:var(--green-d);color:#05230f}.btn-primary:hover{background:var(--green)}
  .btn-ghost{background:transparent;border-color:var(--line);color:var(--ink)}.btn-ghost:hover{border-color:var(--green);color:var(--green)}
  main{padding:34px 0 10px}
  section{padding:22px 0;border-bottom:1px solid var(--line)}
  section:last-of-type{border-bottom:0}
  h3{font-size:clamp(19px,2.8vw,24px);font-weight:800;letter-spacing:-.01em;margin-bottom:6px}
  section p{color:#ccd3c9;margin-top:13px;font-size:16.5px}
  section p b{color:#fff}
  blockquote{margin-top:16px;border-left:3px solid var(--amber);padding:4px 0 4px 16px;color:#e7ecdf;font-style:italic;font-size:16.5px}
  blockquote .cite{display:block;margin-top:7px;font-style:normal;font-size:13px;color:var(--muted)}
  .foot-cta{margin:34px 0;background:linear-gradient(180deg,#0d2412,#153920);border:1px solid #2e6b3c;border-radius:14px;padding:22px}
  .foot-cta p{color:var(--amber);margin:0 0 14px;font-size:16px}
  .foot-cta p b{color:#fff}
  footer{padding:40px 0 60px;color:var(--muted);font-size:13px;border-top:1px solid var(--line);margin-top:20px}
  footer a{color:var(--green);text-decoration:none}
  .foot-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:26px}
  .foot-col h4{font-size:11px;letter-spacing:.11em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:11px}
  .foot-col a{display:block;color:#dfe6da;text-decoration:none;padding:5px 0;font-size:14px;line-height:1.35}
  .foot-col a:hover{color:var(--green)}
  .disc{margin-top:26px;font-size:12.5px;color:#6f7a6f;border-top:1px solid var(--line);padding-top:16px;line-height:1.6}
`;

// Shared columned footer (English — used across all /read pages). `extra` is an
// optional page-specific fine-print appended to the disclaimer line.
function footer(extra) {
  return `<footer>
  <div class="wrap">
    <div class="foot-cols">
      <div class="foot-col"><h4>The campaign</h4>
        <a href="/">Home</a>
        <a href="/#passos">Take action in the consultation</a>
        <a href="/social">Spread the word</a>
      </div>
      <div class="foot-col"><h4>Documents &amp; data</h4>
        <a href="/read/">Documents in English</a>
        <a href="/objecoes">The 172 objections</a>
        <a href="/mapa">The maps of the areas</a>
      </div>
      <div class="foot-col"><h4>Official sources</h4>
        <a href="https://participa.pt/pt/consulta/programa-setorial-das-zonas-de-aceleracao-da-implantacao-de-energias-renovaveis-pszaer" target="_blank" rel="noopener">PSZAER consultation (participa.pt)</a>
        <a href="https://participacao.parlamento.pt/initiatives/5569" target="_blank" rel="noopener">Petition in Parliament</a>
        <a href="https://renovaveisparticipa.pt/" target="_blank" rel="noopener">Renováveis Participa (EMER)</a>
      </div>
    </div>
    <p class="disc">Made by neighbours of the Beira Baixa who want the mountain left standing. Informative, civic, non-profit page, not affiliated with any party, company or public body.${extra ? ' ' + extra : ''}</p>
  </div>
</footer>`;
}

function page(d) {
  const figs = (d.keyFigures || []).map((f) =>
    `<div class="f"><div class="n">${esc(f.n)}</div><div class="l">${rich(f.label)}</div></div>`).join('');

  const secs = (d.sections || []).map((s) => {
    const paras = (s.paras || []).map((p) => `<p>${rich(p)}</p>`).join('\n        ');
    const quotes = (s.quotes || []).map((q) =>
      `<blockquote>“${rich(q.q)}”<span class="cite">${rich(q.cite || d.titlePt || '')}</span></blockquote>`).join('\n        ');
    return `      <section>
        <h3>${rich(s.h)}</h3>
        ${paras}
        ${quotes}
      </section>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.title)} — PSZAER in English</title>
<meta name="description" content="${plain(d.summary || '').slice(0, 180)}">
<link rel="canonical" href="https://salvargardunha.com/read/${esc(d.slug)}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%E2%9B%B0%EF%B8%8F%3C/text%3E%3C/svg%3E">
<style>${CSS}</style>
<script defer data-domain="salvargardunha.com" src="https://analytics.hexgeta.com/script.js"></script>
</head>
<body>

<div class="top"><div class="wrap"><a href="/read/">← All documents in English</a> · <a href="/">salvargardunha.com</a></div></div>

<header>
  <div class="wrap">
    <div class="eyebrow">PSZAER consultation · document in English</div>
    <h1>${rich(d.title)}</h1>
    <p class="meta"><span class="pt">${esc(d.titlePt || '')}</span><br>${esc(d.authors || '')}${d.authors && d.date ? ' · ' : ''}${esc(d.date || '')}${d.pages ? ' · ' + esc(d.pages) + ' pages' : ''}</p>

    <div class="sum">
      <h2>Summary</h2>
      <p>${rich(d.summary)}</p>
    </div>

    ${figs ? `<div class="figs">${figs}</div>` : ''}

    <div class="cta">
      <a class="btn btn-primary" href="/#passos">Object in the consultation →</a>
      <a class="btn btn-ghost" href="/docs/${esc(d.slug)}.pdf" target="_blank" rel="noopener">Original PDF (Portuguese)</a>
    </div>
  </div>
</header>

<main>
  <div class="wrap">
${secs}

    <div class="foot-cta">
      <p><b>The public consultation is how this gets challenged.</b> Objections are part of the official decision process and must be considered by law.</p>
      <a class="btn btn-primary" href="/#passos">See how to object →</a>
    </div>
  </div>
</main>

${footer(`Faithful English rendering of an official document published for public consultation on participa.pt (mirrored at <a href="/docs/${esc(d.slug)}.pdf">/docs/${esc(d.slug)}.pdf</a>) — not an official translation; quoted passages are our translation of the Portuguese original. Where a figure matters, check it against the source PDF.`)}
</body>
</html>
`;
}

function indexPage(docs) {
  const cards = docs.map((d) => `      <a class="doc" href="/read/${esc(d.slug)}">
        <span class="doc-top"><span class="doc-t">${d.tag ? `<span class="doc-tag">${rich(d.tag)}</span>` : ''}${rich(d.title)}</span><span class="doc-s">${esc(d.date || '')}${d.pages ? ' · ' + esc(d.pages) + ' pp' : ''}</span></span>
        <span class="doc-sum">${rich(d.blurb || d.summary)}</span>
      </a>`).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The PSZAER consultation documents — in English</title>
<meta name="description" content="All ${docs.length} official documents of the Portuguese PSZAER renewable-acceleration-zones consultation, rendered in readable English with summaries.">
<link rel="canonical" href="https://salvargardunha.com/read/">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%E2%9B%B0%EF%B8%8F%3C/text%3E%3C/svg%3E">
<style>${CSS}
  .doc{display:block;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:15px 17px;text-decoration:none;margin-top:11px;transition:border-color .15s ease}
  .doc:hover{border-color:var(--green)}
  .doc-top{display:flex;justify-content:space-between;align-items:baseline;gap:14px}
  .doc-t{color:var(--ink);font-weight:700;font-size:16px;line-height:1.35}
  .doc-tag{display:block;color:var(--green);font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px}
  .doc-s{color:var(--muted);font-size:12px;white-space:nowrap}
  .doc-sum{display:block;color:#9aa79a;font-size:14px;line-height:1.55;margin-top:7px}
</style>
<script defer data-domain="salvargardunha.com" src="https://analytics.hexgeta.com/script.js"></script>
</head>
<body>

<div class="top"><div class="wrap"><a href="/">← salvargardunha.com</a></div></div>

<header>
  <div class="wrap">
    <div class="eyebrow">PSZAER consultation</div>
    <h1>The official documents,<br>in readable English</h1>
    <p class="meta">All ${docs.length} documents of the public consultation on Portugal's renewable-energy acceleration zones — the plan that puts the Serra da Gardunha in the most targeted region of the country. Each one summarised and rendered section by section in English, with the original Portuguese PDF linked.</p>
    <div class="cta">
      <a class="btn btn-primary" href="/#passos">Object in the consultation →</a>
    </div>
  </div>
</header>

<main>
  <div class="wrap">
    <section style="border-bottom:0">
${cards}
    </section>
  </div>
</main>

${footer('Faithful English renderings of official documents published for public consultation on participa.pt, mirrored under /docs/ — summarised and translated for readability, not official translations.')}
</body>
</html>
`;
}

// ---- build ----
if (!fs.existsSync(SRC)) { console.error('no content/docs — nothing to build'); process.exit(0); }
fs.mkdirSync(OUT, { recursive: true });

// Newest first — the story reads better backwards: the Government's reply to the
// objections, then the objections themselves, then the documents being objected to.
const ORDER = [
  'analise-pareceres',        // 23 Jun 2026
  'pareceres-entidades',      // 16 Jun 2026
  'abc-zaer',                 // Jun 2026
  'proposta-pszaer',          //  5 May 2026
  'aae-relatorio-preliminar', //  5 May 2026
  'aae-resumo-nao-tecnico',   //  5 May 2026
  'rt-ecologia',              //  5 May 2026
  'rt-espacializada',         //  3 May 2026
  'rt-paisagem',              //  2 May 2026
  'rt-energia',               //  2 May 2026
  'rt-juridico',              //  2 May 2026
  'rt-ordenamento',           //  2 May 2026
];

const docs = fs.readdirSync(SRC).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8')))
  .sort((a, b) => {
    const ia = ORDER.indexOf(a.slug), ib = ORDER.indexOf(b.slug);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

for (const d of docs) {
  fs.writeFileSync(path.join(OUT, d.slug + '.html'), page(d));
  console.log('built read/' + d.slug + '.html');
}
fs.writeFileSync(path.join(OUT, 'index.html'), indexPage(docs));
console.log('built read/index.html  (' + docs.length + ' documents)');
