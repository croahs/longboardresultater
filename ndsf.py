"""Fetch every result list ndsf.no has published and write one JSON file per event.

ndsf.no is WordPress without pretty permalinks, so its REST API lives at
?rest_route=/wp/v2/posts. The result posts (category "Resultater" and the year
categories) hold the lists in four forms, oldest first: plain text in the post
(2007–2010), PDFs on ndsf.no (2012–2013; the 2010–2011 files are gone), embedded
Google Sheets (2014–), and photos (2025 Granåsen, 2026 Vallerås). Everything but
the photos is read here. A published sheet exports as CSV without a login
(…/pub?output=csv&gid=<tab>); the tabs come from the pubhtml page.

  python3 ndsf.py            read the cache, write data/ndsf/<event>.json
  python3 ndsf.py fetch      also fetch new posts and sheets (keeps what is cached)
  python3 ndsf.py refetch    throw the cache away and fetch everything again

Everything fetched is cached under cache/ndsf/ and committed, so a build never
needs the network and ndsf.no is only read when someone runs "fetch".
PDF text needs pdftotext (poppler) once; the text is cached too.

Output (data/ndsf/<year>-<slug>.json), one per event; a post that only has photos
gets a stub with "needs_manual". Hand-written files in data/manual/ with the same
name replace these (sitedata.py reads both). Shape:

  {"id": "2025-ekstremsportveko", "name": "Ekstremsportveko", "year": 2025,
   "date": "2025-07-06", "date_known": true, "hill": "voss",
   "sources": ["https://ndsf.no/?p=3495"], "notes": [],
   "races": [{"name": "NM Open", "kind": "Open", "format": "bracket" | "timed",
              "source": "sheet …/Results",
              "results": [{"place": 1, "name": "Peder Bruem", "time": null, "dnf": false, "dns": false}]}]}

dnf: started but got no placing (counts in the field). dns: did not start (listed, but not in the field).
kind is one of Open, Women, Junior, Masters, Luge, Adaptive, Inline, Other.
format "timed" means the list is ranked by the time in each row (qualifying,
time trials); "bracket" means heats, so only the place is known.
"""
import csv
import html
import io
import json
import os
import re
import shutil
import subprocess
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache", "ndsf")
OUT = os.path.join(HERE, "data", "ndsf")
SITE = "https://ndsf.no"
UA = {"User-Agent": "Mozilla/5.0 (longboardresultater; +https://github.com/croahs/longboardresultater)"}
RESULTS_CAT = 14
# WordPress category id -> season. Posts about old races were often written years later.
YEAR_CATS = {21: 2007, 22: 2008, 16: 2009, 15: 2010, 17: 2011, 18: 2012, 19: 2013, 20: 2014, 35: 2015, 36: 2016,
             45: 2017, 48: 2018, 130: 2019, 220: 2020, 262: 2021, 296: 2022, 346: 2023, 377: 2024, 391: 2025, 404: 2026}
# Posts in the result categories that are not Norwegian races (foreign results, info pages).
SKIP_POSTS = {
    478: "Ekstremsportveko 2012 info page (the results are in post 474)",
    480: "Mt. Keira / Newton's Nation, Australia",
    475: "Ravenhill / Vernon, Canada",
    550: "Almabtrieb World Championships, Austria",
    1197: "IDF world champions",
    1319: "TMI Lillehammer 2015: only a link to the IDF site",
    549: "The Graveyard Call 2010: IGSA World Cup, partial list, venue unknown to us",
}
# Headings in a text post whose list is not a Norwegian race.
FOREIGN = re.compile(r"padova|igsa|idf|almabtrieb|world cup|vernon|ravenhill", re.I)
# The event each post belongs to: (pattern on the title, event name, hill id). First match wins.
EVENTS = [
    (r"ekstrem|extrem|veko", "Ekstremsportveko", "voss"),
    (r"xboard|volda", "XBoard Volda", "volda"),
    (r"kongen|kph", "Kongen på Haugen", "st-hanshaugen"),
    (r"lil+y?hammer|lillehammer", "TMI Lillehammer", "lillehammer"),
    (r"grefsen|nationals", "Grefsenkollen", "grefsenkollen"),
    (r"beito", "Beitostølen", "beitostolen"),
    (r"rullestad", "Rullestadjuvet", "rullestadjuvet"),
    (r"barmen", "Barmen Downhill Challenge", "barmen"),
    (r"gran[åa]sen", "Granåsen", "granasen"),
    (r"valler[åa]s", "Vallerås", "valleras"),
    (r"tryvann", "Tryvann Downhill Challenge", "tryvann"),
    (r"hoddevik", "Hoddevik", "hoddevik"),
    (r"kdf", "KDF", "kdf"),
    (r"drammen|rockstar|padova", "Drammen X-Weekend", "djupdalsveien"),
    (r"skyggen", "Skyggen Open", "skyggen"),
    (r"graveyard", "The Graveyard Call", "graveyard"),
]
KINDS = [
    (r"women|womens|dame|kvinne|jente|girl", "Women"),
    (r"junior|\bjr\b|\bjunior", "Junior"),
    (r"master|\+35|veteran", "Masters"),
    (r"luge", "Luge"),
    (r"adaptive", "Adaptive"),
    (r"inline", "Inline"),
    (r"intermediate|rookie|stock|team|lag|slalom", "Other"),
    (r"open|senior|menn|\bnm\b|norgescup|final|result|resultat|elite|skate", "Open"),
]
# Sheet tabs that never hold a result list: seeding, heats, forms and helper tabs.
IGNORE_TAB = re.compile(r"registration|rego|instruction|bracket|tree|heats?\b|startlist|randomize|condensed|csv|"
                        r"^\d+$|repech|dirty|seeding|poengskala|_list$|list$", re.I)
