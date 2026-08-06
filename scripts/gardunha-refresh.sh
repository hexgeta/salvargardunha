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
# the Gardunha scar layer above is cropped to the serra; these are the national
# per-year complements, thinned enough that the map can load one at a time
.venv/bin/python build_ardidas_nacional.py 2014 2015 2016 2017 2018 2019 2020 2021 2022 2023 2024 2025
.venv/bin/python burn_join.py
echo "gardunha map rebuilt $(date '+%F %T')"
