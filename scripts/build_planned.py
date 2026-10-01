"""Planned + consented projects, straight from the APA environmental register.

Two tiers, and the map keeps them apart on purpose:

  * WITH geometry — the SNIAmb 'areas de estudo' layer publishes a polygon for
    each AIA process, but only up to process 3762. Those get a real outline.
  * WITHOUT geometry — the newest applications (Sophia, Beira, Pinhal Interior
    II) are in the register with concelho and promoter but no shape at all.
    They are listed, and explicitly marked as having no published location.
    Nothing here is placed at a guessed coordinate.
"""
import json, os, re, html, math, time
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) gardunha-research/1.0"}
DET = "https://siaia.apambiente.pt/ProcessoAIA/Detalhes/{}"

# Filed too late to appear in the geometry layer, or found through the news and
# public-consultation trail rather than through the map service.
EXTRA = [3800, 3802, 3954, 3780, 3275, 3706, 3663, 3801]

FIELDS = ["Nº AIA", "Designação do projeto", "Proponente", "Licenciador",
          "Localização (Concelhos)", "Autoridade AIA", "Tipologia",
          "Início de consulta pública", "Fim de consulta pública",
          "Sentido da Decisão", "Data da decisão", "Estado"]

ENERGY = re.compile(
    r"solar|fotovolt|e[óo]lic|aerogerad|hibridiza|armazenamento|bateria|bess|"
    r"linha (el[ée]trica|de muito alta)|lmat|subesta|centro electroprodutor|"
    r"centro eletroprodutor|kv\b", re.I)


def scrape(n):
    try:
        r = requests.get(DET.format(n), headers=UA, timeout=60, verify=False)
        if r.status_code != 200:
            return None
    except Exception:
        return None
    t = re.sub(r"<script.*?</script>", "", r.text, flags=re.S)
    t = re.sub(r"<[^>]+>", "\n", t)
    lines = [html.unescape(x).strip() for x in t.split("\n") if x.strip()]
    out = {}
    for i, ln in enumerate(lines):
        if ln in FIELDS and i + 1 < len(lines):
            nxt = lines[i + 1]
            out[ln] = "" if nxt in FIELDS else nxt
    return out or None


def centroid_area(rings):
    pts = [p for r in rings for p in r]
    lat = sum(p[0] for p in pts) / len(pts)
    lon = sum(p[1] for p in pts) / len(pts)
    k = math.cos(math.radians(lat))
    tot = 0.0
    for r in rings:
        pr = [(p[1] * k * 111320.0, p[0] * 111320.0) for p in r]
        a = 0.0
        for i in range(len(pr)):
            x1, y1 = pr[i]
            x2, y2 = pr[(i + 1) % len(pr)]
            a += x1 * y2 - x2 * y1
        tot += abs(a) / 2
    return [lat, lon], round(tot / 10000.0, 1)


# ------------------------------------------------------- geometry by n_aia
geo = {}
for f in json.load(open(f"{HERE}/ext/aia_bbox.geojson"))["features"]:
    n = f["properties"]["n_aia"]
    coords = f["geometry"]["coordinates"]
    polys = [coords] if f["geometry"]["type"] == "Polygon" else coords
    rings = [[[p[1], p[0]] for p in poly[0]] for poly in polys]
    geo.setdefault(n, []).extend(rings)

nums = sorted(set(geo) | set(EXTRA))
print(f"resolving {len(nums)} AIA processes...")

