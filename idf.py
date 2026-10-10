"""Fetch the race results in the IDF's (International Downhill Federation, 2013–2023) season rankings and
write one JSON file per event, in the shape ndsf.py writes.

internationaldownhillfederation.org is still up. For 2015–2019 its rankings give, per class and region,
every ranked rider with the place and points taken in each race of the season: HTML tables on
rankings.internationaldownhillfederation.org (2015–2018) and published Google Sheets (2019). Read column
by column, that is every race's result list: the riders who placed, nobody else, so there are no DNFs.
2013 and 2014 only have season totals, 2020–2022 were never ranked, and the IDF dissolved in 2023. The
races pages (/races/<year>/) give each race its date and country.

  python3 idf.py            read the cache, write data/idf/<event>.json
  python3 idf.py fetch      also fetch the pages and sheets not cached yet
  python3 idf.py refetch    throw the cache away and fetch everything again

Everything fetched is cached under cache/idf/ and committed.
"""
import html
import os
import re
import shutil
import sys

from ndsf import add_race, clean_name, event_of, fold, get, race_name, rows_of, sheet, slug, write

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache", "idf")
OUT = os.path.join(HERE, "data", "idf")
SITE = "https://internationaldownhillfederation.org"
YEARS = range(2015, 2020)
CLASSES = [(r"women", "Women"), (r"junior", "Junior"), (r"master", "Masters"), (r"luge", "Luge")]


def page(url, fetch=False):
    """A page's HTML, cached in cache/idf/pages/. '' when it cannot be fetched."""
    path = os.path.join(CACHE, "pages", re.sub(r"[^A-Za-z0-9]+", "_", url.split("//", 1)[-1]).strip("_")[:150] + ".html")
    try:
        with open(path, encoding="utf-8") as f:
            cached = f.read()
    except OSError:
        cached = None
    if cached is not None and not fetch:
        return cached
    try:
        data = get(url, binary=True)
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            text = data.decode("cp1252", "replace")  # the rankings.* pages are Windows-1252 (Paixão, Wünsche)
    except Exception as e:
        print(f"  {url}: {e}", file=sys.stderr)
        text = ""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    return text


def tables(h):
    """Every table in a page as rows of cell text."""
    out = []
    for t in re.findall(r"<table.*?</table>", h or "", re.S | re.I):
        rows = []
        for row in re.findall(r"<tr.*?</tr>", t, re.S | re.I):
            rows.append([re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", c))).strip()
                         for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S | re.I)])
        out.append(rows)
    return out


def race_lists(rows):
    """The races in one ranking table: {race name: [(place, name, None, "", country)]}. The header row names
    the columns (Name, Country, then Place and Pts per race); the row above it names the races, one per Place
    column, either in the same columns (a sheet) or in order (an HTML table with spanned cells)."""
    hi = next((i for i, r in enumerate(rows) if "place" in [fold(c) for c in r]
               and any(fold(c) in ("name", "last name", "first name") for c in r)), None)
    if not hi:
        return {}
    head = [fold(c) for c in rows[hi]]
    place_cols = [i for i, c in enumerate(head) if c == "place"]
    above = rows[hi - 1]
    if all(i < len(above) and above[i].strip() for i in place_cols):
        names = [above[i].strip() for i in place_cols]
    else:
        names = [c.strip() for c in above[1:] if c.strip()]
        if len(names) != len(place_cols):
            return {}
    col = lambda *keys: next((i for i, c in enumerate(head) if c in keys), None)
    name_col, first_col, last_col = col("name"), col("first name", "first"), col("last name", "last", "surname")
    nat_col = col("country", "nationality", "nat")
    out = {n: [] for n in names}
    for r in rows[hi + 1:]:
        cell = lambda i: r[i].strip() if i is not None and i < len(r) else ""
        name = clean_name(f"{cell(first_col)} {cell(last_col)}" if first_col is not None and last_col is not None else cell(name_col))
        if not name:
            continue
        for n, i in zip(names, place_cols):
            if re.fullmatch(r"\d{1,3}", cell(i)):
                out[n].append((int(cell(i)), name, None, "", cell(nat_col)))
    return {n: sorted(v) for n, v in out.items() if len(v) >= 2}


def race_info(year, fetch=False):
    """{folded race name: (date, country, name)} from the season's races page."""
    out = {}
    for t in tables(page(f"{SITE}/races/{year}/", fetch)):
        for r in t:
            if len(r) >= 3 and re.fullmatch(r"\d{1,2}/\d{1,2}", r[1].strip()):
                d, m = r[1].split("/")
                out[fold(r[0])] = (f"{year}-{int(m):02}-{int(d):02}", r[2].strip(), r[0].strip())
    return out


