import json, math, urllib.request, urllib.parse
Q='[out:json][timeout:30];(node["amenity"="police"](around:8000,12.9201,77.5101);way["amenity"="police"](around:8000,12.9201,77.5101););out center tags;'
for m in ["https://overpass.private.coffee/api/interpreter","https://overpass.kumi.systems/api/interpreter","https://overpass-api.de/api/interpreter","https://maps.mail.ru/osm/tools/overpass/api/interpreter"]:
    try:
        r=urllib.request.urlopen(urllib.request.Request(m,data=urllib.parse.urlencode({"data":Q}).encode(),headers={"User-Agent":"FlyCheck/1.0"}),timeout=60).read()
        d=json.loads(r); print("mirror",m); break
    except Exception as e: print("fail",m,e)
rows=[]
for e in d["elements"]:
    la=e.get("lat") or e["center"]["lat"]; lo=e.get("lon") or e["center"]["lon"]
    rows.append((round(math.hypot((la-12.9201)*111,(lo-77.5101)*108.5),2),e["type"],e["tags"].get("name"),{k:v for k,v in e["tags"].items() if k not in("amenity","name")}))
for r in sorted(rows,key=lambda r:r[0]): print("ROW",*r)
