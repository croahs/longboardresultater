"""Mark start and finish of the hills on a map, in the browser, and draw the track at once.

  python3 markhills.py          serves http://localhost:8765 and opens it
  python3 markhills.py --no-open   just serve
  python3 markhills.py --port 8766 another port

Pick a hill in the list, click «Start» and then the road, click «Mål» and then the road, add «Via»
points along the race road where OSRM would otherwise pick a faster road, and save: data/hills.json gets the two points, tracks.py runs for that hill, and the road is drawn
coloured by steepness so you see straight away whether start and finish landed on the right
road. Markers can be dragged and saved again. A dev tool only: the site itself never runs this.

Map tiles from Kartverket (open, no key), Leaflet from a CDN, place search from OpenStreetMap's
Nominatim. Nothing else leaves the machine.
"""
import json
import os
import subprocess
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
HILLS = os.path.join(HERE, "data", "hills.json")
TRACKS = os.path.join(HERE, "data", "tracks")
PORT = 8765

PAGE = r"""<!doctype html>
<html lang="nb"><head><meta charset="utf-8"><title>Marker bakker</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  body { margin: 0; font: 14px/1.4 system-ui, sans-serif; display: grid; grid-template-columns: 300px 1fr; height: 100vh; color: #16172c; }
  aside { padding: 14px; overflow: auto; border-right: 1px solid #ddd; background: #f6f7fb; display: flex; flex-direction: column; gap: 10px; }
  #map { height: 100vh; }
  h1 { font-size: 16px; margin: 0; }
  ul { list-style: none; margin: 0; padding: 0; }
  li button { all: unset; display: flex; justify-content: space-between; width: 100%; padding: 6px 8px; border-radius: 6px; cursor: pointer; box-sizing: border-box; }
  li button:hover { background: #e6e8f2; } li button[aria-pressed=true] { background: #3d4ed8; color: #fff; }
  .ok { color: #178467; font-weight: 600; } li button[aria-pressed=true] .ok { color: #c9f5e6; }
  .mode { display: flex; gap: 6px; } .mode button, .act { padding: 8px 10px; border-radius: 6px; border: 1px solid #ccd; background: #fff; cursor: pointer; font: inherit; }
  .mode button[aria-pressed=true] { background: #16172c; color: #fff; border-color: #16172c; }
  .act.primary { background: #3d4ed8; color: #fff; border-color: #3d4ed8; }
  .act:disabled { opacity: .5; cursor: default; }
  .coords { font-variant-numeric: tabular-nums; font-size: 12.5px; color: #474a68; }
  .note { font-size: 12.5px; color: #5d6083; margin: 0; } .err { color: #cf3a56; }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 10px; font-size: 12px; } .legend i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; vertical-align: -2px; margin-right: 4px; }
  input[type=search] { width: 100%; padding: 7px 9px; border: 1px solid #ccd; border-radius: 6px; font: inherit; box-sizing: border-box; }
  .hits button { all: unset; display: block; padding: 4px 6px; cursor: pointer; font-size: 12.5px; } .hits button:hover { background: #e6e8f2; }
  .facts { font-size: 12.5px; color: #474a68; }
  .pin { width: 16px; height: 16px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 0 2px #16172c; }
</style></head><body>
<aside>
  <h1>Marker start og mål</h1>
  <p class="note">Velg bakke. Trykk <b>Start</b>, så på veien der starten er. Trykk <b>Mål</b>, så på veien ved mål. Følger ikke veien racet, trykk <b>Via</b> og klikk punkter langs riktig vei (i rekkefølge). Lagre, så tegnes veien med stigning. Punktene kan dras; høyreklikk et via-punkt for å fjerne det.</p>
  <input type="search" id="q" placeholder="Søk sted (Nominatim) …" autocomplete="off"><div class="hits" id="hits"></div>
  <ul id="hills"></ul>
  <div id="sel" hidden>
    <b id="name"></b> <span class="note" id="place"></span>
    <div class="mode"><button type="button" id="mStart" aria-pressed="false">Start</button><button type="button" id="mVia" aria-pressed="false">Via</button><button type="button" id="mFinish" aria-pressed="false">Mål</button></div>
    <div class="coords" id="coords"></div>
    <div class="mode"><button type="button" class="act primary" id="save" disabled>Lagre og tegn vei</button><button type="button" class="act" id="clear">Fjern punktene</button></div>
    <p class="note" id="status"></p>
    <div class="facts" id="facts"></div>
    <div class="legend"><span><i style="background:#d7263d"></i>9 % +</span><span><i style="background:#f08c1e"></i>7–9 %</span><span><i style="background:#e8c21a"></i>5–7 %</span><span><i style="background:#2aa84a"></i>0–5 %</span><span><i style="background:#2f6fe4"></i>oppover</span></div>
  </div>
</aside>
<div id="map"></div>
<script>
const map = L.map("map").setView([64.5, 11], 5);
L.tileLayer("https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png", { maxZoom: 18, attribution: "© Kartverket" }).addTo(map);
const colour = (g) => { const d = -g; return d < 0 ? "#2f6fe4" : d >= 9 ? "#d7263d" : d >= 7 ? "#f08c1e" : d >= 5 ? "#e8c21a" : "#2aa84a"; };
let hills = [], cur = null, mode = null, marks = { start: null, finish: null }, vias = [], trackLayer = L.layerGroup().addTo(map);
const $ = (id) => document.getElementById(id);
const pin = (kind) => L.divIcon({ className: "", html: `<div class="pin" style="background:${kind === "start" ? "#178467" : kind === "via" ? "#3d4ed8" : "#cf3a56"}"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });
function addVia(latlng) {
  const m = L.marker(latlng, { draggable: true, icon: pin("via"), title: "Via" }).addTo(map);
  m.on("dragend", render); m.on("contextmenu", () => { map.removeLayer(m); vias = vias.filter((x) => x !== m); render(); });
  vias.push(m); render();
}
const clearVias = () => { for (const m of vias) map.removeLayer(m); vias = []; };

async function load() {
  hills = (await (await fetch("/hills")).json()).hills;
  $("hills").innerHTML = hills.map((h) => `<li><button type="button" data-id="${h.id}" aria-pressed="${cur && cur.id === h.id}"><span>${h.name}</span><span class="${h.start && h.finish ? "ok" : "note"}">${h.start && h.finish ? "✓" : "–"}</span></button></li>`).join("");
  for (const b of $("hills").querySelectorAll("button")) b.onclick = () => select(b.dataset.id);
}
function setMarker(kind, latlng) {
  if (marks[kind]) marks[kind].setLatLng(latlng);
  else { marks[kind] = L.marker(latlng, { draggable: true, icon: pin(kind), title: kind === "start" ? "Start" : "Mål" }).addTo(map); marks[kind].on("dragend", render); }
  render();
}
function render() {
  const s = marks.start && marks.start.getLatLng(), f = marks.finish && marks.finish.getLatLng();
  const fmt = (p) => p ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : "ikke satt";
  $("coords").innerHTML = `<div><b style="color:#178467">Start</b> ${fmt(s)}</div><div><b style="color:#3d4ed8">Via</b> ${vias.length} punkt</div><div><b style="color:#cf3a56">Mål</b> ${fmt(f)}</div>`;
  $("save").disabled = !(s && f);
  $("mStart").setAttribute("aria-pressed", mode === "start"); $("mVia").setAttribute("aria-pressed", mode === "via"); $("mFinish").setAttribute("aria-pressed", mode === "finish");
}
async function select(id) {
  cur = hills.find((h) => h.id === id); mode = null;
  for (const k of ["start", "finish"]) { if (marks[k]) map.removeLayer(marks[k]); marks[k] = null; }
  clearVias(); trackLayer.clearLayers(); $("facts").textContent = ""; $("status").textContent = "";
  $("sel").hidden = false; $("name").textContent = cur.name; $("place").textContent = cur.place === "unknown" ? "(sted ukjent: søk det opp)" : cur.place;
  for (const b of $("hills").querySelectorAll("button")) b.setAttribute("aria-pressed", b.dataset.id === id);
  if (cur.start) setMarker("start", cur.start); if (cur.finish) setMarker("finish", cur.finish);
  for (const v of cur.via || []) addVia(v);
  render();
  const t = await fetch(`/tracks/${id}`); if (t.ok) draw(await t.json());
  else if (cur.start && cur.finish) map.fitBounds([cur.start, cur.finish], { padding: [40, 40] });
  else if (cur.center) map.setView(cur.center, 13);
}
function draw(track) {
  trackLayer.clearLayers();
  const pts = track.pts; let run = [[pts[0][0], pts[0][1]]], c = colour(pts[0][3]);
  const flush = () => { if (run.length > 1) L.polyline(run, { color: c, weight: 6, opacity: .95 }).addTo(trackLayer); };
  for (let i = 1; i < pts.length; i++) { const ci = colour(pts[i - 1][3]); if (ci !== c) { run.push([pts[i][0], pts[i][1]]); flush(); run = [[pts[i][0], pts[i][1]]]; c = ci; } else run.push([pts[i][0], pts[i][1]]); }
  flush();
  map.fitBounds(L.latLngBounds(pts.map((p) => [p[0], p[1]])), { padding: [40, 40] });
  $("facts").textContent = `${(track.length_m / 1000).toFixed(2)} km, ${Math.round(track.drop_m)} høydemeter, snitt ${(-track.avg_grade).toFixed(1)} %, brattest ${(-track.max_grade).toFixed(1)} %.`;
}
map.on("click", (e) => {
  if (!cur || !mode) return;
  if (mode === "via") { addVia(e.latlng); return; } // stays in via mode: click along the road
  setMarker(mode, e.latlng); mode = mode === "start" ? "finish" : null; render();
});
$("mStart").onclick = () => { mode = mode === "start" ? null : "start"; render(); };
$("mVia").onclick = () => { mode = mode === "via" ? null : "via"; render(); };
$("mFinish").onclick = () => { mode = mode === "finish" ? null : "finish"; render(); };
$("clear").onclick = () => { for (const k of ["start", "finish"]) { if (marks[k]) map.removeLayer(marks[k]); marks[k] = null; } clearVias(); trackLayer.clearLayers(); render(); };
$("save").onclick = async () => {
  const s = marks.start.getLatLng(), f = marks.finish.getLatLng();
  $("save").disabled = true; $("status").textContent = "Lagrer og henter vei og høyder …"; $("status").className = "note";
  const r = await fetch("/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: cur.id, start: [+s.lat.toFixed(6), +s.lng.toFixed(6)], finish: [+f.lat.toFixed(6), +f.lng.toFixed(6)],
      via: vias.map((m) => m.getLatLng()).map((p) => [+p.lat.toFixed(6), +p.lng.toFixed(6)]) }) });
  const out = await r.json();
  if (out.track) { draw(out.track); $("status").textContent = "Lagret i data/hills.json og data/tracks/. Commit begge."; }
  else { $("status").textContent = "Lagret i data/hills.json, men tracks.py feilet:\n" + (out.error || ""); $("status").className = "note err"; }
  await load(); $("save").disabled = false;
};
let timer;
$("q").oninput = () => { clearTimeout(timer); timer = setTimeout(async () => {
  const q = $("q").value.trim(); if (q.length < 3) { $("hits").innerHTML = ""; return; }
  const res = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=no&q=${encodeURIComponent(q)}`)).json();
  $("hits").innerHTML = res.map((h) => `<button type="button" data-lat="${h.lat}" data-lon="${h.lon}">${h.display_name}</button>`).join("");
  for (const b of $("hits").querySelectorAll("button")) b.onclick = () => { map.setView([+b.dataset.lat, +b.dataset.lon], 14); $("hits").innerHTML = ""; };
}, 400); };
load();
</script></body></html>
"""


