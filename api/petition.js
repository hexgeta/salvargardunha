// Serverless function (Vercel) — live TOTAL signature count for the petition
// at participacao.parlamento.pt/initiatives/5569.
//
// NO FALLBACK BY DESIGN: if we can't read the real number we return count:null
// and the page simply hides the counter. A stale hardcoded number that looks
// live is worse than showing nothing.
//
// The portal server-renders the count ("Total de assinaturas: <n>"), so we
// scrape it — but it firewalls datacenter IPs, so a direct fetch from Vercel
// gets no count. We try bare first (fast, no proxy bandwidth) and, if that
// yields nothing, tunnel through the Webshare proxy (env WEBSHARE_PROXY_URL).
// undici ignores credentials embedded in a proxy URL, so they're passed
// explicitly as a Proxy-Authorization token; only some exits reach the portal,
// so we try a few pinned exits (username-N) and take the first that answers.

const { ProxyAgent } = require('undici');

const TARGET = 'https://participacao.parlamento.pt/initiatives/5569';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

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

function parseCount(html) {
  const m = html.match(/Total de assinaturas:\s*([\d.,\s]+?)\s*</i);
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
  return parseCount(await r.text());
}

module.exports = async (req, res) => {
  const proxy = process.env.WEBSHARE_PROXY_URL;
  const debug = req.query && req.query.debug === '1';
  const tried = [];

  // Bare first (in case the datacenter block ever lifts), then a handful of
  // proxy exits with short timeouts. First one that returns a count wins.
  const attempts = [{ proxy: null, exit: null }].concat(
    proxy ? randomExits(4, 20000).map((exit) => ({ proxy, exit })) : []
  );

  for (const a of attempts) {
    try {
      const count = await attempt(a.proxy, a.exit, 4000);
      if (count) {
        res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
        res.status(200).json({ count, source: a.proxy ? 'live-proxy' : 'live' });
        return;
      }
      tried.push({ via: a.proxy ? 'proxy-' + a.exit : 'bare', err: 'no-count-in-html' });
    } catch (e) {
      tried.push({ via: a.proxy ? 'proxy-' + a.exit : 'bare', err: String(e && e.message) });
    }
  }

  // Never invent a number — hide the counter instead.
  res.setHeader('Cache-Control', 'no-store');
  const body = { count: null, source: 'unavailable' };
  if (debug) { body.hasProxy = Boolean(proxy); body.tried = tried; }
  res.status(200).json(body);
};
