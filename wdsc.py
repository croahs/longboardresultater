"""Fetch the race results on worlddownhillskateboardingchampionship.com (WDSC, the World Downhill
Skateboarding Championship, 2019–) and write one JSON file per event, in the shape ndsf.py writes.

The site has one standings page per season (2019, 2022–2025) and per 2026 round, linked from its
"Riders & Standings" menu. Each is HTML tables under headings: the season standings first (points, not
placings, so skipped), then per event the result list of every class, with the series it counts for
(Championship Tour, CT, or Qualifying Series, QS) and sometimes the qualifying times. The 2022 and 2023
season tables also give every rider's place per race, and list more riders than the top-10 tables below
them. 2019 has nothing but season points. A date is read from the heading when it carries one; the other
events get the first of January, marked unknown.

  python3 wdsc.py            read the cache, write data/wdsc/<event>.json
  python3 wdsc.py fetch      also fetch the pages again
  python3 wdsc.py refetch    the same, from an empty cache

Everything fetched is cached under cache/wdsc/ and committed.
"""
import html
import os
import re
import shutil
import sys

from ndsf import add_race, clean_name, fold, get, kind_of, race_name, secs, slug, write

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache", "wdsc")
OUT = os.path.join(HERE, "data", "wdsc")
SITE = "https://worlddownhillskateboardingchampionship.com"
PAGES = [f"{SITE}/{p}/" for p in ("standings-2019", "standings-2022", "standings-2023", "standings-2024", "standings-2025",
                                  "el-salvador", "erzincan-standings-2026", "isle-of-man-standings-2026")]
MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split()
DATE_RE = r"(?P<mon>[a-z]{3})[a-z]*\.?\s+(?P<day>\d{1,2})(?:\s*-\s*\d{1,2})?,?\s+(?P<year>20\d\d)"


def page(url, fetch=False):
    path = os.path.join(CACHE, re.sub(r"[^A-Za-z0-9]+", "_", url.split("//", 1)[-1]).strip("_") + ".html")
    try:
        with open(path, encoding="utf-8") as f:
            cached = f.read()
    except OSError:
        cached = None
    if cached is not None and not fetch:
        return cached
    try:
        text = get(url)
    except Exception as e:
        print(f"  {url}: {e}", file=sys.stderr)
        text = ""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    return text


def pages(fetch=False):
    """The standings pages: every link in the menu that says so, plus the ones we know."""
    h = page(SITE + "/", fetch)
    found = [html.unescape(u) for u, t in re.findall(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', h, re.S)
             if "standings" in fold(re.sub(r"<[^>]+>", " ", t)) and u.startswith(SITE)]
    return list(dict.fromkeys(PAGES + found))


def blocks(h):
    """Headings and tables in page order: ("h", text) or ("t", rows)."""
    out = []
    for m in re.finditer(r"<h([1-6])[^>]*>(.*?)</h\1>|<table.*?</table>", h, re.S | re.I):
        if m.group(0).lower().startswith("<table"):
            rows = [[re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", c))).strip()
                     for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S | re.I)]
                    for row in re.findall(r"<tr.*?</tr>", m.group(0), re.S | re.I)]
            out.append(("t", rows))
        else:
            text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", m.group(2)))).strip()
            if text:
                out.append(("h", text))
    return out


def rider(name):
    """'Clarke, Harry' -> 'Harry Clarke'; nicknames in brackets go."""
    if "," in name:
        last, first = name.split(",", 1)
        name = f"{first} {last}"
    return clean_name(name)


def new_event(events, place, year, date_text, url):
    place = re.sub(r"\brace\s+(\d)\b", r"\1", place, flags=re.I).strip(" -–")
    eid = f"{year}-{slug(place)}"
    m = re.search(DATE_RE, fold(date_text or ""))
    date, known = (f"{year}-{MONTHS.index(m.group('mon')) + 1:02}-{int(m.group('day')):02}", True) \
        if m and m.group("mon") in MONTHS and int(m.group("year")) == year else (f"{year}-01-01", False)
    ev = events.setdefault(eid, {"id": eid, "name": f"WDSC {place}", "year": year, "date": date, "date_known": known, "hill": None,
                                 "place": place, "sources": [], "titles": [], "notes": [], "races": []})
    if known and not ev["date_known"]:
        ev["date"], ev["date_known"] = date, known
    if url not in ev["sources"]:
        ev["sources"].append(url)
    return ev


