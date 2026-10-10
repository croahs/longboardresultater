// Copies the JSON the site reads into public/data before dev/build:
//   ../data/site/*       (sitedata.py: site.json)
//   ../data/riders/*     (sitedata.py: search index + every rider, in shards)
//   ../data/races.json   (sitedata.py: every result list)
//   ../data/summary.json (sitedata.py: front page numbers and top lists)
//   ../data/videos.json  (hand-kept: riders' YouTube channels and race videos)
//   ../data/hills.json   (hand-kept: the hills, with start and finish)
//   ../data/tracks/*     (tracks.py: the road from start to finish with elevation and grade)
import { cpSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../data/", import.meta.url));
const out = fileURLToPath(new URL("../public/data/", import.meta.url));
for (const d of ["site", "riders"]) {
  if (!existsSync(root + d)) { console.error(`Missing data/${d}. Run python3 sitedata.py first.`); process.exit(1); }
}
rmSync(out, { recursive: true, force: true });
cpSync(root + "site", out + "site", { recursive: true });
cpSync(root + "riders", out + "riders", { recursive: true });
for (const f of ["races.json", "summary.json", "videos.json", "hills.json"]) if (existsSync(root + f)) cpSync(root + f, out + f);
if (existsSync(root + "tracks")) cpSync(root + "tracks", out + "tracks", { recursive: true });
console.log("copied data/ into web/public/data");
