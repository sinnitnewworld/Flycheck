const A = require("../around.js"), assert = require("assert"), fs = require("fs");
const ap = JSON.parse(fs.readFileSync(__dirname + "/../airports.json"));
let n = 0; const t = (m, f) => { f(); n++; console.log("ok -", m); };
t("Bengaluru airport: red very close, yellow 5-8 km, green far", () => {
  assert.strictEqual(A.zoneFromAirports(ap, 13.1979, 77.7063, 50).near[0].code, "VOBL");
  assert.strictEqual(A.zoneFromAirports(ap, 13.1979 + 0.085, 77.7063, 50).color, "yellow");        // ~9.4 km from centre -> 7.4 km from edge
  assert.strictEqual(A.zoneFromAirports(ap, 12.90, 77.50, 100).color, "green");                    // RR Nagar, >12 km from HAL edge
});
t("8-12 km band: green at 50 m, yellow at 100 m", () => {
  const la = 13.1979 + 0.12;   // ~13.3 km centre -> 11.3 km edge
  assert.strictEqual(A.zoneFromAirports(ap, la, 77.7063, 50).color, "green");
  assert.strictEqual(A.zoneFromAirports(ap, la, 77.7063, 100).color, "yellow");
});
t("border districts", () => {
  assert.strictEqual(A.borderCheck({ state: "Punjab", state_district: "Amritsar" }).gps, "high");
  assert.strictEqual(A.borderCheck({ state: "Karnataka", state_district: "Bengaluru Urban" }), null);
  assert(A.borderCheck({ state: "Manipur", state_district: "Chandel" }));
});
t("events matched by place name, not by substring", () => {
  const ev = { items: [
    { type: "ban", title: "Pune police declare temporary red zone for drones ahead of VP visit" },
    { type: "vip", title: "PM to visit Varanasi on Tuesday" },
    { type: "ban", title: "Drone ban across Maharashtra for festival" },
    { type: "crowd", title: "Punekar marathon traffic advisory" }] };
  const hits = A.matchEvents(ev, { city: "Pune", state_district: "Pune District", state: "Maharashtra" });
  assert.deepStrictEqual(hits.map(h => h.title), ["Pune police declare temporary red zone for drones ahead of VP visit", "Drone ban across Maharashtra for festival"]);
});
t("calendar: Republic Day and kite season", () => {
  assert(A.calendar("2027-01-14", { state: "Gujarat" }).some(x => /kite/i.test(x) && /your state/.test(x)));
  assert(A.calendar("2027-01-24", { state: "Delhi" }).some(x => /Republic Day/.test(x)));
  assert.strictEqual(A.calendar("2027-03-10", { state: "Delhi" }).length, 0);
});
t("letter contains the essentials", () => {
  const L = A.letterText({ pname: "Nitin", rpc: "RPC123", uin: "UA0001", date: "2026-12-01", from: "07:00", to: "08:00", maxh: "60", purpose: "Real-estate photography" }, "Rajarajeshwari Nagar Police Station", { name: "RR Nagar", lat: 12.92, lon: 77.51 }, "[zone]");
  ["Rajarajeshwari Nagar Police Station", "RPC123", "UA0001", "12.92000, 77.51000", "60 m", ].forEach(k => assert(L.includes(k), k));
});
t("news filter: only pilot-relevant VIP and air-show items", () => {
  const ev = { items: [
    { type: "vip", title: "Japanese lawmakers visit IISc in Bengaluru" },
    { type: "airshow", title: "Aero India 2027 expands exhibition space in Bengaluru" },
    { type: "vip", title: "Traffic diversions in Bengaluru for President's visit" },
    { type: "vip", title: "Karnataka: security tightened for PM visit to Mysuru" } ] };
  const m = A.matchEvents(ev, { city: "Bengaluru", state: "Karnataka" });
  assert(m.length === 1 && /Traffic/.test(m[0].title), JSON.stringify(m));
});
t("police: only real police stations in the main list", () => {
  const st = ["Rajarajeshwari Nagar Police Station", "Kengeri Police Station", "BSK 3rd stage Police Station", "J J R Nagar Police station", "ಗಿರಿನಗರ ಆರಕ್ಷಕ ಠಾಣೆ", "Andheri Police Thana"];
  const not = { "Vijayanagara Traffic Police Station": "traffic", "Women's Police Station": "women", "Police Quarters": "office", "Commissioner of Police Office": "office", "Majestic Police Outpost": "outpost", "CEN Police Station West": "special", "Hoysala": "other" };
  st.forEach(n => assert(A.policeKind(n) === "station", n));
  for (const [n, k] of Object.entries(not)) assert(A.policeKind(n) === k, n + " -> " + A.policeKind(n));
});
console.log(n + " tests passed");