TIME_RE = re.compile(r"^\s*\(?(\d{1,2}[:.,]\d{2}[:.,]\d{1,3}|\d{1,2}[:.]\d{2}|\d{2,3}[.,]\d{1,2})\)?\s*$")
NAME_RE = re.compile(r"[A-Za-zÀ-ÿ]{2,}")
NOT_NAME = re.compile(r"^(bye|rider|team)\s*\d*$|^#n/a$|^-+$|^\?+$|^(dns|dnf|dsq)$", re.I)


# ---------------------------------------------------------------- fetching and caching

def _path(*parts):
    p = os.path.join(CACHE, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def _read(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return None


def _write(path, text):
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def get(url, binary=False, tries=3):
    """One HTTP GET with the site's pace in mind: a short pause and a plain browser-like agent."""
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                data = r.read()
            time.sleep(0.4)
            return data if binary else data.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 404) or i == tries - 1:
                raise
            time.sleep(3)
    return None


def rest(route, **params):
    q = urllib.parse.urlencode({"rest_route": route, **params})
    return json.loads(get(f"{SITE}/?{q}"))


def posts(fetch=False):
    """Every post on ndsf.no (id, date, title, categories, content), cached in cache/ndsf/posts.json."""
    path = _path("posts.json")
    cached = _read(path)
    if cached and not fetch:
        return json.loads(cached)
    out, page = [], 1
    while True:
        batch = rest("/wp/v2/posts", per_page=100, page=page, _fields="id,date,title,link,categories,content")
        out += [{"id": p["id"], "date": p["date"][:10], "title": html.unescape(p["title"]["rendered"]),
                 "categories": p["categories"], "content": p["content"]["rendered"]} for p in batch]
        if len(batch) < 100:
            break
        page += 1
    _write(path, json.dumps(out, ensure_ascii=False, indent=0))
    return out


def sheet(key, fetch=False):
    """A published Google Sheet: its title and every tab as CSV text, cached in cache/ndsf/sheets/<key>.json.
    key is "<id>" or "e/<published id>", as it appears in the embed URL."""
    path = _path("sheets", key.replace("/", "_") + ".json")
    cached = _read(path)
    if cached and not fetch:
        return json.loads(cached)
    base = f"https://docs.google.com/spreadsheets/d/{key}"
    out = {"key": key, "title": None, "tabs": [], "error": None}
    try:
        page = get(base + "/pubhtml")
    except Exception as e:  # not published any more, or never was
        out["error"] = str(e)
        _write(path, json.dumps(out, ensure_ascii=False))
        return out
    m = re.search(r"<title>(.*?)</title>", page, re.S)
    out["title"] = re.sub(r"\s*-\s*Google (Disk|Sheets|Drive)\s*$", "", html.unescape(m.group(1))).strip() if m else None
    tabs = re.findall(r'items\.push\(\{name: "([^"]*)",[^}]*?gid: "(\d+)"', page) or [("sheet", "")]
    for name, gid in tabs:
        try:
            text = get(base + "/pub?output=csv" + (f"&gid={gid}" if gid else ""))
        except Exception as e:
            out["tabs"].append({"name": name, "gid": gid, "csv": None, "error": str(e)})
            continue
        out["tabs"].append({"name": name, "gid": gid, "csv": text})
    _write(path, json.dumps(out, ensure_ascii=False))
    return out


def pdf_text(url, fetch=False):
    """The text of a PDF on ndsf.no (pdftotext -layout), cached in cache/ndsf/pdf/. None when the file is gone."""
    name = re.sub(r"[^A-Za-z0-9.]+", "_", urllib.parse.unquote(url.rsplit("/", 1)[-1]))
    path = _path("pdf", name + ".txt")
    cached = _read(path)
    if cached is not None and not fetch:
        return cached or None
    try:
        data = get(url, binary=True)
    except Exception:
        _write(path, "")  # remember that it is gone
        return None
    if not shutil.which("pdftotext"):
        print(f"  pdftotext missing, skipping {url}", file=sys.stderr)
        return None
    pdf = _path("pdf", name)
    with open(pdf, "wb") as f:
        f.write(data)
    text = subprocess.run(["pdftotext", "-layout", "-enc", "UTF-8", pdf, "-"], capture_output=True, text=True,
                          encoding="utf-8", errors="replace").stdout
    os.remove(pdf)
    _write(path, text)
    return text or None


# ---------------------------------------------------------------- small helpers

def fold(s):
    """Lower-case ASCII for comparing names and headings: 'Jørund Bratset' -> 'jorund bratset'."""
    s = s.replace("ø", "o").replace("Ø", "o").replace("æ", "ae").replace("Æ", "ae").replace("å", "a").replace("Å", "a")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s.lower()).strip()


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", fold(s)).strip("-")


