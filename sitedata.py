"""Build the data the site reads (data/site/, data/riders/, data/races.json, data/summary.json)
from the events in data/ndsf/ (ndsf.py) and data/manual/ (hand-written, same shape; a manual
file replaces the automatic one with the same name).

  python3 sitedata.py          write everything
  python3 sitedata.py names    list names that may be the same rider spelt differently

Riders are matched on their name: the same words in any order, folded to ASCII, so
"Patricksson Henning" and "Henning Patricksson" are one rider. Other spellings are joined
by hand in data/riders.json ("aliases"), which also holds every rider's id ("r12"); ids
are given in order of first appearance and never change. Sex is only known for riders who
have placed in a women's race (K); everyone else is null, never guessed from the name.

Head-to-head: in every race two riders both rode, the better place wins; a DNF loses to
everyone placed and draws with another DNF. Timed races (qualifying, time trials) also
give the gap in seconds and percent. No network.
"""
import json
import os
import re
import statistics
import sys
from collections import Counter, defaultdict

from ndsf import fold, slug

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
REGISTRY = os.path.join(DATA, "riders.json")
SHARDS = 16
MIN_RACES = 3  # to be called a rival
MAX_LIST = 10
CONTACT = "peder@holterman.no"
KINDS = ["Open", "Women", "Junior", "Masters", "Luge", "Adaptive", "Inline", "Other"]
RATED_KINDS = {"Open", "Women", "Junior", "Masters"}  # stand-up longboard; luge, adaptive and inline are other disciplines
POOLS = {"race": "bracket", "kvalik": "timed"}  # rating pool -> race format
ELO_START, ELO_K_NEW, ELO_K, ELO_NEW = 1500, 40, 24, 8  # K for the rider's first ELO_NEW races in a pool, then K
MIN_RATED, MIN_SEASON, ACTIVE_YEARS, TOP_N = 5, 3, 2, 25
HILL_MIN = 3  # races on a hill before a rider is listed in the hill's own rating


def dump(path, obj, indent=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":") if indent is None else None, indent=indent)


SOURCES = ["igsa", "idf", "wdsc", "ndsf", "manual"]  # data/<folder>/; a later folder wins over an earlier one


def load_events():
    """Every event. The same event in several folders (a Norwegian race the IGSA or IDF also ranked) is the
    one from the folder latest in SOURCES that has any races: ndsf.no over the international bodies, a
    hand-written file over everything."""
    events = {}
    for folder in SOURCES:
        d = os.path.join(DATA, folder)
        if not os.path.isdir(d):
            continue
        for fn in sorted(os.listdir(d)):
            if fn.endswith(".json"):
                with open(os.path.join(d, fn), encoding="utf-8") as f:
                    ev = json.load(f)
                if ev["races"] or ev["id"] not in events:
                    ev["_source"] = folder
                    events[ev["id"]] = ev
    return sorted(events.values(), key=lambda e: (e["date"], e["id"]))


NORWAY = re.compile(r"^(nor|norway|norge)$|,\s*norway$|norge$", re.I)


def in_norway(ev):
    """A race run in Norway: from ndsf.no or a hand-written file, on one of our hills, or placed in Norway."""
    return ev.get("_source") in ("ndsf", "manual") or bool(ev.get("hill")) or bool(NORWAY.search((ev.get("place") or "").strip()))


def norwegians(races, reg):
    """The riders in the Norway view: a Norwegian nationality in any list, or at least half of the rider's
    races run in Norway (the Norwegian lists give no nationality, so that is as close as we get; a visiting
    pro with one start at Lillehammer stays out, a Swede who only races here is in). "norsk": true or
    false on the rider in data/riders.json overrides."""
    no, home, total = set(), Counter(), Counter()
    for r in races:
        for y in r["rows"]:
            total[y[0]] += 1
            home[y[0]] += r["norway"]
            if NORWAY.match((y[5] or "").strip()):
                no.add(y[0])
    no |= {rid for rid in total if home[rid] * 2 >= total[rid]}
    for rid, r in reg.riders.items():
        if "norsk" in r:
            (no.add if r["norsk"] else no.discard)(rid)
    return no


# ---------------------------------------------------------------- riders

def name_key(name):
    return " ".join(sorted(fold(name).replace(".", " ").replace("-", " ").split()))


