# Serra da Gardunha — solar and wind map

Live at **https://mapa.salvargardunha.com** (also https://gardunha.hexgeta.com).

Every position on the map comes from a public register, and every position that
could be checked against a second, independent register has been. Nothing is
placed at a guessed coordinate. Where a project exists on paper but has no
published geometry, it is listed and explicitly marked as having no location
rather than being dropped or pinned somewhere plausible.

This file explains where the data comes from, how the weekly rebuild works, and
what the known limits are.

---

## 1. Sources

Area of interest for every source: bounding box **39.85 / −7.90 / 40.30 / −7.20**
(S/W/N/E), which covers the Serra da Gardunha and the surrounding Fundão,
Castelo Branco and Covilhã municipalities.

### 1.1 DGEG — the licence register (positional ground truth)

Direção-Geral de Energia e Geologia, the national energy licensing authority.
Two ArcGIS MapServer layers, queried directly:

| What | Endpoint |
|---|---|
| Wind (Centrais Eólicas) | `servergeo.dgeg.gov.pt/arcgis/rest/services/Visualizadores/CE/MapServer/0/query` |
| Solar (Centrais Solares) | `servergeo.dgeg.gov.pt/arcgis/rest/services/Visualizadores/CS/MapServer/0/query` |

One polygon per **turbine block** and per **solar block**, carrying the licence
file number (`processo`), owner, park and sub-park name, rated power
(`potencia_geradorkw` / `potencia_instaladakva`), blade radius, municipality and
the date the station entered service (`data_exploracao`, epoch ms).

This is the authoritative positional source. Where OSM and DGEG disagree, DGEG
wins.

Gotchas encoded in `fetch_dgeg.py`:
- The server presents an **incomplete certificate chain**, hence `verify=False`.
- Park totals are stamped on *every* block of the park, so aggregating them
  requires `max()`, not `sum()`. Summing inflates capacity by the block count.
- `data_exploracao` is epoch **milliseconds**; parse with
  `datetime.utcfromtimestamp(ms/1000)`.

### 1.2 OpenStreetMap — outlines, names, turbine detail

Overpass API (three mirrors tried in turn: overpass-api.de,
overpass.kumi.systems, overpass.private.coffee).

- `way|relation["power"="plant"]` → plant outlines, operator, `plant:output:electricity`
- `nwr["power"="generator"]["generator:source"="wind"]` → individual turbines,
  hub height, model

OSM contributes what DGEG does not publish: park outlines, operator names,
turbine models and heights. It is **not** trusted for position on its own — see
the cross-check below.

Gotcha: `out geom tags;` silently suppresses relation members and returns only a
bounding box. The queries use `out geom;` / `out center;`. Wind farms are often
mapped as `type=site` relations whose members are the turbine nodes; the farm
outline for those is a convex hull of its own turbines, not a legal boundary,
and the map says so in the popup.

### 1.3 APA / SNIAmb — planned projects, with geometry

Agência Portuguesa do Ambiente. Every project that needs an Avaliação de
Impacte Ambiental files a study-area polygon.

`sniambgeoext.apambiente.pt/arcgis/rest/services/Visualizador/ZoomToApp/MapServer/0/query`

Gotchas in `fetch_aia.py`:
- Requires both a browser `User-Agent` **and** `Referer: https://sniambgeoviewer.apambiente.pt/`.
- The server accepts `f=geojson` but returns **zero features**. Ask for native
  `f=json` and convert the esriJSON `rings` by hand.
- **The layer stops at AIA file no. 3762.** Anything filed later has no shape at
  all. This is the single biggest limitation of the planned-projects layer.

### 1.4 APA / SIAIA — planned project details

`siaia.apambiente.pt/ProcessoAIA/Detalhes/<n>` scraped per file number for:
designação, proponente, licenciador, concelhos, public-consultation dates,
sentido da decisão and decision date.

Files are taken from the SNIAmb geometry layer, plus a hand-maintained list in
`build_planned.py` (`EXTRA = [3800, 3802, 3954, 3780, 3275, 3706, 3663, 3801]`)
of newer applications found through the consultation and news trail — Sophia,
Beira, Pinhal Interior II and others that postdate the geometry cut-off.
**Add new file numbers there** when a new application appears.

### 1.5 INEGI e2p — independent second opinion

`services5.arcgis.com/AMh9EzyFGgthLT1q/arcgis/rest/services/e2p2_en/FeatureServer/1/query`

Maintained by INEGI / Universidade do Porto. One point per power station, no
turbine positions. Used only to corroborate park name, promoter and rated power.
25 stations in the box.

### 1.6 Sources deliberately **not** used

- **WRI Global Power Plant Database** — 454 of its 469 Portuguese rows carry
  `geolocation_source = "Energias Endogenas de Portugal"`, i.e. they are
  INEGI-derived and from 2017. Using it would have been double-counting one
  source as two. Dropped.
