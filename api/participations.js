// Serverless function (Vercel) — live count of submitted contributions on the
// PSZAER public consultation at participa.pt.
//
// There is no public JSON API, but the portal server-renders the counters
// (<span class="value n-participations">) so we scrape them.
//
// IMPORTANT: participa.pt firewalls datacenter IPs — a direct fetch from Vercel
// never connects (verified: Hetzner + Vercel both fail, a residential IP works).
// So we route the request through the Webshare proxy, which does get through.
// Requires env var WEBSHARE_PROXY_URL on Vercel. Without it we return the
// fallback rather than a wrong number.

const { ProxyAgent } = require('undici');

const URL = 'https://participa.pt/pt/consulta/programa-setorial-das-zonas-de-aceleracao-da-implantacao-de-energias-renovaveis-pszaer';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const FALLBACK = 3161; // last known count (2026-07-14)

function parse(html) {
  const p = html.match(/class="value n-participations"[^>]*>\s*([\d.,\s]+)</i);
  const f = html.match(/class="value n-follows"[^>]*>\s*([\d.,\s]+)</i);
  return {
    count: p ? parseInt(p[1].replace(/[^\d]/g, ''), 10) : 0,
    follows: f ? parseInt(f[1].replace(/[^\d]/g, ''), 10) : 0,
  };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');

  const proxy = process.env.WEBSHARE_PROXY_URL;
  const opts = {
    headers: { 'User-Agent': UA, 'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8' },
    signal: AbortSignal.timeout(9000),
  };
  if (proxy) opts.dispatcher = new ProxyAgent(proxy);

  try {
    const r = await fetch(URL, opts);
    const { count, follows } = parse(await r.text());
    res.status(200).json({
      count: count > 0 ? count : FALLBACK,
      follows: follows > 0 ? follows : null,
      source: count > 0 ? 'live' : 'fallback',
    });
  } catch (e) {
    res.status(200).json({ count: FALLBACK, follows: null, source: 'fallback' });
  }
};