class Registry:
    """data/riders.json: id -> {name, aliases}. Stable ids, hand-kept aliases."""

    def __init__(self):
        try:
            with open(REGISTRY, encoding="utf-8") as f:
                self.riders = json.load(f)["riders"]
        except (OSError, ValueError):
            self.riders = {}
        self.by_key = {}
        self.spellings = defaultdict(Counter)
        # A rider is found by the first or last word of any spelling, give or take a letter: the index maps
        # every such word and every one-letter-shorter form of it to the riders (so a typo, a letter added
        # or dropped, or two letters swapped still meet on a shared key). Thousands of riders make the
        # pairwise search below far too slow without it.
        self.index = defaultdict(set)
        for rid, r in self.riders.items():
            for n in [r["name"]] + r.get("aliases", []):
                self.by_key[name_key(n)] = rid
                self._index(rid, n)

    def _index(self, rid, spelled):
        t = _toks(spelled)
        if t:
            for key in _keys(t[0]) | _keys(t[-1]):
                self.index[key].add(rid)

    def candidates(self, name):
        """The riders whose first or last word is within a letter of this name's first or last word."""
        t = _toks(name)
        if not t:
            return set()
        return set().union(*(self.index.get(k, set()) for k in _keys(t[0]) | _keys(t[-1])))

    def id_for(self, name):
        k = name_key(name)
        rid = self.by_key.get(k) or self.same_person(name)
        if not rid:
            rid = f"r{1 + max((int(x[1:]) for x in self.riders), default=0)}"
            self.riders[rid] = {"name": name, "aliases": []}
        self.by_key[k] = rid
        self.spellings[rid][name.strip()] += 1
        self._index(rid, name)
        return rid

    def same_person(self, name, only=None):
        """A rider already registered under a spelling this name is a variant of: the same words with a
        typo in one or two of them (Jørundland / Jørunland), the same name with a middle name or initial
        added, dropped or abbreviated (Trygve Jørundland / Trygve Flebu Jørundland / Trygve F. Jørundland),
        in any order (Coward Gorgus / Gorgus T Coward). Two different people can share a name, so this is
        only a start; "aliases" in data/riders.json is the authority."""
        toks = _toks(name)
        if len(toks) < 2:
            return None
        for rid in sorted({only} if only else self.candidates(name), key=lambda x: int(x[1:])):
            r = self.riders.get(rid)
            if r is None:
                continue
            for spelled in [r["name"]] + r.get("aliases", []) + list(self.spellings[rid]):
                t = _toks(spelled)
                if len(t) < 2:
                    continue
                for short, long in ((toks, t), (t, toks)):
                    # First and last name must both be there (in either order): "Pål Erik" alone is not
                    # "Pål Erik Lystad", it could as well be "Pål Eirik Svanevik".
                    ends = _close(short[0], long[0]) and _close(short[-1], long[-1]) or \
                        _close(short[0], long[-1]) and _close(short[-1], long[0])
                    if ends and all(_in(x, long) for x in short) and sum(_in(x, long) == 2 for x in short) >= 2:
                        return rid
        return None

    def consolidate(self):
        """Second pass: two riders registered apart because the joining spelling came later ("Einbu Erland"
        in 2012, "Erland Lien" in 2013, "Erland Lien Einbu" in 2014) are one rider. Returns {old id: kept id}."""
        moved = {}
        num = lambda x: int(x[1:])

        def merge(b, a):
            moved[b] = a
            self.spellings[a].update(self.spellings[b])
            for sp in self.spellings[b]:
                self._index(a, sp)
            self.riders[a]["aliases"] = sorted(set(self.riders[a].get("aliases", [])) | {self.riders[b]["name"]} | set(self.riders[b].get("aliases", [])))
            del self.riders[b]

        for b in sorted(self.riders, key=num):
            if b in moved:
                continue
            hits = {a for sp in self.spellings[b] for a in self.candidates(sp) if a in self.riders and num(a) < num(b)}
            for a in sorted(hits, key=num):
                if any(self.same_person(sp, only=a) for sp in self.spellings[b]):
                    merge(b, a)
                    break
        # A name cut short ("Roy Helge", "Sander Viste") is the one rider whose name starts that way.
        for b in sorted(self.riders, key=num):
            if b in moved:
                continue
            t = _toks(self.riders[b]["name"])
            hits = {a for a in self.index.get(t[0], ()) if a != b and a in self.riders and any(
                len(ft) > len(t) and ft[:len(t)] == t for ft in (_toks(sp) for sp in self.spellings[a]))} if t else set()
            if len(hits) == 1 and len(t) >= 2:
                merge(b, hits.pop())
        self.by_key = {k: moved.get(rid, rid) for k, rid in self.by_key.items()}
        return moved

    def display(self, rid):
        """The name as written most often; a hand-set name in the registry wins."""
        r = self.riders[rid]
        if r.get("fixed"):
            return r["name"]
        return self.spellings[rid].most_common(1)[0][0] if self.spellings[rid] else r["name"]

    def save(self):
        for rid, r in self.riders.items():
            if not r.get("fixed") and self.spellings[rid]:
                r["name"] = self.display(rid)
        dump(REGISTRY, {"_help": "Rider ids for the site. Add other spellings of a name to \"aliases\" to merge "
                                 "riders; set \"fixed\": true to keep \"name\" as written here; set \"norsk\": true or false "
                                 "to put a rider in the Norway view or out of it, whatever the lists say.",
                        "riders": dict(sorted(self.riders.items(), key=lambda kv: int(kv[0][1:])))}, indent=1)

    def suspects(self):
        """Pairs of riders that may be the same person: same first word and similar last word, or one
        name inside the other."""
        ids = sorted(self.riders, key=lambda x: int(x[1:]))
        toks = {rid: fold(self.display(rid)).split() for rid in ids}
        out = []
        for i, a in enumerate(ids):
            for b in ids[i + 1:]:
                ta, tb = toks[a], toks[b]
                if not ta or not tb:
                    continue
                if ta[0] == tb[0] and (ta[-1][:4] == tb[-1][:4] or _close(ta[-1], tb[-1])):
                    out.append((a, b))
                elif set(ta) < set(tb) or set(tb) < set(ta):
                    out.append((a, b))
                elif len(ta) == len(tb) and sum(_close(x, y) for x, y in zip(ta, tb)) == len(ta):
                    out.append((a, b))
        return out