def clean_name(s):
    """A rider's name as written, minus bib numbers, nicknames in quotes and trailing notes."""
    s = html.unescape(s or "").replace("\xa0", " ")
    # The 2012–2013 PDFs lose their Norwegian letters; ø is by far the most common of them in names.
    s = s.replace("\ufffd", "ø")
    s = re.sub(r"[\"“”«»„]\s*[^\"“”«»„]*?\s*[\"“”«»„]", " ", s)  # "Kula", «Fiffen»
    s = re.sub(r"\s[A-ZÆØÅ]{3,}[»”\"]?(?=\s)", " ", s)  # a nickname in capitals: Amund BLIX Aaeng
    s = re.sub(r"\(.*?\)|\[.*?\]", " ", s)
    s = re.sub(r"\b(DNS|DNF|DSQ|DNK)\b.*$", " ", s)
    s = re.sub(r"\s*[-–]\s+.*$|\s*[-–]+\s*$", "", s)  # "Mikael Jensen – DDC – Rockstar", "Mathias Unsvåg –"
    s = re.sub(r"^[\d.:,/\s]+", "", s)  # "1.Plats", "10/2 0:59:50 Anders"
    s = re.sub(r"\s+\d{1,2}[:.,]\d{2}([:.,]\d{1,3})?$", "", s)  # a time at the end of the name
    s = re.sub(r"^(plats|plass)\s+", "", s, flags=re.I)
    s = re.sub(r"\s+\d+$", "", s)  # a trailing start number
    s = re.sub(r"\s+", " ", s).strip(" .,;:!")
    return s if NAME_RE.search(s) and not NOT_NAME.match(s) else ""


def secs(t):
    """'2:09.72', '02:08,15', '1.10.5', '17.3', '1:03:55' (minutes:seconds:hundredths) -> seconds, or None.
    A downhill run takes under 20 minutes, so three groups are m:ss.ff unless that is impossible."""
    t = (t or "").strip().strip("()")
    if not TIME_RE.match(t):
        return None
    parts = [p for p in re.split(r"[:.,]", t) if p != ""]
    try:
        if len(parts) == 3:
            m, s, f = parts
            return int(m) * 60 + int(s) + int(f) / 10 ** len(f)
        if len(parts) == 2:
            a, b = parts
            if ":" in t:
                return int(a) * 60 + int(b)
            return int(a) + int(b) / 10 ** len(b)
    except ValueError:
        return None
    return None


def kind_of(*labels):
    """The class a label points to (Women, Junior, Masters, Luge, Adaptive, Inline, Other, Open), or None."""
    for label in labels:
        f = re.sub(r"[_\-]+", " ", fold(label or ""))
        f = re.sub(r"\b(final results?|results?|resultater?|resultat|plass|timetrials?|timed runs?|time ?trails?|time ?trials?|"
                   r"tidskjoring|tider|kval\w*|speed ?trail|eurotour quali\w*|total ranking)\b", " ", f).strip()
        if not f:
            continue
        found = [kind for pat, kind in KINDS if re.search(pat, f)]
        if len([k for k in found if k != "Open"]) >= 2:
            return "Open"  # "Times-Open-Luge-Inline-Adaptive": one list for every class
        if found:
            return found[0]
    return None


def event_of(title):
    for pat, name, hill in EVENTS:
        if re.search(pat, fold(title)):
            return name, hill
    return None, None


# ---------------------------------------------------------------- parsing tables

def rows_of(text):
    return [[c.strip() for c in row] for row in csv.reader(io.StringIO(text))]


