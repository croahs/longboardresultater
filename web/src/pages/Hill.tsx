import { Suspense, lazy, useEffect, useState } from "react";
import { hills, loadTrack, raceLists, type Hill as HillT, type RaceList, type Track } from "../data";
import { TYPE_LABEL, dateLong, pct } from "../format";
import { href } from "../nav";
import { GRADE_LEGEND } from "../grade";
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
  if (hill === undefined) return <Loading what="bakken" />;
  if (!hill) return <Empty title="Fant ikke bakken"><a href={href.home()}>Til forsiden</a></Empty>;
  const events = new Map<string, RaceList[]>();
  for (const r of races) events.set(r.event, [...(events.get(r.event) || []), r]);
  const riders = new Set(races.flatMap((r) => r.rows.map((x) => x[0]))).size;
  const km = (m: number) => (m / 1000).toFixed(2).replace(".", ",");
  return (
    <section className="hill-page" aria-labelledby="h-hill">
      <div className="section-head">
        <div>
          <p className="eyebrow">Bakke · {hill.place === "unknown" ? "sted ukjent" : hill.place}</p>
          <h1 className="h-display" id="h-hill">{hill.name}</h1>
          <p className="lead">{track
            ? `${km(track.length_m)} km fra start til mål, ${Math.round(track.drop_m)} høydemeter ned. Snitt ${pct(-track.avg_grade, 1)}, brattest ${pct(-track.max_grade, 1)}.`
            : "Veien er ikke tegnet opp ennå: start og mål må markeres i hills.json før den kan vises."}</p>
        </div>
        {track && <div className="legend">{GRADE_LEGEND.map(([c, l]) => <span key={l} className="swatch"><i style={{ background: c }} />{l}</span>)}</div>}
      </div>
      {track ? <Suspense fallback={<div className="track-scene" />}><TrackScene track={track} /></Suspense> : (
        <div className="track-missing" aria-hidden="true"><span>{hill.name}</span></div>
      )}
      <dl className="hill-facts">
        {track && <><div><dt>Lengde</dt><dd className="tnum">{km(track.length_m)} km</dd></div><div><dt>Fall</dt><dd className="tnum">{Math.round(track.drop_m)} m</dd></div><div><dt>Start</dt><dd className="tnum">{Math.round(track.start_ele)} moh</dd></div><div><dt>Mål</dt><dd className="tnum">{Math.round(track.finish_ele)} moh</dd></div></>}
        <div><dt>Race</dt><dd className="tnum">{races.length}</dd></div>
        <div><dt>Stevner</dt><dd className="tnum">{events.size}</dd></div>
        <div><dt>Kjørere</dt><dd className="tnum">{riders}</dd></div>
      </dl>
      <div className="section-head"><div><p className="eyebrow">Kjørt her</p><h2 className="h-section">Race i {hill.name}</h2></div></div>
      {events.size === 0 ? <Empty title="Ingen resultatlister fra denne bakken ennå" /> : (
        <div className="event-grid">
          {[...events.entries()].map(([ev, rs]) => (
            <article key={ev} className={`card card-pad event-card type-${rs[0].type}`}>
              <p className="eyebrow">{rs[0].date_known ? dateLong(rs[0].date) : rs[0].date.slice(0, 4)}</p>
              <h3 className="recent-name">{rs[0].name} {rs[0].date.slice(0, 4)}</h3>
              <ul className="event-races">
                {rs.map((r) => <li key={r.id}><a href={href.race(r.id)}><b>{r.cls}</b><span className="muted">{TYPE_LABEL[r.type]} · {r.rows.length}</span></a></li>)}
              </ul>
            </article>
          ))}
        </div>
      )}
      {track && <p className="fine">Vei fra {track.source}.</p>}
    </section>
  );
}
