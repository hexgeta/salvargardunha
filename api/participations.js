// Serverless function (Vercel) — live count of submitted contributions on the
// PSZAER public consultation at participa.pt.
//
// There is no public JSON API, but the portal server-renders the counters
// (<span class="value n-participations">) so we scrape them.
//
// NO FALLBACK BY DESIGN: if we can't read the real number we return count:null
// and the page simply hides the counter. A stale hardcoded number that looks
// live is worse than showing nothing.
//
// Two gotchas, both verified the hard way:
//  1. participa.pt firewalls datacenter IPs — a direct fetch from Vercel never
//     connects. We tunnel through the Webshare proxy (env WEBSHARE_PROXY_URL),
//     and undici ignores credentials embedded in a proxy URL, so they have to be
//     passed explicitly as a Proxy-Authorization token.
//  2. participa.pt serves an INCOMPLETE cert chain (leaf only, no intermediate).
//     Browsers/curl work around it via AIA fetching; Node throws "unable to
//     verify the first certificate". We only read a public counter and send no
//     credentials, so verification is skipped on this one tunneled request.

const { ProxyAgent } = require('undici');

const TARGET = 'https://participa.pt/pt/consulta/programa-setorial-das-zonas-de-aceleracao-da-implantacao-de-energias-renovaveis-pszaer';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Only SOME Webshare exit IPs can reach participa.pt (most get refused), so we
// try a few different pinned exits (username-N) and take the first that answers.
function proxyAgent(raw, exit) {
  const u = new URL(raw);
  const user = decodeURIComponent(u.username) + (exit ? '-' + exit : '');
  return new ProxyAgent({
    uri: u.protocol + '//' + u.host,
    token: 'Basic ' + Buffer.from(user + ':' + decodeURIComponent(u.password)).toString('base64'),
    requestTls: { rejectUnauthorized: false },
  });
}

function randomExits(n, max) {
  const out = [];
  while (out.length < n) {
    const e = 1 + Math.floor(Math.random() * max);
    if (!out.includes(e)) out.push(e);
  }
  return out;
}

function num(html, cls) {
  const m = html.match(new RegExp('class="value ' + cls + '"[^>]*>\\s*([\\d.,\\s]+)<', 'i'));
  if (!m) return 0;
  return parseInt(m[1].replace(/[^\d]/g, ''), 10) || 0;
}

async function attempt(proxy, exit, ms) {
  const opts = {
    headers: { 'User-Agent': UA, 'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8' },
    signal: AbortSignal.timeout(ms),
  };
  if (proxy) opts.dispatcher = proxyAgent(proxy, exit);
  const r = await fetch(TARGET, opts);
  const html = await r.text();
  return { count: num(html, 'n-participations'), follows: num(html, 'n-follows') };
}

module.exports = async (req, res) => {
  const proxy = process.env.WEBSHARE_PROXY_URL;
  const debug = req.query && req.query.debug === '1';
  const tried = [];

  // Most exits get refused by participa.pt; try a handful, short timeouts, and
  // stay well inside the platform's function limit. First one that answers wins.
  const exits = proxy ? randomExits(4, 20000) : [null];

  for (const exit of exits) {
    try {
      const { count, follows } = await attempt(proxy, exit, 3500);
      if (count) {
        res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
        res.status(200).json({ count, follows: follows || null, source: 'live' });
        return;
      }
      tried.push({ exit, err: 'no-count-in-html' });
    } catch (e) {
      tried.push({ exit, err: String(e && e.message) });
    }
  }

  // Never invent a number — hide the counter instead.
  res.setHeader('Cache-Control', 'no-store');
  const body = { count: null, follows: null, source: 'unavailable' };
  if (debug) { body.hasProxy = Boolean(proxy); body.tried = tried; }
  res.status(200).json(body);
};
