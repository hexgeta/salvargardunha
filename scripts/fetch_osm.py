"""Existing / mapped energy infrastructure around Serra da Gardunha, from OSM."""
import requests, json, time

H = {"User-Agent": "gardunha-research/1.0 (michael@twospouts.com)"}
EPS = ["https://overpass-api.de/api/interpreter",
       "https://overpass.kumi.systems/api/interpreter",
       "https://overpass.private.coffee/api/interpreter"]
# Serra da Gardunha ridge (peak 1227m at 40.0806,-7.5250) plus a generous buffer
# covering Fundao, Castelo Branco, Alpedrinha, Soalheira, Louriçal do Campo.
BBOX = (36.9, -9.6, 42.2, -6.1)   # S, W, N, E

def run(q, tries=3):
    for _ in range(tries):
        for ep in EPS:
            try:
                r = requests.post(ep, data={"data": q}, headers=H, timeout=240)
                if r.status_code == 200:
                    return r.json()
            except Exception:
                pass
        time.sleep(5)
    return None

s, w, n, e = BBOX
q = f"""[out:json][timeout:600];
(
  nwr["power"="plant"]({s},{w},{n},{e});
  nwr["plant:source"~"solar|wind"]({s},{w},{n},{e});
  nwr["generator:source"="wind"]({s},{w},{n},{e});
  nwr["power"="substation"]({s},{w},{n},{e});
);
out center tags;"""
d = run(q)
els = (d or {}).get("elements", [])
print(f"raw OSM elements: {len(els)}")
out = []
for el in els:
    t = el.get("tags", {})
    lat = el.get("lat") or (el.get("center") or {}).get("lat")
    lon = el.get("lon") or (el.get("center") or {}).get("lon")
    if lat is None:
        continue
    src = (t.get("plant:source") or t.get("generator:source") or "").lower()
    kind = None
    if "solar" in src: kind = "solar"
    elif "wind" in src: kind = "wind"
    elif t.get("power") == "substation": kind = "substation"
    if not kind:
        continue
    out.append({
        "kind": kind, "osm": f"{el['type']}/{el['id']}", "lat": lat, "lon": lon,
        "name": t.get("name"), "operator": t.get("operator"),
        "power": t.get("power"),
        "output": t.get("plant:output:electricity") or t.get("generator:output:electricity"),
        "start_date": t.get("start_date"),
        "tags": t,
    })
json.dump(out, open("osm_raw.json", "w"), indent=1, ensure_ascii=False)
from collections import Counter
print(Counter(o["kind"] for o in out))
for o in out:
    if o["kind"] in ("solar", "wind"):
        print(f"  {o['kind']:<6} {o['lat']:.5f},{o['lon']:.5f}  {o['power']:<10} "
              f"{(o['name'] or '-')[:34]:<34} {o['output'] or ''}")