def _toks(name):
    return fold(name).replace(".", "").replace("-", " ").split()


def _keys(tok):
    """The index keys of a word: itself and every form one letter shorter. Two words within an edit of each
    other (a typo, a letter more or less, two letters swapped) share at least one."""
    return {tok} | {tok[:i] + tok[i + 1:] for i in range(len(tok))}


def _in(tok, toks):
    """2 when a word (or a one-letter typo of it) is among toks, 1 when it is an initial or short form of
    one (D. or Kr. for Drageset or Kristian), else 0."""
    if any(_close(tok, x) for x in toks):
        return 2
    return 1 if len(tok) <= 2 and any(x.startswith(tok) for x in toks) else 0


def _close(a, b):
    """Edit distance at most 1 (typos: Jørundland / Jørunland, Bratset / Brattset)."""
    if a == b:
        return True
    if abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        diff = [i for i, (x, y) in enumerate(zip(a, b)) if x != y]
        return len(diff) == 1 or (len(diff) == 2 and diff[1] == diff[0] + 1 and a[diff[0]] == b[diff[1]] and a[diff[1]] == b[diff[0]])
    s, l = (a, b) if len(a) < len(b) else (b, a)
    for i in range(len(l)):
        if l[:i] + l[i + 1:] == s:
            return True
    return False


# ---------------------------------------------------------------- races and head-to-head

def races_of(events, reg):
    """One record per race: who placed where. Rows: [rid, name, place, time, dnf, nat]."""
    out = []
    for ev in events:
        # A name cut short in one list ("Odin", "Sander Viste") is the rider whose name starts that way in
        # the event's other lists, when there is exactly one.
        full = {}
        for r in ev["races"]:
            for x in r["results"]:
                t = _toks(x["name"])
                if len(t) > 1:
                    full[tuple(t)] = reg.id_for(x["name"])
        def cut(t):
            hits = {rid for ft, rid in full.items() if len(ft) > len(t) and ft[:len(t)] == tuple(t)}
            return next(iter(hits)) if len(hits) == 1 else None
        for i, r in enumerate(ev["races"]):
            rows = []
            for x in r["results"]:
                if x.get("dns"):
                    continue  # did not start: not part of the field
                t = _toks(x["name"])
                rid = (cut(t) if tuple(t) not in full else None) or reg.id_for(x["name"])
                if any(y[0] == rid for y in rows):
                    continue
                rows.append([rid, x["name"], None if x.get("dnf") else x["place"], x.get("time"), bool(x.get("dnf")), x.get("nat")])
            placed = [y for y in rows if y[2] is not None]
            placed.sort(key=lambda y: y[2])
            rid_ = f"{ev['id']}/{slug(r['name'])}"
            while any(x["id"] == rid_ for x in out):
                rid_ += "-2"
            out.append({
                "id": rid_, "event": ev["id"], "name": ev["name"], "cls": r["name"], "type": r["kind"],
                "format": r["format"], "date": ev["date"], "date_known": ev.get("date_known", True), "hill": ev.get("hill"),
                "norway": in_norway(ev), "url": (ev.get("sources") or [""])[0], "rows": placed + [y for y in rows if y[2] is None],
            })
    return out