def class_of(label, timed):
    """(kind, race name) for a class heading: 'CT Open Skateboard', "Women's Street Luge", 'Luge Times'."""
    f = fold(label)
    if "luge" in f:
        kind = "Luge"
    elif "inline" in f:
        kind = "Inline"
    else:
        kind = kind_of(label) or "Open"
    name = race_name(kind, timed=timed)
    if kind in ("Luge", "Inline") and "women" in f:
        name += " Damer"
    return kind, name


def result_rows(rows):
    """A result table -> (rows [(place, name, time, note, nat)], timed). The header row names the columns;
    the place is the first cell when the header leaves it unnamed. A row whose points exceed an event's
    maximum (100) is a season total pasted in by mistake and is dropped."""
    hi = next((i for i, r in enumerate(rows) if "name" in [fold(c) for c in r]), None)
    if hi is None:
        return [], False
    head = [fold(c) for c in rows[hi]]
    col = lambda *keys: next((i for i, c in enumerate(head) if c in keys), None)
    name_col, nat_col = col("name"), col("country", "nat", "nationality")
    pos_col = col("pos", "position", "rank")
    if pos_col is None:
        pos_col = 0
    time_col, pts_col = col("time", "best"), col("points", "pts", "points earned", "total")
    out = []
    for r in rows[hi + 1:]:
        cell = lambda i: r[i].strip() if i is not None and i < len(r) else ""
        name = rider(cell(name_col))
        if not name:
            continue
        pts = cell(pts_col)
        if pts.isdigit() and int(pts) > 100:
            continue
        place = int(cell(pos_col)) if cell(pos_col).isdigit() else None
        t = secs(cell(time_col)) if time_col is not None else None
        out.append((place, name, t, "", cell(nat_col)))
    timed = any(t for _, _, t, _, _ in out) and sum(1 for x in out if x[2]) >= 0.7 * len(out)
    if timed:
        ranked = sorted([x for x in out if x[2]], key=lambda x: x[2])
        out = [(i + 1, n, t, note, nat) for i, (_, n, t, note, nat) in enumerate(ranked)] + \
            [(None, n, None, "DNF", nat) for _, n, t, note, nat in out if not t]
    else:
        out = [(p, n, None, "" if p else "DNF", nat) for p, n, t, note, nat in out]
    return out, timed


def season_places(rows):
    """A 2022/2023 season table (POS Name NAT, then POS and PTS per race) -> {race: [(place, name, None, "", nat)]}."""
    if len(rows) < 3 or [fold(c) for c in rows[0][:3]] != ["pos", "name", "nat"]:
        return {}
    races = [c.strip() for c in rows[0][3:] if c.strip() and not re.match(r"total", fold(c))]
    out = {r: [] for r in races}
    for r in rows[2:]:
        name = rider(r[1]) if len(r) > 2 else ""
        if not name:
            continue
        for i, race in enumerate(races):
            j = 3 + 2 * i
            if j < len(r) and r[j].strip().isdigit():
                out[race].append((int(r[j]), name, None, "", r[2].strip()))
    return {r: sorted(v) for r, v in out.items() if len(v) >= 2}


