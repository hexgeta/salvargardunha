"""ICNF burned-area polygons for the Gardunha region, last 15 years (2011-2025).
Written to /var/www/gardunha/ardidas.json (served, CORS *) and lazy-loaded by the
map only when the "burned areas" layer is switched on. Mirrored locally so the map
never depends on ICNF being reachable. Pass --mirror to also archive the FULL
national dataset (all Portugal, full resolution) under ext/ardidas_pt/."""
import json, os, sys, ssl, time, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
EXT = f"{HERE}/ext"
OUT = "/var/www/gardunha"
BASE = "https://sigservices.icnf.pt/server/rest/services/BDG/areas_ardidas/MapServer"
BBOX = (39.85, -7.90, 40.30, -7.20)   # S, W, N, E — same window as the rest of the pipeline
YEAR_LAYER = {2025:20,2024:19,2023:18,2022:17,2021:15,2020:0,2019:1,2018:2,
              2017:3,2016:4,2015:5,2014:6,2013:7,2012:8,2011:9}
SIMPLIFY_TOL = 0.0003   # ~30 m — imperceptible for a context layer, cuts size ~6x
PAGE = 500
CTX = ssl.create_default_context()

def query(layer, params):
    url = f"{BASE}/{layer}/query?" + urllib.parse.urlencode(params)
    last = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=120, context=CTX) as r:
                return json.load(r)
        except Exception as e:
            last = e; time.sleep(3 * (attempt + 1))
    raise last

def fetch_layer(layer, envelope=None):
    feats, offset = [], 0
    while True:
        p = {"where":"1=1","outFields":"Ano,AreaHaPoly,PI_Conc,Causa_Desc",
             "f":"geojson","outSR":4326,"resultOffset":offset,"resultRecordCount":PAGE}
        if envelope:
            s,w,n,e = envelope
            p.update({"geometry":f"{w},{s},{e},{n}","geometryType":"esriGeometryEnvelope",
                      "inSR":4326,"spatialRel":"esriSpatialRelIntersects"})
        d = query(layer, p)
        fs = d.get("features", [])
        feats += fs
        if len(fs) < PAGE: break
        offset += PAGE
    return feats

def _pseg(p, a, b):
    ax, ay, bx, by, px, py = a[0], a[1], b[0], b[1], p[0], p[1]
    dx, dy = bx-ax, by-ay
    if dx == 0 and dy == 0:
        return ((px-ax)**2 + (py-ay)**2) ** 0.5
    t = ((px-ax)*dx + (py-ay)*dy) / (dx*dx + dy*dy)
    t = max(0, min(1, t))
    cx, cy = ax + t*dx, ay + t*dy
    return ((px-cx)**2 + (py-cy)**2) ** 0.5

def simplify(pts, tol):
    if len(pts) < 3: return pts
    keep = [False]*len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts)-1)]
    while stack:
        i, j = stack.pop()
        dmax, idx = 0.0, -1
        for k in range(i+1, j):
            d = _pseg(pts[k], pts[i], pts[j])
            if d > dmax: dmax, idx = d, k
        if dmax > tol and idx != -1:
            keep[idx] = True
            stack.append((i, idx)); stack.append((idx, j))
    return [p for p, k in zip(pts, keep) if k]

def polys(geom, tol):
    if not geom: return []
    def ring(rr):
        latlng = [[pt[1], pt[0]] for pt in rr]
        s = simplify(latlng, tol)
        return [[round(a,5), round(b,5)] for a,b in s]
    t, c = geom.get("type"), geom.get("coordinates") or []
    if t == "Polygon" and c: return [ring(c[0])]
    if t == "MultiPolygon": return [ring(poly[0]) for poly in c if poly]
    return []

# ---- map subset: Gardunha window, all 15 years ----
ard, kept = [], 0
for y in sorted(YEAR_LAYER, reverse=True):
    for f in fetch_layer(YEAR_LAYER[y], BBOX):
        pr = f.get("properties", {})
        for r in polys(f.get("geometry"), SIMPLIFY_TOL):
            if len(r) >= 4:
                ard.append({"year": y, "area_ha": round(pr.get("AreaHaPoly") or 0, 1),
                            "concelho": pr.get("PI_Conc"), "cause": pr.get("Causa_Desc"),
                            "rings": [r]})
                kept += len(r)
os.makedirs(OUT, exist_ok=True)
json.dump({"years":[min(YEAR_LAYER), max(YEAR_LAYER)], "areas":ard},
          open(f"{OUT}/ardidas.json","w"), ensure_ascii=False)
print(f"gardunha ardidas: {len(ard)} polygons, {kept} verts -> {OUT}/ardidas.json "
      f"({os.path.getsize(f'{OUT}/ardidas.json')//1024} KB)")

# ---- optional: full national mirror for independence (resumable, fault-tolerant) ----
if "--mirror" in sys.argv:
    os.makedirs(f"{EXT}/ardidas_pt", exist_ok=True)
    total = 0
    for y in sorted(YEAR_LAYER, reverse=True):
        p = f"{EXT}/ardidas_pt/ardidas_{y}.geojson"
        if os.path.exists(p) and os.path.getsize(p) > 100:
            print(f"  mirror {y}: already present, skipping"); continue
        try:
            fs = fetch_layer(YEAR_LAYER[y])
        except Exception as e:
            print(f"  mirror {y}: FAILED ({e}) — skipped"); continue
        json.dump({"type":"FeatureCollection","features":fs}, open(p,"w"), ensure_ascii=False)
        total += len(fs)
        print(f"  mirror {y}: {len(fs)} features -> {os.path.getsize(p)//1024} KB")
    print(f"national mirror: {total} new features -> {EXT}/ardidas_pt/")
