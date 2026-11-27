"""Fetch official police-station jurisdiction boundaries (KSRSAC / state GIS, published as
public-domain KML on data.opencity.in) and write compact GeoJSON for FlyCheck.
Output: police/index.json (one entry per file with its bounding box) + police/<slug>.json"""
import io, json, re, sys, zipfile, urllib.request, xml.etree.ElementTree as ET, pathlib

API = "https://data.opencity.in/api/3/action/"
UA = {"User-Agent": "FlyCheck/1.0 (github.com/sinnitnewworld/Flycheck)"}
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "police")


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
        return r.read()


def resources():
    seen, out = set(), []
    for q in ("police jurisdiction", "police station limits", "police station boundaries"):
        j = json.loads(get(API + "package_search?rows=100&q=" + urllib.parse.quote(q)))
        for p in j["result"]["results"]:
            for r in p.get("resources", []):
                name = (r.get("name") or "") + " " + p.get("title", "")
                fmt = (r.get("format") or "").lower() + " " + (r.get("url") or "").lower()
                if r["url"] in seen or not re.search(r"kml|kmz|geojson|json", fmt):
                    continue
                if not re.search(r"jurisdiction|limits|boundar", name, re.I) or re.search(r"traffic|railway|outpost|location", r.get("name") or "", re.I):
                    continue
                seen.add(r["url"]); out.append((p["name"], r.get("name") or r["url"], r["url"]))
    return out


KNS = "{http://www.opengis.net/kml/2.2}"


def coords(text):
    pts = []
    for tok in text.split():
        a = tok.split(",")
        if len(a) >= 2:
            pts.append([round(float(a[0]), 5), round(float(a[1]), 5)])
    # drop consecutive duplicates after rounding
    return [p for i, p in enumerate(pts) if i == 0 or p != pts[i - 1]]


def kml_features(data):
    if data[:2] == b"PK":
        z = zipfile.ZipFile(io.BytesIO(data)); data = z.read([n for n in z.namelist() if n.endswith(".kml")][0])
    root = ET.fromstring(data)
    ns = KNS if root.tag.startswith(KNS) else ""
    feats = []
    for pm in root.iter(ns + "Placemark"):
        props = {}
        n = pm.find(ns + "name")
        if n is not None and n.text: props["name"] = n.text.strip()
        for sd in pm.iter(ns + "SimpleData"):
            props[sd.get("name")] = (sd.text or "").strip()
        for d in pm.iter(ns + "Data"):
            v = d.find(ns + "value"); props[d.get("name")] = (v.text or "").strip() if v is not None else ""
        desc = pm.find(ns + "description")
        if desc is not None and desc.text: props["_desc"] = re.sub("<[^>]+>", " ", desc.text)[:300]
        polys = []
        for pg in pm.iter(ns + "Polygon"):
            ob = pg.find(f"{ns}outerBoundaryIs/{ns}LinearRing/{ns}coordinates")
            if ob is None: continue
            rings = [coords(ob.text)]
            for ib in pg.findall(f"{ns}innerBoundaryIs/{ns}LinearRing/{ns}coordinates"):
                rings.append(coords(ib.text))
            if len(rings[0]) >= 4: polys.append(rings)
        if polys:
            feats.append({"type": "Feature", "properties": props,
                          "geometry": {"type": "MultiPolygon", "coordinates": polys}})
    return feats


def geojson_features(data):
    j = json.loads(data)
    out = []
    for f in j.get("features", []):
        g = f.get("geometry") or {}
        if g.get("type") == "Polygon": g = {"type": "MultiPolygon", "coordinates": [g["coordinates"]]}
        if g.get("type") != "MultiPolygon": continue
        g["coordinates"] = [[[[round(x, 5), round(y, 5)] for x, y, *_ in ring] for ring in poly] for poly in g["coordinates"]]
        out.append({"type": "Feature", "properties": f.get("properties") or {}, "geometry": g})
    return out


NAME_KEYS = re.compile(r"^(ps_?name|police_?st(ation)?(_name)?|ps|station|name_?of_?ps|psname|police|name)$", re.I)


def station_name(p):
    for k, v in p.items():
        if NAME_KEYS.match(k or "") and v and not re.fullmatch(r"[\d.]+", v):
            return v
    return p.get("name") or ""


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    index = []
    for pkg, rname, url in resources():
        try:
            data = get(url)
            feats = kml_features(data) if re.search(rb"<kml|^PK", data[:400]) else geojson_features(data)
        except Exception as e:
            print("SKIP", rname, url, e); continue
        if not feats: print("EMPTY", rname, url); continue
        for f in feats:
            p = f["properties"]; f["properties"] = {"station": station_name(p).strip(), "raw": {k: v for k, v in p.items() if k != "_desc" and v}}
        xs = [c[0] for f in feats for poly in f["geometry"]["coordinates"] for c in poly[0]]
        ys = [c[1] for f in feats for poly in f["geometry"]["coordinates"] for c in poly[0]]
        slug = re.sub(r"[^a-z0-9]+", "-", rname.lower()).strip("-")[:60]
        (OUT / f"{slug}.json").write_text(json.dumps({"type": "FeatureCollection", "source": url, "dataset": pkg, "features": feats}, separators=(",", ":")))
        index.append({"file": f"{slug}.json", "name": rname, "bbox": [min(xs), min(ys), max(xs), max(ys)], "count": len(feats), "source": url})
        print(f"OK {rname}: {len(feats)} areas; sample props: {feats[0]['properties']}")
    (OUT / "index.json").write_text(json.dumps({"files": index}, indent=1))
    print("files:", len(index))


if __name__ == "__main__":
    import urllib.parse
    main()
