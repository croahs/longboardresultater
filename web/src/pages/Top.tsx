import { useEffect, useMemo, useState } from "react";
import { POOLS, getJSON, poolLabel, type Pool, type RatingPool, type Summary, type Who } from "../data";
import { PALETTE, ticks, useWidth } from "../chart";
import { dateLong, ord, raw, typeLabel } from "../format";
import { t } from "../lang";
import { TOP_KINDS, href, type TopKind } from "../nav";
import { useNorge } from "../scope";
import { Delta, Empty, Loading } from "../ui";

/* The top lists behind the front page's record cards: the Elo rating, the biggest fields, the closest timed
   races and the riders with most wins. sitedata.py writes them into summary.json. */

const title = (k: TopKind): [string, string] => ({
  rating: ["Rating", t("Hvem som er best, regnet som rating: hvert race er et oppgjør mot alle andre i listen, og å slå en sterk kjører gir mer enn å slå en svak.", "Who is best, counted as a rating: every race is a match against everyone else in the list, and beating a strong rider gives more than beating a weak one.")],
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

const poolLead = (k: Pool) => ({
  race: t("Heat-race: finaler og rankinger.", "Heat races: finals and rankings."),
  kvalik: t("Kvalifisering og annen kjøring på tid.", "Qualifying and other timed runs."),
  luge: t("Luge, klassisk og street: heat-race, finaler og rankinger.", "Luge, classic and street: heat races, finals and rankings."),
  luge_kvalik: t("Luge, klassisk og street: kvalifisering og annen kjøring på tid.", "Luge, classic and street: qualifying and other timed runs."),
})[k];

/** The Elo lists: one pool and one view at a time, and the ratings over time below. */
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
  const none = (cols: number) => <tr><td colSpan={cols} className="l muted">{t("Ingen kjørere oppfyller kravene her ennå.", "No riders meet the bar here yet.")}</td></tr>;
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
      <p className="lead rating-lead">{poolLead(pool)} {lead} {t(`${p.races} race og ${p.riders} kjørere`, `${p.races} races and ${p.riders} riders`)}, {p.since}–{p.until}.</p>
      <div className="card table-wrap"><table className="sheet top">
        {view === "now" && <>
          <thead><tr><th>#</th><th>Rating</th><th className="l">{t("Kjører", "Rider")}</th><th>{t("Topp", "Peak")}</th><th>{t("Race", "Races")}</th><th>{t("Sist", "Last")}</th></tr></thead>
          <tbody>{now.map((r, i) => (
            <tr key={r.id}><td className="tnum">{i + 1}</td><td className="tnum big">{r.rating}</td><td className="l">{who(r)}</td><td className="tnum muted">{r.peak} <small>{t("i", "in")} {r.peak_year}</small></td><td className="tnum">{r.races}</td><td className="tnum muted">{r.last}</td></tr>
          ))}{!now.length && none(6)}</tbody>
        </>}
        {view === "peak" && <>
          <thead><tr><th>#</th><th>{t("Topp", "Peak")}</th><th className="l">{t("Kjører", "Rider")}</th><th>{t("År", "Year")}</th><th>{t("Nå", "Now")}</th><th>{t("Race", "Races")}</th><th>{t("Sist", "Last")}</th></tr></thead>
          <tbody>{peak.map((r, i) => (
            <tr key={r.id}><td className="tnum">{i + 1}</td><td className="tnum big">{r.peak}</td><td className="l">{who(r)}</td><td className="tnum">{r.peak_year}</td><td className="tnum muted">{r.rating}</td><td className="tnum">{r.races}</td><td className="tnum muted">{r.last}</td></tr>
          ))}{!peak.length && none(7)}</tbody>
        </>}
        {view === "seasons" && <>
          <thead><tr><th className="l">{t("Sesong", "Season")}</th>{[1, 2, 3, 4, 5].map((n) => <th key={n} className="l">{ord(n)}</th>)}</tr></thead>
          <tbody>{p.seasons.map((x) => (
            <tr key={x.year}><td className="l tnum"><b>{x.year}</b></td>{[0, 1, 2, 3, 4].map((i) => { const w = seasonTop(x)[i]; return <td key={i} className="l season-cell">{w ? <>{who(w)}<small className="muted tnum">{w.rating}</small></> : <span className="muted">–</span>}</td>; })}</tr>
          ))}</tbody>
        </>}
      </table></div>
      <Timeline key={`${pool}-${norge}`} p={p} riders={[...now, ...peak]} />
    </>
  );
}

const colour = (i: number) => ({ "--c": PALETTE[i % PALETTE.length] }) as React.CSSProperties;

/** The rating over time, race by race, for the riders on the lists above: pick who to draw. Every point is one
    race; the x-axis is the date. */
