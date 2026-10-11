"""Fetch every result list the IGSA (International Gravity Sports Association, 1996–2017) kept on
igsaworldcup.com and write one JSON file per event, in the shape ndsf.py writes.

igsaworldcup.com is gone; the Wayback Machine has its result files under /results/<year>/. From 2009 there
is one PDF per event and list (…_qual.pdf for the qualifying, …_rslt.pdf or no suffix for the race), in
2008–2010 often one PDF per event, in 2005–2008 an Excel sheet exported as HTML (…_files/sheet001.htm). All
open with the same header (Event, Location, Date, Event Level) and then one section per class: "Downhill
Skateboard Qualifying" (Pos No Surname First Name Nat Run #1 Run #2 Best) and "Downhill Skateboard Results"
(Pos No Surname First Name Nat Best Points), continued across pages. A result list ranks everyone who
raced; the heats decide the order and Best is the qualifying time, so it is a bracket race without times.

  python3 igsa.py            read the cache, write data/igsa/<event>.json
  python3 igsa.py fetch      also ask the Wayback index and fetch the files not cached yet
  python3 igsa.py refetch    throw the cache away and fetch everything again

The index (cache/igsa/cdx.json) and the text of every file (cache/igsa/files/) are cached and committed.
pdftotext (poppler) is only needed to read a PDF the first time. The PDFs lose letters outside ASCII
(Håkon, Königshausen); for Norwegian riders that letter is written as ø, the most common one, and for
everyone else it is dropped, so a name may be a letter short.
"""
import html
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.parse

from ndsf import add_race, clean_name, event_of, fold, get, race_name, secs, slug, write

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache", "igsa")
OUT = os.path.join(HERE, "data", "igsa")
CDX = ("http://web.archive.org/cdx/search/cdx?url=igsaworldcup.com/results/*&output=json"
       "&fl=timestamp,original,mimetype&filter=statuscode:200&limit=5000")
WAYBACK = "http://web.archive.org/web/{ts}id_/{url}"
MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split()
# The class a section heading names; first match wins.
CLASSES = [(r"women|ladies|girl", "Women"), (r"junior", "Junior"), (r"master|veteran", "Masters"), (r"luge", "Luge"),
           (r"inline", "Inline"), (r"gravity bike|buttboard|king of the hill|slalom|team|open class", "Other"),
           (r"skateboard|downhill|stand ?up|street", "Open")]
HEADING_RE = re.compile(r"^(?P<label>[A-Za-z][A-Za-z0-9 ()/&'+-]{0,70}?)\s*(?P<what>qualifying|results?)\b(?P<rest>.*)$", re.I)
TIME_TOKEN = re.compile(r"^\d{1,2}[:.]\d{2}[.,:]\d{1,3}$|^\d{2}\.\d{3}$")
SHORT_TIME = re.compile(r"^\d{2}\.\d{2}$")  # 50.14: seconds, only trusted when the row has no fuller time
ROW_RE = re.compile(r"^\s*[=T]?(\d{1,3}|DQ|DSQ|DNF|DNS)\.?\s+(?:(\d{1,4}|-)\s+)?([A-Za-z(].+?)\s*$", re.I)
BRACKET_RE = re.compile(r"^(Round [A-Z]|QUAL\b|Pos\.? ?\d|Qual Finish)", re.I)
PARTICLE = re.compile(r"^(jr|sr|ii|iii|iv|de|da|do|dos|das|del|della|di|du|la|le|van|von|der|den|ten|ter|y|e)\.?$", re.I)
NOT_NAME_TOKEN = re.compile(r"^[\d.,$%-]+$|^(DNS|DNF|DQ|DSQ|NQT|N/A)$", re.I)


# ---------------------------------------------------------------- fetching and caching

