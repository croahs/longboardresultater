import { Suspense, lazy, useEffect, useState } from "react";
import { RACE_TYPES, getJSON, hills, type Hill, type IndexRider, type RaceType, type Summary, type Who } from "../data";
import { count, dateLong, int, raw, span, typeLabel } from "../format";
import { t } from "../lang";
import { href, type Tab } from "../nav";
import { useNorge } from "../scope";
import Search from "../Search";
import { Cls, Failed, Icon } from "../ui";

/* The front page: the road, the search, and what the result lists hold. Every number comes from summary.json
   (sitedata.py), so nothing here is typed in by hand. */

// three.js is its own chunk: the page reads before the road has loaded.
const HeroScene = lazy(() => import("../three/HeroScene"));
const WhoLink = ({ w }: { w: Who }) => (w.page ? <a href={href.rider(w.id)}>{w.name}</a> : <span>{w.name}</span>);

export default function Home({ index, example }: { index: IndexRider[]; example: string | null }) {
  const norge = useNorge();
  const [s, setS] = useState<Summary | null>(null);
  const [err, setErr] = useState(false);
  const v = s && norge && s.no ? s.no : s; // the lists and records: the Norway view or everything
  const best = norge ? s?.rating?.race.now_no?.[0] : s?.rating?.race.now[0];
  const [hs, setHs] = useState<(Hill & { races: number; last: string })[]>([]);
  useEffect(() => {
    const summary = getJSON<Summary>("summary.json");
    summary.then(setS).catch(() => setErr(true));
    Promise.all([hills(), summary]).then(([h, s]) => {
      const by = s.hills || {};
      setHs(h.map((x) => ({ ...x, races: by[x.id]?.races || 0, last: by[x.id]?.last || "" })).filter((x) => x.races).sort((a, b) => b.races - a.races));
    }).catch(() => {});
  }, []);
  const features: [Tab, () => JSX.Element, string, string][] = [
    ["oversikt", Icon.overview, t("Hvert race", "Every race"), t("Plassering, hvor stor del av feltet kjøreren slo, og tiden bak vinneren der det ble tatt tid.", "The placing, how much of the field the rider beat, and the time behind the winner where it was timed.")],
    ["rivaler", Icon.rivals, t("Rivalene", "The rivals"), t("Hvem kjøreren møter oftest, stillingen mellom dem, og hvem som alltid ender rett foran.", "Who the rider meets most often, the score between them, and who always ends up just ahead.")],
    ["utvikling", Icon.trend, t("Utviklingen", "The progress"), t("Om kjøreren klatrer i feltet fra sesong til sesong, og hvordan det gikk i de samme racene i fjor.", "Whether the rider climbs through the field season by season, and how the same races went last year.")],
  ];

  return (
    <>
      <section className="hero" aria-labelledby="h-hero">
        <Suspense fallback={<div className="hero-canvas" aria-hidden="true" />}><HeroScene className="hero-canvas" /></Suspense>
        <div className="hero-copy">
          <p className="eyebrow">{t("Downhill-longboard · Norge og verden", "Downhill longboard · Norway and the world")}{s ? ` · ${span(s.years)}` : ""}</p>
          <h1 className="hero-title" id="h-hero">{t("Hvert løp, hver bakke, hver rival.", "Every race, every hill, every rival.")}</h1>
          <p className="lead">{t("Resultatlistene fra NDSF og de internasjonale forbundene IGSA, IDF og WDSC, samlet på ett sted: plasseringer, innbyrdes oppgjør og utvikling for hver kjører.", "The result lists from NDSF and the international federations IGSA, IDF and WDSC, in one place: placings, head-to-heads and progress for every rider.")}</p>
          <div className="hero-search"><Search index={index} big /></div>
          {example && <p className="fine">{t("Eller", "Or")} <a href={href.rider(example)}>{t("se et eksempel", "see an example")}</a> {t("først.", "first.")}</p>}
        </div>
        <dl className="hero-stats" aria-label={t("Innholdet i tall", "The contents in numbers")}>
          <div><dt>{t("Stevner", "Events")}</dt><dd className="tnum">{int(s?.events)}</dd></div>
          <div><dt>{t("Race", "Races")}</dt><dd className="tnum">{int(s?.races)}</dd></div>
          <div><dt>{t("Kjørere", "Riders")}</dt><dd className="tnum">{int(s?.riders)}</dd></div>
          <div><dt>{t("Resultater", "Results")}</dt><dd className="tnum">{int(s?.results)}</dd></div>
        </dl>
      </section>

      <section className="section" id="siste" aria-labelledby="h-siste">
        <div className="section-head"><div><p className="eyebrow">{t("Sist kjørt", "Latest")}{norge ? t(" i Norge", " in Norway") : ""}</p><h2 className="h-section" id="h-siste">{t("Siste race", "Latest races")}</h2></div><a className="btn" href={href.top("felt")}>{t("Alle topplister", "All top lists")}</a></div>
        <div className="recent-grid">
          {v?.recent.map((r, i) => (
            <article key={r.id} className={`recent-card type-${r.type}`} style={{ animationDelay: `${i * 70}ms` }}>
              <p className="eyebrow">{r.date_known === false ? r.date.slice(0, 4) : dateLong(r.date)}</p>
              <h3 className="recent-name"><a href={href.race(r.id)}>{r.name} <span className="muted">{r.date.slice(0, 4)}</span></a></h3>
              <p><Cls type={r.type} cls={r.cls} /></p>
              <p className="recent-n tnum">{r.finishers} <span className="muted">{t("i mål", "finished")}</span></p>
              {r.fastest && <p className="recent-win"><span className="eyebrow">{t("Vant", "Won")}</span><WhoLink w={r.fastest} /></p>}
              {r.fastest_women && <p className="recent-win"><span className="eyebrow">{t("Beste kvinne", "Best woman")}</span><WhoLink w={r.fastest_women} /></p>}
            </article>
          ))}
          {!s && (err ? <Failed what={t("racene", "the races")} /> : <div className="loading">{t("Henter racene …", "Loading the races …")}</div>)}
        </div>
      </section>

      {s && (
        <section className="section" aria-labelledby="h-fakta">
          <div className="section-head"><div><p className="eyebrow">{t("Fra listene", "From the lists")}{norge ? t(" · Norge-utvalget", " · Norway view") : ""}</p><h2 className="h-section" id="h-fakta">{t("Rekordene", "The records")}</h2></div></div>
          <div className="facts">
            {best && <a className="fact-card" href={href.top("rating")}><p className="eyebrow">{t("Best nå", "Best now")} <i aria-hidden="true">→</i></p><b className="fact-num tnum">{best.rating}</b><p>{best.name} {t("leder ratingen i heat", "leads the rating in heats")}{norge ? t(" blant kjørerne i Norge-utvalget", " among the riders in the Norway view") : ""}.</p></a>}
            {v?.most_wins && <a className="fact-card" href={href.top("seire")}><p className="eyebrow">{t("Flest seire", "Most wins")} <i aria-hidden="true">→</i></p><b className="fact-num tnum">{v.most_wins.wins}</b><p>{v.most_wins.name}, {t("i finaler og heat.", "in finals and heats.")}</p></a>}
            {v?.closest && <a className="fact-card" href={href.top("jevnest")}><p className="eyebrow">{t("Jevneste tidskjøring", "Closest timed race")} <i aria-hidden="true">→</i></p><b className="fact-num tnum">{raw(v.closest.gap_s)} s</b><p>{t("skilte", "between")} {v.closest.a.name} {t("og", "and")} {v.closest.b.name} {t("i", "in")} {v.closest.name}.</p></a>}
            {v?.biggest && <a className="fact-card" href={href.top("felt")}><p className="eyebrow">{t("Største felt", "Biggest field")} <i aria-hidden="true">→</i></p><b className="fact-num tnum">{v.biggest.riders}</b><p>{t("kjørere i", "riders in")} {v.biggest.name}{v.biggest.cls ? ` (${v.biggest.cls})` : ""}.</p></a>}
          </div>
        </section>
      )}

      {hs.length > 0 && (
        <section className="section" aria-labelledby="h-bakker">
          <div className="section-head"><div><p className="eyebrow">{t("Hvor det kjøres", "Where they race")}</p><h2 className="h-section" id="h-bakker">{t("Bakkene", "The hills")}</h2></div></div>
          <div className="hills-grid">
            {hs.map((h, i) => (
              <a key={h.id} className="hill-card" href={href.hill(h.id)} style={{ animationDelay: `${i * 40}ms` }}>
                <span className="hill-icon" aria-hidden="true"><Icon.hill /></span>
                <span className="hill-name">{h.name}</span>
                <span className="hill-place muted">{h.place === "unknown" ? t("Sted ukjent", "Place unknown") : h.place}</span>
                <span className="hill-n tnum">{count(h.races, "race", "race")}<small>{h.last ? ` · ${t("sist", "last")} ${h.last.slice(0, 4)}` : ""}</small></span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="section two" aria-labelledby="h-flest">
        <div>
          <div className="section-head"><div><p className="eyebrow">{t("Mest på startstreken", "Most often on the start line")}</p><h2 className="h-section" id="h-flest">{t("Flest race", "Most races")}</h2></div></div>
          <ol className="busy">
            {v?.busiest.map((r, i) => (
              <li key={r.id}><a href={r.page ? href.rider(r.id) : undefined}><span className="busy-n tnum">{i + 1}</span><b>{r.name}</b><span className="tnum muted">{count(r.races, "race", "race")}</span></a></li>
            ))}
          </ol>
        </div>
        <div>
          <div className="section-head"><div><p className="eyebrow">{t("For hver kjører", "For every rider")}</p><h2 className="h-section">{t("Dette får du", "What you get")}</h2></div></div>
          <div className="features">
            {features.map(([tab, I, title, d]) => (
              <a key={tab} className="feature" href={example ? href.rider(example, tab) : undefined}>
                <I /><b>{title}</b><span className="muted">{d}</span>{example && <span className="feature-go">{t("Se et eksempel →", "See an example →")}</span>}
              </a>
            ))}
          </div>
        </div>
      </section>

      <p className="note">{t("Med er", "Included are")} {s ? `${t(`${s.events} stevner og ${s.races} race`, `${s.events} events and ${s.races} races`)}, ${span(s.years)}` : t("racene", "the races")}, {t("i klassene", "in the classes")} {RACE_TYPES.filter((k) => k !== "Other").map(typeLabel).join(", ").toLowerCase()} {t("og andre. Tallene oppdateres når nye lister kommer til.", "and others. The numbers update as new lists come in.")}</p>
    </>
  );
}

export type { RaceType };
