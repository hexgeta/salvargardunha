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
  footer{padding:26px 0 60px;color:var(--muted);font-size:13px}
  footer a{color:var(--green);text-decoration:none}
  .disc{margin-top:14px;font-size:12.5px;color:#6f7a6f;border-top:1px solid var(--line);padding-top:14px}
`;

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

<footer>
  <div class="wrap">
    <div><a href="/read/">All documents</a> · <a href="/">salvargardunha.com</a></div>
    <p class="disc">Faithful English rendering of an official document published for public consultation on participa.pt (mirrored at <a href="/docs/${esc(d.slug)}.pdf">/docs/${esc(d.slug)}.pdf</a>). Summarised and translated section by section for readability — it is not an official translation, and quoted passages are our translation of the Portuguese original. Where a figure matters, check it against the source PDF. Informative, civic, non-profit page.</p>
  </div>
</footer>
</body>
</html>
`;
}

function indexPage(docs) {
  const cards = docs.map((d) => `      <a class="doc" href="/read/${esc(d.slug)}">
        <span class="doc-top"><span class="doc-t">${rich(d.title)}</span><span class="doc-s">${esc(d.date || '')}${d.pages ? ' · ' + esc(d.pages) + ' pp' : ''}</span></span>
        <span class="doc-sum">${rich(d.summary)}</span>
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
  .doc-s{color:var(--muted);font-size:12px;white-space:nowrap}
  .doc-sum{display:block;color:#9aa79a;font-size:14px;line-height:1.55;margin-top:7px}
</style>
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

<footer>
  <div class="wrap">
    <div><a href="/">salvargardunha.com</a></div>
    <p class="disc">Faithful English renderings of official documents published for public consultation on participa.pt, mirrored under /docs/. Summarised and translated for readability — not official translations. Informative, civic, non-profit page.</p>
  </div>
</footer>
</body>
</html>
`;
}

// ---- build ----
if (!fs.existsSync(SRC)) { console.error('no content/docs — nothing to build'); process.exit(0); }
fs.mkdirSync(OUT, { recursive: true });

const ORDER = [
  'abc-zaer', 'proposta-pszaer', 'aae-resumo-nao-tecnico', 'aae-relatorio-preliminar',
  'rt-paisagem', 'rt-ecologia', 'rt-ordenamento', 'rt-energia', 'rt-juridico',
  'rt-espacializada', 'pareceres-entidades', 'analise-pareceres',
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