rows = []
for n in nums:
    d = scrape(n)
    time.sleep(0.3)
    if not d:
        print(f"  {n}: not resolvable")
        continue
    name = d.get("Designação do projeto", "")
    if not ENERGY.search(name):
        continue
    rings = geo.get(n)
    cen, area = (centroid_area(rings) if rings else (None, None))
    decision = d.get("Sentido da Decisão") or ""
    cp_end = d.get("Fim de consulta pública") or ""
    status = (f"DIA {decision.lower()} ({d.get('Data da decisão') or 's/ data'})"
              if decision else
              f"em avaliação — consulta pública até {cp_end}" if cp_end else
              "submetido, sem consulta pública marcada")
    rows.append({
        "n_aia": n,
        "name": name,
        "type": ("solar" if re.search(r"solar|fotovolt", name, re.I)
                 else "eólico" if re.search(r"e[óo]lic|aerogerad", name, re.I)
                 else "linha/subestação" if re.search(r"linha|lmat|subesta|kv", name, re.I)
                 else "armazenamento" if re.search(r"armazen|bateria|bess", name, re.I)
                 else "híbrido"),
        "promoter": d.get("Proponente"),
        "municipality": d.get("Localização (Concelhos)"),
        "licensor": d.get("Licenciador"),
        "cp_start": d.get("Início de consulta pública"),
        "cp_end": cp_end or None,
        "decision": decision or None,
        "decision_date": d.get("Data da decisão") or None,
        "status": status,
        "lat": cen[0] if cen else None,
        "lon": cen[1] if cen else None,
        "area_ha": area,
        "rings": rings,
        "precision": ("polígono da área de estudo publicado pela APA" if rings
                      else "sem geometria publicada — o processo é posterior ao "
                           "limite da camada SNIAmb (n.º 3762)"),
        "sources": [{"title": f"APA/SIAIA — processo AIA n.º {n}",
                     "url": DET.format(n), "date": time.strftime("%Y-%m-%d")}]
        + ([{"title": "APA/SNIAmb — áreas de estudo de processos de AIA",
             "url": "https://sniambgeoext.apambiente.pt/arcgis/rest/services/"
                    "Visualizador/ZoomToApp/MapServer/0",
             "date": time.strftime("%Y-%m-%d")}] if rings else []),
    })

# Hand-added context that no register carries: the proposal the local campaign
# is actually about, and the campaign's own target. Both are deliberately left
# without coordinates because none have been published.
rows.append({
    "n_aia": None,
    "name": "Parque solar e eólico na Serra da Gardunha (proposta Eurowind)",
    "type": "híbrido (solar + eólico)", "promoter": "Eurowind Energy, Lda",
    "municipality": "Castelo Branco",
    "status": "proposta rejeitada pelo executivo municipal em junho de 2026; "
              "sem processo de AIA aberto",
    "lat": None, "lon": None, "rings": [],
    "precision": "sem localização publicada — apenas '~7 ha de terreno "
                 "municipal na serra'. Não é colocada no mapa por isso.",
    "notes": "É a proposta em torno da qual se organizou a contestação local. "
             "Não existe potência instalada publicada.",
    "sources": [{"title": "Gazeta do Interior — Câmara não quer parque solar e "
                          "eólico na Gardunha",
                 "url": "https://www.gazetadointerior.pt/noticias/ano-2026/"
                        "1952-06-24/castelo-branco/camara-nao-quer-parque-solar-"
                        "e-eolico-na-gardunha.aspx", "date": "2026-06-24"}],
})
rows.append({
    "n_aia": None,
    "name": "PSZAER — Zonas de Aceleração de Energias Renováveis",
    "type": "programa setorial", "promoter": "Estrutura de Missão para o "
            "Licenciamento de Projetos de Energias Renováveis 2030",
    "municipality": "nacional (cluster «Pinhal do Centro» abrange a Gardunha)",
    "status": "consulta pública encerrada 15/07/2026, em análise",
    "lat": None, "lon": None, "rings": [],
    "precision": "o programa não publicou cartografia por concelho, pelo que "
                 "não há nada de exato para desenhar",
    "notes": "É este programa, e não um projeto concreto, que a campanha "
             "«Salvar a Gardunha» contesta.",
    "sources": [{"title": "participa.pt — consulta pública do PSZAER",
                 "url": "https://participa.pt/pt/consulta/programa-setorial-das-"
                        "zonas-de-aceleracao-da-implantacao-de-energias-renovaveis",
                 "date": "2026-07-15"},
                {"title": "salvargardunha.com", "url": "https://salvargardunha.com",
                 "date": "2026-08-05"}],
})

