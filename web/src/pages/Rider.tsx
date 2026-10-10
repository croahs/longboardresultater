import { useEffect, useMemo, useState } from "react";
import { hills, loadAthlete, median, womenOnly, years, type Athlete, type Hill, type IndexRider, type RaceType, type Result } from "../data";
import { TYPE_LABEL, dateLong, dateShort, firstName, initials, pct, span, clock } from "../format";
import { KlasseProvider, KlasseToggle, useFelt } from "../klasse";
import { TABS, href, type Tab } from "../nav";
import { addRecent } from "../recent";
import { SelProvider, raceKey, useSel } from "../state";
import { Beaten, Cls, Empty, Icon, Loading } from "../ui";
import Development from "./Development";
import Races from "./Races";
import Rivals from "./Rivals";

/* One rider: the start card, the tabs, and the overview. The other tabs are their own files. */

export default function Rider({ id, tab, index }: { id: string; tab: Tab; index: IndexRider[] }) {
  const [a, setA] = useState<Athlete | null>(null);
  const [err, setErr] = useState(false);
  const [women, setWomen] = useState(false);
  useEffect(() => {
    let live = true; setA(null); setErr(false);
    loadAthlete(id, index).then((x) => { if (live) { setA(x); addRecent({ id: x.id, name: x.name, club: "" }); } }).catch(() => live && setErr(true));
    return () => { live = false; };
  }, [id, index]);
  const isWoman = a?.sex === "K";
  const shown = useMemo(() => (a && isWoman && women ? womenOnly(a) : a), [a, isWoman, women]);
  const klasse = useMemo(() => ({ on: !!isWoman, women: !!isWoman && women, setWomen }), [isWoman, women]);
  if (err) return <Empty title="Fant ikke kjøreren">Lenken kan være gammel, eller kjøreren er ikke med i listene ennå. <a href={href.home()}>Til forsiden</a></Empty>;
  if (!shown) return <Loading what="resultatene" />;
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
  return (
    <header className="rider-head">
      <div className="bib" aria-label={`Startkort for ${a.name}`}>
        <div className="bib-top"><span>Kjører</span></div>
        <div className="bib-ini" aria-hidden="true">{initials(a.name)}</div>
        <h1 className="bib-name">{a.name}</h1>
        <dl className="bib-trio">
          <div><dt>race</dt><dd className="tnum">{a.results.length}</dd></div>
          <div><dt>seire</dt><dd className="tnum">{wins}</dd></div>
          <div><dt>pallplasser</dt><dd className="tnum">{podiums}</dd></div>
          <div title={best ? `${best.place}. av ${best.field} i ${best.race} ${best.year}` : undefined}><dt>beste plass</dt><dd className="tnum">{best ? `${best.place}.` : "–"}</dd></div>
        </dl>
        <div className="bib-foot"><span className="tnum">{span(ys)}{a.sex === "K" ? " · har kjørt dameklassen" : ""} · NDSF-lister</span><KlasseToggle /></div>
      </div>
      <nav className="tabs" aria-label={`Sider for ${a.name}`}>
        {TABS.map((t) => <a key={t.id} href={href.rider(a.id, t.id)} aria-current={tab === t.id ? "page" : undefined}>{t.label}</a>)}
      </nav>
    </header>
  );
}

