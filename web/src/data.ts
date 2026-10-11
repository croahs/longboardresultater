import { fold } from "./format";
import { t } from "./lang";
// Data model and loading. The site only reads static JSON under data/ (written by site.py).

/** The class a race was run in. "Other" covers stock races, intermediate, team and slalom events. */
export type RaceType = "Open" | "Women" | "Junior" | "Masters" | "Luge" | "Adaptive" | "Inline" | "Other";
export const RACE_TYPES: RaceType[] = ["Open", "Women", "Junior", "Masters", "Luge", "Adaptive", "Inline", "Other"];
/** "bracket": heats, only the place is known. "timed": ranked by the time in each row (qualifying, time trials). */
export type Format = "bracket" | "timed";

export interface Result {
  raceId: string;     // the list in data/races.json
  race: string;       // the event: "Ekstremsportveko"
  cls: string;        // the race within the event: "NM Open", "Damer", "Tidskjøring"
  date: string; year: number; type: RaceType; format: Format;
  place: number; field: number;
  basis: "i feltet" | "blant kvinnene"; // what place/field count: the whole list, or the women in it
  top: number;        // place as % of field, lower is better
  beaten: number;     // % of the others beaten (the winner beat 100 %), higher is better
  behind: number | null; // % behind the fastest time (timed races)
  time: number | null; winner: number | null; // seconds (timed races)
  link: string;       // the post on ndsf.no
  hill: string | null;
  elo: number | null;      // Elo after this race, when it counted in a pool (sitedata.py)
  eloDelta: number | null; // what the race moved the rating
  video?: string;     // the rider's own video from this race (data/videos.json)
  videos?: RaceVideo[]; // every rider's video from this race, the rider's own first
  women: Women | null; // placing among the women in the same race; null in women's races, for DNF or unknown sex
}

/** A result counted among the women only: place and field among them, with DNF behind finishers. */
export interface Women { place: number; field: number; beaten: number }
export type Sex = "K" | null;

export interface Meeting {
  race: string; date: string; type: RaceType; res: "w" | "l" | "d";
  gs: number | null; gp: number | null; // time gap in s and % (timed races; negative = this rider was faster)
  pl: number | null;  // places between: positive = the other rider finished ahead, negative = behind
  mc: string | null; tc: string | null; same: boolean;
}

export interface Opponent { id: string; name: string; club: string; w: number; l: number; med: number | null; ms: Meeting[]; sex: Sex; no: boolean }

export interface Who { id: string; name: string; club?: string; races?: number; wins?: number; losses?: number; page?: boolean }
export interface Insights {
  rivals_by_type?: Partial<Record<RaceType, Who[]>>;
  nemesis?: Who[]; victims?: Who[];
  specialists?: (Who & { stronger_than_you_in: RaceType[]; weaker_than_you_in: RaceType[] })[];
  overtaken?: (Who & { lost_in: string; beat_in: string })[];
  right_ahead?: (Who & { right_ahead: number })[];
  right_behind?: (Who & { right_behind: number })[];
}

/* Elo rating (sitedata.py): two pools, heats ("race") and timed runs ("kvalik"), over the stand-up classes. */
export type Pool = "race" | "kvalik";
export const POOLS: Pool[] = ["race", "kvalik"];
export const poolLabel = (k: Pool) => (k === "race" ? "Race" : t("Kvalik", "Qualifying"));
export interface RiderRating { rating: number; peak: number; peak_year: number; races: number; rank: number | null; of: number; rank_no?: number | null; of_no?: number }

export interface Athlete {
  id: string; name: string; club: string;
  sex: Sex;            // K when the rider has placed in a women's race; never from the name
  no: boolean;         // in the Norway view: a Norwegian nationality in a list, or a start in a race in Norway
  rivalsWomen: string[]; // closest rivals among the women (rivals_women)
  channel?: string;    // the rider's own video channel (data/videos.json)
  results: Result[];
  opponents: Map<string, Opponent>; rivals: string[]; insights: Insights;
  rating: Partial<Record<Pool, RiderRating>>;
}

export interface IndexRider { id: string; name: string; club: string; races: number; shard: string | null; sex?: Sex; wins?: number; no?: boolean }
export interface Site { default_rider: string | null; default_rider_no?: string | null; contact?: string }

