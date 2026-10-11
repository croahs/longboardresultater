import { useMemo, useState } from "react";
import { POOLS, median, poolLabel, years, type Athlete, type Pool, type Result } from "../data";
import { ticks, useWidth } from "../chart";
import { dateLong, firstName, ord, pct, placeOf, typeLabel } from "../format";
import { t } from "../lang";
import { useFelt } from "../klasse";
import { raceKey, useSel } from "../state";
import { Delta, Empty } from "../ui";

/* How the rider has placed over time: one point per race, a thick line for the median of the last five;
   the Elo rating after every race that counted; and the same events year by year. */

export default function Development({ a }: { a: Athlete }) {
  const felt = useFelt();
  const { rows, season, setSeason } = useSel();
  const ys = years(a);
  const who = firstName(a.name);
  const types = [...new Set(rows.map((r) => r.type))];
  const rated = rows.filter((r) => r.elo != null);
  return (
    <>
      <div className="section-head">
        <div><p className="eyebrow">{t("Over tid", "Over time")}</p><h2 className="h-section">{t("Utvikling", "Progress")}</h2><p className="lead">{t("Hvert punkt er ett race, i datorekkefølge. Den tykke linjen er medianen av de siste fem.", "Each point is one race, in date order. The thick line is the median of the last five.")}</p></div>
        <div className="chips" role="group" aria-label={t("Sesong", "Season")}>
          {(["all", ...ys] as const).map((y) => <button key={y} type="button" className="chip" aria-pressed={season === y} onClick={() => setSeason(y)}>{y === "all" ? t("Alle år", "All years") : y}</button>)}
        </div>
      </div>
      {rows.length < 2 ? <Empty title={t("For få race til å vise en utvikling", "Too few races to show progress")}>{t("Det trengs minst to race i perioden.", "It takes at least two races in the period.")}</Empty> : (
        <section className="card card-pad">
          <div className="section-head tight"><div><h3 className="h-card">{t(`Andel av ${felt} slått`, `Share of ${felt} beaten`)}</h3><p className="fine">{t("Høyere er bedre.", "Higher is better.")}</p></div>
            <div className="legend">{types.map((k) => <span key={k} className={`swatch type-${k}`}><i />{typeLabel(k)}</span>)}</div></div>
          <Chart rows={rows} />
        </section>
      )}
      {rated.length >= 2 && (
        <section className="card card-pad">
          <div className="section-head tight"><div><h3 className="h-card">{t("Rating", "Rating")}</h3><p className="fine">{t("Ratingen etter hvert race som teller. Race og kvalik er hver sin pool, tallene kan ikke sammenlignes på tvers.", "The rating after every race that counts. Heats and qualifying are separate pools; the numbers do not compare across them.")}</p></div>
            <div className="legend">{POOLS.filter((p) => rated.some((r) => poolOf(r) === p)).map((p) => <span key={p} className={`swatch pool-${p}`}><i />{poolLabel(p)}</span>)}</div></div>
          <EloChart rows={rated} />
        </section>
      )}
      <SameRace a={a} who={who} />
    </>
  );
}

