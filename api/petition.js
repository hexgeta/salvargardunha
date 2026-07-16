// Serverless function (Vercel) — live TOTAL signature count for the petition
// at participacao.parlamento.pt/initiatives/5569, cached at the edge for 30 min.

const FALLBACK = 5323; // last known total (2026-07-16)

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  try {
    const r = await fetch('https://participacao.parlamento.pt/initiatives/5569', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SalvarGardunha/1.0; +https://salvargardunha.hexgeta.com)' },
    });
    const html = await r.text();
    const m = html.match(/Total de assinaturas:\s*([\d.  ]+)/);
    const count = m ? parseInt(m[1].replace(/[^\d]/g, ''), 10) : 0;
    res.status(200).json({ count: count > 0 ? count : FALLBACK, source: count > 0 ? 'live' : 'fallback' });
  } catch (e) {
    res.status(200).json({ count: FALLBACK, source: 'fallback' });
  }
};