def sexes(races):
    return {y[0]: "K" for r in races if r["type"] == "Women" for y in r["rows"]}


def women_place(race, rid, sex):
    """Place among the women in a race that is not a women's race, or None."""
    if race["type"] == "Women" or sex.get(rid) != "K":
        return None
    w = [y for y in race["rows"] if sex.get(y[0]) == "K"]
    placed = [y for y in w if y[2] is not None]
    me = next(y for y in w if y[0] == rid)
    if me[2] is None:
        return None
    return placed.index(me) + 1, len(w)


def meeting(race, me, other):
    """One head-to-head: result (w/l/d), gap in s and %, places between (positive = they were ahead)."""
    p, q = me[2], other[2]
    if p is None and q is None:
        return "d", None, None, None
    if q is None:
        return "w", None, None, None
    if p is None:
        return "l", None, None, None
    res = "w" if p < q else "l" if p > q else "d"
    gs = gp = None
    if me[3] and other[3]:
        gs = round(me[3] - other[3], 2)
        gp = round(100 * gs / other[3], 1)
    places = q - p  # positive: I was ahead, by this many places
    return res, gs, gp, -places if places else None


def build_rider(rid, mine, sex, reg, no):
    """A rider's profile: every result, head-to-head with everyone met, rivals and insights."""
    results, opps = [], {}
    for race in mine:
        me = next(y for y in race["rows"] if y[0] == rid)
        placed = [y for y in race["rows"] if y[2] is not None]
        # A bye in a bracket leaves a gap in the places (1-6 and 8): the field is at least the last place.
        field = max(len(race["rows"]), max((y[2] for y in placed), default=0))
        winner = placed[0] if placed else None
        beaten = (field - me[2]) / (field - 1) * 100 if me[2] and field > 1 else (100.0 if me[2] == 1 else None)
        behind = round(100 * (me[3] / winner[3] - 1), 1) if me[3] and winner and winner[3] and me[2] else None
        r = {"race_id": race["id"], "race": race["name"], "cls": race["cls"], "type": race["type"], "format": race["format"],
             "date": race["date"], "place": me[2], "field": field, "beaten_pct": round(beaten, 1) if beaten is not None else None,
             "time": me[3], "winner": winner[3] if winner else None, "behind_pct": behind, "link": race["url"], "hill": race["hill"]}
        wp = women_place(race, rid, sex)
        if wp:
            r["women_place"], r["women_field"] = wp
        results.append(r)
        for other in race["rows"]:
            if other[0] == rid:
                continue
            res, gs, gp, pl = meeting(race, me, other)
            o = opps.setdefault(other[0], {"id": other[0], "name": reg.display(other[0]), "sex": sex.get(other[0]), "no": other[0] in no, "ms": []})
            o["ms"].append([race["name"], race["date"], race["type"], res, gs, gp, pl, race["cls"], race["cls"], 1])
    for o in opps.values():
        o["w"] = sum(m[3] == "w" for m in o["ms"])
        o["l"] = sum(m[3] == "l" for m in o["ms"])
        pls = [m[6] for m in o["ms"] if m[6] is not None]
        o["med"] = statistics.median(pls) if pls else None  # median places between (negative = I was ahead)
    return results, opps


def rivals(opps, key=lambda o: o["ms"]):
    """Met at least MIN_RACES times, closest first: few places between and an even record."""
    rs = []
    for o in opps.values():
        ms = key(o)
        pls = [abs(m[6]) for m in ms if m[6] is not None]
        if len(ms) >= MIN_RACES and pls:
            w, l = sum(m[3] == "w" for m in ms), sum(m[3] == "l" for m in ms)
            rs.append((statistics.median(pls) + 3 * abs(w - l) / len(ms), o["id"]))
    return [rid for _, rid in sorted(rs)]


def who(o, **extra):
    return {"id": o["id"], "name": o["name"], **extra}


