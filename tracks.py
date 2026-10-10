"""Turn the hand-marked start and finish of each hill into a track with elevation and grade.

data/hills.json is the hand-kept registry of hills; the owner marks start and
finish as [lat, lon], plus "via" points where the race road is not the fastest route
between them. For every hill with start and finish set this fetches the road through
those points, the terrain height along it, and writes data/tracks/<id>.json for the map.

  python3 tracks.py            build the hills that have no track file yet
  python3 tracks.py --force    build every hill that has start and finish
  python3 tracks.py voss       build (or rebuild) just these hill ids
  python3 tracks.py check      show which hills still need start/finish or a track

Road geometry comes from the public OSRM demo server (OpenStreetMap roads,
driving profile), heights from Kartverket's open height API (DTM1, no key
needed; koordsys 4258 is lon/lat on ETRS89). Both answers are cached under
cache/tracks/<id>-*.json together with the start and finish they were fetched
for, so a re-run only touches the network when a hill has moved.

The line is densified to points at most 10 m apart, the heights are smoothed
with a centred moving average over about 30 m (the 1 m DTM is noisy enough to
fake gradient spikes otherwise), and each point carries the grade of the segment
that starts there, in percent, negative when descending from start to finish.
Output shape (lat first in pts; the last point repeats the previous grade):

  {"id": "voss", "length_m": 2761, "drop_m": 312, "start_ele": 640, "finish_ele": 328,
   "max_grade": -14.2, "avg_grade": -11.3, "source": "OpenStreetMap via OSRM, elevation Kartverket (DTM1)",
   "pts": [[lat, lon, ele_m, grade_pct_of_segment_starting_here], ...]}

max_grade is the steepest downhill segment (most negative); avg_grade is the
total drop over the total length.
"""
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
HILLS = os.path.join(HERE, "data", "hills.json")
OUT = os.path.join(HERE, "data", "tracks")
CACHE = os.path.join(HERE, "cache", "tracks")
UA = {"User-Agent": "Mozilla/5.0 (longboardresultater; +https://github.com/croahs/longboardresultater)"}
OSRM = "https://router.project-osrm.org/route/v1/driving/"
HEIGHTS = "https://ws.geonorge.no/hoydedata/v1/punkt"
SOURCE = "OpenStreetMap via OSRM, elevation Kartverket (DTM1)"
STEP_M = 10          # max distance between consecutive points after densifying
SMOOTH_M = 30        # width of the moving average over the heights
HEIGHTS_PER_REQ = 50 # points per height request (the API accepts more; stay polite)


# ---------------------------------------------------------------- files

def _read_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except OSError:
        return None


def _write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n")


def hills():
    return _read_json(HILLS)["hills"]


def track_path(hill_id):
    return os.path.join(OUT, f"{hill_id}.json")


def get_json(url):
    """One GET with a browser-like agent and a short pause, so neither demo server minds."""
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        data = json.loads(r.read().decode("utf-8"))
    time.sleep(0.3)
    return data


def cached(hill, kind, fetch, **key):
    """cache/tracks/<id>-<kind>.json holds the answer and the start/finish (plus key) it was fetched for.

    fetch() is only called when there is no cache or the hill has moved."""
    path = os.path.join(CACHE, f"{hill['id']}-{kind}.json")
    key = {"start": hill["start"], "finish": hill["finish"], "via": hill.get("via") or [], **key}
    c = _read_json(path)
    if c and all(c.get(k) == v for k, v in key.items()):
        return c["data"]
    data = fetch()
    _write_json(path, {**key, "data": data})
    return data


# ---------------------------------------------------------------- geometry

def haversine(a, b):
    """Distance in metres between two (lat, lon) points."""
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def densify(line, step=STEP_M):
    """Resample the (lat, lon) line at even spacing of at most step metres (linear along each segment).

    Even spacing matters: OSRM has nodes centimetres apart in places, and a grade over such a
    segment would be noise."""
    seg = [haversine(a, b) for a, b in zip(line, line[1:])]
    total = sum(seg)
    if total == 0:
        return [line[0]]
    n = math.ceil(total / step)
    spacing = total / n
    out = []
    i, start = 0, 0.0  # current segment and the distance along the line where it starts
    for k in range(n):
        s = k * spacing
        while i < len(seg) - 1 and start + seg[i] <= s:
            start += seg[i]
            i += 1
        t = (s - start) / seg[i] if seg[i] else 0.0
        a, b = line[i], line[i + 1]
        out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    out.append(line[-1])
    return out


def fill_gaps(values):
    """Replace None entries with values interpolated linearly from the nearest known neighbours."""
    known = [i for i, v in enumerate(values) if v is not None]
    if not known:
        raise ValueError("no heights at all")
    out = list(values)
    for i, v in enumerate(values):
        if v is not None:
            continue
        left = max((k for k in known if k < i), default=None)
        right = min((k for k in known if k > i), default=None)
        if left is None:
            out[i] = values[right]
        elif right is None:
            out[i] = values[left]
        else:
            t = (i - left) / (right - left)
            out[i] = values[left] + (values[right] - values[left]) * t
    return out