- **Global Energy Monitor** — wind and solar trackers are behind a registration
  form; the open `api.globalenergymonitor.org/assets` endpoint exposes only
  ownership-tracing data. Dead end.

### 1.7 Hand-entered context (two entries, both without coordinates)

Added at the bottom of `build_planned.py` because no register carries them:

- **Eurowind Gardunha proposal** — rejected by the Castelo Branco municipal
  executive in June 2026, no AIA process opened. Source: Gazeta do Interior,
  2026-06-24. Only "~7 ha of municipal land on the sierra" was ever published,
  so it gets **no coordinates**.
- **PSZAER** (Zonas de Aceleração de Energias Renováveis) — the sector programme
  the campaign actually contests. Public consultation closed 2026-07-15. No
  municipality-level cartography published, so **no coordinates**.

---

## 2. How the verification works

`crosscheck.py` is the heart of it.

**Turbine level.** Each OSM turbine is matched to the nearest DGEG turbine block
within a **250 m** tolerance (`TOL`). Current result:

- **224 of 229** OSM turbines confirmed by DGEG
- **median offset 1 m**, maximum 232 m
- **5** OSM turbines with no DGEG block within tolerance → drawn amber,
  "position unverified"
- **19** DGEG-licensed turbines absent from OSM → drawn pink. These are recent
  builds: VALVERDINHO (14 turbines, 92.4 MW), GARDUNHA II (2, 10 MW, 2025),
  RAIA/TROVISCAL (2, 14.4 MW), VIDUAL (1, 1 MW, 2006).

A 1 m median across 224 turbines is the whole argument for trusting this map:
two registers compiled by different bodies for different purposes agree to
within the width of a turbine tower.

**Park level.** Each OSM plant is matched against DGEG park aggregates and
against INEGI e2p by name and centroid distance. 35 of 36 plants carry at least
one independent confirmation.

**Built vs. unbuilt.** A consent is not a wind farm. `build_planned.py` takes
each AIA study-area polygon and asks whether DGEG has any licensed turbine or
solar block *inside* it (ray-casting point-in-polygon):

- DGEG has something inside → **built**
- Consent stands, DGEG has nothing → **approved, unbuilt** (the interesting
  category — currently 6 projects, headed by Central Solar Fotovoltaica da
  Gardunha, Generg, 820 ha, DIA favourable 17/03/2023)
- Study areas are drawn loosely and a plant can fall just outside its own
  polygon, so an accent-stripped exact **name match** in the register is
  accepted as a fallback. This is what fixed Cabeço Vermelho being wrongly
  reported as unbuilt.
- **Lines and substations are exempted.** The DGEG register only covers
  generating stations, so a 400 kV line's absence from it proves nothing. They
  are marked "not verifiable here" rather than "unbuilt".

---

## 3. The weekly rebuild

Cron, Mondays 04:17:

```
17 4 * * 1 flock -n /tmp/gardunha.lock /home/hexgetahetzner/gardunha/refresh.sh >> /home/hexgetahetzner/gardunha/refresh.log 2>&1
```

`flock` prevents overlapping runs; output is appended to `refresh.log`.

`refresh.sh` runs seven steps in order. Each step overwrites its own output —
nothing is appended, so it is safe to run by hand at any time:

```
python3 fetch_geom.py      # Overpass  → osm_geom.json
python3 build_osm.py       #           → farms_osm.json      (plants + turbines)
python3 fetch_dgeg.py      # DGEG CE+CS→ ext/dgeg_*_gardunha_bbox.geojson
python3 fetch_inegi.py     # INEGI e2p → ext/inegi_e2p_gardunha_bbox.geojson
python3 crosscheck.py      #           → crosscheck.json, dgeg_all.json,
                           #             dgeg_extra.json, rewrites farms_osm.json
python3 fetch_aia.py       # APA SNIAmb→ ext/aia_bbox.geojson
python3 build_planned.py   # SIAIA     → planned.json
python3 build_map.py       #           → /var/www/gardunha/data.json
```

Run it manually with:

```bash
~/gardunha/refresh.sh
```

Takes roughly 3–5 minutes, most of it the polite 0.3 s delay between SIAIA
page scrapes.

**`crosscheck.py` writes `farms_osm.json` back out.** That writeback is what
stamps each turbine with its DGEG confirmation. Without it every turbine renders
as unverified amber. Do not reorder the steps.

The front end is static: `/var/www/gardunha/index.html` fetches
`data.json?v=<timestamp>` and Caddy serves it `no-cache`, so a browser refresh
always picks up the new build. **There is no deploy step** — writing `data.json`
is the deploy.

### Failure modes

Each fetcher raises `SystemExit` on an empty response rather than writing an
empty file, so a silently-changed upstream service fails the run loudly and
leaves last week's good data in place. Check `refresh.log` if the "built"
timestamp in the sidebar stops advancing.

