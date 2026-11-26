# FlyCheck

Drone weather for any spot in India: search a place, use your location or tap the map, choose your drone, and get **GO / CAUTION / NO-GO** for your planned time, plus the best windows in the next 3 days.

It checks wind and gusts at your flight height (against your drone's rated wind resistance), rain, visibility, cloud base, thunderstorm risk, temperature and geomagnetic Kp.

Open it at: https://sinnitnewworld.github.io/flycheck/

Forecast: Open-Meteo · Kp: NOAA SWPC · Place search: OpenStreetMap Nominatim · Map: OpenStreetMap.
Planning aid only. It does not check airspace: confirm zones on Digital Sky before every flight.

## Before you fly here (new)
- **Drone zone**: FlyCheck doesn't estimate it. It links to the official Digital Sky airspace map and gives the spot's coordinates to paste there. The plan is to show the official result in the app through the Digital Sky Interactive Maps API, using the pilot's own Digital Sky access.
- **GPS jamming warning** for districts on the Pakistan and Myanmar borders, where interference is reported.
- **News scan** (refreshed by the PassCast pipeline): drone-ban and red-zone orders, publicly announced VIP visits, air shows and big gatherings, matched to the spot's city, district and state. Only published headlines are used; VIP movements are never tracked or inferred.
- **Calendar cautions** for fixed dates: the Republic Day and Independence Day ban periods, kite seasons, Christmas and New Year.
- **Nearest police stations**, with phone numbers where mapped, and **power lines** near the take-off spot, both from OpenStreetMap.
- **Police intimation letter**: fill in your details once, then print, save as PDF or share on WhatsApp.
- **Search**: Mappls (MapmyIndia) search for apartments and buildings, falling back to OpenStreetMap. There is also a satellite photo view.