/* summary.json (site.py): the front page and the top lists. */
export interface TopRace { id: string; name: string; cls: string; date: string; type: RaceType }
export interface RatedWho extends Who { rating: number; peak: number; peak_year: number; races: number; last: number }
export interface RatingPool {
  races: number; riders: number; since: number | null; until: number | null; min_races: number; active_years: number;
  now: RatedWho[];   // riders who raced in the last active_years seasons, by rating today
  peak: RatedWho[];  // the highest rating ever held
  now_no?: RatedWho[]; peak_no?: RatedWho[]; // the same among the riders in the Norway view
  seasons: { year: number; top: (Who & { rating: number; races: number })[]; top_no?: (Who & { rating: number; races: number })[] }[]; // the top at the end of each season, newest first
  timeline?: Timeline;
}
/** The rating after every race for the riders on the now and peak lists: the races [id, name, date, class], and per rider [race index, rating]. */
export interface Timeline { races: [string, string, string, string][]; riders: Record<string, [number, number][]> }
/** The rating run over one hill's races alone: who is best there, with wins and the average place on the hill (null when every race was a DNF). */
export interface HillRating { races: number; riders: number; min_races: number; top: (RatedWho & { wins: number; avg_place: number | null })[] }
/** The front page's lists and records, for everything or for the Norway view (the races in Norway, the riders in the view). */
export interface Highlights {
  recent: { id: string; name: string; cls: string; date: string; date_known?: boolean; type: RaceType; finishers: number; fastest: Who | null; fastest_women: Who | null }[];
  biggest: { name: string; cls: string; riders: number } | null;
  busiest: (Who & { races: number })[];
  closest?: { name: string; gap_s: number; a: Who; b: Who };
  most_wins?: Who & { wins: number };
  top: { biggest: (TopRace & { riders: number })[]; closest: (TopRace & { gap_s: number; a: Who; b: Who })[]; wins: (Who & { wins: number })[] };
}
export interface Counts { events: number; races: number; results: number; riders: number }
export interface Summary extends Highlights, Counts {
  years: number[];
  no?: Highlights & Counts;
  rating?: Record<Pool, RatingPool>;
  hill_rating?: Record<string, Partial<Record<Pool, HillRating>>>; // per hill id
}

const cache = new Map<string, Promise<unknown>>();
export function getJSON<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    cache.set(path, fetch(`data/${path}`).then((r) => {
      if (!r.ok) throw new Error(`${path}: ${r.status}`);
      return r.json();
    }).catch((e) => { cache.delete(path); throw e; }));
  }
  return cache.get(path) as Promise<T>;
}

type RawMeeting = [string, string, RaceType, string, number | null, number | null, number | null, string | null, string | null, number];
type RawOpp = [string, string, string, number, number, number | null, RawMeeting[], Sex?, (0 | 1)?];

function opponents(raw: RawOpp[] | undefined): Map<string, Opponent> {
  return new Map((raw || []).map(([id, name, club, w, l, med, ms, sex, no]) => [id, {
    id, name, club, w, l, med, sex: sex ?? null, no: !!no,
    ms: ms.map(([race, date, type, res, gs, gp, pl, mc, tc, same]) => ({
      race, date, type, res: res[0] as Meeting["res"], gs, gp, pl, mc, tc, same: !!same,
    })).sort((a, b) => a.date.localeCompare(b.date)),
  }]));
}

interface RawResult {
  race_id: string; race: string; cls: string; type: RaceType; format: Format; date: string;
  place: number | null; field: number; beaten_pct: number | null; time: number | null; winner: number | null;
  behind_pct: number | null; link: string; hill: string | null; women_place?: number; women_field?: number; elo?: number; elo_d?: number;
}
interface RawProfile {
  id: string; name: string; club: string; sex?: Sex; no?: boolean; results: RawResult[];
  opponents?: RawOpp[]; rivals?: string[]; insights?: Insights; rivals_women?: string[]; rating?: Partial<Record<Pool, RiderRating>>;
}