def parse_page(url, h, events):
    year_hint = int(m.group(1)) if (m := re.search(r"(20\d\d)", url)) else None
    event, series, cls, event_timed, rank_cls = None, "", "", False, None
    for kind, body in blocks(h):
        if kind == "h":
            f = fold(body)
            m = re.match(rf"^wdsc\s*[-–]*\s*(?P<place>.+?)\s+(?P<date>{DATE_RE}|20\d\d)(?:\s+standings)?$", f)
            if m and not re.search(r"championship|rankings|season", m.group("place")):
                year = int(re.search(r"20\d\d", m.group("date")).group(0))
                event = new_event(events, _place(body), year, body, url)
                series, event_timed, rank_cls = "", False, None
                continue
            m = re.match(r"^world rankings (20\d\d): (.+)$", f)
            if m:
                event, rank_cls = None, (int(m.group(1)), m.group(2))
                continue
            if re.match(r"^day \d qualifying", f):
                event_timed = True
                continue
            if f.endswith(("championship tour", "qualifying series")):
                series = "CT" if f.endswith("championship tour") else "QS"
                continue
            m = re.match(r"^(?P<place>.+?) (?P<what>race|qualifying) results$", f)
            if m and year_hint:
                event, series, event_timed, rank_cls = new_event(events, _place(body), year_hint, "", url), "", m.group("what") == "qualifying", None
                continue
            m = re.match(r"^(?P<place>[a-z ]+?) race (?P<n>\d)$", f)
            if m and year_hint:
                event, series, event_timed, rank_cls = new_event(events, f"{m.group('place').title()} {m.group('n')}", year_hint, "", url), "", False, None
                continue
            if re.match(r"^[a-z ]+ race \d results$", f):
                event_timed = False
                continue
            m = re.match(r"^(?P<qs>qs\b[\s-]*)?(?P<place>.+?)\s+(?P<year>20\d\d)$", f)  # fold() drops the dash in "QS – Wales"
            if m and not re.search(r"wdsc|standings|championship|rankings", m.group("place")):
                event, series, event_timed, rank_cls = new_event(events, _place(body), int(m.group("year")), "", url), "QS" if m.group("qs") else "", False, None
                continue
            if re.search(r"standings|rankings|championship|wdsc", f):
                event, rank_cls = None, None
                continue
            cls = body
            m = re.match(r"^(ct|qs)\b", f)
            if m:
                series = m.group(1).upper()
            continue
        if rank_cls:
            year, label = rank_cls
            for race, results in season_places(body).items():
                ev = new_event(events, race, year, "", url)
                k, name = class_of(label, False)
                add_race(ev, name, k, "bracket", f"{url} / season table / {race} / {label}", results)
            continue
        if event is None or not cls:
            continue
        results, timed = result_rows(body)
        timed = timed or event_timed or bool(re.search(r"\btimes?\b|qualif", fold(cls)))
        if timed and not any(t for _, _, t, _, _ in results):
            continue  # a qualifying list without times is nothing to rank
        if not results:
            continue
        k, name = class_of(cls, timed)
        if series and not timed:
            name += f" {series}"
        add_race(event, name, k, "timed" if timed else "bracket", f"{url} / {series} {cls}".replace("/  ", "/ "), results)


def _place(heading):
    """The place in an event heading: 'WDSC – El Salvador 2025 Standings' -> 'El Salvador', 'QS – Wales 2024' ->
    'Wales', 'Kozakov Race Results' -> 'Kozakov', 'WDSC Utah Sep 25-28 2025' -> 'Utah'."""
    t = re.sub(r"^(wdsc|qs|ct)\s*[-–]*\s*", "", heading, flags=re.I)
    t = re.sub(rf"\s+{DATE_RE}.*$", "", t, flags=re.I)
    t = re.sub(r"\s+20\d\d\b.*$|\s+(race|qualifying)\s+results$|\s+standings$", "", t, flags=re.I)
    return t.strip(" -–")


def drop_qs_copies(ev):
    """A QS list that is the CT list of its class cut down to the QS riders, in the same order, is the same
    race scored twice, not a race of its own: drop it. Names compare as word sets ('Vogel Paul' = 'Paul Vogel')."""
    key = lambda n: frozenset(fold(n).split())
    for qs in [r for r in ev["races"] if r["name"].endswith(" QS")]:
        base = qs["name"][:-3]
        ct = next((r for r in ev["races"] if r["name"] in (f"{base} CT", base) and r["format"] == qs["format"]), None)
        if not ct:
            continue
        order = {key(x["name"]): i for i, x in enumerate(ct["results"])}
        at = [order.get(key(x["name"])) for x in qs["results"]]
        if None not in at and at == sorted(at):
            ev["races"].remove(qs)
            ev["notes"].append(f"{qs['name']} dropped: the {ct['name']} list cut down to the QS riders")


def build(fetch=False):
    events = {}
    for url in pages(fetch):
        parse_page(url, page(url, fetch), events)
    for ev in events.values():
        drop_qs_copies(ev)
        ev["needs_manual"] = not ev["races"]
    return events


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "refetch":
        shutil.rmtree(CACHE, ignore_errors=True)
    write(build(fetch=cmd in ("fetch", "refetch")), OUT)
