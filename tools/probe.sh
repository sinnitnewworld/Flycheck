curl -s -m 60 https://overpass-api.de/api/interpreter --data-urlencode 'data=[out:json][timeout:30];(node["amenity"="police"](around:8000,12.9201,77.5101);way["amenity"="police"](around:8000,12.9201,77.5101););out center tags;' | python3 -c '
import json,sys,math
d=json.load(sys.stdin)
for e in d["elements"]:
  la=e.get("lat") or e["center"]["lat"]; lo=e.get("lon") or e["center"]["lon"]
  km=math.hypot((la-12.9201)*111,(lo-77.5101)*108.5)
  print(round(km,2), e["type"], e["tags"].get("name"), {k:v for k,v in e["tags"].items() if k not in ("amenity","name")})' | sort -n
