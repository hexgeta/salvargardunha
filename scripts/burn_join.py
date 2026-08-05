"""Spatial join: solar/wind footprints × ICNF burned-area scars, nationally.

Answers one question with public data only: how much of Portugal's licensed
renewable footprint sits on land that burned in the previous decade, and does
that happen more often than chance would predict?

Method
  1. Footprints — every DGEG-licensed solar plant (national register) and every
     OSM-traced solar/wind farm. Both carry polygons, so the overlap is measured,
     not inferred from a centre point.
  2. Scars — ICNF's official burned-area polygons, one layer per year, full
     resolution, from our own mirror in ext/ardidas_pt/. Streamed with ijson so a
     120 MB year never has to fit in memory at once.
  3. For each plant, the burned share of its footprint per fire year. A fire
     STRICTLY BEFORE the commissioning year is "burned, then built"; a fire in or
     after that year is the plant's own land burning later, which is a different
     story and is kept separate.
  4. Baseline — the same scars are tested against a 0.01 degree grid clipped to
     continental Portugal, so the burned share of the country is measured exactly
     the way the burned share of the solar estate is. Without that denominator the
     plant numbers mean nothing: a sixth of the country has burned, so overlap
     alone is not evidence of anything.
  5. LOCAL baseline — the national rate is still not a fair comparison, because
     solar is built in the south and the south barely burns. So each plant is also
     scored against the burn rate of the land within 20 km of it. Comparing the
     estate against the sum of those local rates is the like-for-like test: it
     asks whether developers pick burned ground more often than the ground around
     them is burned.

This measures COINCIDENCE IN SPACE AND TIME. It is not evidence about who or
what started any fire, and the output must not be presented as if it were.

Run on the VPS from ~/gardunha with the shapely venv:
    .venv/bin/python burn_join.py
Writes /var/www/gardunha/burns.json and merges a compact `burn` field into the
existing data.json so the map can show it without a second fetch.
"""
import json, math, os, time

import ijson
from shapely.geometry import Polygon, Point, shape
from shapely.strtree import STRtree
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
EXT  = f"{HERE}/ext/ardidas_pt"
OUT  = "/var/www/gardunha"

PT_BBOX  = (36.85, -9.65, 42.20, -6.15)   # S, W, N, E — continental Portugal
PT_KM2   = 89102.0                         # continental Portugal, official area
GRID_DEG = 0.01                            # ~1.1 km baseline sampling grid
LOCAL_R  = 0.20                            # ~20 km — radius of the local baseline
MIN_FRAC = 0.02                            # ignore <2% clips — mostly edge noise
MIN_HA   = 0.5

# ---------------------------------------------------------------- geometry ---
# Everything is in lon/lat degrees. Area RATIOS are exact there (both axes are
# scaled by a constant over a footprint this small), so the burned share needs no
# projection; only absolute hectares do, via the local scale below.

def deg2ha(area_deg2, lat):
    return area_deg2 * (111320.0 * math.cos(math.radians(lat))) * 110540.0 / 10000.0

def poly_of(rings):
    """rings = [[[lat,lon], ...], ...] as stored by the pipeline."""
    ps = []
    for r in rings or []:
        if len(r) < 4:
            continue
        p = Polygon([(pt[1], pt[0]) for pt in r])
        if not p.is_valid:
            p = p.buffer(0)
        if not p.is_empty and p.area > 0:
            ps.append(p)
    if not ps:
        return None
    return ps[0] if len(ps) == 1 else unary_union(ps)

def year_of(v):
    s = str(v or "")
    for i in range(len(s) - 3):
        if s[i:i+4].isdigit():
            y = int(s[i:i+4])
            if 1980 <= y <= 2035:
                return y
    return None

# --------------------------------------------------------------- footprints ---