def _int(c):
    return int(c) if re.fullmatch(r"\d{1,3}", c or "") else None


def place_lists(rows, label):
    """Every ranked list in a table: a column counting 1, 2, 3 … with names beside it.

    Handles the bracket sheets' "FINAL RESULTS" block (place, reg no, name), plain "Plass, Navn" lists,
    the IDF sheets with first and last names in two columns, and side-by-side lists (Open | Rookies).
    Returns [(heading or None, [(place, name, time, note)])]."""
    ncol = max((len(r) for r in rows), default=0)
    rows = [r + [""] * (ncol - len(r)) for r in rows]
    lists = []
    taken = set()  # (row, col) cells already used as names
    for c in range(ncol):
        col = [_int(r[c]) for r in rows]
        starts = [i for i, v in enumerate(col) if v == 1 and i + 1 < len(rows) and col[i + 1] in (1, 2)]
        for start in starts:
            if any((start, c) == s for s, _ in lists):
                continue
            # A header row above the list that names the ranking column: only that column ranks the rows
            # ("Startnr, Navn, Poeng, Plass" is ranked by Plass, not by the start numbers).
            if start:
                head_row = [fold(h) for h in rows[start - 1]]
                ranked = [j for j, h in enumerate(head_row) if re.match(r"^(plass|place|rank|pos|total rank|kvalplass|resultat|#)", h)]
                if ranked and c not in ranked:
                    continue
            # The name column: the first column to the right with a name in the first rows of the list.
            name_col = None
            for nc in list(range(c + 1, min(c + 6, ncol))) + list(range(c - 1, max(c - 6, -1), -1)):
                vals = [rows[i][nc] for i in range(start, min(start + 4, len(rows)))]
                if sum(bool(clean_name(v)) for v in vals) >= 2 and all(_int(v) is None for v in vals):
                    name_col = nc
                    break
            if name_col is None or (start, name_col) in taken:
                continue
            # First name | Last name in two columns (IDF "rank, name, surname" and "Last Name, First Name").
            head = [fold(h) for h in rows[start - 1]] if start else []
            pair = None
            if head and name_col + 1 < ncol:
                h1, h2 = head[name_col], head[name_col + 1] if name_col + 1 < len(head) else ""
                if h1.startswith(("last", "etternavn")) and h2.startswith(("first", "fornavn")):
                    pair = (name_col + 1, name_col)
                elif h1.startswith(("first", "fornavn", "name")) and h2.startswith(("last", "etternavn", "surname")):
                    pair = (name_col, name_col + 1)
            # Time columns: "Best"/"Total" when the sheet has one, else every run, heat or qualifying column;
            # never "Diff". Without a header, the first time-looking cell to the right.
            time_cols = [tc for tc, h in enumerate(head) if tc > name_col and re.search(r"^(best|beste|total|tid|time|run|heat|q\d|\d\. ?(heat|run|omgang)|kval)", h)]
            best_cols = [tc for tc in time_cols if head[tc].startswith(("best", "total"))]
            time_cols = best_cols or time_cols
            diff_cols = {tc for tc, h in enumerate(head) if h.startswith("diff")}
            out, expect = [], 1
            for i in range(start, len(rows)):
                v = col[i]
                if v is None:
                    if out and all(not x for x in rows[i]):
                        break  # a blank row ends the list
                    if out and v is None and rows[i][name_col]:
                        continue  # a header or note inside the block
                    if not out:
                        break
                    continue
                if v < expect - 1 or v > expect + 3:
                    break  # another list, or heat ranks
                name = clean_name(f"{rows[i][pair[0]]} {rows[i][pair[1]]}" if pair else rows[i][name_col])
                if not name:
                    expect = v + 1
                    continue
                t = None
                if time_cols:
                    ts = [secs(rows[i][tc]) for tc in time_cols if tc < len(rows[i])]
                    ts = [x for x in ts if x]
                    t = min(ts) if ts else None
                else:
                    for k, cell in enumerate(rows[i][name_col + 1:name_col + 8], name_col + 1):
                        if k not in diff_cols and secs(cell):
                            t = secs(cell)
                            break
                note = next((x for x in rows[i][name_col + 1:] if re.fullmatch(r"(consi|dnf|dns|dsq|dq|3rd in qf\.?)", x, re.I)), "")
                out.append((v, name, t, note))
                expect = v + 1
            class_col = next((j for j, h in enumerate(head) if h in ("class", "klasse", "category", "kategori")), None) if head else None
            if class_col is not None and len({rows[i][class_col] for i in range(start, start + len(out))}) > 1:
                # One list per class, each ranked on its own ("Rank ... Class ... Total Time").
                by = {}
                for k, row in enumerate(out):
                    by.setdefault(rows[start + k][class_col].strip() or "Open", []).append(row)
                for cls, rows_ in by.items():
                    ranked = [(j + 1, n, t, note) for j, (_, n, t, note) in enumerate(rows_)]
                    if len(ranked) >= 2:
                        lists.append(((start, c + 100 + len(lists)), (cls, ranked)))
                continue
            if len(out) >= 2:
                heading = rows[start - 1][name_col] if start and clean_name(rows[start - 1][name_col]) and not NAME_RE.search(
                    rows[start - 1][name_col].replace("Open", "")) else None
                heading = heading or (rows[start - 1][c] if start and rows[start - 1][c] and not _int(rows[start - 1][c]) else None)
                if heading and re.match(r"^(rank|plass|pos|#|seed|kvalplass|total rank|resultat)", fold(heading)) and start > 1:
                    # The header row says nothing about the class; the title row above it may ("Luge", "Skate - Open").
                    title = next((x for x in rows[start - 2] if x.strip()), "")
                    heading = title if title and not _int(title) else heading
                # Seedings and start lists rank the riders before the race, not after it.
                above = f"{rows[start - 1][c]} {rows[start - 1][name_col]}" if start else ""
                if re.search(r"seed|startliste|start ?list|registr", fold(f"{heading or ''} {above}")):
                    continue
                taken.update((start + k, name_col) for k in range(len(out)))
                lists.append(((start, c), (heading, out)))
    # Drop a list that is only a copy of another one (the bracket sheets repeat names in helper columns).
    final = []
    for _, (heading, out) in sorted(lists, key=lambda x: x[0]):
        names = [fold(n) for _, n, _, _ in out]
        if any(names == [fold(n) for _, n, _, _ in o] for _, o in final):
            continue
        final.append((heading, out))
    return final


