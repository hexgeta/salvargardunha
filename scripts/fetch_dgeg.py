"""The official licence register: DGEG's wind and solar map services.

One polygon per turbine block and per solar block, with the licence number, the
owner, the rated power and the date the station entered service. This is the
positional ground truth the OpenStreetMap data is checked against.

The server presents an incomplete certificate chain, hence verify=False.
"""
import json, os, requests, urllib3

urllib3.disable_warnings()
HERE = os.path.dirname(os.path.abspath(__file__))
EXT = f"{HERE}/ext"
os.makedirs(EXT, exist_ok=True)
BBOX = (36.9, -9.6, 42.2, -6.1)   # S, W, N, E
BASE = "https://servergeo.dgeg.gov.pt/arcgis/rest/services/Visualizadores/{}/MapServer/0/query"
H = {"User-Agent": "gardunha-research/1.0 (michael@twospouts.com)"}

s, w, n, e = BBOX
for svc, name in (("CE", "eolicas"), ("CS", "solares")):
    r = requests.get(BASE.format(svc), params={
        "where": "1=1", "outFields": "*", "f": "geojson", "outSR": 4326,
        "geometry": f"{w},{s},{e},{n}", "geometryType": "esriGeometryEnvelope",
        "inSR": 4326, "spatialRel": "esriSpatialRelIntersects",
        "returnGeometry": "true", "resultRecordCount": 10000,
    }, headers=H, timeout=300, verify=False)
    r.raise_for_status()
    d = r.json()
    feats = d.get("features", [])
    if not feats:
        raise SystemExit(f"DGEG {svc}: empty response — did the service change?")
    json.dump(d, open(f"{EXT}/dgeg_{name}_gardunha_bbox.geojson", "w"),
              ensure_ascii=False)
    print(f"DGEG {svc}: {len(feats)} polygons")