def smooth(values, along, width=SMOOTH_M):
    """Centred moving average: each value becomes the mean of those within width/2 metres along the line."""
    half = width / 2
    out = []
    lo = 0
    for i, s in enumerate(along):
        while along[lo] < s - half:
            lo += 1
        hi = i
        while hi + 1 < len(along) and along[hi + 1] <= s + half:
            hi += 1
        window = values[lo:hi + 1]
        out.append(sum(window) / len(window))
    return out


# ---------------------------------------------------------------- fetching

def fetch_route(hill):
    """The road from start to finish, through the hill's via points when the race road is not the
    fastest way (OSRM picks that otherwise), as OSRM's answer."""
    points = [hill["start"], *(hill.get("via") or []), hill["finish"]]
    url = OSRM + ";".join(f"{lon},{lat}" for lat, lon in points) + "?" + urllib.parse.urlencode(
        {"overview": "full", "geometries": "geojson", "steps": "false"})
    return cached(hill, "route", lambda: get_json(url))


def fetch_heights(hill, points):
    """Terrain height for each (lat, lon) point, None where Kartverket has no value."""
    def fetch():
        zs = []
        for i in range(0, len(points), HEIGHTS_PER_REQ):
            chunk = [[round(lon, 7), round(lat, 7)] for lat, lon in points[i:i + HEIGHTS_PER_REQ]]
            q = urllib.parse.urlencode({"koordsys": 4258, "punkter": json.dumps(chunk, separators=(",", ":"))})
            answer = get_json(f"{HEIGHTS}?{q}")
            got = answer.get("punkter", [])
            if len(got) != len(chunk):
                raise RuntimeError(f"height API returned {len(got)} points for {len(chunk)} sent")
            zs.extend(p.get("z") for p in got)
        return zs
    return cached(hill, "heights", fetch, n=len(points))


# ---------------------------------------------------------------- building

def build(hill):
    """Fetch, compute and write the track for one hill. Returns the summary line, or None if skipped."""
    route = fetch_route(hill)
    if route.get("code") != "Ok":
        print(f"{hill['id']}: OSRM found no road ({route.get('code')}: {route.get('message', '')}); skipped")
        return None
    line = [(lat, lon) for lon, lat in route["routes"][0]["geometry"]["coordinates"]]
    pts = densify(line)
    if len(pts) < 2:
        print(f"{hill['id']}: start and finish are the same point; skipped")
        return None
    zs = fetch_heights(hill, pts)
    missing = sum(z is None for z in zs)
    if missing:
        print(f"{hill['id']}: {missing} of {len(zs)} points had no height, interpolated")
    along = [0.0]
    for a, b in zip(pts, pts[1:]):
        along.append(along[-1] + haversine(a, b))
    ele = smooth(fill_gaps(zs), along)
    grades = []
    for i in range(len(pts) - 1):
        d = along[i + 1] - along[i]
        grades.append((ele[i + 1] - ele[i]) / d * 100 if d else 0.0)
    grades.append(grades[-1])
    length = along[-1]
    track = {
        "id": hill["id"],
        "length_m": round(length),
        "drop_m": round(ele[0] - ele[-1]),
        "start_ele": round(ele[0]),
        "finish_ele": round(ele[-1]),
        "max_grade": round(min(grades), 1),
        "avg_grade": round((ele[-1] - ele[0]) / length * 100, 1),
        "source": SOURCE,
        "pts": [[round(lat, 6), round(lon, 6), round(e, 1), round(g, 1)]
                for (lat, lon), e, g in zip(pts, ele, grades)],
    }
    path = track_path(hill["id"])
    _write_json(path, track)
    summary = (f"{hill['id']}: {track['length_m']} m, drop {track['drop_m']} m, "
               f"avg {track['avg_grade']} %, max {track['max_grade']} % -> {os.path.relpath(path, HERE)}")
    print(summary)
    return summary


def check():
    for h in hills():
        marks = ("start" if h["start"] else "no start") + ", " + ("finish" if h["finish"] else "no finish")
        has = "track written" if os.path.exists(track_path(h["id"])) else "no track"
        print(f"{h['id']:16} {h['name']:22} {marks:22} {has}")


def main(args):
    if args == ["check"]:
        return check()
    force = "--force" in args
    ids = [a for a in args if a != "--force"]
    for h in hills():
        if ids and h["id"] not in ids:
            continue
        if not (h["start"] and h["finish"]):
            if ids:
                print(f"{h['id']}: start and finish not set in data/hills.json")
            continue
        if not (force or ids) and os.path.exists(track_path(h["id"])):
            continue
        build(h)
    for i in ids:
        if i not in {h["id"] for h in hills()}:
            print(f"{i}: no such hill in data/hills.json")


if __name__ == "__main__":
    main(sys.argv[1:])