def load_footprints():
    fps = []
    dgeg = json.load(open(f"{HERE}/dgeg_all.json")).get("solar") or {}
    for name, d in dgeg.items():
        g = poly_of(d.get("rings"))
        if g is None:
            continue
        fps.append({"key": "dgeg:" + name, "src": "DGEG", "kind": "solar", "name": name,
                    "owner": d.get("owner"), "concelho": d.get("concelho"),
                    "mva": d.get("mva"), "processo": d.get("processo"),
                    "since": year_of(d.get("since")), "centre": d.get("centre"),
                    "geom": g})

    osm = json.load(open(f"{HERE}/farms_osm.json"))
    for p in osm.get("plants", []):
        if not p.get("name") and (p.get("area_ha") or 0) < 2:
            continue
        g = poly_of(p.get("rings"))
        if g is None:
            continue
        fps.append({"key": "osm:" + str(p.get("id")), "src": "OSM", "kind": p.get("kind"),
                    "name": p.get("name"), "owner": p.get("operator"), "concelho": None,
                    "mva": p.get("mw"), "processo": None,
                    "since": year_of(p.get("start")), "centre": p.get("centre"),
                    "geom": g})
    for f in fps:
        c = f["centre"] or [39.5, -8.0]
        f["lat"] = c[0]
        f["area_ha"] = round(deg2ha(f["geom"].area, c[0]), 1)
        f["burn"] = {}          # year -> intersected degree-area
        f["cause"] = {}         # year -> ICNF cause of the largest overlapping fire
    return fps

# ------------------------------------------------------------ baseline grid ---

def grid_points():
    """A 0.01 degree grid clipped to the continental Portugal land boundary, so
    ocean and Spain never dilute a burn rate. Boundary is the OSM relation for
    Portugal (mirrored in ext/); its Atlantic-island parts are dropped by bounds."""
    b = shape(json.load(open(f"{HERE}/ext/pt_boundary.geojson")))
    mainland = unary_union([p for p in getattr(b, "geoms", [b]) if p.bounds[0] > -10])
    s, w, n, e = PT_BBOX
    pts, lats = [], []
    lat = s
    while lat < n:
        lon = w
        while lon < e:
            if mainland.contains(Point(lon, lat)):
                pts.append(Point(lon, lat))
                lats.append(lat)
            lon += GRID_DEG
        lat += GRID_DEG
    return pts, lats

def local_index(lats, pts):
    """Coarse 0.1 degree buckets over the land grid, for the 20 km local rate."""
    idx = {}
    for i, p in enumerate(pts):
        idx.setdefault((int(lats[i] * 10), int(p.x * 10)), []).append(i)
    return idx

def local_rate(idx, pts, burned, lat, lon):
    """Burned share of the land within LOCAL_R degrees of a point."""
    tot = hit = 0
    r2 = LOCAL_R * LOCAL_R
    cl, co = int(lat * 10), int(lon * 10)
    span = int(LOCAL_R * 10) + 1
    for a in range(cl - span, cl + span + 1):
        for b in range(co - span, co + span + 1):
            for i in idx.get((a, b), ()):
                p = pts[i]
                if (p.y - lat) ** 2 + (p.x - lon) ** 2 > r2:
                    continue
                tot += 1
                if i in burned:
                    hit += 1
    return (hit / tot, tot) if tot else (None, 0)

# ------------------------------------------------------------------- join ----

