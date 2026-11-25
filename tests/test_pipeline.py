import glob
import json
import os
import re
import sys
import unittest
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import markhills
import ndsf
import sitedata


class PipelineUnitTests(unittest.TestCase):
    def test_secs(self):
        self.assertAlmostEqual(ndsf.secs("2:09.72"), 129.72)
        self.assertAlmostEqual(ndsf.secs("02:08,15"), 128.15)
        self.assertAlmostEqual(ndsf.secs("1.10.5"), 70.5)
        self.assertAlmostEqual(ndsf.secs("17.3"), 17.3)
        self.assertAlmostEqual(ndsf.secs("129.157"), 129.157)
        self.assertAlmostEqual(ndsf.secs("1:03:55"), 63.55)
        self.assertAlmostEqual(ndsf.secs("(01:05.20)"), 65.2)
        self.assertIsNone(ndsf.secs(""))
        self.assertIsNone(ndsf.secs("DNS"))
        self.assertIsNone(ndsf.secs("abc"))

    def test_place_lists_skipped_rows_alignment(self):
        # A skipped note row inside the list must not misalign class_col or taken indices.
        rows = [
            ["Rank", "Name", "Class", "Time"],
            ["1", "Alice Hansen", "Open", "1:01.00"],
            ["2", "Bob Olsen", "Women", "1:02.00"],
            ["", "Mid-table note", "WRONG_CLASS", ""],
            ["3", "Carol Berg", "Open", "1:03.00"],
            ["4", "Dina Lien", "Women", "1:04.00"],
        ]
        found = ndsf.place_lists(rows, "Qualifying")
        by_cls = {cls: [n for _, n, _, _ in res] for cls, res in found}
        self.assertEqual(by_cls["Open"], ["Alice Hansen", "Carol Berg"])
        self.assertEqual(by_cls["Women"], ["Bob Olsen", "Dina Lien"])

    def test_parse_pdf_ignores_points_and_bracket_times(self):
        bracket_pdf = "\n".join([
            "Resultatliste Open",
            "  1   Alice Hansen    250.5   184.7",
            "  2   Bob Olsen       200.25  154.6",
            "  3   Carol Berg      150.0   138.8",
        ])
        parsed = ndsf.parse_pdf(bracket_pdf)
        self.assertEqual(len(parsed), 1)
        _, fmt, rows = parsed[0]
        self.assertEqual(fmt, "bracket")
        self.assertTrue(all(t is None for _, _, t, _ in rows))

        timed_pdf = "\n".join([
            "Kvalifisering Open",
            "  1   Alice Hansen   184.7   1:05.12",
            "  2   Bob Olsen      154.60  1:06.45",
        ])
        parsed_timed = ndsf.parse_pdf(timed_pdf)
        self.assertEqual(len(parsed_timed), 1)
        _, fmt_t, rows_t = parsed_timed[0]
        self.assertEqual(fmt_t, "timed")
        self.assertAlmostEqual(rows_t[0][2], 65.12)
        self.assertAlmostEqual(rows_t[1][2], 66.45)

    def test_parse_sheet_clears_times_on_bracket(self):
        sh = {
            "key": "testkey",
            "title": "Test Event",
            "tabs": [{
                "name": "Resultater",
                "gid": "0",
                "csv": "Plass,Navn,Tid\n1,Alice Hansen,1:02.50\n2,Bob Olsen,1:01.00\n3,Carol Berg,1:03.00\n",
            }],
        }
        races = ndsf.parse_sheet(sh, "Open")
        self.assertEqual(len(races), 1)
        _, _, fmt, _, results = races[0]
        self.assertEqual(fmt, "bracket")
        self.assertTrue(all(t is None for _, _, t, _ in results))

    def test_post_date_validation(self):
        bad = {"title": "Test", "content": "Kjørt 32. juli 2024 i bakken", "date": "2024-08-01"}
        date, known = ndsf.post_date(bad, 2024)
        self.assertEqual((date, known), ("2024-08-01", True))

        good = {"title": "Test", "content": "Kjørt 6. juli 2024 i bakken", "date": "2024-08-01"}
        self.assertEqual(ndsf.post_date(good, 2024), ("2024-07-06", True))

    def test_consolidate_transitive_chain(self):
        reg = object.__new__(sitedata.Registry)
        reg.riders = {
            "r1": {"name": "Erland Lien Einbu", "aliases": []},
            "r2": {"name": "Erland Lien", "aliases": []},
            "r3": {"name": "Erland Lien", "aliases": []},
        }
        reg.next = 4
        reg.known = set()
        reg.by_key = {
            sitedata.name_key("Erland Lien Einbu"): "r1",
            sitedata.name_key("Erland Lien"): "r2",
            sitedata.name_key("Erland L"): "r3",
        }
        reg.spellings = {
            "r1": Counter({"Erland Lien Einbu": 1}),
            "r2": Counter({"Erland Lien": 1}),
            "r3": Counter({"Erland L": 1}),
        }
        reg.index = {}
        for rid, sp_counter in reg.spellings.items():
            for sp in sp_counter:
                for tok in sitedata._toks(sp):
                    for k in sitedata._keys(tok):
                        reg.index.setdefault(k, set()).add(rid)
        reg.lists = sitedata.defaultdict(set)
        # First pass: r3 ("Erland L") merges into r2 ("Erland Lien") via prefix? Wait:
        # Make r3 a spelling variant of r2 (not r1), and r2 a prefix of r1 so pass 1 merges r3->r2
        # and pass 2 merges r2->r1!
        reg.riders["r1"] = {"name": "Ola Nordmann Berg", "aliases": []}
        reg.riders["r2"] = {"name": "Ola Nordmann", "aliases": []}
        reg.riders["r3"] = {"name": "Ola Nordman", "aliases": []}
        reg.by_key = {
            sitedata.name_key("Ola Nordmann Berg"): "r1",
            sitedata.name_key("Ola Nordmann"): "r2",
            sitedata.name_key("Ola Nordman"): "r3",
        }
        reg.spellings = {
            "r1": Counter({"Ola Nordmann Berg": 1}),
            "r2": Counter({"Ola Nordmann": 1}),
            "r3": Counter({"Ola Nordman": 1}),
        }
        reg.index = sitedata.defaultdict(set)
        for rid, sp_counter in reg.spellings.items():
            for sp in sp_counter:
                reg._index(rid, sp)

        moved = reg.consolidate()
        self.assertEqual(moved.get("r2"), "r1")
        self.assertEqual(moved.get("r3"), "r1")
        self.assertEqual(set(reg.riders.keys()), {"r1"})
        for k, rid in reg.by_key.items():
            self.assertIn(rid, reg.riders, f"by_key[{k!r}] points to deleted rider {rid}")

    def test_elo_step(self):
        race = {
            "format": "bracket",
            "rows": [
                ["r1", "Winner", 1, None, False, None],
                ["r2", "Second", 2, None, False, None],
                ["r3", "DNFer", None, None, True, None],
                ["r4", "DNFer2", None, None, True, None],
            ],
        }
        rating = {}
        n = Counter()
        delta = sitedata.elo_step(race, rating, n)
        self.assertAlmostEqual(sum(delta.values()), 0.0, places=6)
        self.assertGreater(delta["r1"], delta["r2"])
        self.assertGreater(delta["r2"], delta["r3"])
        self.assertAlmostEqual(delta["r3"], delta["r4"], places=6)
        self.assertEqual(all(n[rid] == 1 for rid in ("r1", "r2", "r3", "r4")), True)

    def test_markhills_validation(self):
        self.assertTrue(markhills._valid_point([59.91, 10.75]))
        self.assertFalse(markhills._valid_point([91.0, 10.75]))
        self.assertFalse(markhills._valid_point([59.91, 181.0]))
        self.assertFalse(markhills._valid_point([True, 10.75]))
        self.assertFalse(markhills._valid_point([float("nan"), 10.75]))
        self.assertFalse(markhills._valid_point("59.91,10.75"))
        self.assertTrue(markhills._local_request({"Host": "localhost:8765", "Origin": "http://localhost:8765"}))
        self.assertTrue(markhills._local_request({"Host": "127.0.0.1:8765"}))
        self.assertFalse(markhills._local_request({"Host": "localhost:8765", "Origin": "https://evil.example"}))
        self.assertFalse(markhills._local_request({"Host": "evil.example"}))


