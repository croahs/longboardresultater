import { Suspense, lazy, useEffect, useState } from "react";
import { POOLS, getJSON, hills, loadTrack, poolLabel, raceLists, type Hill as HillT, type HillRating, type Pool, type RaceList, type Summary, type Track } from "../data";
import { dateLong, dec, num, pct, typeLabel } from "../format";
import { t } from "../lang";
import { href } from "../nav";
import { gradeLegend } from "../grade";
import { Empty, Failed, Loading } from "../ui";

/* One hill: the road in 3D, coloured by steepness, who is best here, and every race run on it. The road comes
   from tracks.py once start and finish are marked in data/hills.json; until then the page says so. */

const TrackScene = lazy(() => import("../three/TrackScene"));

export default function Hill({ id }: { id: string }) {
  const [hill, setHill] = useState<HillT | null | undefined>(undefined);
  const [err, setErr] = useState(false);
  const [track, setTrack] = useState<Track | null>(null);
  const [races, setRaces] = useState<RaceList[]>([]);
  const [rating, setRating] = useState<Partial<Record<Pool, HillRating>>>({});
  useEffect(() => {
    let live = true;
    Promise.all([hills(), loadTrack(id), raceLists(), getJSON<Summary>("summary.json").catch(() => null)]).then(([hs, tr, rs, s]) => {
      if (!live) return;
      setHill(hs.find((h) => h.id === id) ?? null); setTrack(tr);
      setRaces(rs.filter((r) => r.hill === id).sort((a, b) => b.date.localeCompare(a.date)));
      setRating(s?.hill_rating?.[id] || {});
    }).catch(() => live && setErr(true));
    return () => { live = false; };
  }, [id]);
  if (err) return <Failed what={t("bakken", "the hill")} />;
  if (hill === undefined) return <Loading what={t("bakken", "the hill")} />;
  if (!hill) return <Empty title={t("Fant ikke bakken", "Could not find the hill")}><a href={href.home()}>{t("Til forsiden", "To the front page")}</a></Empty>;
  const events = new Map<string, RaceList[]>();
  for (const r of races) events.set(r.event, [...(events.get(r.event) || []), r]);
  const riders = new Set(races.flatMap((r) => r.rows.map((x) => x[0]))).size;
  const km = (m: number) => num(m / 1000, 2);
  return (
    <section className="hill-page" aria-labelledby="h-hill">
      <div className="section-head">
        <div>
          <p className="eyebrow">{t("Bakke", "Hill")} · {hill.place === "unknown" ? t("sted ukjent", "place unknown") : hill.place}</p>
          <h1 className="h-display" id="h-hill">{hill.name}</h1>
          <p className="lead">{track
            ? t(`${km(track.length_m)} km fra start til mål, ${Math.round(track.drop_m)} høydemeter ned. Snitt ${pct(-track.avg_grade, 1)}, brattest ${pct(-track.max_grade, 1)}.`, `${km(track.length_m)} km from start to finish, ${Math.round(track.drop_m)} m of descent. Average ${pct(-track.avg_grade, 1)}, steepest ${pct(-track.max_grade, 1)}.`)
            : t("Veien er ikke tegnet opp ennå: start og mål må markeres i hills.json før den kan vises.", "The road has not been drawn yet: start and finish must be marked in hills.json before it can be shown.")}</p>
        </div>
        {track && <div className="legend">{gradeLegend().map(([c, l]) => <span key={l} className="swatch"><i style={{ background: c }} />{l}</span>)}</div>}
      </div>
      {track ? <Suspense fallback={<div className="track-scene" />}><TrackScene track={track} /></Suspense> : (
        <div className="track-missing" aria-hidden="true"><span>{hill.name}</span></div>
      )}
      <dl className="hill-facts">
        {track && <><div><dt>{t("Lengde", "Length")}</dt><dd className="tnum">{km(track.length_m)} km</dd></div><div><dt>{t("Fall", "Drop")}</dt><dd className="tnum">{Math.round(track.drop_m)} m</dd></div><div><dt>Start</dt><dd className="tnum">{Math.round(track.start_ele)} {t("moh", "m a.s.l.")}</dd></div><div><dt>{t("Mål", "Finish")}</dt><dd className="tnum">{Math.round(track.finish_ele)} {t("moh", "m a.s.l.")}</dd></div></>}
        <div><dt>{t("Race", "Races")}</dt><dd className="tnum">{races.length}</dd></div>
        <div><dt>{t("Stevner", "Events")}</dt><dd className="tnum">{events.size}</dd></div>
        <div><dt>{t("Kjørere", "Riders")}</dt><dd className="tnum">{riders}</dd></div>
      </dl>
      <BestHere name={hill.name} rating={rating} />
      <div className="section-head"><div><p className="eyebrow">{t("Kjørt her", "Raced here")}</p><h2 className="h-section">{t("Race i", "Races at")} {hill.name}</h2></div></div>
      {events.size === 0 ? <Empty title={t("Ingen resultatlister fra denne bakken ennå", "No result lists from this hill yet")} /> : (
        <div className="event-grid">
          {[...events.entries()].map(([ev, rs]) => (
            <article key={ev} className={`card card-pad event-card type-${rs[0].type}`}>
              <p className="eyebrow">{rs[0].date_known ? dateLong(rs[0].date) : rs[0].date.slice(0, 4)}</p>
              <h3 className="recent-name">{rs[0].name} {rs[0].date.slice(0, 4)}</h3>
              <ul className="event-races">
                {rs.map((r) => <li key={r.id}><a href={href.race(r.id)}><b>{r.cls}</b><span className="muted">{typeLabel(r.type)} · {r.rows.length}</span></a></li>)}
              </ul>
            </article>
          ))}
        </div>
      )}
      {track && <p className="fine">{t("Vei fra", "Road from")} {track.source}.</p>}
    </section>
  );
}

