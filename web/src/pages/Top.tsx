import { useEffect, useState } from "react";
import { POOLS, POOL_LABEL, getJSON, type Pool, type RatingPool, type Summary, type Who } from "../data";
import { TYPE_LABEL, dateLong } from "../format";
import { TOP_KINDS, href, type TopKind } from "../nav";
import { Empty, Loading } from "../ui";

/* The top lists behind the front page's record cards: the Elo rating, the biggest fields, the closest timed
   races and the riders with most wins. sitedata.py writes them into summary.json. */

const TITLE: Record<TopKind, [string, string]> = {
  rating: ["Rating", "Hvem som er best, regnet som Elo: hvert race er et oppgjør mot alle andre i listen, og å slå en sterk kjører gir mer enn å slå en svak."],
  felt: ["Største felt", "Racene med flest kjørere i resultatlisten."],
  jevnest: ["Jevneste tidskjøring", "Racene på tid der vinneren slo nummer to med minst."],
  seire: ["Flest seire", "Seire i heat-race: finaler og rankinger, ikke kvalifisering på tid."],
};

const who = (w: Who) => (w.page ? <a href={href.rider(w.id)}>{w.name}</a> : <span>{w.name}</span>);

export default function Top({ kind }: { kind: TopKind }) {
  const [s, setS] = useState<Summary | null | undefined>(undefined);
  useEffect(() => { getJSON<Summary>("summary.json").then(setS).catch(() => setS(null)); }, []);
  const [title, lead] = TITLE[kind];
  if (s === undefined) return <Loading what="topplisten" />;
  const top = s?.top;
  if (!s || !top) return <Empty title="Fant ikke topplisten" />;
  return (
    <section className="race-page" aria-labelledby="h-top">
      <div className="section-head">
        <div><p className="eyebrow">Toppliste</p><h1 className="h-display" id="h-top">{title}</h1><p className="lead">{lead}</p></div>
        <nav className="chips" aria-label="Topplister">{TOP_KINDS.map((k) => <a key={k} className="chip" aria-current={k === kind ? "page" : undefined} href={href.top(k)}>{TITLE[k][0]}</a>)}</nav>
      </div>
      {kind === "rating" && (s.rating ? <Rating pools={s.rating} /> : <Empty title="Ratingen er ikke regnet ut ennå" />)}
      {kind !== "rating" && <div className="card table-wrap"><table className="sheet top">
        {kind === "felt" && <>
          <thead><tr><th>#</th><th>Kjørere</th><th className="l">Race</th><th className="l">Klasse</th><th className="l">Dato</th></tr></thead>
          <tbody>{top.biggest.map((r, i) => (
            <tr key={r.id} className={`type-${r.type}`}><td className="tnum">{i + 1}</td><td className="tnum big">{r.riders}</td><td className="l"><a href={href.race(r.id)}>{r.name}</a></td><td className="l"><span className="swatch"><i />{r.cls || TYPE_LABEL[r.type]}</span></td><td className="l muted">{dateLong(r.date)}</td></tr>
          ))}</tbody>
        </>}
        {kind === "jevnest" && <>
          <thead><tr><th>#</th><th>Skilte</th><th className="l">Race</th><th className="l">Vinner</th><th className="l">Nummer to</th><th className="l">Dato</th></tr></thead>
          <tbody>{top.closest.map((r, i) => (
            <tr key={r.id} className={`type-${r.type}`}><td className="tnum">{i + 1}</td><td className="tnum big">{String(r.gap_s).replace(".", ",")} s</td><td className="l"><a href={href.race(r.id)}>{r.name}</a><span className="muted"> · {r.cls}</span></td><td className="l">{who(r.a)}</td><td className="l">{who(r.b)}</td><td className="l muted">{dateLong(r.date)}</td></tr>
          ))}</tbody>
        </>}
        {kind === "seire" && <>
          <thead><tr><th>#</th><th>Seire</th><th className="l">Kjører</th></tr></thead>
          <tbody>{top.wins.map((r, i) => (
            <tr key={r.id}><td className="tnum">{i + 1}</td><td className="tnum big">{r.wins}</td><td className="l">{who(r)}</td></tr>
          ))}</tbody>
        </>}
      </table></div>}
    </section>
  );
}