---

## 4. Files

| File | Role |
|---|---|
| `fetch_geom.py` | Overpass pull (plant outlines + turbines), 3 mirrors |
| `build_osm.py` | raw OSM → farms: hulls, sub-park detection, turbine attribution |
| `fetch_dgeg.py` | DGEG wind + solar licence polygons |
| `fetch_inegi.py` | INEGI e2p stations |
| `crosscheck.py` | turbine and park matching; the verification core |
| `fetch_aia.py` | APA/SNIAmb study-area polygons |
| `build_planned.py` | SIAIA scrape, built-vs-unbuilt classification, hand entries |
| `build_map.py` | assembles `/var/www/gardunha/data.json` + the stats block |
| `refresh.sh` | runs all of the above in order |
| `fetch_osm.py` | **superseded** by `fetch_geom.py`; not in `refresh.sh`, kept only as a record of the original wide pull |
| `ext/` | cached upstream responses, including large national files not re-fetched weekly (`dgeg_*.geojson`, `wri.csv.zip`, `global_power_plant_database.csv`, `gem_portugal_assets.json`) |

---

## 5. Hosting — two front ends, one data file

`data.json` is written once by `build_map.py` and consumed by two pages.

**VPS (this box)** — `/var/www/gardunha/`, owner `hexgetahetzner:caddy`, mode 775.
A single Caddy vhost serves `gardunha.hexgeta.com` and `mapa.salvargardunha.com`
from it, with `Cache-Control: no-cache, must-revalidate` and
`Access-Control-Allow-Origin: *`. That CORS header is **load-bearing** — without
it the campaign site cannot read `data.json` cross-origin.
DNS: `mapa.salvargardunha.com` A → 204.168.228.209 (Porkbun).

**Campaign site (Vercel)** — `salvargardunha.com/map`, from `map.html` in the
`hexgeta/salvargardunha` repo. It is the site's own chrome and its own four
languages, and it **fetches `https://mapa.salvargardunha.com/data.json` at
runtime**. Nothing is copied into the repo, so the weekly rebuild on this box
updates the campaign page too, with no deploy.

Two things had to be registered for the localised routes to work:
- `map` added to the `ROOT` set in `api/page.js`, which is what makes
  `/en/map`, `/de/map`, `/fr/map` resolve with the right `<html lang>`,
  canonical and hreflang for crawlers.
- Cross-links added on `/mapa` (the page that says the Government published no
  municipal maps) and in the footers.

If `data.json` ever moves, `DATA_URL` at the top of the script in `map.html` is
the only place to change.

---

## 6. Language

Two independent implementations, because the two front ends have different
audiences:

- **`mapa.salvargardunha.com`** — PT/EN, stored under `localStorage`
  key `gardunha.lang`. First-time visitors get their browser language.
- **`salvargardunha.com/map`** — PT/EN/DE/FR, sharing the campaign site's
  existing `nf_lang` key, so the language chosen anywhere on the site carries
  over to the map and vice versa.

Both translate the interface, the four project states and the phrasing the
pipeline generates. **Project, promoter and place names stay in Portuguese in
every language** — they are the names as filed with DGEG and APA, and
translating them would break the trail back to the source document. The English
strapline says so explicitly.

To add a translated string: add the key to every language object (`I18N` in
`index.html`, `STR` in `map.html`). For a phrase the pipeline writes into
`data.json` in Portuguese, add it to the `PHRASE` map (exact strings) or to
`tr()` (templated ones such as `DIA <decision> (<date>)`). Templated forms are
per-language in `TPL`, and the DIA decision words in `DIAW`.

Anything unrecognised falls through `tr()` untranslated rather than being
dropped, so a new phrase from upstream shows up in Portuguese instead of
vanishing.

---

## 7. Known limits — state these if the map is challenged

1. **APA geometry stops at file no. 3762.** The newest applications (Sophia
   3800, Beira 3802, Pinhal Interior II 3954) are real, are in the register, and
   have no published shape. They are listed without coordinates. Ten planned
   entries are in this position.
2. **Wind-farm outlines from OSM `site` relations are convex hulls** of the
   turbines, not legal park boundaries. The real licensed area is usually larger.
3. **Lines and substations cannot be verified as built** from the DGEG register,
   because it only covers generating stations.
4. **250 m matching tolerance** is a judgement call. It is generous relative to
   the 1 m median actually observed, and was chosen so that a genuinely
   mis-mapped OSM turbine still matches rather than appearing as a phantom.
5. **"Approved, unbuilt" is inference, not a statement from DGEG.** It means the
   consent exists and the licence register shows nothing inside the study area
   today. A project mid-construction will read as unbuilt.
6. Data is a weekly snapshot. The build timestamp is shown at the foot of the
   sidebar.
