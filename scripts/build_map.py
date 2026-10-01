"""Emit the map payload: existing OSM farms + planned projects + verification."""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = "/var/www/gardunha"
PEAK = (40.0806, -7.5250)   # Gardunha summit, 1227 m


def km(a, b):
    R = 6371.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    h = (math.sin((p2 - p1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(b[1] - a[1]) / 2) ** 2)
    return round(2 * R * math.asin(math.sqrt(h)), 1)


osm = json.load(open(f"{HERE}/farms_osm.json"))


def load(name, default):
    p = f"{HERE}/{name}"
    return json.load(open(p)) if os.path.exists(p) else default


planned = load("planned.json", [])
xref = load("crosscheck.json", {})     # {osm_id: [{source, name, mw, dist_km}]}
extra = load("dgeg_extra.json", {})    # licensed and built, but absent from OSM
dgeg_all = load("dgeg_all.json", {})

plants = []
for p in osm["plants"]:
    # Unnamed 0-1 ha polygons are a shed roof someone traced, not a farm.
    if not p["name"] and p["area_ha"] < 2:
        continue
    p["dist_km"] = km(p["centre"], PEAK)
    p["xref"] = xref.get(p["id"], [])
    plants.append(p)

for t in osm["turbines"]:
    t["dist_km"] = km((t["lat"], t["lon"]), PEAK)

for pl in planned:
    if pl.get("lat") is not None:
        pl["dist_km"] = km((pl["lat"], pl["lon"]), PEAK)

# DGEG is the licence register, so anything it holds is built or consented even
# when no OSM volunteer has traced it. Those go on the map as their own layer
# rather than being quietly merged, so it stays obvious which source said what.
dgeg_solar = []
for name, d in (dgeg_all.get("solar") or {}).items():
    d = dict(d, name=name)
    d["dist_km"] = km(d["centre"], PEAK)
    dgeg_solar.append(d)

extra_turb = extra.get("turbines", [])
for t in extra_turb:
    t["dist_km"] = km((t["lat"], t["lon"]), PEAK)
extra_parks = extra.get("parks", [])
for p in extra_parks:
    p["dist_km"] = km(p["centre"], PEAK)

offsets = sorted(t["dgeg"]["offset_m"] for t in osm["turbines"] if t.get("dgeg"))
stats = {
    "turbines": len(osm["turbines"]),
    "turbines_confirmed": len(offsets),
    "median_offset_m": offsets[len(offsets) // 2] if offsets else None,
    "max_offset_m": offsets[-1] if offsets else None,
    "dgeg_only": len(extra_turb),
    "plants": len(plants),
    "plants_confirmed": sum(1 for p in plants if p["xref"]),
    "built": __import__("time").strftime("%Y-%m-%d %H:%M"),
}

os.makedirs(OUT, exist_ok=True)
json.dump({"peak": PEAK, "plants": plants, "turbines": osm["turbines"],
           "planned": planned, "dgeg_solar": dgeg_solar,
           "dgeg_turbines": extra_turb, "dgeg_parks": extra_parks,
           "stats": stats},
          open(f"{OUT}/data.json", "w"), ensure_ascii=False)

print(f"{len(plants)} OSM plants, {len(osm['turbines'])} OSM turbines, "
      f"{len(dgeg_solar)} DGEG solar, {len(extra_turb)} DGEG-only turbines, "
      f"{len(planned)} planned -> {OUT}/data.json")
