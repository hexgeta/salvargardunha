"""Verify OSM against the official DGEG register, and INEGI as a third opinion.

DGEG (Direcao-Geral de Energia e Geologia) is the licensing authority: its
`Centrais Eolicas` layer is one polygon per turbine block, so its centroids are
turbine positions straight from the licence file. That makes it positional
ground truth — better than OSM, which is volunteer-traced and lags new builds.

Three things come out of this:
  * per-OSM-object confirmation, with the measured offset in metres
  * DGEG turbines and parks that OSM has never mapped (usually the newest ones)
  * INEGI e2p as an independent second name/MW check at park level
"""
import json, math, os
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
EXT = f"{HERE}/ext"
BBOX = (36.9, -9.6, 42.2, -6.1)


def m(a, b):
    R = 6371000.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    h = (math.sin((p2 - p1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(b[1] - a[1]) / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(h))


def poly_centroid_area(geom):
    """Centroid (lat,lon) and area in ha of a (Multi)Polygon outer ring."""
    rings = geom["coordinates"]
    if geom["type"] == "Polygon":
        rings = [rings]
    pts = []
    for poly in rings:
        pts.extend(poly[0])
    lat = sum(p[1] for p in pts) / len(pts)
    lon = sum(p[0] for p in pts) / len(pts)
    k = math.cos(math.radians(lat))
    area = 0.0
    for poly in rings:
        r = [(p[0] * k * 111320.0, p[1] * 111320.0) for p in poly[0]]
        a = 0.0
        for i in range(len(r)):
            x1, y1 = r[i]
            x2, y2 = r[(i + 1) % len(r)]
            a += x1 * y2 - x2 * y1
        area += abs(a) / 2
    return (lat, lon), area / 10000.0


def inside(p):
    return BBOX[0] <= p[0] <= BBOX[2] and BBOX[1] <= p[1] <= BBOX[3]


def year(ms):
    if not ms:
        return None
    import datetime
    return datetime.datetime.utcfromtimestamp(ms / 1000).year


# ------------------------------------------------------------- DGEG wind
dgeg_turbines = []
for f in json.load(open(f"{EXT}/dgeg_eolicas_gardunha_bbox.geojson"))["features"]:
    p = f["properties"]
    c, _ = poly_centroid_area(f["geometry"])
    if not inside(c):
        continue
    dgeg_turbines.append({
        "lat": c[0], "lon": c[1],
        "park": p["nome"], "sub": (p.get("subparque") or "").strip() or None,
        "owner": p.get("proprietario"),
        "kw": p.get("potencia_geradorkw"),
        "blade_r": p.get("raio_pa"),
        "processo": p.get("processo"),
        "concelho": p.get("concelho"),
        "over": p.get("sobreequipamento"),
        "since": year(p.get("data_exploracao")),
        "matched": False,
    })

# DGEG repeats the park total on every block, so max() is the park figure and
# sum() would be nonsense. Same trick for the licensing dates.
dgeg_parks = defaultdict(lambda: {"n": 0, "pts": []})
for t in dgeg_turbines:
    k = (t["park"], t["sub"])
    d = dgeg_parks[k]
    d["n"] += 1
    d["pts"].append((t["lat"], t["lon"]))
    d["owner"] = t["owner"]
    d["concelho"] = t["concelho"]
    d["since"] = t["since"] or d.get("since")
    d["mw"] = round((t["kw"] or 0) * d["n"] / 1000, 1)
for k, d in dgeg_parks.items():
    d["centre"] = [sum(p[0] for p in d["pts"]) / d["n"],
                   sum(p[1] for p in d["pts"]) / d["n"]]
    d.pop("pts")

# ------------------------------------------------------------ DGEG solar
dgeg_solar = defaultdict(lambda: {"blocks": 0, "area_ha": 0.0, "rings": [], "pts": []})
for f in json.load(open(f"{EXT}/dgeg_solares_gardunha_bbox.geojson"))["features"]:
    p = f["properties"]
    c, a = poly_centroid_area(f["geometry"])
    if not inside(c):
        continue
    d = dgeg_solar[p["nome"]]
    d["blocks"] += 1
    d["area_ha"] += a
    d["pts"].append(c)
    d["owner"] = p.get("proprietario")
    d["concelho"] = p.get("concelho")
    d["since"] = year(p.get("data_exploracao")) or d.get("since")
    d["processo"] = p.get("processo")
    # The park total is stamped on every block, but some blocks carry a
    # partial figure, so take the largest rather than the last one seen.
    d["mva"] = max(d.get("mva", 0), round((p.get("potencia_instaladakva") or 0) / 1000, 1))
    rings = f["geometry"]["coordinates"]
    if f["geometry"]["type"] == "Polygon":
        rings = [rings]
    for poly in rings:
        d["rings"].append([[q[1], q[0]] for q in poly[0]])
for k, d in dgeg_solar.items():
    d["centre"] = [sum(p[0] for p in d["pts"]) / len(d["pts"]),
                   sum(p[1] for p in d["pts"]) / len(d["pts"])]
    d["area_ha"] = round(d["area_ha"], 1)
    d.pop("pts")

# ----------------------------------------------------------------- INEGI
inegi = []
for f in json.load(open(f"{EXT}/inegi_e2p_gardunha_bbox.geojson"))["features"]:
    p = f["properties"]
    g = f["geometry"]
    if not g:
        continue
    lon, lat = g["coordinates"][:2]
    inegi.append({"name": p.get("Name"), "type": p.get("Type"),
                  "mw": p.get("InstalledPower"), "year": p.get("Year"),
                  "status": p.get("Status"), "promoter": p.get("Promoter"),
                  "concelho": p.get("Municipality"), "lat": lat, "lon": lon,
                  "url": p.get("E2P_URL")})

# ------------------------------------------------------------- the match
osm = json.load(open(f"{HERE}/farms_osm.json"))

# 1. turbine-for-turbine
TOL = 250.0     # metres; DGEG blocks are licence circles, OSM is a traced mast
pairs = []
for t in osm["turbines"]:
    best, bd = None, 1e9
    for d in dgeg_turbines:
        dist = m((t["lat"], t["lon"]), (d["lat"], d["lon"]))
        if dist < bd:
            best, bd = d, dist
    if best and bd <= TOL:
        best["matched"] = True
        t["dgeg"] = {"park": best["park"], "sub": best["sub"], "offset_m": round(bd),
                     "owner": best["owner"], "kw": best["kw"], "since": best["since"],
                     "processo": best["processo"]}
        pairs.append(bd)
    else:
        t["dgeg"] = None

unmapped = [d for d in dgeg_turbines if not d["matched"]]
unmapped_parks = defaultdict(list)
for d in unmapped:
    unmapped_parks[(d["park"], d["sub"])].append(d)

# 2. park level: OSM plant -> DGEG park / INEGI plant, by proximity
xref = {}
for p in osm["plants"]:
    hits = []
    if p["kind"] == "wind":
        # how many of this park's turbines DGEG also has, and under what name
        names = defaultdict(int)
        for t in osm["turbines"]:
            if t.get("park") == (p["name"] or p["id"]) and t.get("dgeg"):
                names[(t["dgeg"]["park"], t["dgeg"]["sub"])] += 1
        for (nm, sub), n in sorted(names.items(), key=lambda x: -x[1]):
            d = dgeg_parks[(nm, sub)]
            hits.append({"source": "DGEG (registo oficial)",
                         "name": nm + (f" / {sub}" if sub else ""),
                         "mw": d.get("mw"), "n": n,
                         "dist_km": round(m(p["centre"], d["centre"]) / 1000, 1),
                         "note": f"{n} aerogeradores coincidem (< {TOL:.0f} m)",
                         "url": "https://servergeo.dgeg.gov.pt/arcgis/rest/services/Visualizadores/CE/MapServer"})
    else:
        for nm, d in dgeg_solar.items():
            dist = m(p["centre"], d["centre"])
            if dist < 3000:
                hits.append({"source": "DGEG (registo oficial)", "name": nm,
                             "mw": d.get("mva"), "dist_km": round(dist / 1000, 1),
                             "note": f"{d['blocks']} blocos licenciados, {d['area_ha']} ha",
                             "url": "https://servergeo.dgeg.gov.pt/arcgis/rest/services/Visualizadores/CS/MapServer"})
    for i in inegi:
        dist = m(p["centre"], (i["lat"], i["lon"]))
        same = (i["type"] or "").lower().startswith("wind") == (p["kind"] == "wind")
        if same and dist < 6000:
            hits.append({"source": "INEGI e2p", "name": i["name"], "mw": i["mw"],
                         "dist_km": round(dist / 1000, 1),
                         "note": f"{i['status'] or ''} {i['year'] or ''}".strip(),
                         "url": i["url"] or "https://e2p.inegi.up.pt/"})
    if hits:
        xref[p["id"]] = hits

json.dump(xref, open(f"{HERE}/crosscheck.json", "w"), ensure_ascii=False)
# the turbines now carry their DGEG confirmation — write that back
json.dump(osm, open(f"{HERE}/farms_osm.json", "w"), ensure_ascii=False)
json.dump({"turbines": unmapped,
           "parks": [{"park": k[0], "sub": k[1], "n": len(v),
                      "centre": [sum(x["lat"] for x in v) / len(v),
                                 sum(x["lon"] for x in v) / len(v)],
                      "owner": v[0]["owner"], "since": v[0]["since"],
                      "mw": round((v[0]["kw"] or 0) * len(v) / 1000, 1),
                      "concelho": v[0]["concelho"], "over": v[0]["over"],
                      "processo": v[0]["processo"]}
                     for k, v in unmapped_parks.items()],
           "solar": dgeg_solar},
          open(f"{HERE}/dgeg_extra.json", "w"), ensure_ascii=False)
json.dump({"turbines": dgeg_turbines, "parks":
           [{"park": k[0], "sub": k[1], **v} for k, v in dgeg_parks.items()],
           "solar": dgeg_solar, "inegi": inegi},
          open(f"{HERE}/dgeg_all.json", "w"), ensure_ascii=False)

# ------------------------------------------------------------------ report
print(f"OSM turbines: {len(osm['turbines'])}, DGEG blocks: {len(dgeg_turbines)}")
print(f"matched within {TOL:.0f} m: {len(pairs)}  "
      f"(median offset {sorted(pairs)[len(pairs)//2]:.0f} m, "
      f"max {max(pairs):.0f} m)" if pairs else "no matches")
print(f"OSM turbines with no DGEG block: "
      f"{sum(1 for t in osm['turbines'] if not t['dgeg'])}")
print(f"\nDGEG turbines OSM has NOT mapped: {len(unmapped)}")
for k, v in sorted(unmapped_parks.items(), key=lambda x: -len(x[1])):
    a = v[0]
    print(f"  {len(v):>3}  {(k[0] + (' / ' + k[1] if k[1] else ''))[:40]:<40} "
          f"{(a['kw'] or 0) * len(v) / 1000:>6.1f} MW  {a['since'] or '?'}  "
          f"{a['concelho']:<14} sobre-equip={a['over']}")

print("\nDGEG solar parks in the box:")
for nm, d in sorted(dgeg_solar.items(), key=lambda x: -x[1]["mva"]):
    print(f"  {d['mva']:>7.1f} MVA  {d['area_ha']:>7.1f} ha  {d['blocks']} blocos  "
          f"{d['centre'][0]:.4f},{d['centre'][1]:.4f}  {nm} — {d['owner']} ({d['since'] or '?'})")

print(f"\nINEGI e2p records in the box: {len(inegi)}")