def lookup(info, name):
    """The races-page entry a ranking column names: the same name, or the one sharing most words with it
    (Mt Kiera / Mt Keira Downhill Challenge, TMI Lillehammer / TMI Lilyhammer, Maryhill GP / Tour de Maryhill)."""
    f = fold(name)
    if f in info:
        return info[f]
    mine = [t for t in re.split(r"[^a-z0-9]+", f) if len(t) >= 3]
    best, score = None, 0
    for k in info:
        theirs = [t for t in re.split(r"[^a-z0-9]+", k) if len(t) >= 3]
        n = sum(any(_alike(a, b) for b in theirs) for a in mine)
        if n > score or (n == score and best and len(k) < len(best)):
            best, score = k, n
    return info[best] if best and score >= max(1, len(mine) - 1) else None


def _alike(a, b):
    """The same word, give or take a letter or a doubled one (kiera/keira, lily/lille)."""
    if a == b or (len(a) >= 4 and (a.startswith(b[:4]) and b.startswith(a[:4]))):
        return True
    if abs(len(a) - len(b)) > 1:
        return False
    s, l = sorted((a, b), key=len)
    return any(l[:i] + l[i + 1:] == s for i in range(len(l))) if len(s) < len(l) else sum(x != y for x, y in zip(a, b)) == 1


def ranking_tables(year, fetch=False):
    """[(source, class label, rows)] for every ranking table of a season: the HTML pages the season's rankings
    page links to, and its published sheets (the front rankings page lists more of 2019's than the 2019 page)."""
    out = []
    pages = [f"{SITE}/rankings/{year}-rankings/"] + ([f"{SITE}/rankings/"] if year == max(YEARS) else [])
    seen_urls, seen_keys = set(), set()
    for p in pages:
        h = page(p, fetch)
        for url in re.findall(r'href="(https?://rankings\.internationaldownhillfederation\.org/[^"]+)"', h):
            url = html.unescape(url)
            if url in seen_urls:
                continue
            seen_urls.add(url)
            for rows in tables(page(url, fetch)):
                out.append((url, url.rsplit("/", 1)[-1].replace("-", " ").replace(".html", ""), rows))
        for key in re.findall(r"spreadsheets/d/(e/[A-Za-z0-9_-]+)", h):
            if key in seen_keys:
                continue
            seen_keys.add(key)
            sh = sheet(key, fetch, cache=CACHE)
            if str(year) not in (sh.get("title") or ""):
                continue
            for tab in sh.get("tabs", []):
                if tab.get("csv"):
                    out.append((f"sheet {key} / {tab['name']}", f"{sh.get('title') or ''} {tab['name']}", rows_of(tab["csv"])))
    return out


def build(fetch=False):
    events = {}
    for year in YEARS:
        info = race_info(year, fetch)
        for src, label, rows in ranking_tables(year, fetch):
            lists = race_lists(rows)
            title = next((c for c in rows[0] if c.strip()), "") if rows else ""
            kind = next((k for pat, k in CLASSES if re.search(pat, fold(f"{label} {title}"))), "Open")
            for col_name, results in lists.items():
                ri = lookup(info, col_name)
                name, hill = (ri[2] if ri else col_name), None
                if (ri and fold(ri[1]) in ("norway", "norge")) or re.search(r"lil+y?hammer|grefsen", fold(name)):
                    known_name, hill = event_of(name)
                    name = known_name or name
                eid = f"{year}-{slug(name)}"
                ev = events.setdefault(eid, {"id": eid, "name": name, "year": year, "date": ri[0] if ri else f"{year}-01-01",
                                             "date_known": bool(ri), "hill": hill, "place": ri[1] if ri else None,
                                             "sources": [f"{SITE}/rankings/{year}-rankings/"], "titles": [], "notes": [], "races": []})
                if col_name not in ev["titles"]:
                    ev["titles"].append(col_name)
                if not ri and not ev["notes"]:
                    ev["notes"].append(f"not on {SITE}/races/{year}/: date and country unknown")
                add_race(ev, race_name(kind), kind, "bracket", f"{src} / {col_name}", results)
    for ev in events.values():
        ev["needs_manual"] = not ev["races"]
    return events


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "refetch":
        shutil.rmtree(CACHE, ignore_errors=True)
    write(build(fetch=cmd in ("fetch", "refetch")), OUT)
