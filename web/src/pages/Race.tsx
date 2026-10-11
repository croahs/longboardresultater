import { useEffect, useMemo, useState } from "react";
import { hills, loadVideos, raceLists, videosFor, type Hill, type IndexRider, type RaceList, type VideoFile } from "../data";
import { clock, count, dateLong, typeLabel } from "../format";
import { t } from "../lang";
import { KlasseProvider, KlasseToggle } from "../klasse";
import { href } from "../nav";
import { useNorge } from "../scope";
import { Sources } from "../sources";
import { Cls, Empty, Icon, Loading } from "../ui";

/* One result list, for anyone: «Åpen» is everybody, «Kvinner» the women placed among themselves.
   DNF comes after everyone who finished. Other lists from the same event sit under it. */

export default function Race({ id, index }: { id: string; index: IndexRider[] }) {
  const [all, setAll] = useState<RaceList[] | null>(null);
  const [women, setWomen] = useState(false);
  const norge = useNorge();
  const [vfile, setVfile] = useState<VideoFile | null>(null);
  const [hs, setHs] = useState<Hill[]>([]);
  useEffect(() => { let live = true; raceLists().then((l) => live && setAll(l)).catch(() => live && setAll([])); loadVideos().then((f) => live && setVfile(f)); hills().then((h) => live && setHs(h)).catch(() => {}); return () => { live = false; }; }, []);
  const race = all?.find((r) => r.id === id);
  const siblings = useMemo(() => (race ? all!.filter((r) => r.event === race.event && r.id !== race.id) : []), [all, race]);
  const known = useMemo(() => new Set(index.map((r) => r.id)), [index]);
  const vids = useMemo(() => new Map(race ? videosFor(vfile, race.date, race.name).map((v) => [v.rid, v.url]) : []), [vfile, race]);
  const only = !!race && norge && !race.norway; // a race abroad in the Norway view: the riders in the view, placed among themselves
  const rows = useMemo(() => {
    if (!race) return [];
    const pick = race.rows.filter((r) => (!women || r[4] === "K") && (!only || r[5]));
    const done = pick.filter((r) => r[2] != null).sort((a, b) => a[2]! - b[2]!);
    return [...done, ...pick.filter((r) => r[2] == null)];
  }, [race, women, only]);
  if (all === null) return <Loading what={t("resultatlisten", "the result list")} />;
  if (!race) return <Empty title={t("Fant ikke racet", "Could not find the race")}><a href={href.home()}>{t("Til forsiden", "To the front page")}</a></Empty>;
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
            <p className="eyebrow"><span className="type-dot" /> {typeLabel(race.type)} · {race.date_known ? dateLong(race.date) : race.date.slice(0, 4)}{hill && <> · <a href={href.hill(hill.id)}>{hill.name}</a></>}</p>
            <h1 className="h-display" id="h-race">{race.name} <span className="muted">{race.date.slice(0, 4)}</span></h1>
            <p className="race-cls"><Cls type={race.type} cls={race.cls} big /></p>
            <p className="lead">{women ? t(`${finished} kvinner i mål`, `${finished} women finished`) : only ? t(`${finished} fra Norge-utvalget i mål`, `${finished} from the Norway view finished`) : t(`${finished} i mål`, `${finished} finished`)}{rows.length > finished ? `, ${rows.length - finished} DNF` : ""}. {timed ? t("Rangert på tid.", "Ranked on time.") : t("Plassering fra heatene.", "Placings from the heats.")}{women ? t(" Plassene er regnet blant kvinnene.", " Places are counted among the women.") : only ? t(` Plassene er regnet blant dem; hele listen har ${race.rows.length} kjørere.`, ` Places are counted among them; the full list has ${race.rows.length} riders.`) : ""}</p>
          </div>
          <div className="filters"><KlasseToggle />{race.url && <a className="btn ghost" href={race.url} target="_blank" rel="noopener">{t("Kilden", "Source")} <Icon.out /></a>}</div>
        </div>
        {rows.length === 0 ? <Empty title={women ? t("Ingen kvinner i denne listen", "No women in this list") : only ? t("Ingen fra Norge-utvalget i denne listen", "No one from the Norway view in this list") : t("Tom resultatliste", "Empty result list")}>{only && <span>{t("Velg Verden øverst for hele listen.", "Choose World at the top for the full list.")}</span>}</Empty> : (
          <div className="card table-wrap"><table className="sheet results">
            <thead><tr><th>{t("Plass", "Place")}</th><th className="l">{t("Kjører", "Rider")}</th>{timed && <><th>{t("Tid", "Time")}</th><th>{t("Bak", "Behind")}</th></>}<th></th></tr></thead>
            <tbody>{rows.map((r, i) => {
              const time = r[3], dnf = r[2] == null, place = women || only ? i + 1 : r[2]; // among the women or the Norway view we rank ourselves; otherwise the sheet's own place, ties included
              return (
                <tr key={`${r[0]}-${i}`} className={!dnf && place! <= 3 ? `podium p${place}` : dnf ? "dnf" : ""}>
                  <td className="tnum place">{dnf ? "DNF" : place}</td>
                  <td className="l">{known.has(r[0]) ? <a href={href.rider(r[0])}>{r[1]}</a> : r[1]}{r[4] === "K" && !women && race.type !== "Women" && <small className="muted"> {t("K", "W")}</small>}{r[5] === 1 && !only && !race.norway && <small className="muted"> {t("Norge", "Norway")}</small>}</td>
                  {timed && <><td className="tnum">{time == null ? "–" : clock(time)}</td><td className="tnum muted">{time == null || best == null || i === 0 ? "" : `+${clock(time - best)}`}</td></>}
                  <td className="links">{vids.has(r[0]) && <a href={vids.get(r[0])} target="_blank" rel="noopener" aria-label={t(`Video fra ${r[1]}`, `Video by ${r[1]}`)} title="Video"><Icon.play /></a>}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        {siblings.length > 0 && (
          <div className="siblings">
            <p className="eyebrow">{t("Andre klasser i", "Other classes in")} {race.name} {race.date.slice(0, 4)}</p>
            <ul>{siblings.map((r) => <li key={r.id} className={`type-${r.type}`}><a href={href.race(r.id)}><b><i className="type-dot" /> {r.cls}</b><span className="muted">{typeLabel(r.type) !== r.cls ? `${typeLabel(r.type)} · ` : ""}{count(r.rows.length, "kjørere", "rider")}</span></a></li>)}</ul>
          </div>
        )}
        <p className="fine">{t("Fra", "From")} <Sources />. {timed ? t("Tider er som i kildelisten.", "Times are as in the source list.") : t("Heat-formatet gir bare plasseringen, ikke tid.", "The heat format gives only the placing, not a time.")}</p>
      </section>
    </KlasseProvider>
  );
}