function result(r: RawResult): Result | null {
  if (r.place == null) return null; // DNF: counted in others' fields, no placing of its own
  const place = r.place, field = Math.max(r.field, place); // a sheet can skip a number: never "8. av 7"
  const beatenOf = (p: number, f: number) => (f > 1 ? ((f - p) / (f - 1)) * 100 : 100);
  return {
    raceId: r.race_id, race: r.race, cls: r.cls, date: r.date, year: Number(r.date.slice(0, 4)), type: r.type, format: r.format,
    place, field, basis: "i feltet", top: (place / field) * 100, beaten: Math.max(0, Math.min(100, r.beaten_pct ?? beatenOf(place, field))),
    behind: r.behind_pct, time: r.time, winner: r.winner, link: r.link || "", hill: r.hill, elo: r.elo ?? null, eloDelta: r.elo_d ?? null,
    women: r.women_place != null && r.women_field != null ? { place: r.women_place, field: r.women_field, beaten: beatenOf(r.women_place, r.women_field) } : null,
  };
}

function athlete(p: RawProfile): Athlete {
  return {
    id: p.id, name: p.name, club: p.club || "", sex: p.sex ?? null, no: !!p.no, rivalsWomen: p.rivals_women || [],
    results: p.results.map(result).filter((r): r is Result => !!r).sort((a, b) => a.date.localeCompare(b.date)),
    opponents: opponents(p.opponents), rivals: p.rivals || [], insights: p.insights || {}, rating: p.rating || {},
  };
}

/* Riders' videos, hand-kept in data/videos.json: a channel per rider, and per race the videos riders made of it.
   A race is found by date and event name, so a video shows on the race for everyone who rode it. */
export interface VideoFile {
  channels?: Record<string, string>;
  races?: { date: string; race: string; videos: { rid: string; url: string }[] }[];
}
export interface RaceVideo { rid: string; by: string; url: string; own: boolean }

const plain = (s: string) => fold(s).replace(/[^a-z0-9]/g, "");

/** The videos shared from the race on this date with this name (the name may carry the year). */
export function videosFor(file: VideoFile | null, date: string, name: string) {
  const n = plain(name.replace(/\s+20\d\d$/, ""));
  return file?.races?.find((x) => x.date === date && (n.startsWith(plain(x.race)) || plain(x.race).startsWith(n)))?.videos || [];
}

export const loadVideos = () => getJSON<VideoFile>("videos.json").catch(() => null); // optional: a missing file just means no videos

export function withVideos(a: Athlete, file: VideoFile | null, names: (rid: string) => string): Athlete {
  const races = file?.races || [];
  const channel = file?.channels?.[a.id];
  if (!races.length && !channel) return a;
  const find = (date: string, name: string): RaceVideo[] | undefined => {
    const vs = videosFor(file, date, name);
    if (!vs.length) return undefined;
    return vs.map((v) => ({ rid: v.rid, by: v.rid === a.id ? a.name : names(v.rid), url: v.url, own: v.rid === a.id }))
      .sort((x, y) => Number(y.own) - Number(x.own));
  };
  const own = (vs?: RaceVideo[]) => vs?.find((v) => v.own)?.url;
  return {
    ...a, channel,
    results: a.results.map((r) => { const vs = find(r.date, r.race); return vs ? { ...r, videos: vs, video: own(vs) } : r; }),
  };
}

export async function loadAthlete(id: string, index: IndexRider[], get: <T>(path: string) => Promise<T> = getJSON): Promise<Athlete> {
  const videos = get<VideoFile>("videos.json").catch(() => null); // optional: a missing file just means no videos
  const entry = index.find((r) => r.id === id);
  if (!entry?.shard) throw new Error("Fant ikke kjøreren");
  const shard = await get<Record<string, RawProfile>>(`riders/shard-${entry.shard}.json`);
  const raw = shard[id];
  if (!raw) throw new Error("Fant ikke kjøreren");
  return withVideos(athlete({ ...raw, id }), await videos, (rid) => index.find((r) => r.id === rid)?.name || "");
}

/** The insights with only the riders keep() allows. */
function keepInsights(ins: Insights, keep: (w: { id: string }) => boolean): Insights {
  return {
    ...ins,
    rivals_by_type: ins.rivals_by_type && Object.fromEntries(Object.entries(ins.rivals_by_type).map(([t, l]) => [t, l?.filter(keep)])),
    nemesis: ins.nemesis?.filter(keep), victims: ins.victims?.filter(keep), specialists: ins.specialists?.filter(keep),
    overtaken: ins.overtaken?.filter(keep), right_ahead: ins.right_ahead?.filter(keep), right_behind: ins.right_behind?.filter(keep),
  };
}

/** The athlete counted among the women only: every placing, rival and head-to-head is against women. Races with
    no women's placing drop out. The rider is a woman, so this is what her own class looks like. */