def _read(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return None


def _write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def _key(url):
    """results/<year>/<file>, spelt one way: the site's odd separators (ˍ, broken UTF-8) and doubled slashes all
    pointed at the same files. None for what is not a result file (sheet indexes, tab strips)."""
    p = urllib.parse.unquote(url.split("/results/", 1)[-1]).split("?")[0]
    p = p.replace("\u02cd", "_").replace("\ufffd\ufffd", "_").replace("\ufffd", "_").replace("//", "/").lower()
    if not re.match(r"\d{4}/", p) or p.endswith((".xml", "tabstrip.htm", "filelist.xml")):
        return None
    return p


def index(fetch=False):
    """Every archived file under /results/, one capture each: [(timestamp, url, mimetype, key)]. The index
    lists the same file under several spellings and captures; a PDF capture wins over an HTML one (an error
    page archived with status 200), then the latest."""
    path = os.path.join(CACHE, "cdx.json")
    cached = _read(path)
    rows = json.loads(cached) if cached and not fetch else None
    if rows is None:
        rows = json.loads(get(CDX))[1:]
        _write(path, json.dumps(rows))
    best = {}
    for ts, url, mime in rows:
        key = _key(url)
        if key is None or (key.endswith(".htm") and "_files/" not in key):
            continue  # the frameset of an Excel export says nothing; its sheets do
        rank = (mime == "application/pdf", ts)
        if key not in best or rank > best[key][0]:
            best[key] = (rank, ts, url, mime)
    return sorted((ts, url, mime, key) for key, (_, ts, url, mime) in best.items())


def html_rows(page):
    """An Excel sheet exported as HTML: every table row as one line, the cells separated by spaces."""
    lines = []
    for row in re.findall(r"<tr.*?</tr>", page, re.S | re.I):
        cells = [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", c))).strip()
                 for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S | re.I)]
        line = " ".join(c for c in cells if c)
        if line:
            lines.append(line)
    return "\n".join(lines)


def text_of(ts, url, mime, key, fetch=False):
    """The file's text (pdftotext -raw for a PDF, one line per table row for an Excel sheet), cached in
    cache/igsa/files/<key>.txt. None when the capture is neither, or cannot be read."""
    path = os.path.join(CACHE, "files", key.replace("/", "_") + ".txt")
    cached = _read(path)
    if cached is not None:
        return cached or None  # the files never change: "fetch" only fills the gaps, "refetch" empties the cache
    if not fetch:
        return None
    data = None
    for attempt in range(4):
        try:
            data = get(WAYBACK.format(ts=ts, url=url), binary=True)
            break
        except Exception as e:  # the Wayback Machine refuses connections when asked too often: wait, try again
            print(f"  {key}: {e}", file=sys.stderr)
            time.sleep(10 * (attempt + 1))
    if data is None:
        return None
    text = ""
    if data[:4] == b"%PDF":
        if not shutil.which("pdftotext"):
            print(f"  pdftotext missing, skipping {key}", file=sys.stderr)
            return None
        pdf = path[:-4] + ".pdf"
        with open(pdf, "wb") as f:
            f.write(data)
        text = subprocess.run(["pdftotext", "-raw", "-enc", "UTF-8", pdf, "-"], capture_output=True, text=True,
                              encoding="utf-8", errors="replace").stdout
        os.remove(pdf)
    elif b"<table" in data[:100000].lower():
        m = re.search(rb"charset=([\w-]+)", data[:3000])
        try:
            page = data.decode(m.group(1).decode() if m else "cp1252")
        except (LookupError, UnicodeDecodeError):
            page = data.decode("cp1252", "replace")
        text = html_rows(page)
    _write(path, text)
    return text or None


# ---------------------------------------------------------------- parsing

def header(text):
    """Event, Location, Date and Event Level from the top of a file. The right-hand column (Promoter, Chief
    Steward, Starter, Track Conditions) lands on the same line and is cut off."""
    out = {}
    for key, stop in (("Event", "Promoter"), ("Location", "Chief Steward"), ("Date", "Starter"), ("Event Level", "Track Conditions")):
        m = re.search(rf"^{key}:\s*(.*?)\s*(?:{stop}:.*)?$", text, re.M)
        out[key] = m.group(1).strip() if m else ""
    if not out["Event"] or out["Event"].endswith(":"):
        # A file without the labels (2009 Downhill vs Miniramp): the values alone, in the same order, the
        # right-hand column's value tacked on to each.
        lines = text.splitlines()[1:5] + [""] * 4
        out = dict(zip(("Event", "Location", "Date", "Event Level"), (l.strip() for l in lines)))
    return out


