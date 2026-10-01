"""Independent second opinion: INEGI's e2p renewable-energy register.

e2p (Energias Endogenas de Portugal, Universidade do Porto / INEGI) is compiled
from promoter and DGEG filings but maintained separately, so where it agrees
with DGEG on a park's name, promoter and rated power that is a genuine second
confirmation rather than a copy.

Park-level only: one point per power station, no turbine positions. It is used
in crosscheck.py to corroborate parks, never to place anything on the map.
"""
import json, os, requests

HERE = os.path.dirname(os.path.abspath(__file__))
EXT = f"{HERE}/ext"
os.makedirs(EXT, exist_ok=True)
BBOX = (36.9, -9.6, 42.2, -6.1)   # S, W, N, E
URL = ("https://services5.arcgis.com/AMh9EzyFGgthLT1q/arcgis/rest/services/"
       "e2p2_en/FeatureServer/1/query")
H = {"User-Agent": "gardunha-research/1.0 (michael@twospouts.com)"}

s, w, n, e = BBOX
r = requests.get(URL, params={
    "where": "1=1", "outFields": "*", "f": "geojson", "outSR": 4326,
    "geometry": f"{w},{s},{e},{n}", "geometryType": "esriGeometryEnvelope",
    "inSR": 4326, "spatialRel": "esriSpatialRelIntersects",
    "returnGeometry": "true", "resultRecordCount": 5000,
}, headers=H, timeout=180)
r.raise_for_status()
d = r.json()
feats = d.get("features", [])
if not feats:
    raise SystemExit("INEGI e2p: empty response — did the service change?")
json.dump(d, open(f"{EXT}/inegi_e2p_gardunha_bbox.geojson", "w"),
          ensure_ascii=False)
print(f"INEGI e2p: {len(feats)} stations in the box")