def insights(opps):
    out = {"rivals_by_type": {}}
    for kind in KINDS:
        ranked = rivals(opps, lambda o, k=kind: [m for m in o["ms"] if m[2] == k])[:MAX_LIST]
        if ranked:
            out["rivals_by_type"][kind] = [who(opps[rid], races=sum(m[2] == kind for m in opps[rid]["ms"]),
                                              wins=sum(m[2] == kind and m[3] == "w" for m in opps[rid]["ms"]),
                                              losses=sum(m[2] == kind and m[3] == "l" for m in opps[rid]["ms"]))
                                          for rid in ranked]
    level = [o for o in opps.values() if len(o["ms"]) >= MIN_RACES and o["med"] is not None and abs(o["med"]) <= 3]
    pick = lambda key: [who(o, races=len(o["ms"]), wins=o["w"], losses=o["l"]) for o in sorted(level, key=key)[:5]]
    out["nemesis"] = pick(lambda o: (-o["l"] / len(o["ms"]), -o["l"]))
    out["victims"] = pick(lambda o: (-o["w"] / len(o["ms"]), -o["w"]))
    out["specialists"], out["overtaken"] = [], []
    for o in opps.values():
        by = defaultdict(list)
        for m in o["ms"]:
            by[m[2]].append(m[3])
        strong = [t for t, rs in by.items() if len(rs) >= 2 and all(r == "l" for r in rs)]
        weak = [t for t, rs in by.items() if len(rs) >= 2 and all(r == "w" for r in rs)]
        if strong and weak:
            out["specialists"].append(who(o, stronger_than_you_in=strong, weaker_than_you_in=weak))
        by = defaultdict(list)
        for m in o["ms"]:
            by[m[1][:4]].append(m[3])
        ys = sorted(by)
        for a, b in zip(ys, ys[1:]):
            if len(by[a]) >= 2 and len(by[b]) >= 2 and set(by[a]) == {"l"} and set(by[b]) == {"w"}:
                out["overtaken"].append(who(o, lost_in=a, beat_in=b, races=len(by[a]) + len(by[b])))
    ahead = []
    for o in opps.values():
        n = sum(1 <= (m[6] or 0) <= 3 for m in o["ms"])
        behind = sum(-3 <= (m[6] or 0) <= -1 for m in o["ms"])
        if n + behind >= 2:
            ahead.append(who(o, right_ahead=n, right_behind=behind, races=len(o["ms"])))
    out["right_ahead"] = sorted(ahead, key=lambda a: (-a["right_ahead"], a["right_behind"]))[:MAX_LIST]
    out["right_behind"] = sorted(ahead, key=lambda a: (-a["right_behind"], a["right_ahead"]))[:MAX_LIST]
    out["specialists"] = out["specialists"][:MAX_LIST]
    out["overtaken"] = sorted(out["overtaken"], key=lambda o: -o["races"])[:MAX_LIST]
    return out


# ---------------------------------------------------------------- rating