# --------------------------------------------- has it actually been built?
# A consent is not a wind farm. Cross the AIA study area against the DGEG
# licence register: if DGEG has turbines or solar blocks inside the polygon, the
# project is on the ground. If the consent stands and DGEG has nothing there,
# it is approved and still unbuilt — which is the interesting category.
def in_poly(pt, ring):
    x, y, inside = pt[1], pt[0], False
    j = len(ring) - 1
    for i in range(len(ring)):
        yi, xi = ring[i][0], ring[i][1]
        yj, xj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def norm(s):
    s = (s or "").lower()
    for a, b in [("á", "a"), ("â", "a"), ("ã", "a"), ("é", "e"), ("ê", "e"),
                 ("í", "i"), ("ó", "o"), ("ô", "o"), ("õ", "o"), ("ú", "u"),
                 ("ç", "c")]:
        s = s.replace(a, b)
    return re.sub(r"[^a-z0-9 ]", " ", s)


dg = json.load(open(f"{HERE}/dgeg_all.json"))
for r in rows:
    # The DGEG register only covers generating stations. A 400 kV line or a
    # substation is simply absent from it, so 'not found' says nothing at all
    # about whether it was built — better to admit that than to imply it wasn't.
    if r["type"] == "linha/subestação":
        r["built"] = None
        r["built_note"] = ("linhas e subestações não constam do registo DGEG de "
                           "centrais — estado no terreno não verificável aqui")
        continue
    if not r["rings"]:
        r["built"] = None
        r["built_note"] = "sem geometria — não é possível verificar no terreno"
        continue
    nt = sum(1 for t in dg["turbines"]
             if any(in_poly((t["lat"], t["lon"]), ring) for ring in r["rings"]))
    ns = [nm for nm, s in dg["solar"].items()
          if any(in_poly(s["centre"], ring) for ring in r["rings"])]
    # Study areas are drawn loosely and a plant can end up just outside its own
    # polygon, so accept an exact name match in the register as well.
    nn = norm(r["name"])
    for nm in dg["solar"]:
        if nm not in ns and norm(nm) in nn:
            ns.append(nm)
    r["built"] = bool(nt or ns)
    bits = []
    if nt:
        bits.append(f"{nt} aerogeradores licenciados pela DGEG dentro da área")
    if ns:
        bits.append("centrais solares DGEG na área: " + ", ".join(ns))
    r["built_note"] = ("; ".join(bits) if bits else
                       "nada consta do registo DGEG dentro desta área — "
                       "aprovado mas aparentemente por construir")
    if bits:
        r["sources"].append({
            "title": "DGEG — registo de centrais eólicas e solares",
            "url": "https://servergeo.dgeg.gov.pt/arcgis/rest/services/Visualizadores/CE/MapServer",
            "date": time.strftime("%Y-%m-%d")})

for r in rows:
    r["state"] = ("construído" if r["built"] else
                  "aprovado, por construir" if r["built"] is False else
                  "linha/subestação — não verificável" if r["rings"] else
                  "sem geometria publicada")

rows.sort(key=lambda r: (r["lat"] is None, -(r.get("area_ha") or 0)))
json.dump(rows, open(f"{HERE}/planned.json", "w"), ensure_ascii=False, indent=1)

print(f"\n{len(rows)} energy projects in the register "
      f"({sum(1 for r in rows if r['rings'])} with published geometry)\n")
for r in rows:
    where = (f"{r['lat']:.4f},{r['lon']:.4f} {r.get('area_ha') or 0:>8.0f} ha"
             if r["lat"] else "  - sem coordenadas publicadas -   ")
    print(f"  {str(r['n_aia'] or '.'):>5}  {where}  {r['state'][:22]:<22} {r['name'][:48]:<48} "
          f"{(r['promoter'] or '')[:24]:<24} {r['status'][:40]}")