def parse_date(s, year):
    """'July 23, 2011', 'Dec 8-10, 2011', '10/1/2011', '6/29-30/2012', '6-30-05', '31-Aug-08' -> (date, known).
    American month/day order. The year must be the file's; else the first of January, marked unknown."""
    s = s.replace("–", "-")
    m = re.search(r"\b(\d{1,2})[/.-](\d{1,2})(?:-\d{1,2})?[/.-](\d{2,4})\b", s)
    if m:
        mo, d, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        y = y + 2000 if y < 100 else y
        if mo > 12 >= d:
            mo, d = d, mo
        if y == year and 1 <= mo <= 12 and 1 <= d <= 31:
            return f"{y}-{mo:02}-{d:02}", True
    m = re.search(r"\b(\d{1,2})-([A-Za-z]{3})[a-z]*-(\d{2,4})\b", s)
    if m and m.group(2).lower() in MONTHS:
        d, mo, y = int(m.group(1)), MONTHS.index(m.group(2).lower()) + 1, int(m.group(3))
        y = y + 2000 if y < 100 else y
        if y == year and 1 <= d <= 31:
            return f"{y}-{mo:02}-{d:02}", True
    m = re.search(r"\b([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:\s*-\s*(?:[A-Za-z]+\s+)?\d{1,2})?,?\s+(\d{4})\b", s)
    if m and m.group(1).lower() in MONTHS:
        mo, d, y = MONTHS.index(m.group(1).lower()) + 1, int(m.group(2)), int(m.group(3))
        if y == year and 1 <= d <= 31:
            return f"{y}-{mo:02}-{d:02}", True
    return f"{year}-01-01", False


def split_name(toks, surname_first, nat):
    """'Surname First Name' (or 'First Surname' when the header says so) -> 'First Name Surname'. A particle
    or suffix stays with the surname (van Heerden, Rojas Jr); '(F)' marks a woman and '(Dalua)' a nickname,
    both dropped. A letter the PDF lost is ø for a Norwegian, nothing for anyone else."""
    toks = [t for t in toks if t.upper() not in ("(F)", "DR.", "DR")]
    if not toks:
        return ""
    if surname_first:
        n = 1
        if PARTICLE.match(toks[0]) and len(toks) > 2:
            n = 2
        while n < len(toks) - 1 and (PARTICLE.match(toks[n]) or toks[n].startswith("(")):
            n += 1
        first, surname = toks[n:], toks[:n]
    else:
        first, surname = toks[:1], toks[1:]
    name = " ".join(first + surname)
    name = name.replace("\ufffd", "ø" if nat == "NOR" else "")
    return clean_name(name)


def parse(text):
    """The lists in one file: [(label, format, [(place, name, time, note, nat)])]. A section heading names the
    class and whether it is the qualifying (timed) or the race; a "Continued" heading carries the list on.
    The heats' brackets are skipped: their rows have neither a nationality nor a time."""
    out, cur = [], []
    label = fmt = None
    surname_first = True

    def flush():
        nonlocal cur
        if len(cur) >= 2:
            out.append((label, fmt, cur))
        cur = []

    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        words = fold(line).split()
        if "surname" in words and ("first" in words or "firstname" in words or "name" in words):
            surname_first = words.index("surname") < min(i for i, w in enumerate(words) if w in ("first", "firstname", "name"))
            continue
        m = HEADING_RE.match(line)
        if m and "pos" not in words and not re.search(r"\d:\d\d", line):
            what = m.group("what").lower()
            new_label = re.sub(r"\bcontinued\b", "", m.group("label"), flags=re.I)
            new_label = re.sub(r"\s+", " ", new_label).strip(" -:")
            new_fmt = "timed" if what.startswith("qual") else "bracket"
            if re.search(r"continued", line, re.I) and new_label == label and new_fmt == fmt:
                continue
            flush()
            label, fmt = new_label, new_fmt
            continue
        if BRACKET_RE.match(line):
            flush()
            label = None
            continue
        m = ROW_RE.match(line)
        if not m or label is None:
            continue
        pos, _, rest = m.groups()
        toks = rest.split()
        nat_i = None
        for i, t in enumerate(toks):
            if re.fullmatch(r"[A-Z]{2,3}", t) and t not in ("DNS", "DNF", "DQ", "DSQ", "NQT") and not any(re.search(r"[a-z]", x) for x in toks[i + 1:]):
                nat_i = i
        times = [secs(t) for t in toks if TIME_TOKEN.match(t)] or [secs(t) for t in toks if SHORT_TIME.match(t)]
        times = [t for t in times if t]
        if nat_i is None and not times:
            continue
        if nat_i is not None:
            name_toks, nat = toks[:nat_i], toks[nat_i]
        else:
            name_toks, nat = [], None
            for t in toks:
                if TIME_TOKEN.match(t) or SHORT_TIME.match(t) or NOT_NAME_TOKEN.match(t):
                    break
                name_toks.append(t)
        name = split_name(name_toks, surname_first, nat)
        if not name:
            continue
        place = int(pos) if pos.isdigit() else None
        note = "" if pos.isdigit() else {"DQ": "DSQ"}.get(pos.upper(), pos.upper())
        if nat_i is not None and any(t.upper() == "DNS" for t in toks[nat_i + 1:]):
            note = "DNS"
        if cur and place == 1 and cur[-1][0] not in (None, 1):
            flush()  # the numbering starts over: another list under the same heading
        cur.append((place, name, min(times) if times and fmt == "timed" else None, note, nat))
    flush()
    return out


