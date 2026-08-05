"""National burned-area layer for a single year, sized for the browser.

The map's main scar layer (fetch_ardidas.py) is cropped to a window around the
Gardunha, so at country zoom it shows nothing outside the Beira Baixa. This
builds the complement: every scar in continental Portugal for one year, from our
own mirror in ext/ardidas_pt/, thinned enough to load over a phone connection.

Two knobs do the thinning, and both are stated on the map so the reader knows
what was dropped:
  MIN_HA    — scars below this are omitted. The count is dominated by tiny
              burns; the AREA is dominated by big ones, so a 5 ha floor removes
              three quarters of the polygons and almost none of the burned land.
  TOL       — Douglas-Peucker tolerance in degrees, ~100 m. Invisible at the
              zooms this layer is read at, and it roughly halves the vertices.

Usage: .venv/bin/python build_ardidas_nacional.py [year]   (default 2025)
Writes /var/www/gardunha/ardidas-<year>.json in the same {areas:[{rings,...}]}
shape the map already knows how to draw.
"""
import json, os, sys

from shapely.geometry import shape

HERE = os.path.dirname(os.path.abspath(__file__))
SRC  = f"{HERE}/ext/ardidas_pt"
OUT  = "/var/www/gardunha"
MIN_HA = 5.0
TOL    = 0.001    # ~100 m


def rings_of(geom, tol):
    """Simplified exterior rings as [[lat, lon], ...], the map's own format."""
    g = geom.simplify(tol, preserve_topology=True)
    if g.is_empty:
        return []
    parts = list(g.geoms) if g.geom_type == "MultiPolygon" else [g]
    out = []
    for p in parts:
        if p.is_empty or p.geom_type != "Polygon":
            continue
        r = [[round(y, 5), round(x, 5)] for x, y in p.exterior.coords]
        if len(r) >= 4:
            out.append(r)
    return out


def build(year):
    src = f"{SRC}/ardidas_{year}.geojson"
    if not os.path.exists(src) or os.path.getsize(src) < 100:
        raise SystemExit(f"missing mirror for {year} — run fetch_ardidas_tiled.py {year}")

    feats = json.load(open(src))["features"]
    areas, dropped_small, dropped_ha = [], 0, 0.0
    for f in feats:
        pr = f.get("properties") or {}
        ha = pr.get("AreaHaPoly") or 0
        if ha < MIN_HA:
            dropped_small += 1
            dropped_ha += ha
            continue
        try:
            rings = rings_of(shape(f["geometry"]), TOL)
        except Exception:
            continue
        if rings:
            areas.append({"area_ha": round(ha, 1), "concelho": pr.get("PI_Conc"),
                          "cause": pr.get("Causa_Desc"), "rings": rings})

    kept_ha = sum(a["area_ha"] for a in areas)
    doc = {"year": year, "min_ha": MIN_HA, "simplify_m": round(TOL * 111320),
           "source_total": len(feats), "shown": len(areas),
           "shown_ha": round(kept_ha), "omitted": dropped_small,
           "omitted_ha": round(dropped_ha), "areas": areas}

    os.makedirs(OUT, exist_ok=True)
    p = f"{OUT}/ardidas-{year}.json"
    json.dump(doc, open(p, "w"), ensure_ascii=False, separators=(",", ":"))
    pct = 100 * dropped_ha / (kept_ha + dropped_ha) if kept_ha + dropped_ha else 0
    print(f"{year}: {len(areas)}/{len(feats)} scars kept ({kept_ha:.0f} ha); "
          f"{dropped_small} under {MIN_HA:g} ha omitted = {pct:.1f}% of burned area "
          f"-> {p} ({os.path.getsize(p)//1024} KB)")


for y in (sys.argv[1:] or ["2025"]):
    build(int(y))
