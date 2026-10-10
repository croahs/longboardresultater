import { useEffect, useMemo, useState } from "react";
import { hills, loadVideos, raceLists, videosFor, type Hill, type IndexRider, type RaceList, type VideoFile } from "../data";
import { TYPE_LABEL, clock, dateLong } from "../format";
import { KlasseProvider, KlasseToggle } from "../klasse";
import { href } from "../nav";
import { Sources } from "../sources";
import { Cls, Empty, Icon, Loading } from "../ui";

/* One result list, for anyone: «Åpen» is everybody, «Kvinner» the women placed among themselves.
   DNF comes after everyone who finished. Other lists from the same event sit under it. */

export default function Race({ id, index }: { id: string; index: IndexRider[] }) {
  const [all, setAll] = useState<RaceList[] | null>(null);
  const [women, setWomen] = useState(false);
  const [vfile, setVfile] = useState<VideoFile | null>(null);
  const [hs, setHs] = useState<Hill[]>([]);
  useEffect(() => { let live = true; raceLists().then((l) => live && setAll(l)).catch(() => live && setAll([])); loadVideos().then((f) => live && setVfile(f)); hills().then((h) => live && setHs(h)).catch(() => {}); return () => { live = false; }; }, []);
  const race = all?.find((r) => r.id === id);
  const siblings = useMemo(() => (race ? all!.filter((r) => r.event === race.event && r.id !== race.id) : []), [all, race]);
  const known = useMemo(() => new Set(index.map((r) => r.id)), [index]);
  const vids = useMemo(() => new Map(race ? videosFor(vfile, race.date, race.name).map((v) => [v.rid, v.url]) : []), [vfile, race]);
  const rows = useMemo(() => {
    if (!race) return [];
    const pick = race.rows.filter((r) => !women || r[4] === "K");
    const done = pick.filter((r) => r[2] != null).sort((a, b) => a[2]! - b[2]!);
    return [...done, ...pick.filter((r) => r[2] == null)];
  }, [race, women]);
  if (all === null) return <Loading what="resultatlisten" />;
  if (!race) return <Empty title="Fant ikke racet"><a href={href.home()}>Til forsiden</a></Empty>;
  const hill = hs.find((h) => h.id === race.hill);
  const finished = rows.filter((r) => r[2] != null).length;
  const best = rows[0]?.[3] ?? null;
  const timed = race.format === "timed";
  const hasWomen = race.type !== "Women" && race.rows.some((r) => r[4] === "K");
  return (
    <KlasseProvider value={{ on: hasWomen, women, setWomen }}>
      <section className="race-page" aria-labelledby="h-race">
        <div className={`section-head type-${race.type}`}>
          <div>
            <p className="eyebrow"><span className="type-dot" /> {TYPE_LABEL[race.type]} · {race.date_known ? dateLong(race.date) : race.date.slice(0, 4)}{hill && <> · <a href={href.hill(hill.id)}>{hill.name}</a></>}</p>
            <h1 className="h-display" id="h-race">{race.name} <span className="muted">{race.date.slice(0, 4)}</span></h1>
            <p className="race-cls"><Cls type={race.type} cls={race.cls} big /></p>
            <p className="lead">{women ? `${finished} kvinner i mål` : `${finished} i mål`}{rows.length > finished ? `, ${rows.length - finished} DNF` : ""}. {timed ? "Rangert på tid." : "Plassering fra heatene."}{women ? " Plassene er regnet blant kvinnene." : ""}</p>
          </div>
          <div className="filters"><KlasseToggle />{race.url && <a className="btn ghost" href={race.url} target="_blank" rel="noopener">Kilden <Icon.out /></a>}</div>
        </div>
        {rows.length === 0 ? <Empty title={women ? "Ingen kvinner i denne listen" : "Tom resultatliste"} /> : (
          <div className="card table-wrap"><table className="sheet results">
            <thead><tr><th>Plass</th><th className="l">Kjører</th>{timed && <><th>Tid</th><th>Bak</th></>}<th></th></tr></thead>
            <tbody>{rows.map((r, i) => {
              const t = r[3], dnf = r[2] == null, place = women ? i + 1 : r[2]; // among the women we rank ourselves; otherwise the sheet's own place, ties included
              return (
                <tr key={`${r[0]}-${i}`} className={!dnf && place! <= 3 ? `podium p${place}` : dnf ? "dnf" : ""}>
                  <td className="tnum place">{dnf ? "DNF" : place}</td>
                  <td className="l">{known.has(r[0]) ? <a href={href.rider(r[0])}>{r[1]}</a> : r[1]}{r[4] === "K" && !women && race.type !== "Women" && <small className="muted"> K</small>}</td>
                  {timed && <><td className="tnum">{t == null ? "–" : clock(t)}</td><td className="tnum muted">{t == null || best == null || i === 0 ? "" : `+${clock(t - best)}`}</td></>}
                  <td className="links">{vids.has(r[0]) && <a href={vids.get(r[0])} target="_blank" rel="noopener" aria-label={`Video fra ${r[1]}`} title="Video"><Icon.play /></a>}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        {siblings.length > 0 && (
          <div className="siblings">
            <p className="eyebrow">Andre klasser i {race.name} {race.date.slice(0, 4)}</p>
            <ul>{siblings.map((r) => <li key={r.id} className={`type-${r.type}`}><a href={href.race(r.id)}><b><i className="type-dot" /> {r.cls}</b><span className="muted">{TYPE_LABEL[r.type] !== r.cls ? `${TYPE_LABEL[r.type]} · ` : ""}{r.rows.length} kjørere</span></a></li>)}</ul>
          </div>
        )}
        <p className="fine">Fra <Sources />. {timed ? "Tider er som i kildelisten." : "Heat-formatet gir bare plasseringen, ikke tid."}</p>
      </section>
    </KlasseProvider>
  );
}