def read_hills():
    with open(HILLS, encoding="utf-8") as f:
        return json.load(f)


def write_hills(obj):
    """Keep the file's hand-friendly layout: one hill per line."""
    with open(HILLS, "w", encoding="utf-8", newline="\n") as f:
        f.write('{"_help": ' + json.dumps(obj["_help"], ensure_ascii=False) + ',\n "hills": [\n')
        f.write(",\n".join("  " + json.dumps(h, ensure_ascii=False) for h in obj["hills"]))
        f.write("\n ]}\n")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send(self, code, body, ctype="application/json; charset=utf-8"):
        data = body if isinstance(body, bytes) else body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/":
            return self.send(200, PAGE, "text/html; charset=utf-8")
        if self.path == "/hills":
            return self.send(200, json.dumps(read_hills(), ensure_ascii=False))
        if self.path.startswith("/tracks/"):
            hid = self.path[8:]
            path = os.path.join(TRACKS, f"{hid}.json")
            if hid.replace("-", "").isalnum() and os.path.exists(path):
                with open(path, encoding="utf-8") as f:
                    return self.send(200, f.read())
            return self.send(404, "{}")
        self.send(404, "{}")

    def do_POST(self):
        if self.path != "/save":
            return self.send(404, "{}")
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
        obj = read_hills()
        hill = next((h for h in obj["hills"] if h["id"] == body["id"]), None)
        if not hill:
            return self.send(404, json.dumps({"error": "unknown hill"}))
        hill["start"], hill["finish"] = body["start"], body["finish"]
        if body.get("via"):
            hill["via"] = body["via"]
        else:
            hill.pop("via", None)
        write_hills(obj)
        run = subprocess.run([sys.executable, "-X", "utf8", os.path.join(HERE, "tracks.py"), hill["id"]],
                             capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=HERE)
        path = os.path.join(TRACKS, f"{hill['id']}.json")
        if run.returncode == 0 and os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                return self.send(200, json.dumps({"track": json.load(f), "log": run.stdout}))
        self.send(200, json.dumps({"error": (run.stdout + run.stderr).strip()[-1500:]}))


if __name__ == "__main__":
    port = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else PORT
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    url = f"http://localhost:{port}/"
    print(f"Marker bakker: {url}  (Ctrl+C stopper)")
    if "--no-open" not in sys.argv:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