export function womenOnly(a: Athlete): Athlete {
  const opponents = new Map([...a.opponents].filter(([, o]) => o.sex === "K"));
  const keep = (w: { id: string }) => opponents.has(w.id);
  return {
    ...a,
    results: a.results.flatMap((r) => (r.type === "Women" ? [r] : r.women ? [{
      ...r, place: r.women.place, field: r.women.field, beaten: r.women.beaten, top: (r.women.place / r.women.field) * 100,
      behind: null, basis: "blant kvinnene" as const,
    }] : [])),
    opponents, rivals: a.rivalsWomen.filter((id) => opponents.has(id)), insights: keepInsights(a.insights, keep),
  };
}

/** The athlete's rivals and head-to-heads against the riders in the Norway view only. The results stay: a
    placing in Kozakov is still a placing. */
export function norgeOnly(a: Athlete): Athlete {
  const opponents = new Map([...a.opponents].filter(([, o]) => o.no));
  const keep = (w: { id: string }) => opponents.has(w.id);
  return { ...a, opponents, rivals: a.rivals.filter((id) => opponents.has(id)), rivalsWomen: a.rivalsWomen.filter((id) => opponents.has(id)), insights: keepInsights(a.insights, keep) };
}

/* ---------- derived numbers ---------- */

export const median = (a: number[]) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
export const years = (a: Athlete) => [...new Set(a.results.map((r) => r.year))].sort();
export const record = (ms: Meeting[]) => ({ w: ms.filter((m) => m.res === "w").length, l: ms.filter((m) => m.res === "l").length });

/* The result lists (data/races.json): one per race, for the race pages and head-to-head between any two riders. */
/** One row: rider id, name, place (null = DNF), time in s (timed races), sex, in the Norway view (1 | 0). */
export type RaceRow = [string, string, number | null, number | null, Sex, (0 | 1)?];
export interface RaceList {
  id: string; event: string; name: string; cls: string; type: RaceType; format: Format;
  date: string; date_known: boolean; hill: string | null; norway?: boolean; url: string; rows: RaceRow[];
}
interface RacesFile { races: RaceList[] }
export const raceLists = async () => (await getJSON<RacesFile>("races.json")).races;

/** Head-to-head against any rider: in every race both rode, the better place wins; a DNF loses to anyone placed. */
export async function headToHead(meId: string, other: IndexRider): Promise<Opponent> {
  const ms: Meeting[] = [];
  for (const race of await raceLists()) {
    const me = race.rows.find((r) => r[0] === meId), o = race.rows.find((r) => r[0] === other.id);
    if (!me || !o) continue;
    const p = me[2], q = o[2];
    let res: Meeting["res"], gs: number | null = null, gp: number | null = null, pl: number | null = null;
    if (p == null && q == null) res = "d";
    else if (q == null) res = "w";
    else if (p == null) res = "l";
    else {
      res = p < q ? "w" : p > q ? "l" : "d";
      pl = p === q ? null : p - q;
      if (me[3] && o[3]) { gs = Math.round((me[3] - o[3]) * 100) / 100; gp = Math.round((1000 * gs) / o[3]) / 10; }
    }
    ms.push({ race: race.name, date: race.date, type: race.type, res, gs, gp, pl, mc: race.cls, tc: race.cls, same: true });
  }
  ms.sort((a, b) => a.date.localeCompare(b.date));
  const pls = ms.filter((m) => m.pl != null).map((m) => m.pl!);
  const rec = record(ms);
  return { id: other.id, name: other.name, club: other.club, w: rec.w, l: rec.l, med: pls.length ? median(pls) : null, ms, sex: other.sex ?? null, no: !!other.no };
}

/* Hills (data/hills.json) and their tracks (data/tracks/<id>.json, from tracks.py). */
export interface Hill { id: string; name: string; place: string; center: [number, number] | null; start: [number, number] | null; finish: [number, number] | null }
export interface Track {
  id: string; length_m: number; drop_m: number; start_ele: number; finish_ele: number; max_grade: number; avg_grade: number; source: string;
  pts: [number, number, number, number][]; // lat, lon, elevation m, grade % of the segment starting here (negative = downhill)
}
export const hills = async () => (await getJSON<{ hills: Hill[] }>("hills.json")).hills;
export const loadTrack = (id: string) => getJSON<Track>(`tracks/${id}.json`).catch(() => null);