/** Who is best on this hill: the rating run over the hill's races alone (sitedata.py), one pool at a time. */
function BestHere({ name, rating }: { name: string; rating: Partial<Record<Pool, HillRating>> }) {
  const pools = POOLS.filter((k) => rating[k]?.top.length);
  const [pick, setPick] = useState<Pool | null>(null);
  const pool = pick && pools.includes(pick) ? pick : pools[0];
  if (!pool) return null;
  const p = rating[pool]!;
  return (
    <section className="hill-rating" aria-labelledby="h-best">
      <div className="section-head">
        <div>
          <p className="eyebrow">{t("Hvem som er best her", "Who is best here")}</p>
          <h2 className="h-section" id="h-best">{t("Rating i", "Rating at")} {name}</h2>
          <p className="lead">{t(`Ratingen regnet bare over racene i denne bakken: ${p.races} ${{ race: "heat-race", kvalik: "race på tid", luge: "luge heat-race", luge_kvalik: "luge-race på tid" }[pool]} og ${p.riders} kjørere. Minst ${p.min_races} race her for å stå på listen, og ratingen faller ikke av seg selv. Snittplassering er over fullførte race.`,
            `The rating over this hill's races alone: ${p.races} ${{ race: "heat races", kvalik: "timed races", luge: "luge heat races", luge_kvalik: "timed luge races" }[pool]} and ${p.riders} riders. At least ${p.min_races} races here to be listed, and the rating does not decay. Average place is over finished races.`)}</p>
        </div>
        {pools.length > 1 && <div className="chips" role="group" aria-label="Pool">{pools.map((k) => <button key={k} type="button" className="chip" aria-pressed={pool === k} onClick={() => setPick(k)}>{poolLabel(k)}</button>)}</div>}
      </div>
      <div className="card table-wrap"><table className="sheet top">
        <thead><tr><th>#</th><th>Rating</th><th className="l">{t("Kjører", "Rider")}</th><th>{t("Topp", "Peak")}</th><th>{t("Race her", "Races here")}</th><th>{t("Seiere", "Wins")}</th><th>{t("Snittplass", "Avg place")}</th><th>{t("Sist", "Last")}</th></tr></thead>
        <tbody>{p.top.map((r, i) => (
          <tr key={r.id}><td className="tnum">{i + 1}</td><td className="tnum big">{r.rating}</td><td className="l">{r.page ? <a href={href.rider(r.id)}>{r.name}</a> : r.name}</td><td className="tnum muted">{r.peak} <small>{t("i", "in")} {r.peak_year}</small></td><td className="tnum">{r.races}</td><td className="tnum">{r.wins || <span className="muted">–</span>}</td><td className="tnum">{dec(r.avg_place)}</td><td className="tnum muted">{r.last}</td></tr>
        ))}</tbody>
      </table></div>
    </section>
  );
}