class LiveDataInvariantTests(unittest.TestCase):
    def test_data_invariants(self):
        data_dir = os.path.join(ROOT, "data")
        with open(os.path.join(data_dir, "races.json"), encoding="utf-8") as f:
            races = json.load(f)["races"]
        with open(os.path.join(data_dir, "riders", "index.json"), encoding="utf-8") as f:
            index = json.load(f)
        with open(os.path.join(data_dir, "riders.json"), encoding="utf-8") as f:
            registry = json.load(f)["riders"]

        # Zero 0-row races and zero times on bracket races
        for r in races:
            self.assertGreater(len(r["rows"]), 0, f"0-row race: {r['id']}")
            if r["format"] == "bracket":
                for row in r["rows"]:
                    self.assertIsNone(row[3], f"bracket race has time: {r['id']} {row}")

        # Registry has no unused riders
        used_ids = {row[0] for r in races for row in r["rows"]}
        unused = set(registry) - used_ids
        self.assertEqual(unused, set(), f"unused riders in data/riders.json: {unused}")

        # index.json <-> data/riders/r*.json consistency + no negative behind_pct / bracket times
        index_by_id = {r["id"]: r for r in index}
        rider_files = glob.glob(os.path.join(data_dir, "riders", "r*.json"))
        file_ids = {os.path.basename(p)[:-5] for p in rider_files}
        self.assertEqual(set(index_by_id), file_ids)

        for p in rider_files:
            with open(p, encoding="utf-8") as f:
                prof = json.load(f)
            rid = prof["id"]
            entry = index_by_id[rid]
            self.assertEqual(entry["races"], len(prof["results"]), f"race count mismatch for {rid}")
            wins = sum(1 for r in prof["results"] if r["place"] == 1 and r["format"] == "bracket")
            self.assertEqual(entry["wins"], wins, f"wins mismatch for {rid}")
            opp_ids = {o[0] for o in prof.get("opponents", [])}
            for rival_id in prof.get("rivals", []):
                self.assertIn(rival_id, opp_ids, f"{rid}: rival {rival_id} missing from opponents")
            for rival_id in prof.get("rivals_women", []):
                self.assertIn(rival_id, opp_ids, f"{rid}: women rival {rival_id} missing from opponents")
            for r in prof["results"]:
                if r.get("behind_pct") is not None:
                    self.assertGreaterEqual(r["behind_pct"], 0, f"negative behind_pct: {rid} {r['race_id']}")
                if r["format"] == "bracket":
                    self.assertIsNone(r["time"], f"bracket time on rider profile: {rid} {r['race_id']}")
                    self.assertIsNone(r["behind_pct"], f"bracket behind_pct on rider profile: {rid} {r['race_id']}")

        # cache/ndsf/posts.json should contain only result-category posts and zero emails
        posts_path = os.path.join(ROOT, "cache", "ndsf", "posts.json")
        if os.path.exists(posts_path):
            with open(posts_path, encoding="utf-8") as f:
                posts = json.load(f)
            email_re = re.compile(r"[\w.-]+@[\w.-]+\.\w+")
            self.assertEqual(email_re.findall(json.dumps(posts)), [])
            for post in posts:
                cats = post.get("categories", [])
                self.assertTrue(
                    ndsf.RESULTS_CAT in cats or any(c in ndsf.YEAR_CATS for c in cats),
                    f"non-result post in cache/ndsf/posts.json: {post.get('id')}",
                )


if __name__ == "__main__":
    unittest.main()
