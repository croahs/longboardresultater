import { useEffect, useMemo, useState } from "react";
import { POOLS, hills, poolLabel, loadAthlete, median, norgeOnly, womenOnly, years, type Athlete, type Hill, type IndexRider, type Pool, type RaceType, type Result } from "../data";
import { clock, count, dateLong, dateShort, firstName, initials, ord, pct, placeOf, span, typeLabel } from "../format";
import { t } from "../lang";
import { KlasseProvider, KlasseToggle, useFelt } from "../klasse";
import { TABS, href, tabLabel, type Tab } from "../nav";
import { addRecent } from "../recent";
import { useNorge } from "../scope";
import { SelProvider, raceKey, useSel } from "../state";
import { Beaten, Cls, Delta, Empty, Icon, Loading } from "../ui";
import Development from "./Development";
import Races from "./Races";
import Rivals from "./Rivals";

/* One rider: the start card, the tabs, and the overview. The other tabs are their own files. */

export default function Rider({ id, tab, index }: { id: string; tab: Tab; index: IndexRider[] }) {
  const [a, setA] = useState<Athlete | null>(null);
  const [err, setErr] = useState(false);
  const [women, setWomen] = useState(false);
  const norge = useNorge();
  useEffect(() => {
    let live = true; setA(null); setErr(false);
    loadAthlete(id, index).then((x) => { if (live) { setA(x); addRecent({ id: x.id, name: x.name, club: "" }); } }).catch(() => live && setErr(true));
    return () => { live = false; };
  }, [id, index]);
  const isWoman = a?.sex === "K";
  const shown = useMemo(() => { let x = a; if (x && norge) x = norgeOnly(x); if (x && isWoman && women) x = womenOnly(x); return x; }, [a, isWoman, women, norge]);
  const klasse = useMemo(() => ({ on: !!isWoman, women: !!isWoman && women, setWomen }), [isWoman, women]);
  if (err) return <Empty title={t("Fant ikke kjøreren", "Could not find the rider")}>{t("Lenken kan være gammel, eller kjøreren er ikke med i listene ennå.", "The link may be old, or the rider is not in the lists yet.")} <a href={href.home()}>{t("Til forsiden", "To the front page")}</a></Empty>;
  if (!shown) return <Loading what={t("resultatene", "the results")} />;
  return (
    <KlasseProvider value={klasse}>
      <SelProvider key={shown.id} a={shown}>
        <Head a={shown} tab={tab} />
        {tab === "oversikt" && <Overview a={shown} />}
        {tab === "utvikling" && <Development a={shown} />}
        {tab === "rivaler" && <Rivals a={shown} index={index} />}
        {tab === "race" && <Races a={shown} />}
      </SelProvider>
    </KlasseProvider>
  );
}

function Head({ a, tab }: { a: Athlete; tab: Tab }) {
  const ys = years(a);
  const wins = a.results.filter((r) => r.place === 1 && r.format === "bracket").length;
  const podiums = a.results.filter((r) => r.place <= 3).length;
  const best = a.results.reduce<Result | null>((b, r) => (!b || r.place < b.place || (r.place === b.place && r.field > b.field) ? r : b), null);
  const pool: Pool | null = a.rating.race ? "race" : a.rating.kvalik ? "kvalik" : null; // the heat rating, or the timed one for a rider with no rated heats
  const elo = pool ? a.rating[pool]! : null;
  return (
    <header className="rider-head">
      <div className="bib" aria-label={t(`Startkort for ${a.name}`, `Race bib for ${a.name}`)}>
        <div className="bib-top"><span>{t("Kjører", "Rider")}</span></div>
        <div className="bib-ini" aria-hidden="true">{initials(a.name)}</div>
        <h1 className="bib-name">{a.name}</h1>
        <dl className="bib-trio">
          <div><dt>{t("race", "races")}</dt><dd className="tnum">{a.results.length}</dd></div>
          <div><dt>{t("seire", "wins")}</dt><dd className="tnum">{wins}</dd></div>
          <div><dt>{t("pallplasser", "podiums")}</dt><dd className="tnum">{podiums}</dd></div>
          <div title={best ? `${placeOf(best.place, best.field)} ${t("i", "in")} ${best.race} ${best.year}` : undefined}><dt>{t("beste plass", "best place")}</dt><dd className="tnum">{best ? ord(best.place) : "–"}</dd></div>
          <div title={elo ? t(`Elo i ${poolLabel(pool!).toLowerCase()}-poolen${elo.rank ? `, ${elo.rank}. av ${elo.of} aktive` : ""}, topp ${elo.peak} i ${elo.peak_year}`, `Elo in the ${poolLabel(pool!).toLowerCase()} pool${elo.rank ? `, ${ord(elo.rank)} of ${elo.of} active` : ""}, peak ${elo.peak} in ${elo.peak_year}`) : t("Ingen race som teller i ratingen", "No races that count in the rating")}><dt>elo{pool === "kvalik" ? ` ${poolLabel(pool).toLowerCase()}` : ""}</dt><dd className="tnum">{elo ? elo.rating : "–"}</dd></div>
        </dl>
        <div className="bib-foot"><span className="tnum">{span(ys)}{a.sex === "K" ? t(" · har kjørt dameklassen", " · has raced the women's class") : ""} · {t("resultatlister", "result lists")}</span><KlasseToggle /></div>
      </div>
      <nav className="tabs" aria-label={t(`Sider for ${a.name}`, `Pages for ${a.name}`)}>
        {TABS.map((k) => <a key={k} href={href.rider(a.id, k)} aria-current={tab === k ? "page" : undefined}>{tabLabel(k)}</a>)}
      </nav>
    </header>
  );
}