function Chart({ rows }: { rows: Result[] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const { sel, setSel } = useSel();
  const [hov, setHov] = useState<number | null>(null);
  const H = 260, L = 38, R = 14, T = 16, B = 30;
  const n = rows.length, step = (W - L - R) / Math.max(n - 1, 1);
  const x = (i: number) => L + i * step, y = (v: number) => T + (1 - v / 100) * (H - T - B);
  const med = rows.map((_, i) => median(rows.slice(Math.max(0, i - 4), i + 1).map((r) => r.beaten)));
  const line = med.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const yearTicks = rows.flatMap((r, i) => (i === 0 || r.year !== rows[i - 1].year ? [[i, r.year] as const] : []));
  const i = hov ?? (sel ? rows.findIndex((r) => raceKey(r) === sel) : -1);
  const cur = i >= 0 ? rows[i] : null;
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={t("Andel av feltet slått, race for race", "Share of the field beaten, race by race")} onMouseLeave={() => setHov(null)}>
        {[0, 25, 50, 75, 100].map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" /><text x={L - 8} y={y(v) + 4} textAnchor="end" className="tick">{v}</text></g>)}
        {yearTicks.map(([k, yr]) => <text key={yr} x={x(k)} y={H - 8} className="tick" textAnchor={k === 0 ? "start" : "middle"}>{yr}</text>)}
        <path d={line} className="median" />
        {rows.map((r, k) => (
          <g key={raceKey(r)} className={`pt type-${r.type}`} onMouseEnter={() => setHov(k)} onClick={() => setSel(sel === raceKey(r) ? null : raceKey(r))} style={{ cursor: "pointer" }}>
            <circle cx={x(k)} cy={y(r.beaten)} r={k === i ? 7 : 4.5} />
            <circle cx={x(k)} cy={y(r.beaten)} r={Math.max(9, step / 2)} fill="transparent" />
          </g>
        ))}
      </svg>
      <div className="chart-tip" role="status">{cur ? <><b>{cur.race} {cur.year}</b> · {dateLong(cur.date)} · {placeOf(cur.place, cur.field)} · {t("slo", "beat")} {pct(cur.beaten)}</> : <span className="muted">{t("Pek på et punkt.", "Point at a dot.")}</span>}</div>
    </div>
  );
}

const poolOf = (r: Result): Pool => (r.format === "bracket" ? "race" : "kvalik");

/** The Elo rating after each rated race, in date order, one line per pool. */
function EloChart({ rows }: { rows: Result[] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const { sel, setSel } = useSel();
  const [hov, setHov] = useState<number | null>(null);
  const H = 260, L = 46, R = 14, T = 16, B = 30;
  const n = rows.length, step = (W - L - R) / Math.max(n - 1, 1);
  const vs = rows.map((r) => r.elo!);
  const lo = Math.min(...vs) - 20, hi = Math.max(...vs) + 20;
  const x = (i: number) => L + i * step, y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const yearTicks = rows.flatMap((r, i) => (i === 0 || r.year !== rows[i - 1].year ? [[i, r.year] as const] : []));
  const lines = POOLS.map((p) => [p, rows.flatMap((r, k) => (poolOf(r) === p ? [k] : []))] as const).filter(([, ks]) => ks.length);
  const i = hov ?? (sel ? rows.findIndex((r) => raceKey(r) === sel) : -1);
  const cur = i >= 0 ? rows[i] : null;
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={t("Rating, race for race", "Rating, race by race")} onMouseLeave={() => setHov(null)}>
        {ticks(lo, hi).map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" /><text x={L - 8} y={y(v) + 4} textAnchor="end" className="tick">{v}</text></g>)}
        {yearTicks.map(([k, yr]) => <text key={yr} x={x(k)} y={H - 8} className="tick" textAnchor={k === 0 ? "start" : "middle"}>{yr}</text>)}
        {lines.map(([p, ks]) => <path key={p} className={`line pool-${p}`} d={ks.map((k, j) => `${j ? "L" : "M"}${x(k).toFixed(1)},${y(rows[k].elo!).toFixed(1)}`).join(" ")} />)}
        {rows.map((r, k) => (
          <g key={raceKey(r)} className={`pt pool-${poolOf(r)}`} onMouseEnter={() => setHov(k)} onClick={() => setSel(sel === raceKey(r) ? null : raceKey(r))} style={{ cursor: "pointer" }}>
            <circle cx={x(k)} cy={y(r.elo!)} r={k === i ? 7 : 4.5} />
            <circle cx={x(k)} cy={y(r.elo!)} r={Math.max(9, step / 2)} fill="transparent" />
          </g>
        ))}
      </svg>
      <div className="chart-tip" role="status">{cur ? <><b>{cur.race} {cur.year}</b> · {poolLabel(poolOf(cur))} · {placeOf(cur.place, cur.field)} · {t("Rating", "Rating")} <b className="tnum">{cur.elo}</b> <Delta d={cur.eloDelta} /></> : <span className="muted">{t("Pek på et punkt.", "Point at a dot.")}</span>}</div>
    </div>
  );
}

function SameRace({ a, who }: { a: Athlete; who: string }) {
  const felt = useFelt();
  const ys = years(a);
  const groups = useMemo(() => {
    const m = new Map<string, Result[]>();
    for (const r of a.results) { const k = `${r.race}|${r.cls}`; m.set(k, [...(m.get(k) || []), r]); }
    return [...m.values()].filter((rs) => new Set(rs.map((r) => r.year)).size > 1).sort((x, y) => y.length - x.length);
  }, [a]);
  if (!groups.length || ys.length < 2) return null;
  return (
    <section className="section" id="samme-race" aria-labelledby="h-samme">
      <div className="section-head"><div><p className="eyebrow">{t("År for år", "Year by year")}</p><h2 className="h-section" id="h-samme">{t("Samme race", "Same race")}</h2><p className="lead">{t(`Plassen ${who} fikk i race som er kjørt flere år. Tallet under er andelen av ${felt} slått.`, `The place ${who} got in races run in several years. The number below is the share of ${felt} beaten.`)}</p></div></div>
      <div className="card table-wrap">
        <table className="sheet">
          <thead><tr><th className="l">Race</th>{ys.map((y) => <th key={y}>{y}</th>)}</tr></thead>
          <tbody>{groups.map((rs) => (
            <tr key={`${rs[0].race}|${rs[0].cls}`}>
              <td className="l"><b>{rs[0].race}</b>{rs[0].cls ? <span className="muted"> · {rs[0].cls}</span> : null}</td>
              {ys.map((y) => { const r = rs.find((r) => r.year === y); return <td key={y} className="tnum">{r ? <><b>{ord(r.place)}</b><small className="muted"> {t("av", "of")} {r.field}</small><br /><small>{Math.round(r.beaten)} %</small></> : <span className="muted">–</span>}</td>; })}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
