"""Pull full geometry for power plants + every turbine around Serra da Gardunha.

The first pass (fetch_osm.py) only asked for centre points, which is enough to
count things but not to draw them. A 135 MW wind farm is a 10 km ridge, not a
dot, and the whole point of this map is to show how much of the serra is
covered — so the polygons matter.
"""
import requests, json, time

H = {"User-Agent": "gardunha-research/1.0 (michael@twospouts.com)"}
EPS = ["https://overpass-api.de/api/interpreter",
       "https://overpass.kumi.systems/api/interpreter",
       "https://overpass.private.coffee/api/interpreter"]
BBOX = (36.9, -9.6, 42.2, -6.1)


def run(q, tries=3):
    for _ in range(tries):
        for ep in EPS:
            try:
                r = requests.post(ep, data={"data": q}, headers=H, timeout=300)
                if r.status_code == 200:
                    return r.json()
                print(f"  {ep} -> {r.status_code}")
            except Exception as e:
                print(f"  {ep} -> {e}")
        time.sleep(5)
    return None


s, w, n, e = BBOX

# Plants: full outlines, so the map can shade the actual footprint.
q_plant = f"""[out:json][timeout:300];
(
  way["power"="plant"]({s},{w},{n},{e});
  relation["power"="plant"]({s},{w},{n},{e});
);
out geom;"""

# Turbines: points, but each one is a real 100 m structure on a ridge line.
q_turb = f"""[out:json][timeout:300];
(
  nwr["power"="generator"]["generator:source"="wind"]({s},{w},{n},{e});
);
out center;"""

print("plants...")
plants = run(q_plant)
print("turbines...")
turb = run(q_turb)

json.dump({"plants": plants, "turbines": turb},
          open("osm_geom.json", "w"), ensure_ascii=False)
print(f"plants {len((plants or {}).get('elements', []))} "
      f"turbines {len((turb or {}).get('elements', []))}")