def ratings(races, reg, index_ids, no):
    """Elo per pool (POOLS: heats and timed runs apart), over the stand-up classes (RATED_KINDS). A race is every
    pair of riders in it: the better place wins, a DNF loses to everyone placed and draws with another DNF. A
    rider's score is the share of those pairs won, the expected share is the mean Elo expectation against each,
    and the rating moves K times the difference. Everyone starts at ELO_START; K is higher for a rider's first
    races so newcomers settle fast. Ratings never decay: "now" is the rating of riders who raced in the last
    ACTIVE_YEARS seasons, "peak" the highest rating ever held, and "seasons" the top at the end of each season
    among those who raced it. The same lists restricted to the Norway view (no) end in _no; the ratings
    themselves are the same, everyone raced everyone. "timeline" is the rating after every race for the riders
    on those lists, for the chart. Returns (summary per pool, per rider per pool, per rider the rating after
    each race)."""
    page = lambda rid: {"id": rid, "name": reg.display(rid), "page": rid in index_ids}
    out, per_rider, per_race = {}, defaultdict(dict), defaultdict(dict)
    for pool, fmt in POOLS.items():
        rating, n, peak, last, seasons = {}, Counter(), {}, {}, []
        pool_races = rated(races, fmt)
        years = sorted({r["date"][:4] for r in pool_races})
        history = defaultdict(list)  # rid -> [(race index, rating after)]
        for i, r in enumerate(pool_races):
            for rid, d in elo_step(r, rating, n).items():
                last[rid] = r["date"]
                if rating[rid] > peak.get(rid, (0, ""))[0]:
                    peak[rid] = (rating[rid], r["date"][:4])
                history[rid].append((i, round(rating[rid])))
                per_race[rid][r["id"]] = [round(rating[rid]), round(d)]
            year = r["date"][:4]
            if i + 1 == len(pool_races) or pool_races[i + 1]["date"][:4] != year:
                raced = {y[0] for x in pool_races[:i + 1] if x["date"][:4] == year for y in x["rows"]}
                ranked = sorted((rid for rid in raced if n[rid] >= MIN_SEASON), key=lambda rid: -rating[rid])
                top, top_no = ranked[:5], [rid for rid in ranked if rid in no][:5]
                if top:
                    seasons.append({"year": int(year), "top": [dict(page(rid), rating=round(rating[rid]), races=n[rid]) for rid in top],
                                    "top_no": [dict(page(rid), rating=round(rating[rid]), races=n[rid]) for rid in top_no]})
        row = lambda rid: dict(page(rid), rating=round(rating[rid]), peak=round(peak[rid][0]), peak_year=int(peak[rid][1]),
                               races=n[rid], last=int(last[rid][:4]))
        active = [rid for rid in rating if n[rid] >= MIN_RATED and int(last[rid][:4]) >= int(years[-1]) - ACTIVE_YEARS + 1] if years else []
        now = sorted(active, key=lambda rid: -rating[rid])
        best = sorted((rid for rid in rating if n[rid] >= MIN_RATED), key=lambda rid: -peak[rid][0])
        now_no, best_no = [rid for rid in now if rid in no], [rid for rid in best if rid in no]
        # The chart: every race the listed riders rode, numbered afresh, and each rider's rating after each of them.
        charted = list(dict.fromkeys(now[:TOP_N] + best[:TOP_N] + now_no[:TOP_N] + best_no[:TOP_N]))
        used = sorted({i for rid in charted for i, _ in history[rid]})
        renum = {i: k for k, i in enumerate(used)}
        timeline = {"races": [[pool_races[i]["id"], pool_races[i]["name"], pool_races[i]["date"], pool_races[i]["cls"]] for i in used],
                    "riders": {rid: [[renum[i], x] for i, x in history[rid]] for rid in charted}}
        out[pool] = {"races": len(pool_races), "riders": len(rating), "since": int(years[0]) if years else None, "until": int(years[-1]) if years else None,
                     "min_races": MIN_RATED, "active_years": ACTIVE_YEARS,
                     "now": [row(rid) for rid in now[:TOP_N]], "peak": [row(rid) for rid in best[:TOP_N]], "seasons": seasons[::-1],
                     "now_no": [row(rid) for rid in now_no[:TOP_N]], "peak_no": [row(rid) for rid in best_no[:TOP_N]], "timeline": timeline}
        rank_now = {rid: i + 1 for i, rid in enumerate(now)}
        rank_no = {rid: i + 1 for i, rid in enumerate(now_no)}
        for rid in rating:
            per_rider[rid][pool] = {"rating": round(rating[rid]), "peak": round(peak[rid][0]), "peak_year": int(peak[rid][1]),
                                    "races": n[rid], "rank": rank_now.get(rid), "of": len(now), "rank_no": rank_no.get(rid), "of_no": len(now_no)}
    return out, per_rider, per_race


def rated(races, fmt):
    """The races that count in a pool: this format, a stand-up class, more than one rider."""
    return [r for r in races if r["format"] == fmt and r["type"] in RATED_KINDS and len(r["rows"]) > 1]


def elo_step(r, rating, n):
    """One race into the ratings (in place; newcomers start at ELO_START). Returns {rid: change}."""
    rows = r["rows"]
    for y in rows:
        rating.setdefault(y[0], ELO_START)
    delta = {}
    for me in rows:
        s = e = 0.0
        for other in rows:
            if other is me:
                continue
            s += {"w": 1.0, "l": 0.0, "d": 0.5}[meeting(r, me, other)[0]]
            e += 1 / (1 + 10 ** ((rating[other[0]] - rating[me[0]]) / 400))
        k = ELO_K_NEW if n[me[0]] < ELO_NEW else ELO_K
        delta[me[0]] = k * (s - e) / (len(rows) - 1)
    for rid, d in delta.items():
        rating[rid] += d
        n[rid] += 1
    return delta


