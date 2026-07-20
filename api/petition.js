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

// Time-series of the count, for 1h/24h/7d "increase" stats. Stored in Supabase.
// We snapshot lazily on each live scrape (the endpoint is edge-cached 30 min, so
// this runs ~twice an hour), throttled so we never write more than one row per
// ~20 min. Deltas are the current count minus the newest snapshot at-or-before
// (now − window); null until enough history has accrued.
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
const TABLE = 'petition_snapshots';
const INSERT_THROTTLE_MS = 20 * 60 * 1000;
const WINDOWS = { h1: 3600e3, h24: 86400e3, d7: 7 * 86400e3 };

function supaHeaders() {
  return { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };
}

// Newest-first snapshots from the last 7 days (a couple hundred rows at most).
async function fetchSnapshots() {
  const since = new Date(Date.now() - WINDOWS.d7 - 3600e3).toISOString();
  const url = SUPA_URL + '/rest/v1/' + TABLE +
    '?select=captured_at,count&captured_at=gte.' + since + '&order=captured_at.desc';
  const r = await fetch(url, { headers: supaHeaders(), signal: AbortSignal.timeout(3000) });
  // Throw rather than return [] — a silently-empty read is indistinguishable from
  // "no history yet" and once hid a disabled API key for days.
  if (!r.ok) throw new Error('read ' + r.status + ': ' + (await r.text()).slice(0, 140));
  return (await r.json()).map((s) => ({ t: new Date(s.captured_at).getTime(), count: s.count }));
}

async function insertSnapshot(count) {
  const r = await fetch(SUPA_URL + '/rest/v1/' + TABLE, {
    method: 'POST',
    headers: Object.assign(supaHeaders(), { Prefer: 'return=minimal' }),
    body: JSON.stringify({ count }),
    signal: AbortSignal.timeout(3000),
  });
  if (!r.ok) throw new Error('write ' + r.status + ': ' + (await r.text()).slice(0, 140));
}

// snaps is newest-first. For each window, the delta is current minus the newest
// snapshot at-or-before (now - window) — i.e. at least the full window has
// elapsed. To keep the "in 1h/24h/7d" label honest when snapshots are sparse,
// that reference must not be much OLDER than the target either: we allow it to
// be stale by at most 20% of the window (min 30 min, cap 24 h). Otherwise null.
function computeDeltas(snaps, current, now) {
  const out = { h1: null, h24: null, d7: null };
  for (const key of Object.keys(WINDOWS)) {
    const w = WINDOWS[key];
    const target = now - w;
    const tol = Math.min(Math.max(w * 0.2, 30 * 60e3), 24 * 3600e3);
    const past = snaps.find((s) => s.t <= target);
    if (past && target - past.t <= tol) out[key] = current - past.count;
  }
  return out;
}

// Record + diff the live count without ever letting a storage hiccup break the
// count response. Returns the deltas object (all-null if storage is unavailable).
async function trackAndDeltas(count) {
  const none = { h1: null, h24: null, d7: null };
  if (!SUPA_URL || !SUPA_KEY) return { deltas: none, storage: 'no-supabase-env' };
  try {
    const now = Date.now();
    const snaps = await fetchSnapshots();
    const newest = snaps.length ? snaps[0].t : 0;
    if (now - newest >= INSERT_THROTTLE_MS) {
      await insertSnapshot(count);
      snaps.unshift({ t: now, count });
    }
    return { deltas: computeDeltas(snaps, count, now), storage: 'ok (' + snaps.length + ' snapshots)' };
  } catch (e) {
    return { deltas: none, storage: String(e && e.message) };
  }
}

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
        const { deltas, storage } = await trackAndDeltas(count);
        res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
        const ok = { count, deltas, source: a.proxy ? 'live-proxy' : 'live' };
        if (debug) ok.storage = storage;
        res.status(200).json(ok);
        return;
      }
      tried.push({ via: a.proxy ? 'proxy-' + a.exit : 'bare', err: 'no-count-in-html' });
    } catch (e) {
      tried.push({ via: a.proxy ? 'proxy-' + a.exit : 'bare', err: String(e && e.message) });
    }
  }

  // Never invent a number — hide the counter instead.
  res.setHeader('Cache-Control', 'no-store');
  const body = { count: null, deltas: null, source: 'unavailable' };
  if (debug) { body.hasProxy = Boolean(proxy); body.tried = tried; }
  res.status(200).json(body);
};
