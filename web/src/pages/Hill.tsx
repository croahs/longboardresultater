import { Suspense, lazy, useEffect, useState } from "react";
import { hills, loadTrack, raceLists, type Hill as HillT, type RaceList, type Track } from "../data";
import { dateLong, num, pct, typeLabel } from "../format";
import { t } from "../lang";
import { href } from "../nav";
import { gradeLegend } from "../grade";
import { Empty, Loading } from "../ui";

/* One hill: the road in 3D, coloured by steepness, and every race run on it. The road comes from tracks.py
   once start and finish are marked in data/hills.json; until then the page says so. */

const TrackScene = lazy(() => import("../three/TrackScene"));

export default function Hill({ id }: { id: string }) {
  const [hill, setHill] = useState<HillT | null | undefined>(undefined);
  const [track, setTrack] = useState<Track | null>(null);
  const [races, setRaces] = useState<RaceList[]>([]);
  useEffect(() => {
    let live = true;
    Promise.all([hills(), loadTrack(id), raceLists()]).then(([hs, t, rs]) => {
      if (!live) return;
      setHill(hs.find((h) => h.id === id) ?? null); setTrack(t);
      setRaces(rs.filter((r) => r.hill === id).sort((a, b) => b.date.localeCompare(a.date)));
    }).catch(() => live && setHill(null));
    return () => { live = false; };
  }, [id]);
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