def main():
    t0 = time.time()
    fps = load_footprints()
    print(f"{len(fps)} footprints ({sum(1 for f in fps if f['kind']=='solar')} solar)")

    fp_tree = STRtree([f["geom"] for f in fps])
    gp, gp_lat = grid_points()
    gp_tree = STRtree(gp)
    burned_pts = set()
    print(f"{len(gp)} baseline grid points")

    years = []
    for y in range(2011, 2026):
        p = f"{EXT}/ardidas_{y}.geojson"
        if os.path.exists(p) and os.path.getsize(p) > 1000:
            years.append(y)

    scar_ha = {}
    for y in years:
        n_feat = 0
        with open(f"{EXT}/ardidas_{y}.geojson", "rb") as fh:
            for feat in ijson.items(fh, "features.item", use_float=True):
                geom = feat.get("geometry")
                if not geom:
                    continue
                try:
                    g = shape(geom)
                except Exception:
                    continue
                if not g.is_valid:
                    g = g.buffer(0)
                if g.is_empty:
                    continue
                n_feat += 1
                pr = feat.get("properties") or {}
                scar_ha[y] = scar_ha.get(y, 0.0) + (pr.get("AreaHaPoly") or 0.0)

                for i in fp_tree.query(g):
                    f = fps[int(i)]
                    inter = f["geom"].intersection(g).area
                    if inter <= 0:
                        continue
                    f["burn"][y] = f["burn"].get(y, 0.0) + inter
                    prev = f["cause"].get(y)
                    if prev is None or inter > prev[1]:
                        f["cause"][y] = (pr.get("Causa_Desc"), inter)

                for i in gp_tree.query(g):
                    i = int(i)
                    if i not in burned_pts and g.contains(gp[i]):
                        burned_pts.add(i)
        print(f"  {y}: {n_feat} scars, {round(scar_ha.get(y,0)):>7} ha reported "
              f"({time.time()-t0:.0f}s)", flush=True)

    # --- baseline: union of every scar 2014-2025, sampled on the land grid
    cell = 0.0
    for i in burned_pts:
        cell += deg2ha(GRID_DEG * GRID_DEG, gp_lat[i])
    burned_km2 = cell / 100.0
    baseline = burned_km2 / PT_KM2

    # --- local baseline: burn rate of the land within 20 km of each plant
    lidx = local_index(gp_lat, gp)
    for f in fps:
        c = f["centre"] or [f["lat"], -8.0]
        f["local"], f["local_n"] = local_rate(lidx, gp, burned_pts, c[0], c[1])
    print(f"local rates done ({time.time()-t0:.0f}s)", flush=True)

    # --- per-plant rollup
    out = []
    for f in fps:
        if not f["burn"]:
            continue
        total_deg = f["geom"].area
        burns = []
        for y, a in sorted(f["burn"].items()):
            frac = a / total_deg if total_deg else 0.0
            ha = deg2ha(a, f["lat"])
            if frac < MIN_FRAC and ha < MIN_HA:
                continue
            burns.append({"year": y, "frac": round(frac, 3), "ha": round(ha, 1),
                          "cause": (f["cause"].get(y) or (None, 0))[0]})
        if not burns:
            continue
        # union share, so a plot that burned three times is not counted three times
        union_frac = min(1.0, max(b["frac"] for b in burns))
        pre  = [b for b in burns if f["since"] and b["year"] <  f["since"]]
        post = [b for b in burns if f["since"] and b["year"] >= f["since"]]
        out.append({
            "key": f["key"], "src": f["src"], "kind": f["kind"], "name": f["name"],
            "owner": f["owner"], "concelho": f["concelho"], "processo": f["processo"],
            "mva": f["mva"], "since": f["since"], "centre": f["centre"],
            "area_ha": f["area_ha"], "burns": burns,
            "local_rate": round(f["local"], 3) if f["local"] is not None else None,
            # burned share of this footprint over the burn rate of the land around
            # it: 1.0 is exactly what the neighbourhood would predict. High values
            # are the only individually interesting cases, and are a lead to check
            # by hand, not a finding.
            "excess": (round(union_frac / f["local"], 1)
                       if f["local"] and f["local"] > 0.005 else None),
            "burned_frac": round(union_frac, 3),
            "burned_ha": round(max(b["ha"] for b in burns), 1),
            "when": ("burned_then_built" if pre and not post else
                     "burned_after_built" if post and not pre else
                     "both" if pre and post else "date_unknown"),
        })
    out.sort(key=lambda r: (-(r["burned_frac"]), -(r["burned_ha"])))

    solar = [r for r in out if r["kind"] == "solar"]
    solar_fp = [f for f in fps if f["kind"] == "solar"]
    solar_ha = sum(f["area_ha"] for f in solar_fp)
    burned_solar_ha = sum(r["burned_ha"] for r in solar)

    def kind_block(kind):
        """Observed burned share of a technology's footprint vs the share the
        land around it burned. Expected is area-weighted, so a 500 ha plant in the
        Alentejo counts for more than a 2 ha roof in Trás-os-Montes."""
        fp = [f for f in fps if f["kind"] == kind]
        hit = [r for r in out if r["kind"] == kind]
        ha = sum(f["area_ha"] for f in fp)
        on = sum(r["burned_ha"] for r in hit)
        wl = [(f["area_ha"], f["local"]) for f in fp if f["local"] is not None]
        exp = (sum(a * l for a, l in wl) / sum(a for a, _ in wl)) if wl and sum(a for a, _ in wl) else None
        obs = (on / ha) if ha else None
        return {"plants": len(fp), "ha": round(ha, 1), "on_scar": len(hit),
                "on_scar_ha": round(on, 1),
                "observed_share": round(obs, 4) if obs is not None else None,
                "expected_share_local": round(exp, 4) if exp is not None else None,
                "ratio_local": round(obs / exp, 2) if obs and exp else None,
                "ratio_national": round(obs / baseline, 2) if obs and baseline else None}

    # by owner — who holds the most burned-then-built ground
    own = {}
    for r in solar:
        if r["when"] not in ("burned_then_built", "both"):
            continue
        o = own.setdefault(r["owner"] or "—", {"owner": r["owner"] or "—", "n": 0,
                                               "ha": 0.0, "mva": 0.0, "years": set()})
        o["n"] += 1
        o["ha"] += r["burned_ha"]
        try:
            o["mva"] += float(r["mva"] or 0)
        except (TypeError, ValueError):
            pass
        o["years"].update(b["year"] for b in r["burns"] if r["since"] and b["year"] < r["since"])
    by_owner = sorted(({**v, "ha": round(v["ha"], 1), "mva": round(v["mva"], 1),
                        "years": sorted(v["years"])} for v in own.values()),
                      key=lambda x: -x["ha"])

    stats = {
        "years": [min(years), max(years)] if years else None,
        "baseline_burned_share": round(baseline, 4),
        "baseline_burned_km2": round(burned_km2),
        "solar_plants": len(solar_fp),
        "solar_ha": round(solar_ha, 1),
        "solar_on_scar": len(solar),
        "solar_on_scar_ha": round(burned_solar_ha, 1),
        "solar_scar_share": round(burned_solar_ha / solar_ha, 4) if solar_ha else None,
        "burned_then_built": sum(1 for r in solar if r["when"] in ("burned_then_built", "both")),
        "burned_after_built": sum(1 for r in solar if r["when"] == "burned_after_built"),
        "date_unknown": sum(1 for r in solar if r["when"] == "date_unknown"),
        "wind_on_scar": sum(1 for r in out if r["kind"] == "wind"),
        "by_kind": {"solar": kind_block("solar"), "wind": kind_block("wind")},
        "built": time.strftime("%Y-%m-%d %H:%M"),
    }
    stats["ratio_vs_baseline"] = (round(stats["solar_scar_share"] / baseline, 2)
                                  if baseline and stats["solar_scar_share"] else None)

    os.makedirs(OUT, exist_ok=True)
    json.dump({"stats": stats, "by_owner": by_owner, "plants": out},
              open(f"{OUT}/burns.json", "w"), ensure_ascii=False)

    # --- merge a compact marker into data.json so popups need no second fetch
    dp = f"{OUT}/data.json"
    if os.path.exists(dp):
        d = json.load(open(dp))
        by_key = {r["key"]: r for r in out}
        for s in d.get("dgeg_solar", []):
            r = by_key.get("dgeg:" + str(s.get("name")))
            s["burn"] = ({"frac": r["burned_frac"], "ha": r["burned_ha"], "when": r["when"],
                          "years": [b["year"] for b in r["burns"]]} if r else None)
        for p in d.get("plants", []):
            r = by_key.get("osm:" + str(p.get("id")))
            p["burn"] = ({"frac": r["burned_frac"], "ha": r["burned_ha"], "when": r["when"],
                          "years": [b["year"] for b in r["burns"]]} if r else None)
        d["burn_stats"] = stats
        json.dump(d, open(dp, "w"), ensure_ascii=False)

    print(f"\nbaseline: {baseline*100:.1f}% of continental Portugal burned "
          f"{stats['years'][0]}-{stats['years'][1]} ({stats['baseline_burned_km2']} km2)")
    for k in ("solar", "wind"):
        b = stats["by_kind"][k]
        print(f"{k:<6}: {b['on_scar']}/{b['plants']} on a scar — "
              f"{(b['observed_share'] or 0)*100:.1f}% of footprint burned vs "
              f"{(b['expected_share_local'] or 0)*100:.1f}% expected from the land "
              f"within 20 km ({b['ratio_local']}x local, {b['ratio_national']}x national)")
    print(f"{stats['burned_then_built']} solar plants burned then built, "
          f"{stats['burned_after_built']} burned after, {stats['date_unknown']} undated")
    print(f"-> {OUT}/burns.json ({time.time()-t0:.0f}s)")

if __name__ == "__main__":
    main()
