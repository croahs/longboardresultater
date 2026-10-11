import { useEffect, useState } from "react";
import { POOLS, getJSON, poolLabel, type Pool, type RatingPool, type Summary, type Who } from "../data";
import { dateLong, ord, raw, typeLabel } from "../format";
import { t } from "../lang";
import { TOP_KINDS, href, type TopKind } from "../nav";
import { useNorge } from "../scope";
import { Empty, Loading } from "../ui";

/* The top lists behind the front page's record cards: the Elo rating, the biggest fields, the closest timed
   races and the riders with most wins. sitedata.py writes them into summary.json. */

const title = (k: TopKind): [string, string] => ({
  rating: ["Rating", t("Hvem som er best, regnet som Elo: hvert race er et oppgjør mot alle andre i listen, og å slå en sterk kjører gir mer enn å slå en svak.", "Who is best, counted as Elo: every race is a match against everyone else in the list, and beating a strong rider gives more than beating a weak one.")],
  felt: [t("Største felt", "Biggest fields"), t("Racene med flest kjørere i resultatlisten.", "The races with the most riders in the result list.")],
  jevnest: [t("Jevneste tidskjøring", "Closest timed races"), t("Racene på tid der vinneren slo nummer to med minst.", "The timed races where the winner beat second place by the least.")],
  seire: [t("Flest seire", "Most wins"), t("Seire i heat-race: finaler og rankinger, ikke kvalifisering på tid.", "Wins in heat races: finals and rankings, not timed qualifying.")],
} satisfies Record<TopKind, [string, string]>)[k];

const who = (w: Who) => (w.page ? <a href={href.rider(w.id)}>{w.name}</a> : <span>{w.name}</span>);

export default function Top({ kind }: { kind: TopKind }) {
  const norge = useNorge();
  const [s, setS] = useState<Summary | null | undefined>(undefined);
  useEffect(() => { getJSON<Summary>("summary.json").then(setS).catch(() => setS(null)); }, []);
  const [head, lead] = title(kind);
  if (s === undefined) return <Loading what={t("topplisten", "the top list")} />;
  const top = (norge && s?.no ? s.no : s)?.top;
  if (!s || !top) return <Empty title={t("Fant ikke topplisten", "Could not find the top list")} />;
  return (
    <section className="race-page" aria-labelledby="h-top">
      <div className="section-head">
        <div><p className="eyebrow">{t("Toppliste", "Top list")}{norge ? t(" · Norge-utvalget", " · Norway view") : ""}</p><h1 className="h-display" id="h-top">{head}</h1><p className="lead">{lead}{norge ? (kind === "seire" ? t(" Bare kjørere i Norge-utvalget.", " Only riders in the Norway view.") : kind === "rating" ? t(" Bare kjørere i Norge-utvalget: nordmenn og alle som har kjørt race i Norge.", " Only riders in the Norway view: Norwegians and everyone who has raced in Norway.") : t(" Bare race i Norge.", " Only races in Norway.")) : ""}</p></div>
        <nav className="chips" aria-label={t("Topplister", "Top lists")}>{TOP_KINDS.map((k) => <a key={k} className="chip" aria-current={k === kind ? "page" : undefined} href={href.top(k)}>{title(k)[0]}</a>)}</nav>
      </div>
      {kind === "rating" && (s.rating ? <Rating pools={s.rating} norge={norge} /> : <Empty title={t("Ratingen er ikke regnet ut ennå", "The rating has not been worked out yet")} />)}
      {kind !== "rating" && <div className="card table-wrap"><table className="sheet top">
        {kind === "felt" && <>
          <thead><tr><th>#</th><th>{t("Kjørere", "Riders")}</th><th className="l">Race</th><th className="l">{t("Klasse", "Class")}</th><th className="l">{t("Dato", "Date")}</th></tr></thead>
          <tbody>{top.biggest.map((r, i) => (
            <tr key={r.id} className={`type-${r.type}`}><td className="tnum">{i + 1}</td><td className="tnum big">{r.riders}</td><td className="l"><a href={href.race(r.id)}>{r.name}</a></td><td className="l"><span className="swatch"><i />{r.cls || typeLabel(r.type)}</span></td><td className="l muted">{dateLong(r.date)}</td></tr>
          ))}</tbody>
        </>}
        {kind === "jevnest" && <>
          <thead><tr><th>#</th><th>{t("Skilte", "Gap")}</th><th className="l">Race</th><th className="l">{t("Vinner", "Winner")}</th><th className="l">{t("Nummer to", "Second")}</th><th className="l">{t("Dato", "Date")}</th></tr></thead>
          <tbody>{top.closest.map((r, i) => (
            <tr key={r.id} className={`type-${r.type}`}><td className="tnum">{i + 1}</td><td className="tnum big">{raw(r.gap_s)} s</td><td className="l"><a href={href.race(r.id)}>{r.name}</a><span className="muted"> · {r.cls}</span></td><td className="l">{who(r.a)}</td><td className="l">{who(r.b)}</td><td className="l muted">{dateLong(r.date)}</td></tr>
          ))}</tbody>
        </>}
        {kind === "seire" && <>
          <thead><tr><th>#</th><th>{t("Seire", "Wins")}</th><th className="l">{t("Kjører", "Rider")}</th></tr></thead>
          <tbody>{top.wins.map((r, i) => (
            <tr key={r.id}><td className="tnum">{i + 1}</td><td className="tnum big">{r.wins}</td><td className="l">{who(r)}</td></tr>
          ))}</tbody>
        </>}
      </table></div>}
    </section>
  );
}

