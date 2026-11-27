UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
for u in "https://data.opencity.in/api/3/action/package_show?id=police-jurisdiction-maps-for-major-cities-of-india" \
 "https://data.opencity.in/dataset/police-jurisdiction-maps-for-major-cities-of-india" \
 "https://olddata.opencity.in/api/3/action/package_show?id=police-jurisdiction-maps-for-major-cities-of-india" \
 "https://olddata.opencity.in/dataset/police-jurisdiction-maps-for-major-cities-of-india"; do
 echo "== $u"; curl -sL -A "$UA" -m 40 -o /tmp/p -w "%{http_code} %{content_type}\n" "$u"; head -c 300 /tmp/p | tr '\n' ' '; echo
 grep -oE 'https?://[^"]+\.(kml|kmz|geojson)' /tmp/p | sort -u | head -40
 grep -oE '"url": *"[^"]+"' /tmp/p | head -40
done