function Overview({ a }: { a: Athlete }) {
  const felt = useFelt();
  const norge = useNorge();
  const { season, setSeason, sel, setSel, rows } = useSel();
  const ys = years(a);
  const last = a.results[a.results.length - 1];
  const typical = median(rows.map((r) => r.beaten));
  const bestRun = rows.reduce<Result | null>((b, r) => (!b || r.beaten > b.beaten || (r.beaten === b.beaten && r.field > b.field) ? r : b), null); // ties (every win is 100 %): the bigger field
  const timed = rows.filter((r) => r.behind != null);
  const behind = median(timed.map((r) => r.behind!));
  const who = firstName(a.name);
  const [hs, setHs] = useState<Hill[]>([]);
  useEffect(() => { hills().then(setHs).catch(() => {}); }, []);
  const byHill = useMemo(() => {
    const m = new Map<string, Result[]>();
    for (const r of rows) if (r.hill) m.set(r.hill, [...(m.get(r.hill) || []), r]);
    return [...m].map(([id, rs]) => ({ id, name: hs.find((h) => h.id === id)?.name || id, rs, med: median(rs.map((r) => r.beaten)), best: rs.reduce((b, r) => (r.place < b.place ? r : b)) }))
      .sort((x, y) => y.rs.length - x.rs.length);
  }, [rows, hs]);
  const byType = useMemo(() => {
    const m = new Map<RaceType, Result[]>();
    for (const r of rows) m.set(r.type, [...(m.get(r.type) || []), r]);
    return [...m].sort((x, y) => y[1].length - x[1].length);
  }, [rows]);
  const selected = rows.find((r) => raceKey(r) === sel) || null;
  const items = useMemo(() => [...rows].sort((x, y) => y.date.localeCompare(x.date)), [rows]);
  const [all, setAll] = useState(false);
  const [hillSel, setHillSel] = useState<string | null>(null);
  const hillOpen = byHill.find((h) => h.id === hillSel) || null;

  return (
    <>
      <div className="stat-trio">
        <div className="stat"><span className="eyebrow">{t("Slår typisk", "Typically beats")}</span><b className="tnum">{pct(typical)}</b><small>{t("av", "of")} {felt}, median{season === "all" ? t(" over alle race", " over all races") : ` ${t("i", "in")} ${season}`}</small></div>
        {bestRun
          ? <a className="stat link" href={href.race(bestRun.raceId)}><span className="eyebrow">{t("Beste race", "Best race")} <i aria-hidden="true">→</i></span><b>{placeOf(bestRun.place, bestRun.field)}</b><small>{bestRun.race} {bestRun.year}, {t("slo", "beat")} {pct(bestRun.beaten)} {t("av", "of")} {felt}. {t("Se resultatlisten.", "See the result list.")}</small></a>
          : <div className="stat"><span className="eyebrow">{t("Beste race", "Best race")}</span><b>–</b><small>{t("Ingen race", "No races")}</small></div>}
        <div className="stat"><span className="eyebrow">{t("Bak vinneren", "Behind the winner")}</span><b className="tnum">{timed.length ? pct(behind, 1) : "–"}</b><small>{timed.length ? t(`typisk, i ${timed.length} race på tid`, `typically, in ${count(timed.length, "", "timed race")}`) : t("ingen race på tid", "no timed races")}</small></div>
      </div>
      {POOLS.some((k) => a.rating[k]) && (
        <p className="latest" role="note"><Icon.trend /><span>Rating: {POOLS.filter((k) => a.rating[k]).map((k, i) => { const r = a.rating[k]!; return (
          <span key={k}>{i ? " · " : ""}{poolLabel(k).toLowerCase()} <b className="tnum">{r.rating}</b>{(norge ? r.rank_no : r.rank) ? ` (${placeOf((norge ? r.rank_no : r.rank)!, (norge ? r.of_no : r.of)!)} ${t("aktive", "active")}${norge ? t(" i Norge-utvalget", " in the Norway view") : ""})` : ""}{r.peak > r.rating ? t(`, topp ${r.peak} i ${r.peak_year}`, `, peak ${r.peak} in ${r.peak_year}`) : ""}</span>
        ); })}.</span><a href={href.top("rating")}>{t("Hele listen", "Full list")}</a></p>
      )}
      {last && <p className="latest" role="note"><Icon.flag /><span>{t("Sist", "Latest")}: {last.race} {last.year} <Cls type={last.type} cls={last.cls} />: {placeOf(last.place, last.field)}. {who} {t("slo", "beat")} {Math.round(last.beaten)} % {t("av", "of")} {felt}.</span><a href={href.race(last.raceId)}>{t("Resultatlisten", "Result list")}</a></p>}

      <section className="section" aria-labelledby="h-race">
        <div className="section-head">
          <div><p className="eyebrow">{t("Alle plasseringer", "Every placing")}</p><h2 className="h-section" id="h-race">{t("Racene", "The races")}</h2></div>
          <div className="chips" role="group" aria-label={t("Sesong", "Season")}>
            {(["all", ...ys] as const).map((y) => <button key={y} type="button" className="chip" aria-pressed={season === y} onClick={() => setSeason(y)}>{y === "all" ? t("Alle år", "All years") : y}</button>)}
          </div>
        </div>
        <div className="board">
          <ol className={`runs${all || items.length <= 10 ? "" : " short"}`} aria-label={t("Race", "Races")}>
            {items.length === 0 && <li className="empty"><b>{t("Ingen race i denne perioden.", "No races in this period.")}</b></li>}
            {items.map((r) => {
              const k = raceKey(r), on = k === sel;
              return (
                <li key={k} className={`run type-${r.type}`}>
                  <button type="button" aria-pressed={on} onClick={() => setSel(on ? null : k)}>
                    <span className="run-place tnum">{r.place}<small>/{r.field}</small></span>
                    <span className="run-main">
                      <span className="run-name">{r.race} <span className="muted">{r.year}</span> <Cls type={r.type} cls={r.cls} /></span>
                      <span className="run-sub muted">{dateShort(r.date)}{r.cls && r.cls !== typeLabel(r.type) ? ` · ${typeLabel(r.type)}` : ""}{r.basis === "blant kvinnene" ? t(" · blant kvinnene", " · among the women") : ""}</span>
                    </span>
                    <span className="run-beaten"><Beaten v={r.beaten} /><small className="tnum">{Math.round(r.beaten)} %</small></span>
                  </button>
                </li>
              );
            })}
          </ol>
          <aside className="board-side">
            <Detail r={selected} rows={rows} who={who} />
            {byType.length > 1 && (
              <div className="card card-pad">
                <h3 className="h-card">{t("Klassene", "The classes")}</h3>
                <ul className="class-list">{byType.map(([k, rs]) => <li key={k} className={`type-${k}`}><i /><span>{typeLabel(k)}</span><small className="muted tnum">{count(rs.length, "race", "race")}</small><b className="tnum">{Math.round(median(rs.map((r) => r.beaten)))} %</b></li>)}</ul>
                <p className="fine">{t(`Andel av ${felt} slått, median.`, `Share of ${felt} beaten, median.`)}</p>
              </div>
            )}
          </aside>
        </div>
        {items.length > 10 && <button type="button" className="btn more" onClick={() => setAll(!all)}>{all ? t("Vis færre", "Show fewer") : t(`Vis alle ${items.length} race`, `Show all ${items.length} races`)}</button>}
      </section>

      {byHill.length > 0 && (
        <section className="section" aria-labelledby="h-bakker">
          <div className="section-head"><div><p className="eyebrow">{t(`Hvor ${who} er best`, `Where ${who} does best`)}</p><h2 className="h-section" id="h-bakker">{t("Bakkene", "The hills")}</h2></div></div>
          <div className="hill-cards">
            {byHill.map((h) => (
              <button key={h.id} type="button" className="hill-stat" aria-pressed={hillSel === h.id} onClick={() => setHillSel(hillSel === h.id ? null : h.id)}>
                <span className="hill-stat-name">{h.name}</span>
                <span className="muted tnum">{count(h.rs.length, "race", "race")} · {t("beste", "best")} {placeOf(h.best.place, h.best.field)}</span>
                <span className="hill-stat-bar"><Beaten v={h.med} /><b className="tnum">{Math.round(h.med)} %</b></span>
              </button>
            ))}
          </div>
          {hillOpen && <HillRuns hill={hillOpen} who={who} felt={felt} onClose={() => setHillSel(null)} />}
        </section>
      )}
    </>
  );
}

