"""Turn raw OSM elements into a list of FARMS, not a list of panels.

Overpass hands back ~2,700 'solar generators' around the Gardunha, but almost
all of them are single rooftop panels on houses in Fundao and Castelo Branco.
Those are not what anyone means by a solar farm. What counts here is:

  * power=plant multipolygons -> a solar station, with a real footprint
  * power=plant site relations -> a wind park, whose members ARE the turbines
  * loose turbines             -> attached to the nearest park, or flagged

The Overpass bbox reaches to -6.1 lon, so it also picks up Extremadura,
Galicia and Andalusia. Spain is dropped here — this is a Portuguese map, and
everything downstream (crosscheck, build_map, burn_join) reads farms_osm.json,
so filtering at this one point keeps every layer consistent.

Output is farms_osm.json, ready to drop onto a Leaflet map.
"""
import json, math, os, re
from collections import defaultdict
from shapely.geometry import shape, Point
from shapely.prepared import prep

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = json.load(open("osm_geom.json"))

# Same boundary burn_join.py uses for its land grid: the OSM relation for
# Portugal, mirrored in ext/. Islands are included; the bbox never reaches them.
PT = prep(shape(json.load(open(f"{HERE}/ext/pt_boundary.geojson"))))


def in_pt(lat, lon):
    return PT.contains(Point(lon, lat))


def ring_area_ha(coords):
    """Shoelace on a local equirectangular projection. Good enough at this size."""
    if len(coords) < 3:
        return 0.0
    lat0 = sum(c[0] for c in coords) / len(coords)
    k = math.cos(math.radians(lat0))
    pts = [(c[1] * k * 111320.0, c[0] * 111320.0) for c in coords]
    a = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2 / 10000.0


def hull(points):
    """Convex hull (monotone chain) of [lat,lon] points."""
    pts = sorted(set((p[1], p[0]) for p in points))
    if len(pts) < 3:
        return [[p[1], p[0]] for p in pts]

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return [[q[1], q[0]] for q in lower[:-1] + upper[:-1]]


def mw(tags):
    v = (tags.get("plant:output:electricity")
         or tags.get("generator:output:electricity") or "")
    m = re.match(r"([\d.]+)\s*(k|M|G)?W", str(v))
    if not m:
        return None
    n = float(m.group(1))
    return {"k": n / 1000, "M": n, "G": n * 1000, None: n}[m.group(2)]


def haversine(a, b):
    R = 6371.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp = p2 - p1
    dl = math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


# ---------------------------------------------------------------- plants
plants, member_ids = [], {}
dropped_es = {"plants": 0, "turbines": 0}
for el in RAW["plants"]["elements"]:
    t = el.get("tags", {})
    src = (t.get("plant:source") or "").lower()
    kind = "solar" if "solar" in src else "wind" if "wind" in src else None
    if not kind:
        continue

    rings, turb_pts = [], []
    if el["type"] == "way":
        g = el.get("geometry") or []
        if g:
            rings = [[[p["lat"], p["lon"]] for p in g]]
    elif t.get("type") == "multipolygon":
        for m in el.get("members", []):
            if m.get("role") == "outer" and m.get("geometry"):
                rings.append([[p["lat"], p["lon"]] for p in m["geometry"]])
    elif t.get("type") == "site":
        # A wind park relation lists its turbines. That membership is the
        # authoritative answer to 'which park is this turbine in' — far better
        # than guessing from distance.
        for m in el.get("members", []):
            if m["type"] == "node" and m.get("lat") is not None:
                turb_pts.append([m["lat"], m["lon"]])
                member_ids[m["ref"]] = t.get("name") or f"{el['type']}/{el['id']}"
        if turb_pts:
            rings = [hull(turb_pts)]

    if not rings:
        continue
    area = sum(ring_area_ha(r) for r in rings)
    all_pts = [p for r in rings for p in r]
    cen = [sum(p[0] for p in all_pts) / len(all_pts),
           sum(p[1] for p in all_pts) / len(all_pts)]
    if not in_pt(cen[0], cen[1]):
        dropped_es["plants"] += 1
        continue
    nm = t.get("name") or ""
    plants.append({
        "id": f"{el['type']}/{el['id']}",
        "kind": kind,
        "name": t.get("name"),
        "operator": t.get("operator"),
        "mw": mw(t),
        "start": t.get("start_date"),
        "area_ha": round(area, 1),
        "n_turbines": len(turb_pts) or None,
        "sub": bool(re.match(r"sub[- ]parque", nm, re.I)),
        "centre": cen,
        "rings": rings,
        "url": f"https://www.openstreetmap.org/{el['type']}/{el['id']}",
        "tags": t,
    })

# A sub-park sits inside its parent park. Keep both, but mark the children so
# the map can nest them instead of double-counting the megawatts.
for p in plants:
    p["parent"] = None
    if not p["sub"]:
        continue
    cands = [q for q in plants if q is not p and not q["sub"]
             and q["kind"] == p["kind"]
             and haversine(p["centre"], q["centre"]) < 15]
    if cands:
        p["parent"] = min(cands, key=lambda q: haversine(p["centre"], q["centre"]))["name"]

# --------------------------------------------------------------- turbines
turbines = []
wind_plants = [p for p in plants if p["kind"] == "wind"]
for el in RAW["turbines"]["elements"]:
    lat = el.get("lat") or (el.get("center") or {}).get("lat")
    if lat is None:
        continue
    lon = el.get("lon") or (el.get("center") or {}).get("lon")
    if not in_pt(lat, lon):
        dropped_es["turbines"] += 1
        continue
    t = el.get("tags", {})
    park = member_ids.get(el["id"])
    how = "relation membership"
    if not park and wind_plants:
        # Not listed in any park relation — fall back to nearest park centre,
        # and record that it was a guess so the map can say so.
        best = min(wind_plants, key=lambda p: haversine((lat, lon), p["centre"]))
        d = haversine((lat, lon), best["centre"])
        if d < 6:
            park, how = best["name"], f"nearest park ({d:.1f} km) — inferred"
    turbines.append({
        "id": f"{el['type']}/{el['id']}", "lat": lat, "lon": lon,
        "mw": mw(t), "height": t.get("height"),
        "model": t.get("generator:model") or t.get("model"),
        "start": t.get("start_date"),
        "park": park, "park_src": how if park else None,
    })

# ------------------------------------------------------------------ report
by = defaultdict(list)
for p in plants:
    by[p["kind"]].append(p)

print(f"{len(plants)} plants ({len(by['wind'])} wind, {len(by['solar'])} solar), "
      f"{len(turbines)} turbines")
print(f"outside Portugal, dropped: {dropped_es['plants']} plants, "
      f"{dropped_es['turbines']} turbines\n")
for kind in ("wind", "solar"):
    print(f"--- {kind} ---")
    for p in sorted(by[kind], key=lambda x: (x["parent"] or x["name"] or "", x["sub"])):
        lead = "    +- " if p["parent"] else "  "
        print(f"{lead}{(p['name'] or 'unnamed')[:50]:<50} "
              f"{(str(p['mw']) + ' MW') if p['mw'] else '? MW':>10} "
              f"{p['area_ha']:>8.0f} ha  {p['centre'][0]:.4f},{p['centre'][1]:.4f}  "
              f"{(str(p['n_turbines']) + ' turb') if p['n_turbines'] else ''}"
              f" {p['start'] or ''}")
    print()

named = sum(1 for t in turbines if t["park"])
print(f"turbines attached to a park: {named}/{len(turbines)}")
json.dump({"plants": plants, "turbines": turbines},
          open("farms_osm.json", "w"), ensure_ascii=False)