def hill_ratings(races, reg, index_ids):
    """Who is best on each hill: the same Elo, per pool, run over that hill's races alone, so only what
    happened there counts. Riders with at least HILL_MIN races on the hill, best first; no activity window,
    hills are raced too seldom for one. {hill: {pool: {races, riders, min_races, top}}}."""
    page = lambda rid: {"id": rid, "name": reg.display(rid), "page": rid in index_ids}
    out = defaultdict(dict)
    for pool, fmt in POOLS.items():
        by_hill = defaultdict(list)
        for r in rated(races, fmt):
            if r["hill"]:
                by_hill[r["hill"]].append(r)
        for hill, rs in by_hill.items():
            rating, n, peak, last = {}, Counter(), {}, {}
            for r in rs:
                for rid in elo_step(r, rating, n):
                    last[rid] = r["date"]
                    if rating[rid] > peak.get(rid, (0, ""))[0]:
                        peak[rid] = (rating[rid], r["date"][:4])
            top = sorted((rid for rid in rating if n[rid] >= HILL_MIN), key=lambda rid: -rating[rid])[:TOP_N]
            out[hill][pool] = {"races": len(rs), "riders": len(rating), "min_races": HILL_MIN,
                               "top": [dict(page(rid), rating=round(rating[rid]), peak=round(peak[rid][0]), peak_year=int(peak[rid][1]),
                                            races=n[rid], last=int(last[rid][:4])) for rid in top]}
    return dict(out)


# ---------------------------------------------------------------- output

def shard_of(rid):
    return f"{int(rid[1:]) % SHARDS:02}"


def summary(races, index_ids, reg, sex, rating, hill_rating, no):
    """data/summary.json: the front page and its top lists, for everything and ("no") for the Norway view:
    the races in Norway and the riders in the view."""
    page = lambda rid: {"id": rid, "name": reg.display(rid), "page": rid in index_ids}
    everyone = {y[0] for r in races for y in r["rows"]}
    out = {
        "events": len({r["event"] for r in races}), "races": len(races), "results": sum(len(r["rows"]) for r in races), "riders": len(everyone),
        "years": sorted({int(r["date"][:4]) for r in races}),
        **highlights(races, races, everyone, page, reg, sex),
        "rating": rating, "hill_rating": hill_rating,
    }
    home = [r for r in races if r["norway"]]
    out["no"] = {"events": len({r["event"] for r in home}), "races": len(home), "results": sum(len(r["rows"]) for r in home),
                 "riders": len(no & everyone), **highlights(home, races, no, page, reg, sex)}
    return out


def highlights(event_races, races, riders, page, reg, sex):
    """The front page's lists and records: the latest Open heat races, the biggest fields and the closest
    timed races among event_races; most wins and most races among riders, counted over every race."""
    count = Counter(y[0] for r in races for y in r["rows"] if y[0] in riders)
    recent = []
    seen_events = []
    for r in sorted(event_races, key=lambda r: r["date"], reverse=True):
        if r["event"] in seen_events or r["type"] != "Open" or r["format"] != "bracket":
            continue
        seen_events.append(r["event"])
        w = r["rows"][0] if r["rows"] and r["rows"][0][2] else None
        # Best woman: the winner of the same event's women's class if there is one,
        # else the best-placed woman in the Open bracket.
        damer = next((d for d in races if d["event"] == r["event"] and d["type"] == "Women" and d["rows"] and d["rows"][0][2]), None)
        women = [y for y in r["rows"] if sex.get(y[0]) == "K" and y[2]]
        best_w = damer["rows"][0][0] if damer else women[0][0] if women else None
        recent.append({"id": r["id"], "name": r["name"], "cls": r["cls"], "date": r["date"], "date_known": r["date_known"], "type": r["type"],
                       "finishers": sum(1 for y in r["rows"] if y[2]), "fastest": page(w[0]) if w else None,
                       "fastest_women": page(best_w) if best_w else None})
        if len(recent) == 4:
            break
    race = lambda r: {"id": r["id"], "name": f"{r['name']} {r['date'][:4]}", "cls": r["cls"], "date": r["date"], "type": r["type"]}
    big = sorted(event_races, key=lambda r: (-len(r["rows"]), r["date"]))
    close = []
    for r in event_races:
        t = [y for y in r["rows"] if y[3] and y[2]]
        if r["format"] == "timed" and len(t) > 1 and t[1][3] > t[0][3]:
            close.append((round(t[1][3] - t[0][3], 2), r, t))
    close.sort(key=lambda x: (x[0], x[1]["date"]))
    wins = Counter(r["rows"][0][0] for r in races if r["rows"] and r["rows"][0][2] == 1 and r["format"] == "bracket" and r["rows"][0][0] in riders)
    busiest = sorted(count, key=lambda rid: (-count[rid], reg.display(rid)))[:8]
    out = {
        "recent": recent,
        "biggest": {"name": race(big[0])["name"], "cls": big[0]["cls"], "riders": len(big[0]["rows"])} if big else None,
        "busiest": [dict(page(rid), races=count[rid]) for rid in busiest],
        "top": {
            "biggest": [dict(race(r), riders=len(r["rows"])) for r in big[:25]],
            "closest": [dict(race(r), gap_s=gap, a=page(t[0][0]), b=page(t[1][0])) for gap, r, t in close[:25]],
            "wins": [dict(page(rid), wins=n) for rid, n in wins.most_common(25)],
        },
    }
    if close:
        gap, r, t = close[0]
        out["closest"] = {"name": race(r)["name"], "gap_s": gap, "a": page(t[0][0]), "b": page(t[1][0])}
    if wins:
        rid, n = wins.most_common(1)[0]
        out["most_wins"] = dict(page(rid), wins=n)
    return out