/** Every race the rider ran on one hill, newest first, with what the hill usually gives: a comparison across the years. */
function HillRuns({ hill, who, felt, onClose }: { hill: { id: string; name: string; rs: Result[]; med: number; best: Result }; who: string; felt: string; onClose: () => void }) {
  const rs = [...hill.rs].sort((x, y) => y.date.localeCompare(x.date));
  const timed = rs.filter((r) => r.time != null);
  const first = rs[rs.length - 1], last = rs[0];
  const trend = rs.length > 1 && first.year !== last.year ? last.beaten - first.beaten : null;
  return (
    <div className="card hill-runs" id="hill-runs">
      <div className="hill-runs-head">
        <div>
          <p className="eyebrow">{who} {t("i", "at")}</p>
          <h3 className="h-section">{hill.name}</h3>
          <p className="lead">{count(rs.length, "race", "race")}{first.year !== last.year ? t(` fra ${first.year} til ${last.year}`, ` from ${first.year} to ${last.year}`) : ` ${t("i", "in")} ${last.year}`}. {t("Slår typisk", "Typically beats")} {Math.round(hill.med)} % {t("av", "of")} {felt} {t("her, beste", "here, best")} {placeOf(hill.best.place, hill.best.field)} {t("i", "in")} {hill.best.year}.
            {trend != null ? ` ${trend >= 0 ? t("Opp", "Up") : t("Ned", "Down")} ${Math.abs(Math.round(trend))} ${t("prosentpoeng fra første til siste gang.", "percentage points from the first time to the last.")}` : ""}</p>
        </div>
        <div className="filters"><a className="btn ghost" href={href.hill(hill.id)}>{t("Om bakken", "About the hill")} <Icon.hill /></a><button type="button" className="btn ghost" onClick={onClose} aria-label={t("Lukk", "Close")}><Icon.close /></button></div>
      </div>
      <div className="table-wrap"><table className="sheet hill-table">
        <thead><tr><th className="l">{t("År", "Year")}</th><th className="l">{t("Klasse", "Class")}</th><th>{t("Plass", "Place")}</th><th className="l">{t("Slo", "Beat")}</th>{timed.length > 0 && <><th>{t("Tid", "Time")}</th><th>{t("Bak", "Behind")}</th></>}<th></th></tr></thead>
        <tbody>{rs.map((r) => (
          <tr key={r.raceId} className={`type-${r.type}`}>
            <td className="l"><b className="tnum">{r.year}</b> <span className="muted">{dateShort(r.date)}</span></td>
            <td className="l"><Cls type={r.type} cls={r.cls} /></td>
            <td className="tnum"><b>{r.place}</b><span className="muted">/{r.field}</span></td>
            <td className="l beaten-cell"><Beaten v={r.beaten} /><span className="tnum">{Math.round(r.beaten)} %</span></td>
            {timed.length > 0 && <><td className="tnum">{r.time != null ? clock(r.time) : <span className="muted">–</span>}</td><td className="tnum muted">{r.behind != null && r.behind > 0 ? pct(r.behind, 1) : ""}</td></>}
            <td className="links"><a href={href.race(r.raceId)} aria-label={t(`Resultatlisten for ${r.race} ${r.year}`, `Result list for ${r.race} ${r.year}`)} title={t("Resultatlisten", "Result list")}><Icon.races /></a></td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

function Detail({ r, rows, who }: { r: Result | null; rows: Result[]; who: string }) {
  const felt = useFelt();
  const { setSel } = useSel();
  if (!rows.length) return null;
  if (!r) {
    const n = rows.length, wins = rows.filter((x) => x.place === 1).length, top3 = rows.filter((x) => x.place <= 3).length;
    return (
      <div className="card card-pad detail">
        <p className="eyebrow">{t("Perioden", "The period")}</p>
        <h3 className="h-card">{count(n, "race", "race")}</h3>
        <dl className="facts-list">
          <div><dt>{t("Seire", "Wins")}</dt><dd className="tnum">{wins}</dd></div>
          <div><dt>{t("Pallplasser", "Podiums")}</dt><dd className="tnum">{top3}</dd></div>
          <div><dt>{t("Typisk plass", "Typical place")}</dt><dd className="tnum">{ord(Math.round(median(rows.map((x) => x.place))))} <span className="muted">{t("av", "of")} {Math.round(median(rows.map((x) => x.field)))}</span></dd></div>
        </dl>
        <p className="fine">{t("Trykk på et race i listen for å se detaljene.", "Tap a race in the list to see the details.")}</p>
      </div>
    );
  }
  return (
    <div className={`card card-pad detail type-${r.type}`} id="race-detail">
      <p className="eyebrow">{dateLong(r.date)}</p>
      <h3 className="h-card">{r.race} {r.year}</h3>
      <p><Cls type={r.type} cls={r.cls} big /></p>
      <div className="detail-big"><b className="tnum">{ord(r.place)}</b><span>{t("av", "of")} {r.field} {r.basis === "blant kvinnene" ? t("blant kvinnene", "among the women") : t("i feltet", "in the field")}</span></div>
      <dl className="facts-list">
        <div><dt>{t("Slo", "Beat")}</dt><dd className="tnum">{pct(r.beaten)} <span className="muted">{t("av", "of")} {felt}</span></dd></div>
        {r.elo != null && <div><dt>{t("Elo etter", "Elo after")}</dt><dd className="tnum">{r.elo} <Delta d={r.eloDelta} /></dd></div>}
        {r.time != null && <div><dt>{t("Tid", "Time")}</dt><dd className="tnum">{clock(r.time)}{r.winner != null && r.winner !== r.time ? <span className="muted"> · {t("vinner", "winner")} {clock(r.winner)}</span> : ""}</dd></div>}
        {r.behind != null && r.behind > 0 && <div><dt>{t("Bak vinneren", "Behind the winner")}</dt><dd className="tnum">{pct(r.behind, 1)}</dd></div>}
        {r.women && r.basis === "i feltet" && <div><dt>{t("Blant kvinnene", "Among the women")}</dt><dd className="tnum">{placeOf(r.women.place, r.women.field)}</dd></div>}
        {r.hill && <div><dt>{t("Bakke", "Hill")}</dt><dd><a href={href.hill(r.hill)}>{r.hill}</a></dd></div>}
      </dl>
      <div className="row-actions">
        <a className="btn" href={href.race(r.raceId)}>{t("Hele listen", "Full list")}</a>
        {r.link && <a className="btn ghost" href={r.link} target="_blank" rel="noopener">{t("Kilden", "Source")} <Icon.out /></a>}
        {r.video && <a className="btn ghost" href={r.video} target="_blank" rel="noopener"><Icon.play /> {t("Video fra", "Video by")} {who}</a>}
        <button type="button" className="linkish" onClick={() => setSel(null)}>{t("Fjern valg", "Clear selection")}</button>
      </div>
    </div>
  );
}
