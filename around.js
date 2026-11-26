/* FlyCheck: "Before you fly here" — airspace estimate, border / GPS-jamming warnings,
   nearest police stations, power lines, news-based cautions, calendar cautions and a
   police intimation letter. Plain words throughout. */
(function (root) {
"use strict";
const D = Math.PI / 180;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hav = (a, b, c, d) => { const x = Math.sin((c - a) * D / 2) ** 2 + Math.cos(a * D) * Math.cos(c * D) * Math.sin((d - b) * D / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
// fetch with a time limit, so one slow service can never hold up the page
function fetchT(url, opts = {}, ms = 10000) { const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  return fetch(url, Object.assign({}, opts, { signal: c.signal })).finally(() => clearTimeout(t)); }
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

/* ---------- 1. zone estimate from airport distance (Drone Rules 2021 airspace map) ---------- */
let AIRPORTS = null;
async function airports() { if (!AIRPORTS) { try { AIRPORTS = await (await fetchT("airports.json", {}, 8000)).json(); } catch (e) { AIRPORTS = []; } } return AIRPORTS; }
// distances are to the airport's centre point; the rule uses the airport boundary, so 2 km is taken off to stay on the safe side
function zoneFromAirports(list, lat, lon, htM) {
  const near = list.map(a => ({ name: a[0], code: a[3], sched: !!a[4], mil: !!a[5], km: hav(lat, lon, a[1], a[2]) })).sort((x, y) => x.km - y.km).slice(0, 3);
  const n = near[0]; if (!n) return { near, color: "grey", text: "Airport list unavailable." };
  const edge = Math.max(0, n.km - 2), ft = htM / 0.3048;
  if (edge < 5) return { near, color: "red", text: `Very close to ${n.name} (about ${n.km.toFixed(1)} km from its centre). Within 5 km of an airport is normally a RED zone: flying needs Central Government permission.` };
  if (edge < 8) return { near, color: "yellow", text: `${n.km.toFixed(1)} km from ${n.name}. Between 5 and 8 km of an airport is a YELLOW zone at any height: you need air traffic control permission through Digital Sky.` };
  if (edge < 12) return { near, color: ft > 200 ? "yellow" : "green", text: `${n.km.toFixed(1)} km from ${n.name}. Between 8 and 12 km you may fly up to 200 ft (60 m) without permission; above that it is YELLOW. ${ft > 200 ? `Your planned ${Math.round(htM)} m is above 60 m.` : ""}` };
  return { near, color: ft > 400 ? "yellow" : "green", text: `Nearest airport ${n.name} is ${n.km.toFixed(0)} km away. No airport zone here: GREEN up to 400 ft (120 m) unless the official map shows another zone.${ft > 400 ? " Your planned height is above 120 m, which is YELLOW." : ""}` };
}

/* ---------- 2. border districts: red zones and GPS jamming ---------- */
const BORDER = [
  { st: /punjab/i, d: /amritsar|gurdaspur|pathankot|tarn taran|firozpur|ferozepur|fazilka/i, gps: "high", side: "Pakistan" },
  { st: /jammu|kashmir/i, d: /jammu|samba|kathua|rajouri|poonch|kupwara|baramulla|bandipora|uri|kargil/i, gps: "high", side: "Pakistan / Line of Control" },
  { st: /ladakh/i, d: /leh|kargil/i, gps: "medium", side: "Line of Control / Line of Actual Control" },
  { st: /rajasthan/i, d: /ganganagar|bikaner|jaisalmer|barmer/i, gps: "medium", side: "Pakistan" },
  { st: /gujarat/i, d: /kachchh|kutch/i, gps: "medium", side: "Pakistan" },
  { st: /manipur/i, d: /chandel|tengnoupal|churachandpur|kamjong|ukhrul|pherzawl/i, gps: "medium", side: "Myanmar" },
  { st: /mizoram/i, d: /champhai|lawngtlai|siaha|saiha|serchhip|hnahthial/i, gps: "medium", side: "Myanmar" },
  { st: /nagaland/i, d: /mon|kiphire|phek|noklak/i, gps: "medium", side: "Myanmar" },
  { st: /arunachal/i, d: /changlang|tirap|longding|tawang|anjaw|upper siang|west kameng/i, gps: "low", side: "Myanmar / China" },
  { st: /sikkim/i, d: /mangan|north sikkim|gangtok|pakyong|east sikkim/i, gps: "low", side: "China" },
];
function borderCheck(addr) {
  const st = addr.state || "", dist = [addr.state_district, addr.district, addr.county, addr.city, addr.town].filter(Boolean).join(" ");
  const b = BORDER.find(x => x.st.test(st) && x.d.test(dist));
  if (!b) return null;
  return { gps: b.gps, text: `This district borders ${b.side}: the official map has red zones along the border, and security forces watch for drones here.` +
    (b.gps === "high" ? " GPS jamming and spoofing are frequently reported in this area: your drone may lose GPS, drift or show a false position. Keep it close, in sight, and be ready to fly it without GPS (ATTI mode)." :
      b.gps === "medium" ? " GPS interference has been reported along this border: watch for sudden position jumps or loss of GPS." : "") };
}

/* ---------- 3. police stations and power lines (OpenStreetMap via Overpass) ---------- */
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
// ask all mirrors at once and use whichever answers first (each limited to 15 s)
async function overpass(q) {
  const one = u => fetchT(u, { method: "POST", body: "data=" + encodeURIComponent(q) }, 15000).then(r => r.ok ? r.json() : Promise.reject(r.status));
  try { return await Promise.any(OVERPASS.map(one)); } catch (e) { return null; } }
function segDistM(lat, lon, a, b) { const kx = 111320 * Math.cos(lat * D), ky = 110540, ax = (a.lon - lon) * kx, ay = (a.lat - lat) * ky, bx = (b.lon - lon) * kx, by = (b.lat - lat) * ky, dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0; return Math.hypot(ax + t * dx, ay + t * dy); }
const OSM_CACHE = {};
async function osmAround(lat, lon) {
  const ck = lat.toFixed(4) + "," + lon.toFixed(4); if (OSM_CACHE[ck]) return OSM_CACHE[ck];
  const q = `[out:json][timeout:12];(node["amenity"="police"](around:20000,${lat},${lon});way["amenity"="police"](around:20000,${lat},${lon}););out center tags 30;
(way["power"~"^(line|minor_line)$"](around:600,${lat},${lon});node["power"~"^(tower|pole)$"](around:300,${lat},${lon}););out geom 200;`;
  const j = await overpass(q); if (!j) return null;   // not cached, so "Try again" asks again
  const police = [], lines = []; let towers = 0;
  for (const e of j.elements || []) {
    const t = e.tags || {};
    if (t.amenity === "police") { const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon; if (la == null) continue;
      police.push({ name: t.name || t["name:en"] || "Police station (name not mapped)", phone: t.phone || t["contact:phone"] || null, addr: [t["addr:street"], t["addr:city"]].filter(Boolean).join(", "), lat: la, lon: lo, km: hav(lat, lon, la, lo) }); }
    else if (t.power === "line" || t.power === "minor_line") { let m = Infinity; const g = e.geometry || []; for (let i = 0; i < g.length - 1; i++) m = Math.min(m, segDistM(lat, lon, g[i], g[i + 1])); lines.push({ m, hv: t.power === "line", volt: t.voltage }); }
    else if (t.power) towers++;
  }
  police.sort((a, b) => a.km - b.km); lines.sort((a, b) => a.m - b.m);
  return OSM_CACHE[ck] = { police: police.slice(0, 4), line: lines[0] || null, towers };
}

/* ---------- 4. news-based cautions (events.json from the PassCast scanner) ---------- */
let EVENTS = null;
async function events() { if (EVENTS) return EVENTS; for (const u of ["/Passcast/events.json", "https://sinnitnewworld.github.io/Passcast/events.json"]) { try { const r = await fetchT(u, { cache: "no-store" }, 8000); if (r.ok) return EVENTS = await r.json(); } catch (e) {} } return { items: [], failed: true }; }
const TYPE = { ban: "Drone ban / no-fly order", vip: "Announced VIP visit", airshow: "Air show / fly-past", crowd: "Big gathering" };
function placeTokens(addr) {
  const local = [addr.village, addr.suburb, addr.town, addr.city, addr.city_district, addr.county, addr.state_district, addr.district].filter(Boolean);
  const clean = s => s.replace(/\b(district|division|taluk|tehsil|city|urban|rural|municipal corporation)\b/gi, "").trim();
  return { local: [...new Set(local.map(clean).filter(s => s.length >= 4))], state: addr.state ? clean(addr.state) : null };
}
function matchEvents(ev, addr) {
  const { local, state } = placeTokens(addr), out = [];
  const has = (t, w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i").test(t);
  for (const it of ev.items || []) {
    const hit = local.find(w => has(it.title, w));
    if (hit) out.push({ ...it, where: hit, strength: 2 });
    else if (state && (it.type === "ban" || it.type === "vip") && has(it.title, state)) out.push({ ...it, where: state, strength: 1 });
  }
  return out.sort((a, b) => b.strength - a.strength).slice(0, 8);
}

/* ---------- 5. calendar cautions (fixed dates only; moving festivals come from the news scan) ---------- */
function calendar(dateIso, addr) {
  const d = new Date(dateIso + "T12:00:00"), m = d.getMonth() + 1, day = d.getDate(), st = addr.state || "", out = [];
  const between = (m1, d1, m2, d2) => (m > m1 || (m === m1 && day >= d1)) && (m < m2 || (m === m2 && day <= d2));
  if (between(1, 19, 1, 26)) out.push("Republic Day period: police in many cities, and the whole of Delhi, ban drones in the days before 26 January.");
  if (between(8, 1, 8, 16)) out.push("Independence Day period: drone bans are common, Delhi usually bans drones from early August to 16 August.");
  if (between(8, 10, 8, 16) && /delhi|uttar pradesh|haryana/i.test(st)) out.push("Kite-flying season around Independence Day: kite string (manja) can snag propellers. Avoid flying near rooftops with kites.");
  if (between(1, 10, 1, 17)) out.push(`Makar Sankranti / Uttarayan kite season${/gujarat|rajasthan|maharashtra|madhya pradesh|telangana|andhra/i.test(st) ? " (heavy in your state)" : ""}: the sky is full of kites and sharp string; birds are injured and flying low. Avoid flying, or keep well away from kites.`);
  if (between(12, 24, 12, 25)) out.push("Christmas: crowds at churches and markets; police may restrict drones near gatherings.");
  if (between(12, 31, 12, 31) || between(1, 1, 1, 1)) out.push("New Year's Eve / Day: large crowds and fireworks; many cities restrict drones.");
  return out;
}

/* ---------- 6. police intimation letter ---------- */
const FIELDS = [["pname", "Your name"], ["pphone", "Your phone"], ["rpc", "Remote Pilot Certificate number"], ["uin", "Drone UIN (Digital Sky)"], ["model", "Drone model"],
  ["purpose", "Purpose (e.g. wedding photography, survey)"], ["client", "Client / organiser (optional)"], ["date", "Date"], ["from", "From (time)"], ["to", "To (time)"], ["maxh", "Maximum height (m)"], ["site", "Exact site address"]];
function letterText(v, station, spot, zone) {
  const L = [
    `To,`, `The Station House Officer,`, `${station || "[Police station name]"}`, ``,
    `Subject: Intimation of drone operation on ${v.date || "[date]"} at ${v.site || spot.name}`, ``,
    `Sir / Madam,`, ``,
    `I, ${v.pname || "[name]"}, holder of DGCA Remote Pilot Certificate No. ${v.rpc || "[RPC no.]"}, wish to inform you that I will be operating a drone as per the details below, in accordance with the Drone Rules, 2021:`, ``,
    `1. Purpose: ${v.purpose || "[purpose]"}${v.client ? ` (for ${v.client})` : ""}`,
    `2. Location: ${v.site || spot.name} — coordinates ${spot.lat.toFixed(5)}, ${spot.lon.toFixed(5)} (https://maps.google.com/?q=${spot.lat.toFixed(5)},${spot.lon.toFixed(5)})`,
    `3. Date and time: ${v.date || "[date]"}, ${v.from || "[from]"} to ${v.to || "[to]"}`,
    `4. Drone: ${v.model || "[model]"}, UIN ${v.uin || "[UIN]"}`,
    `5. Maximum height: ${v.maxh || "[height]"} m above ground`,
    `6. Airspace: ${zone ? zone : "[green / yellow zone as per the Digital Sky airspace map]"}`, ``,
    `The drone will be flown within visual line of sight, away from crowds, government buildings and restricted areas, and will not be used to record anyone's private property without consent. I will stop the operation immediately if asked to by the police.`, ``,
    `Copies of my Remote Pilot Certificate, the drone's UIN certificate and the Digital Sky airspace map for the location are attached.`, ``,
    `Contact: ${v.pname || "[name]"}, ${v.pphone || "[phone]"}`, ``, `Thanking you,`, `${v.pname || "[name]"}`, `Date: ${new Date().toLocaleDateString("en-IN")}`];
  return L.join("\n");
}
function letterUI(el, spot, police, zoneLine) {
  const v = store.get("fc_letter", {}), station = police && police[0] ? police[0].name : "";
  el.innerHTML = `<details class="card"><summary>Police intimation letter (fill once, reuse)</summary>
   <p class="mute">Many police stations ask pilots to inform them in writing, often 24 hours before flying. Fill this once; your details stay on this device only.</p>
   <div class="grid2">${FIELDS.map(([k, l]) => `<label class="f">${esc(l)}<input data-k="${k}" value="${esc(v[k] || "")}" ${k === "date" ? 'type="date"' : k === "from" || k === "to" ? 'type="time"' : ""}></label>`).join("")}
    <label class="f">Addressed to<select id="lt-st">${(police || []).map(p => `<option>${esc(p.name)}</option>`).join("")}<option value="">Other (type in the letter)</option></select></label></div>
   <div class="row"><button id="lt-print" class="pri">Print / save as PDF</button><button id="lt-wa">Share on WhatsApp</button><button id="lt-copy">Copy text</button></div></details>`;
  const read = () => { const o = {}; el.querySelectorAll("[data-k]").forEach(i => o[i.dataset.k] = i.value.trim()); store.set("fc_letter", Object.assign(store.get("fc_letter", {}), o)); return o; };
  const txt = () => letterText(read(), el.querySelector("#lt-st").value, spot, zoneLine);
  el.querySelector("#lt-print").onclick = () => { const w = window.open("", "_blank"); if (!w) return alert("Allow pop-ups to print the letter.");
    w.document.write(`<!DOCTYPE html><title>Drone operation intimation</title><style>body{font:15px/1.6 Georgia,serif;max-width:700px;margin:40px auto;padding:0 20px;white-space:pre-wrap}</style>${esc(txt())}`); w.document.close(); w.focus(); w.print(); };
  el.querySelector("#lt-wa").onclick = () => window.open("https://wa.me/?text=" + encodeURIComponent(txt()), "_blank");
  el.querySelector("#lt-copy").onclick = async e => { try { await navigator.clipboard.writeText(txt()); e.target.textContent = "Copied"; } catch (x) { alert(txt()); } };
}

/* ---------- render the whole section ---------- */
async function render(el, spot, addr, opts) {
  const token = (el.__tok = (el.__tok || 0) + 1), live = () => el.__tok === token;
  const wait = '<p class="mute"><span class="spin"></span>Loading…</p>';
  el.innerHTML = `<div id="a-zone"></div><div class="card" id="a-news"><b>News: bans, VIP visits, air shows, crowds near here</b>${wait}</div><div id="a-cal"></div>
    <div class="card" id="a-police"><b>Nearest police stations</b>${wait}</div><div class="card" id="a-power"><b>Power lines</b>${wait}</div><div id="letter"></div>`;
  const q = id => el.querySelector("#" + id);
  // calendar and letter need nothing from the network
  const cal = calendar(opts.dateIso, addr);
  if (cal.length) q("a-cal").innerHTML = `<div class="card"><b>On your date</b><ul>${cal.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`;
  const zoneLine = "[zone as shown on the official Digital Sky airspace map: green / yellow (ATC permission no. ____) / red (permission no. ____)]";
  letterUI(q("letter"), spot, [], zoneLine);
  // zone card (airport list is a small local file)
  airports().then(ap => { if (!live()) return; const z = zoneFromAirports(ap, spot.lat, spot.lon, opts.htM), b = borderCheck(addr), ap0 = z.near[0];
    q("a-zone").innerHTML = `<div class="card zone" style="border-left-color:#3b6e8f"><b>Drone zone: check the official map</b>
    <p>The only correct answer for green, yellow or red is the government's Digital Sky airspace map, which also has red zones that no other source lists (military areas, government sites, temporary orders). FlyCheck does not guess it.</p>
    <div class="row"><a class="btn pri" href="https://digitalsky.aai.aero/" target="_blank" rel="noopener">Open Digital Sky (Airspace Map / Check Zone Intersection)</a></div>
    <p class="mute">Your spot: <b>${spot.lat.toFixed(5)}, ${spot.lon.toFixed(5)}</b> <button type="button" class="mini" id="cpll">Copy</button> — paste it into the map's search.${ap0 ? ` For reference only: the nearest airport is ${esc(ap0.name)}, ${ap0.km.toFixed(1)} km from its centre.` : ""}</p>
    <details class="dsk"><summary>Show the Digital Sky map here</summary>
      <p class="mute">This is the government's own site, shown inside FlyCheck. Open its Airspace Map, then paste your coordinates (Copy button above) into its search. If this box stays blank, Digital Sky doesn't allow being shown inside other sites: use the button above instead.</p>
      <div class="dskwrap"></div></details>
    ${b ? `<p><b>Border district.</b> ${esc(b.text)}</p>` : ""}</div>`;
    const dk = q("a-zone").querySelector("details.dsk");
    dk.addEventListener("toggle", () => { const w = dk.querySelector(".dskwrap"); if (dk.open && !w.firstChild)
      w.innerHTML = '<iframe src="https://digitalsky.aai.aero/" title="Digital Sky (DGCA / AAI) official site" loading="lazy" allow="geolocation; clipboard-read; clipboard-write" referrerpolicy="strict-origin-when-cross-origin"></iframe>'; });
    const cp = q("cpll"); cp.onclick = async () => { try { await navigator.clipboard.writeText(`${spot.lat.toFixed(5)}, ${spot.lon.toFixed(5)}`); cp.textContent = "Copied"; } catch (e) {} }; });
  // news
  events().then(ev => { if (!live()) return; const hits = matchEvents(ev, addr);
    let h = `<b>News: bans, VIP visits, air shows, crowds near here</b>`;
    if (hits.length) h += `<ul>${hits.map(x => `<li><span class="tag ${x.type}">${esc(TYPE[x.type])}</span> <a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.title)}</a> <span class="mute">· ${esc(x.source)}${x.published_utc ? " · " + new Date(x.published_utc.replace("Z", ":00Z")).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : ""} · matched “${esc(x.where)}”${x.strength === 1 ? " (state level)" : ""}</span></li>`).join("")}</ul><p class="mute">Open the article for the exact area, dates and times of any order.</p>`;
    else h += `<p>${ev.failed ? "The news scan couldn't be loaded right now." : !Object.keys(addr).length ? "Couldn't work out the town or district for this spot, so news can't be matched." : "Nothing found for this area in the last 3 days of news."}</p>`;
    h += `<p class="mute">Scanned from public news${ev.generated_utc ? ", last at " + new Date(ev.generated_utc.replace("Z", ":00Z")).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) + " IST" : ""}. Police often announce bans only a day or two ahead, and some only on the day: ask the local police station when you inform them.</p>`;
    q("a-news").innerHTML = h; });
  // police and power lines (OpenStreetMap; can be slow)
  osmAround(spot.lat, spot.lon).then(osm => { if (!live()) return;
    const retry = '<p>The map service is busy right now. <button type="button" class="mini a-retry">Try again</button></p>';
    if (!osm) { q("a-police").innerHTML = "<b>Nearest police stations</b>" + retry; q("a-power").innerHTML = "<b>Power lines</b>" + retry;
      el.querySelectorAll(".a-retry").forEach(b => b.onclick = () => render(el, spot, addr, opts)); return; }
    let p = `<b>Nearest police stations</b>`;
    p += osm.police.length ? `<ul>${osm.police.map(p => `<li><b>${esc(p.name)}</b> · ${p.km.toFixed(1)} km${p.phone ? ` · <a href="tel:${esc(p.phone.split(/[;,]/)[0])}">${esc(p.phone.split(/[;,]/)[0])}</a>` : " · phone not mapped"}${p.addr ? ` · ${esc(p.addr)}` : ""} · <a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}" target="_blank" rel="noopener">directions</a></li>`).join("")}</ul>` : "<p>No police station is mapped within 20 km.</p>";
    p += `<p class="mute">From OpenStreetMap. The station that covers your spot (its “jurisdiction”) can be a different one: confirm by phone. Emergency: 112.</p>`;
    q("a-police").innerHTML = p;
    const l = osm.line, near = l && l.m < 150, mid = l && l.m < 400;
    const pw = q("a-power"); pw.style.borderLeftColor = near ? "#d64545" : mid ? "#d99300" : "#1f9d55";
    pw.innerHTML = `<b>Power lines</b><p>${l ? `${l.hv ? "High-voltage line" : "Power line"} about ${Math.round(l.m)} m from your spot${l.volt ? ` (${esc(String(l.volt).split(";").map(v => +v >= 1000 ? Math.round(+v / 1000) + " kV" : v + " V").join(", "))})` : ""}.` : "No power line mapped within 600 m."}${near ? " Too close: wires are hard to see on camera, and strong lines can upset the drone's compass. Take off at least 150 m away." : mid ? " Keep clear of it while flying and don't calibrate the compass near it." : ""}${osm.towers ? ` ${osm.towers} towers/poles mapped within 300 m.` : ""}</p><p class="mute">Only lines that volunteers have mapped are shown; many local lines are missing. Always look before take-off.</p>`;
    letterUI(q("letter"), spot, osm.police, zoneLine); });
}

const API = { zoneFromAirports, borderCheck, matchEvents, calendar, letterText, render, placeTokens };
if (typeof module !== "undefined" && module.exports) module.exports = API; else root.Around = API;
})(typeof window !== "undefined" ? window : globalThis);
