import { useEffect, useMemo, useRef, useState } from "react";
import { median, years, type Athlete, type Result } from "../data";
import { TYPE_LABEL, dateLong, firstName, pct } from "../format";
import { useFelt } from "../klasse";
import { raceKey, useSel } from "../state";
import { Empty } from "../ui";

/* How the rider has placed over time: one point per race, a thick line for the median of the last five,
   and the same events year by year. */

export default function Development({ a }: { a: Athlete }) {
  const felt = useFelt();
  const { rows, season, setSeason } = useSel();
  const ys = years(a);
  const who = firstName(a.name);
  const types = [...new Set(rows.map((r) => r.type))];
  return (
    <>
      <div className="section-head">
        <div><p className="eyebrow">Over tid</p><h2 className="h-section">Utvikling</h2><p className="lead">Hvert punkt er ett race, i datorekkefølge. Den tykke linjen er medianen av de siste fem.</p></div>
        <div className="chips" role="group" aria-label="Sesong">
          {(["all", ...ys] as const).map((y) => <button key={y} type="button" className="chip" aria-pressed={season === y} onClick={() => setSeason(y)}>{y === "all" ? "Alle år" : y}</button>)}
        </div>
      </div>
      {rows.length < 2 ? <Empty title="For få race til å vise en utvikling">Det trengs minst to race i perioden.</Empty> : (
        <section className="card card-pad">
          <div className="section-head tight"><div><h3 className="h-card">Andel av {felt} slått</h3><p className="fine">Høyere er bedre.</p></div>
            <div className="legend">{types.map((t) => <span key={t} className={`swatch type-${t}`}><i />{TYPE_LABEL[t]}</span>)}</div></div>
          <Chart rows={rows} />
        </section>
      )}
      <SameRace a={a} who={who} />
    </>
  );
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(760);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
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
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Andel av feltet slått, race for race" onMouseLeave={() => setHov(null)}>
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
      <div className="chart-tip" role="status">{cur ? <><b>{cur.race} {cur.year}</b> · {dateLong(cur.date)} · {cur.place}. av {cur.field} · slo {pct(cur.beaten)}</> : <span className="muted">Pek på et punkt.</span>}</div>
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
      <div className="section-head"><div><p className="eyebrow">År for år</p><h2 className="h-section" id="h-samme">Samme race</h2><p className="lead">Plassen {who} fikk i race som er kjørt flere år. Tallet under er andelen av {felt} slått.</p></div></div>
      <div className="card table-wrap">
        <table className="sheet">
          <thead><tr><th className="l">Race</th>{ys.map((y) => <th key={y}>{y}</th>)}</tr></thead>
          <tbody>{groups.map((rs) => (
            <tr key={`${rs[0].race}|${rs[0].cls}`}>
              <td className="l"><b>{rs[0].race}</b>{rs[0].cls ? <span className="muted"> · {rs[0].cls}</span> : null}</td>
              {ys.map((y) => { const r = rs.find((r) => r.year === y); return <td key={y} className="tnum">{r ? <><b>{r.place}.</b><small className="muted"> av {r.field}</small><br /><small>{Math.round(r.beaten)} %</small></> : <span className="muted">–</span>}</td>; })}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