type View = "now" | "peak" | "seasons";
const VIEWS: View[] = ["now", "peak", "seasons"];
const viewLabel = (k: View) => ({ now: t("Nå", "Now"), peak: t("Alle tider", "All time"), seasons: t("Sesong for sesong", "Season by season") })[k];

/** The Elo lists: one pool (heats or timed runs) and one view at a time. */
function Rating({ pools, norge }: { pools: Record<Pool, RatingPool>; norge: boolean }) {
  const [pool, setPool] = useState<Pool>("race");
  const [view, setView] = useState<View>("now");
  const p = pools[pool];
  const now = norge ? p.now_no || [] : p.now, peak = norge ? p.peak_no || [] : p.peak;
  const seasonTop = (x: RatingPool["seasons"][number]) => (norge ? x.top_no || [] : x.top);
  const lead = {
    now: t(`Kjørere som har kjørt de siste ${p.active_years} sesongene, etter ratingen i dag. Minst ${p.min_races} race i denne poolen.`, `Riders who have raced in the last ${p.active_years} seasons, by today's rating. At least ${p.min_races} races in this pool.`),
    peak: t(`Den høyeste ratingen hver kjører har hatt, uansett når. Minst ${p.min_races} race i denne poolen.`, `The highest rating each rider has held, whenever it was. At least ${p.min_races} races in this pool.`),
    seasons: t("De fem beste ved slutten av hver sesong, blant dem som kjørte den sesongen.", "The top five at the end of each season, among those who raced that season."),
  }[view];
  return (
    <>
      <div className="rating-bar">
        <div className="chips" role="group" aria-label="Pool">
          {POOLS.map((k) => <button key={k} type="button" className="chip" aria-pressed={pool === k} onClick={() => setPool(k)}>{poolLabel(k)}</button>)}
        </div>
        <div className="chips" role="group" aria-label={t("Visning", "View")}>
          {VIEWS.map((k) => <button key={k} type="button" className="chip" aria-pressed={view === k} onClick={() => setView(k)}>{viewLabel(k)}</button>)}
        </div>
      </div>
      <p className="lead rating-lead">{pool === "race" ? t("Heat-race: finaler og rankinger.", "Heat races: finals and rankings.") : t("Kvalifisering og annen kjøring på tid.", "Qualifying and other timed runs.")} {lead} {t(`${p.races} race og ${p.riders} kjørere`, `${p.races} races and ${p.riders} riders`)}, {p.since}–{p.until}.</p>
      <div className="card table-wrap"><table className="sheet top">
        {view === "now" && <>
          <thead><tr><th>#</th><th>Rating</th><th className="l">{t("Kjører", "Rider")}</th><th>{t("Topp", "Peak")}</th><th>{t("Race", "Races")}</th><th>{t("Sist", "Last")}</th></tr></thead>
          <tbody>{now.map((r, i) => (
            <tr key={r.id}><td className="tnum">{i + 1}</td><td className="tnum big">{r.rating}</td><td className="l">{who(r)}</td><td className="tnum muted">{r.peak} <small>{t("i", "in")} {r.peak_year}</small></td><td className="tnum">{r.races}</td><td className="tnum muted">{r.last}</td></tr>
          ))}</tbody>
        </>}
        {view === "peak" && <>
          <thead><tr><th>#</th><th>{t("Topp", "Peak")}</th><th className="l">{t("Kjører", "Rider")}</th><th>{t("År", "Year")}</th><th>{t("Nå", "Now")}</th><th>{t("Race", "Races")}</th><th>{t("Sist", "Last")}</th></tr></thead>
          <tbody>{peak.map((r, i) => (
            <tr key={r.id}><td className="tnum">{i + 1}</td><td className="tnum big">{r.peak}</td><td className="l">{who(r)}</td><td className="tnum">{r.peak_year}</td><td className="tnum muted">{r.rating}</td><td className="tnum">{r.races}</td><td className="tnum muted">{r.last}</td></tr>
          ))}</tbody>
        </>}
        {view === "seasons" && <>
          <thead><tr><th className="l">{t("Sesong", "Season")}</th>{[1, 2, 3, 4, 5].map((n) => <th key={n} className="l">{ord(n)}</th>)}</tr></thead>
          <tbody>{p.seasons.map((x) => (
            <tr key={x.year}><td className="l tnum"><b>{x.year}</b></td>{[0, 1, 2, 3, 4].map((i) => { const w = seasonTop(x)[i]; return <td key={i} className="l season-cell">{w ? <>{who(w)}<small className="muted tnum">{w.rating}</small></> : <span className="muted">–</span>}</td>; })}</tr>
          ))}</tbody>
        </>}
      </table></div>
    </>
  );
}