function Overview({ a }: { a: Athlete }) {
  const felt = useFelt();
  const { season, setSeason, sel, setSel, rows } = useSel();
  const ys = years(a);
  const last = a.results[a.results.length - 1];
  const typical = median(rows.map((r) => r.beaten));
  const bestRun = rows.reduce<Result | null>((b, r) => (!b || r.beaten > b.beaten ? r : b), null);
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

  return (
    <>
      <div className="stat-trio">
        <div className="stat"><span className="eyebrow">Slår typisk</span><b className="tnum">{pct(typical)}</b><small>av {felt}, median{season === "all" ? " over alle race" : ` i ${season}`}</small></div>
        {bestRun
          ? <a className="stat link" href={href.race(bestRun.raceId)}><span className="eyebrow">Beste race <i aria-hidden="true">→</i></span><b>{bestRun.place}. av {bestRun.field}</b><small>{bestRun.race} {bestRun.year}, slo {pct(bestRun.beaten)} av {felt}. Se resultatlisten.</small></a>
          : <div className="stat"><span className="eyebrow">Beste race</span><b>–</b><small>Ingen race</small></div>}
        <div className="stat"><span className="eyebrow">Bak vinneren</span><b className="tnum">{timed.length ? pct(behind, 1) : "–"}</b><small>{timed.length ? `typisk, i ${timed.length} race på tid` : "ingen race på tid"}</small></div>
      </div>
      {last && <p className="latest" role="note"><Icon.flag /><span>Sist: {last.race} {last.year} <Cls type={last.type} cls={last.cls} />: {last.place}. av {last.field}. {who} slo {Math.round(last.beaten)} % av {felt}.</span><a href={href.race(last.raceId)}>Resultatlisten</a></p>}

      <section className="section" aria-labelledby="h-race">
        <div className="section-head">
          <div><p className="eyebrow">Alle plasseringer</p><h2 className="h-section" id="h-race">Racene</h2></div>
          <div className="chips" role="group" aria-label="Sesong">
            {(["all", ...ys] as const).map((y) => <button key={y} type="button" className="chip" aria-pressed={season === y} onClick={() => setSeason(y)}>{y === "all" ? "Alle år" : y}</button>)}
          </div>
        </div>
        <div className="board">
          <ol className={`runs${all || items.length <= 10 ? "" : " short"}`} aria-label="Race">
            {items.length === 0 && <li className="empty"><b>Ingen race i denne perioden.</b></li>}
            {items.map((r) => {
              const k = raceKey(r), on = k === sel;
              return (
                <li key={k} className={`run type-${r.type}`}>
                  <button type="button" aria-pressed={on} onClick={() => setSel(on ? null : k)}>
                    <span className="run-place tnum">{r.place}<small>/{r.field}</small></span>
                    <span className="run-main">
                      <span className="run-name">{r.race} <span className="muted">{r.year}</span> <Cls type={r.type} cls={r.cls} /></span>
                      <span className="run-sub muted">{dateShort(r.date)}{r.cls && r.cls !== TYPE_LABEL[r.type] ? ` · ${TYPE_LABEL[r.type]}` : ""}{r.basis === "blant kvinnene" ? " · blant kvinnene" : ""}</span>
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
                <h3 className="h-card">Klassene</h3>
                <ul className="class-list">{byType.map(([t, rs]) => <li key={t} className={`type-${t}`}><i /><span>{TYPE_LABEL[t]}</span><small className="muted tnum">{rs.length} race</small><b className="tnum">{Math.round(median(rs.map((r) => r.beaten)))} %</b></li>)}</ul>
                <p className="fine">Andel av {felt} slått, median.</p>
              </div>
            )}
          </aside>
        </div>
        {items.length > 10 && <button type="button" className="btn more" onClick={() => setAll(!all)}>{all ? "Vis færre" : `Vis alle ${items.length} race`}</button>}
      </section>

      {byHill.length > 0 && (
        <section className="section" aria-labelledby="h-bakker">
          <div className="section-head"><div><p className="eyebrow">Hvor {who} er best</p><h2 className="h-section" id="h-bakker">Bakkene</h2></div></div>
          <div className="hill-cards">
            {byHill.map((h) => (
              <a key={h.id} className="hill-stat" href={href.hill(h.id)}>
                <span className="hill-stat-name">{h.name}</span>
                <span className="muted tnum">{h.rs.length} race · beste {h.best.place}. av {h.best.field}</span>
                <span className="hill-stat-bar"><Beaten v={h.med} /><b className="tnum">{Math.round(h.med)} %</b></span>
              </a>
            ))}
          </div>
        </section>
      )}
    </>
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
        <p className="eyebrow">Perioden</p>
        <h3 className="h-card">{n} race</h3>
        <dl className="facts-list">
          <div><dt>Seire</dt><dd className="tnum">{wins}</dd></div>
          <div><dt>Pallplasser</dt><dd className="tnum">{top3}</dd></div>
          <div><dt>Typisk plass</dt><dd className="tnum">{Math.round(median(rows.map((x) => x.place)))}. <span className="muted">av {Math.round(median(rows.map((x) => x.field)))}</span></dd></div>
        </dl>
        <p className="fine">Trykk på et race i listen for å se detaljene.</p>
      </div>
    );
  }
  return (
    <div className={`card card-pad detail type-${r.type}`} id="race-detail">
      <p className="eyebrow">{dateLong(r.date)}</p>
      <h3 className="h-card">{r.race} {r.year}</h3>
      <p><Cls type={r.type} cls={r.cls} big /></p>
      <div className="detail-big"><b className="tnum">{r.place}.</b><span>av {r.field} {r.basis}</span></div>
      <dl className="facts-list">
        <div><dt>Slo</dt><dd className="tnum">{pct(r.beaten)} <span className="muted">av {felt}</span></dd></div>
        {r.time != null && <div><dt>Tid</dt><dd className="tnum">{clock(r.time)}{r.winner != null && r.winner !== r.time ? <span className="muted"> · vinner {clock(r.winner)}</span> : ""}</dd></div>}
        {r.behind != null && r.behind > 0 && <div><dt>Bak vinneren</dt><dd className="tnum">{pct(r.behind, 1)}</dd></div>}
        {r.women && r.basis === "i feltet" && <div><dt>Blant kvinnene</dt><dd className="tnum">{r.women.place}. av {r.women.field}</dd></div>}
        {r.hill && <div><dt>Bakke</dt><dd><a href={href.hill(r.hill)}>{r.hill}</a></dd></div>}
      </dl>
      <div className="row-actions">
        <a className="btn" href={href.race(r.raceId)}>Hele listen</a>
        {r.link && <a className="btn ghost" href={r.link} target="_blank" rel="noopener">Kilden <Icon.out /></a>}
        {r.video && <a className="btn ghost" href={r.video} target="_blank" rel="noopener"><Icon.play /> Video fra {who}</a>}
        <button type="button" className="linkish" onClick={() => setSel(null)}>Fjern valg</button>
      </div>
    </div>
  );
}