def time_lists(rows):
    """Ranked lists of names with times, from tabs where every row carries a time (qualifying, time trials).
    Returns [(heading, [(place, name, time, note)])], ranked by time when the sheet does not rank them."""
    ncol = max((len(r) for r in rows), default=0)
    rows = [r + [""] * (ncol - len(r)) for r in rows]
    head_i = next((i for i, r in enumerate(rows) if any(re.search(r"^(navn|name|rider|last ?name|etternavn)", fold(c)) for c in r)
                   and any(re.search(r"best|tid|time|run|heat|q1", fold(c)) for c in r)), None)
    if head_i is None:
        return []
    head = [fold(c) for c in rows[head_i]]
    name_col = next(i for i, h in enumerate(head) if re.search(r"^(navn|name|rider|last ?name|etternavn)", h))
    first_col = next((i for i, h in enumerate(head) if h.startswith(("first", "fornavn"))), None)
    best = [i for i, h in enumerate(head) if re.search(r"^(best|beste|total time)", h)]
    time_cols = best or [i for i, h in enumerate(head) if i > name_col and re.search(r"tid|time|run|heat|q\d", h)]
    out = []
    for r in rows[head_i + 1:]:
        name = clean_name(f"{r[first_col]} {r[name_col]}" if first_col is not None else r[name_col])
        if not name:
            if out and not any(r):
                break
            continue
        ts = [secs(r[i]) for i in time_cols if i < len(r)]
        ts = [t for t in ts if t]
        out.append((None, name, min(ts) if ts else None, ""))
    if len(out) < 2 or not any(t for _, _, t, _ in out):
        return []
    timed = sorted([x for x in out if x[2]], key=lambda x: x[2])
    ranked = [(i + 1, n, t, note) for i, (_, n, t, note) in enumerate(timed)]
    ranked += [(None, n, None, "DNF") for _, n, t, _ in out if not t]
    return [(None, ranked)]


def parse_sheet(sh, heading):
    """The races in one Google Sheet: [(race name, kind, format, source, results)]."""
    races = []
    for tab in sh.get("tabs", []):
        if not tab.get("csv") or IGNORE_TAB.search(tab["name"]):
            continue
        rows = rows_of(tab["csv"])
        src = f"sheet {sh['key']} / {tab['name']}"
        found = place_lists(rows, tab["name"]) or time_lists(rows)
        head_text = fold(" ".join(" ".join(r) for r in rows[:3]))
        for sub_heading, results in found:
            # Most rows timed, and not a final ranking with the qualifying times attached (points, rounds):
            # a qualifying or time-trial list, whatever the tab is called. Rows without a time are DNF.
            n_timed = sum(1 for _, _, t, _ in results if t)
            timed = n_timed >= max(2, 0.7 * len(results)) and not re.search(r"poeng|runde|finale|\bfinal\b", head_text) \
                and not re.search(r"result", fold(tab["name"]))
            if timed:
                results = [(p, n, t, note) if t else (None, n, None, "DNF") for p, n, t, note in results]
            label = sub_heading or ""
            many = len(found) > 1 or len([t for t in sh["tabs"] if t.get("csv") and not IGNORE_TAB.search(t["name"])]) > 1
            kind = kind_of(label, tab["name"] if many else "", heading, sh.get("title") or "") or "Open"
            name = race_name(kind, label, tab["name"] if many else "", heading, sh.get("title") or "", timed=timed)
            races.append((name, kind, "timed" if timed else "bracket", f"{src} / {label}" if label else src, results))
    return races


