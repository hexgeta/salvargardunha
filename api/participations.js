// Serverless function (Vercel) — live count of submitted contributions on the
// PSZAER public consultation at participa.pt. There is no public JSON API, but the
// portal server-renders the counters, so we scrape them. Edge-cached for 10 min
// (shorter than the petition: this number moves fast and drives the page's urgency).

const URL = 'https://participa.pt/pt/consulta/programa-setorial-das-zonas-de-aceleracao-da-implantacao-de-energias-renovaveis-pszaer';

const FALLBACK = 3161; // last known count (2026-07-14)

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
  try {
    const r = await fetch(URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SalvarGardunha/1.0; +https://salvargardunha.com)' },
    });
    const html = await r.text();
    const p = html.match(/class="value n-participations"[^>]*>\s*([\d.,\s]+)</i);
    const f = html.match(/class="value n-follows"[^>]*>\s*([\d.,\s]+)</i);
    const count = p ? parseInt(p[1].replace(/[^\d]/g, ''), 10) : 0;
    const follows = f ? parseInt(f[1].replace(/[^\d]/g, ''), 10) : 0;
    res.status(200).json({
      count: count > 0 ? count : FALLBACK,
      follows: follows > 0 ? follows : null,
      source: count > 0 ? 'live' : 'fallback',
    });
  } catch (e) {
    res.status(200).json({ count: FALLBACK, follows: null, source: 'fallback' });
  }
};
