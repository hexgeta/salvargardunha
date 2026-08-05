#!/bin/bash
# Re-pull every source and rebuild the map. Safe to run any time; each step
# overwrites its own output and nothing is appended.
set -e
cd "$(dirname "$0")"
python3 -W ignore fetch_geom.py
python3 -W ignore build_osm.py > /dev/null
python3 -W ignore fetch_dgeg.py
python3 -W ignore fetch_inegi.py
python3 -W ignore crosscheck.py
python3 -W ignore fetch_aia.py
python3 -W ignore build_planned.py > /dev/null
python3 -W ignore fetch_ardidas.py
python3 -W ignore build_map.py
# 2017 national scars 500 on a single query — tiled fetch fills the gap if missing
[ -s ext/ardidas_pt/ardidas_2017.geojson ] || python3 -W ignore fetch_ardidas_tiled.py 2017
# the Gardunha scar layer above is cropped to the serra; this is the national
# 2025 complement, thinned enough to load in a browser
.venv/bin/python build_ardidas_nacional.py 2025
.venv/bin/python burn_join.py
echo "gardunha map rebuilt $(date '+%F %T')"
