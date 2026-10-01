"""Planned projects: the APA/SNIAmb layer of environmental-assessment study areas.

Every project that needs an Avaliacao de Impacte Ambiental files a study-area
polygon with the Agencia Portuguesa do Ambiente. That layer is the only public
source that gives PLANNED renewable projects an actual shape rather than a
press-release adjective.

Caveat worth carrying onto the map: the published layer stops at process number
3762, so the newest applications (Sophia 3800, Beira 3802, Pinhal Interior II
3954) exist in the register but have no geometry at all.
"""
import requests, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
BBOX = (39.85, -7.90, 40.30, -7.20)   # S, W, N, E
URL = ("https://sniambgeoext.apambiente.pt/arcgis/rest/services/Visualizador/"
       "ZoomToApp/MapServer/0/query")
H = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) gardunha-research/1.0",
     "Referer": "https://sniambgeoviewer.apambiente.pt/"}

s, w, n, e = BBOX
r = requests.get(URL, params={
    "where": "1=1", "outFields": "*", "f": "json",
    "geometry": f"{w},{s},{e},{n}", "geometryType": "esriGeometryEnvelope",
    "inSR": 4326, "outSR": 4326, "spatialRel": "esriSpatialRelIntersects",
    "returnGeometry": "true", "resultRecordCount": 2000,
}, headers=H, timeout=180, verify=False)
r.raise_for_status()
raw = r.json()

# This ArcGIS server ignores f=geojson and hands back an empty set, so ask for
# its native esriJSON and convert the rings here.
feats = []
for f in raw.get("features", []):
    rings = (f.get("geometry") or {}).get("rings") or []
    if not rings:
        continue
    feats.append({"type": "Feature", "properties": f["attributes"],
                  "geometry": {"type": "Polygon" if len(rings) == 1 else "MultiPolygon",
                               "coordinates": rings if len(rings) == 1
                               else [[ring] for ring in rings]}})
json.dump({"type": "FeatureCollection", "features": feats},
          open(f"{HERE}/ext/aia_bbox.geojson", "w"), ensure_ascii=False)

print(f"{len(feats)} AIA study-area polygons in the box")
if feats:
    print(json.dumps(feats[0]["properties"], ensure_ascii=False, indent=1))