function Timeline({ p, riders: listed }: { p: RatingPool; riders: Who[] }) {
  const tl = p.timeline;
  const riders = useMemo(() => [...new Map(listed.map((w) => [w.id, w])).values()].filter((w) => tl?.riders[w.id]?.length), [listed, tl]);
  const [on, setOn] = useState(() => new Set(riders.slice(0, 8).map((w) => w.id)));
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hov, setHov] = useState<[string, number] | null>(null);
  if (!tl || !riders.length) return null;
  const shown = riders.map((w, i) => [w, i] as const).filter(([w]) => on.has(w.id));
  const H = 340, L = 46, R = 14, T = 16, B = 30;
  const at = (i: number) => Date.parse(tl.races[i][2]);
  const pts = shown.flatMap(([w]) => tl.riders[w.id]);
  const t0 = pts.length ? Math.min(...pts.map(([i]) => at(i))) : at(0), t1 = pts.length ? Math.max(...pts.map(([i]) => at(i))) : at(tl.races.length - 1);
  const lo = pts.length ? Math.min(...pts.map(([, v]) => v)) - 20 : 1400, hi = pts.length ? Math.max(...pts.map(([, v]) => v)) + 20 : 1800;
  const x = (ms: number) => L + ((ms - t0) / Math.max(t1 - t0, 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / Math.max(hi - lo, 1)) * (H - T - B);
  const y0 = new Date(t0).getFullYear(), y1 = new Date(t1).getFullYear(), every = Math.ceil((y1 - y0 + 1) / 10);
  const yearTicks: number[] = [];
  for (let yr = y0; yr <= y1; yr += every) if (x(Date.parse(`${yr}-01-01`)) >= L) yearTicks.push(yr);
  const cur = hov && (() => {
    const [rid, k] = hov, w = riders.find((r) => r.id === rid)!, [i, v] = tl.riders[rid][k];
    return { w, race: tl.races[i], v, d: v - (k ? tl.riders[rid][k - 1][1] : 1500) };
  })();
  const toggle = (id: string) => setOn((s) => { const n = new Set(s); if (!n.delete(id)) n.add(id); return n; });
  return (
    <section className="card card-pad timeline" aria-labelledby="h-timeline">
      <div className="section-head tight"><div><h3 className="h-card" id="h-timeline">{t("Utviklingen", "Over time")}</h3><p className="fine">{t("Ratingen etter hvert race, for kjørerne på listene. Trykk på et navn for å vise eller skjule.", "The rating after every race, for the riders on the lists. Tap a name to show or hide it.")}</p></div></div>
      <div className="legend picker" role="group" aria-label={t("Kjørere", "Riders")}>
        {riders.map((w, i) => <button key={w.id} type="button" className="swatch" aria-pressed={on.has(w.id)} style={colour(i)} onClick={() => toggle(w.id)}><i />{w.name}</button>)}
      </div>
      <div className="chart" ref={ref}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={t("Rating over tid, race for race", "Rating over time, race by race")} onMouseLeave={() => setHov(null)}>
          {ticks(lo, hi).map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" /><text x={L - 8} y={y(v) + 4} textAnchor="end" className="tick">{v}</text></g>)}
          {yearTicks.map((yr) => <text key={yr} x={x(Date.parse(`${yr}-01-01`))} y={H - 8} className="tick" textAnchor="middle">{yr}</text>)}
          {shown.map(([w, i]) => <path key={w.id} className="line" style={colour(i)} d={tl.riders[w.id].map(([r, v], j) => `${j ? "L" : "M"}${x(at(r)).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} />)}
          {shown.map(([w, i]) => tl.riders[w.id].map(([r, v], k) => (
            <g key={`${w.id}-${k}`} className="pt small" style={colour(i)} onMouseEnter={() => setHov([w.id, k])}>
              <circle cx={x(at(r))} cy={y(v)} r={hov && hov[0] === w.id && hov[1] === k ? 6 : 3} />
              <circle cx={x(at(r))} cy={y(v)} r={8} fill="transparent" />
            </g>
          )))}
        </svg>
        <div className="chart-tip" role="status">{cur
          ? <><b>{cur.w.name}</b> · <a href={href.race(cur.race[0])}>{cur.race[1]} {cur.race[2].slice(0, 4)}</a> <span className="muted">{cur.race[3]}</span> · {dateLong(cur.race[2])} · <b className="tnum">{cur.v}</b> <Delta d={cur.d} /></>
          : <span className="muted">{shown.length ? t("Pek på et punkt.", "Point at a dot.") : t("Velg kjørere over.", "Pick riders above.")}</span>}</div>
      </div>
    </section>
  );
}
