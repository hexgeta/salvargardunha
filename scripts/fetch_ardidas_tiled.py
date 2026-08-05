"""Tiled national fetch for a single ICNF burned-area year.

The plain national query (fetch_ardidas.py --mirror) returns HTTP 500 for 2017 —
the worst fire year on record, ~540 000 ha — because the server cannot build one
response that big. This walks continental Portugal in 0.5 degree tiles instead,
pages each tile, and dedupes on OBJECTID, so the result is the same feature set
the single query would have returned.

Usage: python3 fetch_ardidas_tiled.py <year> [more years...]
Writes ext/ardidas_pt/ardidas_<year>.geojson (same shape as the mirror step).
"""
import json, os, ssl, sys, time, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
OUT  = f"{HERE}/ext/ardidas_pt"
BASE = "https://sigservices.icnf.pt/server/rest/services/BDG/areas_ardidas/MapServer"
YEAR_LAYER = {2025:20,2024:19,2023:18,2022:17,2021:15,2020:0,2019:1,2018:2,
              2017:3,2016:4,2015:5,2014:6,2013:7,2012:8,2011:9}
PT   = (36.85, -9.65, 42.20, -6.15)   # S, W, N, E — continental Portugal
STEP = 0.5
PAGE = 500
CTX  = ssl.create_default_context()

def query(layer, params):
    url = f"{BASE}/{layer}/query?" + urllib.parse.urlencode(params)
    last = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=180, context=CTX) as r:
                return json.load(r)
        except Exception as e:
            last = e; time.sleep(3 * (attempt + 1))
    raise last

def tile_feats(layer, s, w, n, e):
    feats, offset = [], 0
    while True:
        p = {"where":"1=1","outFields":"OBJECTID,Ano,AreaHaPoly,PI_Conc,Causa_Desc",
             "f":"geojson","outSR":4326,"resultOffset":offset,"resultRecordCount":PAGE,
             "geometry":f"{w},{s},{e},{n}","geometryType":"esriGeometryEnvelope",
             "inSR":4326,"spatialRel":"esriSpatialRelIntersects"}
        d = query(layer, p)
        fs = d.get("features", [])
        feats += fs
        if len(fs) < PAGE: break
        offset += PAGE
    return feats

def fetch_year(y):
    layer = YEAR_LAYER[y]
    seen, out = set(), []
    s0, w0, n0, e0 = PT
    lat = s0
    while lat < n0:
        lon = w0
        while lon < e0:
            for f in tile_feats(layer, lat, lon, min(lat+STEP, n0), min(lon+STEP, e0)):
                oid = (f.get("properties") or {}).get("OBJECTID")
                key = oid if oid is not None else json.dumps(f.get("geometry"))[:200]
                if key in seen: continue
                seen.add(key); out.append(f)
            lon += STEP
        print(f"  {y}: lat {lat:.1f} done — {len(out)} features so far", flush=True)
        lat += STEP
    os.makedirs(OUT, exist_ok=True)
    p = f"{OUT}/ardidas_{y}.geojson"
    json.dump({"type":"FeatureCollection","features":out}, open(p,"w"), ensure_ascii=False)
    print(f"{y}: {len(out)} features -> {p} ({os.path.getsize(p)//1024} KB)")

for arg in sys.argv[1:]:
    fetch_year(int(arg))