def race_name(kind, *labels, timed=False):
    """What to call the race within the event: the class, with the series when the sheet says so."""
    text = " ".join(l for l in labels if l)
    f = fold(text)
    if "slalom" in f:
        return "Storslalåm"
    if timed:
        # Qualifying for the heats when the sheet says so; otherwise a timed competition of its own.
        label = {"Women": "Damer", "Junior": "Junior", "Masters": "Masters", "Luge": "Luge", "Adaptive": "Adaptive", "Inline": "Inline"}.get(kind)
        return "Kvalifisering" + (f" {label}" if label else "")
    if re.search(r"\bnm\b|norwegian championship|norgesmester", f) and kind == "Open":
        return "NM Open"
    if re.search(r"\bnm\b", f) and kind in ("Masters", "Luge", "Women", "Junior"):
        return "NM " + {"Women": "Damer"}.get(kind, kind)
    if re.search(r"kval|round robin", f):
        return "Kvalifisering"
    if "eurotour" in f and kind == "Open":
        return "Open Eurotour"
    if "stock" in f:
        return "Stock race"
    if "intermediate" in f:
        return "Intermediate"
    if "rookie" in f:
        return "Rookies"
    if "team" in f or "lagkonk" in f:
        return "Lagkonkurranse"
    return {"Women": "Damer", "Junior": "Junior", "Masters": "Masters", "Luge": "Luge", "Adaptive": "Adaptive",
            "Inline": "Inline", "Other": text.strip() or "Annet"}.get(kind, "Open")


# ---------------------------------------------------------------- parsing text and PDFs

LINE_RE = re.compile(r"^\s*(\d{1,3})\s*(?:[.:)]|\.?\s*plats|\.?\s*plass)?\s*(.+?)\s*$", re.I)


def parse_text(text):
    """Ranked lists in a post written as text: numbered lines under a heading, or bare names under
    'Plasseringer'. Returns [(heading, format, results)]."""
    lines = [html.unescape(re.sub(r"<[^>]+>", "", l)).replace("\xa0", " ").strip() for l in
             re.split(r"<br[^>]*>|</p>|</li>|</tr>|</h\d>|</div>|\n", text)]
    out, heading, cur, bare = [], "", [], []
    expect = 1

    def flush():
        nonlocal cur, bare
        if len(cur) >= 2:
            out.append((heading, cur))
        elif len(bare) >= 5:
            out.append((heading, [(i + 1, n, None, "") for i, n in enumerate(bare)]))
        cur, bare = [], []

    for line in lines:
        if not line:
            continue
        m = LINE_RE.match(line)
        if m and 0 < int(m.group(1)) <= 200 and clean_name(m.group(2)):
            place, rest = int(m.group(1)), m.group(2)
            if cur and place < expect - 1:
                flush()
            t = next((secs(w) for w in rest.split() if secs(w) is not None), None)
            note = (re.search(r"\b(DNS|DNF|DSQ)\b", rest) or [""])[0]
            cur.append((place, clean_name(re.sub(TIME_RE.pattern.strip("^$"), " ", rest) if t is None else
                                          " ".join(w for w in rest.split() if secs(w) is None)), t, note))
            expect = place + 1
        elif re.match(r"^dns?:", line, re.I):
            continue
        elif re.search(r"\S\s+\(?\d{1,2}[:.,]\d{2}[:.,]\d{2,3}\)?\s*$", line) and clean_name(line) and len(clean_name(line).split()) <= 4:
            # "Peder Bruem      1:07:93": a qualifying time without a rank
            t = secs(line.split()[-1])
            if t is not None:
                cur.append((len(cur) + 1, clean_name(" ".join(line.split()[:-1])), t, ""))
        elif clean_name(line) == line.strip(" .") and len(line.split()) in (2, 3, 4) and not re.search(r"[:!?]", line) \
                and (bare or re.search(r"plasser|result|final", fold(heading))):
            bare.append(clean_name(line))
        else:
            flush()
            heading = line
            expect = 1
    flush()
    return out


