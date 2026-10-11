import { useMemo, useState } from "react";
import { years, type Athlete, type RaceType, type Result } from "../data";
import { clock, dateLong, fold, pct, typeLabel } from "../format";
import { t } from "../lang";
import { href } from "../nav";
import { useSel } from "../state";
import { Beaten, Cls, Delta, Icon } from "../ui";

/* Every race the rider has placed in, as a sortable table. A race links to its full result list. */

type SortKey = "date" | "beaten" | "place" | "elo";

export default function Races({ a }: { a: Athlete }) {
  const { season, setSeason } = useSel();
  const ys = years(a);
  const [q, setQ] = useState("");
  const [type, setType] = useState<RaceType | "all">("all");
  const [sort, setSort] = useState<{ k: SortKey; desc: boolean }>({ k: "date", desc: true });
  const types = [...new Set(a.results.map((r) => r.type))];
  const rated = a.results.some((r) => r.elo != null);
  const rows = useMemo(() => {
    const s = fold(q.trim());
    const val = (r: Result) => (sort.k === "date" ? r.date : sort.k === "beaten" ? r.beaten : sort.k === "elo" ? r.elo ?? -Infinity : r.place);
    return a.results.filter((r) => (season === "all" || r.year === season) && (type === "all" || r.type === type) && (!s || fold(`${r.race} ${r.year} ${r.cls}`).includes(s)))
      .sort((x, y) => { const d = val(x) < val(y) ? -1 : val(x) > val(y) ? 1 : 0; return sort.desc ? -d : d; });
  }, [a, q, type, sort, season]);
  const th = (k: SortKey, label: string, cls = "") => (
    <th className={cls} aria-sort={sort.k === k ? (sort.desc ? "descending" : "ascending") : "none"}>
      <button type="button" onClick={() => setSort((s) => ({ k, desc: s.k === k ? !s.desc : k !== "place" }))}>{label}{sort.k === k ? (sort.desc ? " ↓" : " ↑") : ""}</button>
    </th>
  );
  return (
    <>
      <div className="section-head"><div><p className="eyebrow">{t("Hele listen", "The full list")}</p><h2 className="h-section">{t("Alle race", "All races")}</h2><p className="lead">{t("Trykk på en kolonne for å sortere, og på et race for hele resultatlisten.", "Tap a column to sort, and a race for its full result list.")}{rated ? t(" Elo er ratingen etter racet, og hva racet flyttet den.", " Elo is the rating after the race, and what the race moved it.") : ""}</p></div></div>
      <section className="card">
        <div className="toolbar">
          <input type="search" placeholder={t("Filtrer på navn", "Filter by name")} aria-label={t("Filtrer på navn", "Filter by name")} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="chips" role="group" aria-label={t("Klasse", "Class")}>
            <button type="button" className="chip" aria-pressed={type === "all"} onClick={() => setType("all")}>{t("Alle", "All")}</button>
            {types.map((k) => <button key={k} type="button" className="chip" aria-pressed={type === k} onClick={() => setType(k)}>{typeLabel(k)}</button>)}
          </div>
          {ys.length > 1 && <div className="chips" role="group" aria-label={t("År", "Year")}>
            {(["all", ...ys] as const).map((y) => <button key={y} type="button" className="chip" aria-pressed={season === y} onClick={() => setSeason(y)}>{y === "all" ? t("Alle år", "All years") : y}</button>)}
          </div>}
          <span className="muted tnum count">{rows.length} {t("av", "of")} {a.results.length}</span>
        </div>
        {rows.length === 0 ? <div className="empty"><b>{t("Ingen race passer filteret", "No races match the filter")}</b><button className="btn" onClick={() => { setQ(""); setType("all"); setSeason("all"); }}>{t("Nullstill", "Reset")}</button></div> : (
          <div className="table-wrap"><table className="sheet races">
            <thead><tr>{th("date", t("Dato", "Date"), "l")}<th className="l">Race</th><th className="l">{t("Klasse", "Class")}</th>{th("place", t("Plass", "Place"))}{th("beaten", t("Slo", "Beat"), "l")}{rated && th("elo", "Elo")}<th>{t("Tid", "Time")}</th><th>{t("Bak", "Behind")}</th><th></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.raceId + r.basis} className={`type-${r.type}`}>
                <td className="l muted nowrap">{dateLong(r.date)}</td>
                <td className="l"><a href={href.race(r.raceId)}><b>{r.race}</b> <span className="muted">{r.year}</span></a></td>
                <td className="l"><Cls type={r.type} cls={r.cls} /></td>
                <td className="tnum"><b>{r.place}</b><span className="muted">/{r.field}</span></td>
                <td className="l beaten-cell"><Beaten v={r.beaten} /><span className="tnum">{Math.round(r.beaten)} %</span></td>
                {rated && <td className="tnum nowrap">{r.elo != null ? <><b>{r.elo}</b> <Delta d={r.eloDelta} /></> : <span className="muted">–</span>}</td>}
                <td className="tnum">{r.time != null ? clock(r.time) : <span className="muted">–</span>}</td>
                <td className="tnum muted">{r.behind != null && r.behind > 0 ? pct(r.behind, 1) : ""}</td>
                <td className="links">{r.video && <a href={r.video} target="_blank" rel="noopener" aria-label="Video" title="Video"><Icon.play /></a>}{r.link && <a href={r.link} target="_blank" rel="noopener" aria-label={t(`Kilden for ${r.race} ${r.year}`, `Source for ${r.race} ${r.year}`)} title={t("Kilden", "Source")}><Icon.out /></a>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