# ---------------------------------------------------------------- events

def build(fetch=False):
    events = {}
    for ts, url, mime, key in index(fetch):
        text = text_of(ts, url, mime, key, fetch)
        if not text:
            continue
        year = int(key[:4])
        h = header(text)
        name = re.sub(r"\b(19|20)\d\d\b", " ", h["Event"])
        name = re.sub(r"\s+", " ", name).strip(" -–,") or key.split("/")[-1].split(".")[0]
        hill = None
        if re.search(r"norway|norge", fold(h["Location"])) or re.search(r"grefsen|lil+y?hammer|tryvann|voss", fold(name)):
            known_name, hill = event_of(name)
            name = known_name or name
        eid = f"{year}-{slug(name)}"
        date, known = parse_date(h["Date"], year)
        ev = events.setdefault(eid, {"id": eid, "name": name, "year": year, "date": date, "date_known": known, "hill": hill,
                                     "place": h["Location"], "level": h["Event Level"], "sources": [], "titles": [], "notes": [], "races": []})
        if known and not ev["date_known"]:
            ev["date"], ev["date_known"] = date, known
        src = WAYBACK.format(ts=ts, url=url)
        ev["sources"].append(src)
        if h["Event"] and h["Event"] not in ev["titles"]:
            ev["titles"].append(h["Event"])
        lists = parse(text)
        if not lists:
            ev["notes"].append(f"no list recognised in {key}")
        for label, fmt, results in lists:
            kind = next((k for pat, k in CLASSES if re.search(pat, fold(label))), "Open")
            timed = fmt == "timed"
            if kind == "Other":
                rname = ("Kvalifisering " if timed else "") + label
            else:
                rname = race_name(kind, timed=timed)
                jr = re.search(r"junior\s*(1|2|i{1,2})\b", fold(label))
                if jr:
                    rname += " " + {"i": "1", "ii": "2"}.get(jr.group(1), jr.group(1))
                if kind == "Luge" and "classic" in fold(label):
                    rname = rname.replace("Luge", "Classic Luge")
            if timed:
                ranked = sorted([r for r in results if r[2]], key=lambda r: r[2])
                results = [(i + 1, n, t, note, nat) for i, (_, n, t, note, nat) in enumerate(ranked)] + \
                    [(None, n, None, note or "DNF", nat) for _, n, t, note, nat in results if not t]
            add_race(ev, rname, kind, fmt, f"{src} / {label} / {fmt}", results)
    # The same event under two spellings (the qualifying file says "Hot Heels", the race file "Hot Heels Africa"):
    # the shorter name is the start of the longer, the same year. Keep the longer name.
    for short in sorted(events):
        year, stem = short[:4], short[5:]
        long = next((e for e in events if e != short and e.startswith(f"{year}-{stem}-")), None)
        if long:
            for r in events[short]["races"]:
                add_race(events[long], r["name"], r["kind"], r["format"], r["source"], [(x["place"], x["name"], x["time"], "DNS" if x["dns"] else "DNF" if x["dnf"] else "", x.get("nat")) for x in r["results"]])
            events[long]["sources"] += events[short]["sources"]
            events[long]["titles"] += events[short]["titles"]
            del events[short]
    for ev in events.values():
        ev["needs_manual"] = not ev["races"]
    return events


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "refetch":
        shutil.rmtree(CACHE, ignore_errors=True)
    write(build(fetch=cmd in ("fetch", "refetch")), OUT)