def parse_pdf(text):
    """Result and qualifying lists in the 2012–2013 PDFs (Plass Navn Poeng, Kvalplass Startnr Navn … Tid).
    A list runs across page breaks and stray lines (a wrapped points value on its own line); it ends
    when the numbering starts over."""
    out, cur, heading, pending = [], [], "", ""
    timed, col = False, None  # col: where the place numbers start; a number further right is a bib on a tied row
    for line in text.splitlines():
        m = re.match(r"^\s*=?(\d{1,3})\s{2,}(.+?)\s*$", line)  # "=29": a shared place
        if m:
            n, rest = int(m.group(1)), m.group(2)
            if cur and col is not None and m.start(1) > col + 2:
                n, rest = cur[-1][0], line.strip()  # no place of its own: shares the place above
            cells = re.split(r"\s{2,}", rest)
            name = next((clean_name(c) for c in cells if clean_name(c) and not re.fullmatch(r"\d+", c)), "")
            if not name:
                continue
            if cur and n < cur[-1][0]:  # numbering starts over: a new list (equal = a shared place)
                out.append((heading, "timed" if timed else "bracket", cur))
                cur = []
            if not cur:
                heading = pending or heading
                timed = bool(re.search(r"kval|time|tid", fold(heading)))
                col = m.start(1)
            # The time, wherever it sits: later pages often collapse the columns to single spaces.
            ts = [secs(c) for c in rest.split() if secs(c) is not None and not re.fullmatch(r"\d{3}[.,]\d\d", c)]
            cur.append((n, name, ts[0] if ts else None, (re.search(r"\b(DNS|DNF|DSQ)\b", rest) or [""])[0]))
        elif re.search(r"[A-Za-zÀ-ÿ]{3,}", line):
            pending = line.strip()  # a heading for the next list, if one starts here
    if cur:
        out.append((heading, "timed" if timed else "bracket", cur))
    return [x for x in out if len(x[2]) >= 2]


# ---------------------------------------------------------------- events

def post_date(p, year):
    """The race date when the post names one in that year, else the post date; the first of January,
    marked unknown, when the post was written in another year."""
    for m in re.finditer(r"(\d{1,2})[.\-/](\d{1,2})[.\-/](20\d\d)", p["content"] + " " + p["title"]):
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y == year and 1 <= mo <= 12 and 1 <= d <= 31:
            return f"{y}-{mo:02}-{d:02}", True
    months = "januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember|january|february|march|may|june|july|october|december"
    for m in re.finditer(rf"(\d{{1,2}})\.?\s+({months})\s+(20\d\d)", p["content"], re.I):
        if int(m.group(3)) == year:
            mo = 1 + [x[:3] for x in months.split("|")].index(fold(m.group(2))[:3]) % 12
            return f"{year}-{mo:02}-{int(m.group(1)):02}", True
    if p["date"].startswith(str(year)):
        return p["date"], True
    return f"{year}-01-01", False


def result_posts(all_posts):
    return [p for p in all_posts if p["id"] not in SKIP_POSTS and
            (RESULTS_CAT in p["categories"] or any(c in YEAR_CATS for c in p["categories"]))]


def parse_post(p, fetch=False):
    """Races in one post: [(name, kind, format, source, results)], plus notes."""
    races, notes = [], []
    c = p["content"]
    # Sheets, each with the text just before it (often the class: "Open", "Women", "Masters +35 …").
    parts = re.split(r"(<iframe[^>]*>)", c)
    heading = ""
    for part in parts:
        if part.startswith("<iframe"):
            m = re.search(r"spreadsheets/d/(e/)?([A-Za-z0-9_\-]+)", html.unescape(part))
            if not m:
                continue
            sh = sheet((m.group(1) or "") + m.group(2), fetch)
            if sh.get("error"):
                notes.append(f"sheet {sh['key']}: {sh['error']}")
                continue
            if re.search(r"\bteam\b|lagkonk", fold(sh.get("title") or "")):
                continue  # team events list the members of each team, not a ranking of riders
            found = parse_sheet(sh, heading)
            if not found:
                notes.append(f"sheet {sh['key']} ({sh.get('title')}): no result list recognised")
            races += found
            heading = ""
        else:
            t = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", part))).strip()
            heading = t[:80] if 0 < len(t) <= 80 else ""
    # PDFs on ndsf.no.
    for href in dict.fromkeys(re.findall(r'href="([^"]+\.pdf)"', c, re.I)):
        url = html.unescape(href)
        if not url.startswith("http"):
            url = SITE + "/" + url.lstrip("/")
        url = url.replace("http://www.ndsf.no", SITE).replace("http://ndsf.no", SITE)
        if "ndsf.no" not in url:
            notes.append(f"pdf elsewhere, skipped: {url}")
            continue
        text = pdf_text(url, fetch)
        if text is None:
            notes.append(f"pdf gone: {url}")
            continue
        for heading, fmt, results in parse_pdf(text):
            if fmt == "timed":
                ranked = sorted([r for r in results if r[2]], key=lambda r: r[2])
                results = [(i + 1, n, t, note) for i, (_, n, t, note) in enumerate(ranked)]
            if re.search(r"heat|runde|repech|\d\d\s*(man|final)", fold(url)) or not results:
                continue
            kind = kind_of(heading, url) or "Open"
            races.append((race_name(kind, heading, timed=fmt == "timed"), kind, fmt, f"pdf {url}", results))
    # Lists written in the post itself.
    if not races:
        for heading, results in parse_text(c):
            if FOREIGN.search(heading) or re.match(r"^heat\s*\d", fold(heading)):
                continue
            timed = any(t for _, _, t, _ in results)
            if timed:
                ranked = sorted([r for r in results if r[2]], key=lambda r: r[2])
                results = [(i + 1, n, t, note) for i, (_, n, t, note) in enumerate(ranked)]
            kind = kind_of(heading) or "Open"
            races.append((race_name(kind, heading, timed=timed), kind, "timed" if timed else "bracket", f"text ({heading[:40]})", results))
    if not races and re.search(r"<img", c):
        notes.append("results are in photos; write data/manual/<event>.json by hand")
    return races, notes


