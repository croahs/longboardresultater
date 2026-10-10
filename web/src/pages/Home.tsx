import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { getJSON, hills, raceLists, type Hill, type IndexRider, type RaceType, type Summary, type Who } from "../data";
import { TYPE_LABEL, dateLong, span } from "../format";
import { href, type Tab } from "../nav";
import Search from "../Search";
import { Cls, Icon } from "../ui";

/* The front page: the road, the search, and what the result lists hold. Every number comes from summary.json
   (site.py), so nothing here is typed in by hand. */

// three.js is its own chunk: the page reads before the road has loaded.
const HeroScene = lazy(() => import("../three/HeroScene"));
const num = (n?: number) => (n == null ? "–" : n.toLocaleString("nb-NO"));
const WhoLink = ({ w }: { w: Who }) => (w.page ? <a href={href.rider(w.id)}>{w.name}</a> : <span>{w.name}</span>);

export default function Home({ index, example }: { index: IndexRider[]; example: string | null }) {
  const [s, setS] = useState<Summary | null>(null);
  const [hs, setHs] = useState<(Hill & { races: number; last: string })[]>([]);
  useEffect(() => {
    getJSON<Summary>("summary.json").then(setS).catch(() => setS(null));
    Promise.all([hills(), raceLists()]).then(([h, rs]) => {
      const by = new Map<string, { n: number; last: string }>();
      for (const r of rs) if (r.hill) { const c = by.get(r.hill) || { n: 0, last: "" }; c.n++; if (r.date > c.last) c.last = r.date; by.set(r.hill, c); }
      setHs(h.map((x) => ({ ...x, races: by.get(x.id)?.n || 0, last: by.get(x.id)?.last || "" })).filter((x) => x.races).sort((a, b) => b.races - a.races));
    }).catch(() => {});
  }, []);
  const features = useMemo(() => ([
    ["oversikt", Icon.overview, "Hvert race", "Plassering, hvor stor del av feltet kjøreren slo, og tiden bak vinneren der det ble tatt tid."],
    ["rivaler", Icon.rivals, "Rivalene", "Hvem kjøreren møter oftest, stillingen mellom dem, og hvem som alltid ender rett foran."],
    ["utvikling", Icon.trend, "Utviklingen", "Om kjøreren klatrer i feltet fra sesong til sesong, og hvordan det gikk i de samme racene i fjor."],
  ] as const satisfies readonly (readonly [Tab, () => JSX.Element, string, string])[]), []);

  return (
    <>
      <section className="hero" aria-labelledby="h-hero">
        <Suspense fallback={<div className="hero-canvas" aria-hidden="true" />}><HeroScene className="hero-canvas" /></Suspense>
        <div className="hero-copy">
          <p className="eyebrow">Downhill-longboard · Norge{s ? ` · ${span(s.years)}` : ""}</p>
          <h1 className="hero-title" id="h-hero">Hver bakke.<br />Hvert heat.<br /><em>Hver rival.</em></h1>
          <p className="lead">Alle resultatlistene NDSF har publisert, samlet på ett sted: plasseringer, innbyrdes oppgjør og utvikling for hver kjører siden 2007.</p>
          <div className="hero-search"><Search index={index} big /></div>
          {example && <p className="fine">Eller <a href={href.rider(example)}>se et eksempel</a> først.</p>}
        </div>
        <dl className="hero-stats" aria-label="Innholdet i tall">
          <div><dt>Stevner</dt><dd className="tnum">{num(s?.events)}</dd></div>
          <div><dt>Race</dt><dd className="tnum">{num(s?.races)}</dd></div>
          <div><dt>Kjørere</dt><dd className="tnum">{num(s?.riders)}</dd></div>
          <div><dt>Resultater</dt><dd className="tnum">{num(s?.results)}</dd></div>
        </dl>
        <a className="hero-scroll" href="#siste" aria-label="Til innholdet"><span /></a>
      </section>

      <section className="section" id="siste" aria-labelledby="h-siste">
        <div className="section-head"><div><p className="eyebrow">Sist kjørt</p><h2 className="h-section" id="h-siste">Siste race</h2></div><a className="btn" href={href.top("felt")}>Alle topplister</a></div>
        <div className="recent-grid">
          {s?.recent.map((r, i) => (
            <article key={r.id} className={`recent-card type-${r.type}`} style={{ animationDelay: `${i * 70}ms` }}>
              <p className="eyebrow">{dateLong(r.date)}</p>
              <h3 className="recent-name"><a href={href.race(r.id)}>{r.name} <span className="muted">{r.date.slice(0, 4)}</span></a></h3>
              <p><Cls type={r.type} cls={r.cls} /></p>
              <p className="recent-n tnum">{r.finishers} <span className="muted">i mål</span></p>
              {r.fastest && <p className="recent-win"><span className="eyebrow">Vant</span><WhoLink w={r.fastest} /></p>}
              {r.fastest_women && <p className="recent-win"><span className="eyebrow">Beste kvinne</span><WhoLink w={r.fastest_women} /></p>}
            </article>
          ))}
          {!s && <div className="loading">Henter racene …</div>}
        </div>
      </section>

      {s && (
        <section className="section" aria-labelledby="h-fakta">
          <div className="section-head"><div><p className="eyebrow">Fra listene</p><h2 className="h-section" id="h-fakta">Rekordene</h2></div></div>
          <div className="facts">
            {s.most_wins && <a className="fact-card" href={href.top("seire")}><p className="eyebrow">Flest seire <i aria-hidden="true">→</i></p><b className="fact-num tnum">{s.most_wins.wins}</b><p>{s.most_wins.name}, i finaler og heat.</p></a>}
            {s.closest && <a className="fact-card" href={href.top("jevnest")}><p className="eyebrow">Jevneste tidskjøring <i aria-hidden="true">→</i></p><b className="fact-num tnum">{String(s.closest.gap_s).replace(".", ",")} s</b><p>skilte {s.closest.a.name} og {s.closest.b.name} i {s.closest.name}.</p></a>}
            {s.biggest && <a className="fact-card" href={href.top("felt")}><p className="eyebrow">Største felt <i aria-hidden="true">→</i></p><b className="fact-num tnum">{s.biggest.riders}</b><p>kjørere i {s.biggest.name}{s.biggest.cls ? ` (${s.biggest.cls})` : ""}.</p></a>}
          </div>
        </section>
      )}

      {hs.length > 0 && (
        <section className="section" aria-labelledby="h-bakker">
          <div className="section-head"><div><p className="eyebrow">Hvor det kjøres</p><h2 className="h-section" id="h-bakker">Bakkene</h2></div></div>
          <div className="hills-grid">
            {hs.map((h, i) => (
              <a key={h.id} className="hill-card" href={href.hill(h.id)} style={{ animationDelay: `${i * 40}ms` }}>
                <span className="hill-icon" aria-hidden="true"><Icon.hill /></span>
                <span className="hill-name">{h.name}</span>
                <span className="hill-place muted">{h.place === "unknown" ? "Sted ukjent" : h.place}</span>
                <span className="hill-n tnum">{h.races} race<small>{h.last ? ` · sist ${h.last.slice(0, 4)}` : ""}</small></span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="section two" aria-labelledby="h-flest">
        <div>
          <div className="section-head"><div><p className="eyebrow">Mest på startstreken</p><h2 className="h-section" id="h-flest">Flest race</h2></div></div>
          <ol className="busy">
            {s?.busiest.map((r, i) => (
              <li key={r.id}><a href={r.page ? href.rider(r.id) : undefined}><span className="busy-n tnum">{i + 1}</span><b>{r.name}</b><span className="tnum muted">{r.races} race</span></a></li>
            ))}
          </ol>
        </div>
        <div>
          <div className="section-head"><div><p className="eyebrow">For hver kjører</p><h2 className="h-section">Dette får du</h2></div></div>
          <div className="features">
            {features.map(([tab, I, t, d]) => (
              <a key={tab} className="feature" href={example ? href.rider(example, tab) : undefined}>
                <I /><b>{t}</b><span className="muted">{d}</span>{example && <span className="feature-go">Se et eksempel →</span>}
              </a>
            ))}
          </div>
        </div>
      </section>

      <p className="note">Med er {s ? `${s.events} stevner og ${s.races} race, ${span(s.years)}` : "racene"}, i klassene {Object.values(TYPE_LABEL).filter((x) => x !== "Annet").join(", ").toLowerCase()} og andre. Tallene oppdateres når nye lister kommer til.</p>
    </>
  );
}

export type { RaceType };