type View = "now" | "peak" | "seasons";
const VIEWS: [View, string][] = [["now", "Nå"], ["peak", "Alle tider"], ["seasons", "Sesong for sesong"]];

/** The Elo lists: one pool (heats or timed runs) and one view at a time. */
function Rating({ pools }: { pools: Record<Pool, RatingPool> }) {
  const [pool, setPool] = useState<Pool>("race");
  const [view, setView] = useState<View>("now");
  const p = pools[pool];
  const lead = {
    now: `Kjørere som har kjørt de siste ${p.active_years} sesongene, etter ratingen i dag. Minst ${p.min_races} race i denne poolen.`,
    peak: `Den høyeste ratingen hver kjører har hatt, uansett når. Minst ${p.min_races} race i denne poolen.`,
    seasons: "De fem beste ved slutten av hver sesong, blant dem som kjørte den sesongen.",
  }[view];
  return (
    <>
      <div className="rating-bar">
        <div className="chips" role="group" aria-label="Pool">
          {POOLS.map((k) => <button key={k} type="button" className="chip" aria-pressed={pool === k} onClick={() => setPool(k)}>{POOL_LABEL[k]}</button>)}
        </div>
        <div className="chips" role="group" aria-label="Utvalg">
          {VIEWS.map(([k, label]) => <button key={k} type="button" className="chip" aria-pressed={view === k} onClick={() => setView(k)}>{label}</button>)}
        </div>
      </div>
      <p className="lead rating-lead">{pool === "race" ? "Heat-race: finaler og rankinger." : "Kvalifisering og annen kjøring på tid."} {lead} {p.races} race og {p.riders} kjørere, {p.since}–{p.until}.</p>
      <div className="card table-wrap"><table className="sheet top">
        {view === "now" && <>
          <thead><tr><th>#</th><th>Rating</th><th className="l">Kjører</th><th>Topp</th><th>Race</th><th>Sist</th></tr></thead>
          <tbody>{p.now.map((r, i) => (
            <tr key={r.id}><td className="tnum">{i + 1}</td><td className="tnum big">{r.rating}</td><td className="l">{who(r)}</td><td className="tnum muted">{r.peak} <small>i {r.peak_year}</small></td><td className="tnum">{r.races}</td><td className="tnum muted">{r.last}</td></tr>
          ))}</tbody>
        </>}
        {view === "peak" && <>
          <thead><tr><th>#</th><th>Topp</th><th className="l">Kjører</th><th>År</th><th>Nå</th><th>Race</th><th>Sist</th></tr></thead>
          <tbody>{p.peak.map((r, i) => (
            <tr key={r.id}><td className="tnum">{i + 1}</td><td className="tnum big">{r.peak}</td><td className="l">{who(r)}</td><td className="tnum">{r.peak_year}</td><td className="tnum muted">{r.rating}</td><td className="tnum">{r.races}</td><td className="tnum muted">{r.last}</td></tr>
          ))}</tbody>
        </>}
        {view === "seasons" && <>
          <thead><tr><th className="l">Sesong</th>{[1, 2, 3, 4, 5].map((n) => <th key={n} className="l">{n}.</th>)}</tr></thead>
          <tbody>{p.seasons.map((x) => (
            <tr key={x.year}><td className="l tnum"><b>{x.year}</b></td>{[0, 1, 2, 3, 4].map((i) => { const w = x.top[i]; return <td key={i} className="l season-cell">{w ? <>{who(w)}<small className="muted tnum">{w.rating}</small></> : <span className="muted">–</span>}</td>; })}</tr>
          ))}</tbody>
        </>}
      </table></div>
    </>
  );
}