def build(fetch=False):
    all_posts = posts(fetch)
    events = {}
    for p in sorted(result_posts(all_posts), key=lambda p: p["date"]):
        year = next((YEAR_CATS[c] for c in p["categories"] if c in YEAR_CATS), int(p["date"][:4]))
        name, hill = event_of(p["title"])
        if not name:
            name, hill = re.sub(r"\s*[-–]\s*(resultater|reslutater|results).*$", "", p["title"], flags=re.I).strip(), None
        eid = f"{year}-{slug(name)}"
        ev = events.setdefault(eid, {"id": eid, "name": name, "year": year, "date": None, "date_known": False,
                                     "hill": hill, "sources": [], "titles": [], "notes": [], "races": []})
        date, known = post_date(p, year)
        if ev["date"] is None or (known and not ev["date_known"]) or (known and date < ev["date"]):
            ev["date"], ev["date_known"] = date, known
        ev["sources"].append(f"{SITE}/?p={p['id']}")
        ev["titles"].append(p["title"])
        races, notes = parse_post(p, fetch)
        ev["notes"] += notes
        for rname, kind, fmt, src, results in races:
            if any(r["source"] == src for r in ev["races"]):
                continue
            seen = set()
            rows = []
            for place, nm, t, note in results:
                if fold(nm) in seen:
                    continue
                seen.add(fold(nm))
                dns = bool(re.search(r"dns", note or "", re.I))
                rows.append({"place": None if dns else place, "name": nm, "time": round(t, 2) if t else None,
                             "dnf": not dns and (bool(re.search(r"dnf|dsq", note or "", re.I)) or place is None),
                             "dns": dns})
            if len(rows) < 2:
                continue
            # Two bracket lists of the same kind in one event (the same race posted twice): keep the longer.
            dup = next((r for r in ev["races"] if r["name"] == rname and r["format"] == fmt), None)
            if dup:
                if len(rows) > len(dup["results"]):
                    dup.update(results=rows, source=src)
                continue
            ev["races"].append({"name": rname, "kind": kind, "format": fmt, "source": src, "results": rows})
        if not races and not any("photos" in n for n in notes):
            ev["notes"].append(f"nothing recognised in {SITE}/?p={p['id']}")
    for ev in events.values():
        ev["needs_manual"] = not ev["races"]
    return events


def write(events):
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        os.remove(os.path.join(OUT, f))
    for eid, ev in sorted(events.items()):
        with open(os.path.join(OUT, eid + ".json"), "w", encoding="utf-8", newline="\n") as f:
            json.dump(ev, f, ensure_ascii=False, indent=1)
    n = sum(len(e["races"]) for e in events.values())
    rows = sum(len(r["results"]) for e in events.values() for r in e["races"])
    print(f"{len(events)} events, {n} races, {rows} results -> {OUT}")
    for eid, ev in sorted(events.items()):
        flag = " (needs manual)" if ev["needs_manual"] else ""
        print(f"  {eid}: " + ", ".join(f"{r['name']} {len(r['results'])}" for r in ev["races"]) + flag)
        for note in ev["notes"]:
            print(f"      ! {note}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "refetch":
        shutil.rmtree(CACHE, ignore_errors=True)
    write(build(fetch=cmd in ("fetch", "refetch")))