def main():
    reg = Registry()
    events = load_events()
    races = races_of(events, reg)
    if reg.consolidate():
        races = races_of(events, reg)
    sex = sexes(races)
    no = norwegians(races, reg)
    by_rider = defaultdict(list)
    for r in races:
        for y in r["rows"]:
            by_rider[y[0]].append(r)

    # races.json: every list, for the race pages and head-to-head between any two riders.
    dump(os.path.join(DATA, "races.json"), {
        "row_fields": ["rider id", "name", "place (null = DNF)", "time_s (timed races)", "sex (K | null)", "in the Norway view (1 | 0)"],
        "races": [{k: v for k, v in r.items() if k != "rows"} | {"rows": [[y[0], y[1], y[2], y[3], sex.get(y[0]), int(y[0] in no)] for y in r["rows"]]}
                  for r in races]})

    index_ids = set(by_rider)
    rating, rider_rating, per_race = ratings(races, reg, index_ids, no)
    index, shards = [], defaultdict(dict)
    for rid, mine in by_rider.items():
        results, opps = build_rider(rid, mine, sex, reg, no)
        for r in results:  # the rating after this race and what it moved, on the rated ones
            if r["race_id"] in per_race[rid]:
                r["elo"], r["elo_d"] = per_race[rid][r["race_id"]]
        ranked = rivals(opps)
        ins = insights(opps)
        named = set(ranked) | {x["id"] for v in ins.values() if isinstance(v, list) for x in v} \
            | {x["id"] for v in ins["rivals_by_type"].values() for x in v}
        entry = {"id": rid, "name": reg.display(rid), "club": "", "races": len(mine), "shard": shard_of(rid), "sex": sex.get(rid),
                 "wins": sum(1 for r in results if r["place"] == 1 and r["format"] == "bracket"), "no": rid in no}
        index.append(entry)
        obj = {"id": rid, "name": entry["name"], "club": "", "sex": sex.get(rid), "no": rid in no, "results": sorted(results, key=lambda r: r["date"]),
               "rivals": ranked, "insights": ins, "rating": rider_rating.get(rid, {}),
               "opponents": [[o["id"], o["name"], "", o["w"], o["l"], o["med"], o["ms"], o["sex"], int(o["no"])]
                             for o in opps.values() if len(o["ms"]) >= 2 or o["id"] in named],
               "record": {"opponents": len(opps), "wins": sum(o["w"] for o in opps.values()), "losses": sum(o["l"] for o in opps.values())}}
        if sex.get(rid) == "K":
            obj["rivals_women"] = [x for x in ranked if sex.get(x) == "K"]
        shards[entry["shard"]][rid] = obj
    index.sort(key=lambda r: (-r["races"], r["name"]))
    riders_dir = os.path.join(DATA, "riders")
    os.makedirs(riders_dir, exist_ok=True)
    for f in os.listdir(riders_dir):
        os.remove(os.path.join(riders_dir, f))
    dump(os.path.join(riders_dir, "index.json"), index)
    for k, v in shards.items():
        dump(os.path.join(riders_dir, f"shard-{k}.json"), v)

    s = summary(races, index_ids, reg, sex, rating, hill_ratings(races, reg, index_ids), no)
    dump(os.path.join(DATA, "summary.json"), s)
    # site.json: the example rider on the front page is the one with most races, in the Norway view the same among them.
    dump(os.path.join(DATA, "site", "site.json"), {"default_rider": index[0]["id"] if index else None,
                                                   "default_rider_no": next((r["id"] for r in index if r["no"]), None), "profiles": [], "contact": CONTACT})
    reg.save()
    manual = [e["id"] for e in events if e.get("needs_manual")]
    print(f"{len(events)} events, {len(races)} races, {s['results']} results, {len(index)} riders")
    if manual:
        print("needs data/manual/: " + ", ".join(manual))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "names":
        reg = Registry()
        races_of(load_events(), reg)
        for a, b in reg.suspects():
            print(f"{a:>6} {reg.display(a):<32} {b:>6} {reg.display(b)}")
    else:
        main()
