import { useEffect, useMemo, useState } from "react";
import { getJSON, type IndexRider, type Site } from "./data";
import { LangProvider, LangToggle, t, useLang } from "./lang";
import { href, readRoute, type Route } from "./nav";
import Search from "./Search";
import { ScopeProvider, ScopeToggle, useNorge } from "./scope";
import { Sources } from "./sources";
import { BrandMark, TipFooter } from "./ui";
import Home from "./pages/Home";
import Rider from "./pages/Rider";
import Race from "./pages/Race";
import Hill from "./pages/Hill";
import Top from "./pages/Top";

/* The shell: one top bar, the page the hash names, one footer. The hash is the only state that routes. */

export default function App() {
  return <LangProvider><ScopeProvider><Shell /></ScopeProvider></LangProvider>;
}

function Shell() {
  const norge = useNorge();
  useLang(); // a switch re-renders the shell, and every page with it
  const [site, setSite] = useState<Site | null>(null);
  const [index, setIndex] = useState<IndexRider[]>([]);
  const [error, setError] = useState(false);
  const [route, setRoute] = useState<Route>(() => readRoute());
  useEffect(() => {
    Promise.all([getJSON<Site>("site/site.json"), getJSON<IndexRider[]>("riders/index.json")])
      .then(([s, i]) => { setSite(s); setIndex(i); })
      .catch(() => setError(true));
    const onHash = () => setRoute((prev) => {
      const next = readRoute();
      // A new place scrolls to the top; switching tab on the same rider keeps the scroll.
      if (!(prev.kind === "rider" && next.kind === "rider" && prev.id === next.id)) window.scrollTo({ top: 0 });
      return next;
    });
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  const home = route.kind === "home";
  const riderName = useMemo(() => (route.kind === "rider" ? index.find((r) => r.id === route.id)?.name : undefined), [route, index]);
  useEffect(() => {
    document.title = riderName ? `${riderName} · Longboardresultater` : "Longboardresultater";
  }, [riderName]);

  return (
    <div className={`app${home ? " is-home" : ""}`}>
      <a className="skip" href="#innhold">{t("Hopp til innholdet", "Skip to content")}</a>
      <header className="topbar">
        <a className="brand" href={href.home()} aria-label={t("Longboardresultater, til forsiden", "Longboardresultater, to the front page")}><BrandMark /><span>Longboard<em>resultater</em></span></a>
        <nav className="topnav" aria-label={t("Hovedmeny", "Main menu")}>
          <a href={href.top("rating")}>{t("Topplister", "Top lists")}</a>
        </nav>
        <ScopeToggle />
        <LangToggle />
        {!home && <div className="topbar-search"><Search index={index} current={route.kind === "rider" ? route.id : null} /></div>}
      </header>
      <main className="page" id="innhold" tabIndex={-1}>
        {error && <div className="empty"><b>{t("Fant ikke dataene. Kjør python -X utf8 sitedata.py i roten av repoet og bygg på nytt.", "Could not find the data. Run python -X utf8 sitedata.py in the repo root and build again.")}</b></div>}
        {!error && !site && <div className="loading" role="status">{t("Henter …", "Loading …")}</div>}
        {site && route.kind === "home" && <Home index={index} example={(norge && site.default_rider_no) || site.default_rider} />}
        {site && route.kind === "rider" && <Rider key={route.id} id={route.id} tab={route.tab} index={index} />}
        {site && route.kind === "race" && <Race key={route.id} id={route.id} index={index} />}
        {site && route.kind === "hill" && <Hill key={route.id} id={route.id} />}
        {site && route.kind === "top" && <Top kind={route.top} />}
      </main>
      <footer className="site">
        <span>{t("Resultater fra", "Results from")} <Sources />. {t("Plassering: DNF telles med i feltet.", "Placings: DNF counts in the field.")}</span>
        {site?.contact && <span>{t("Feil i dataene, eller vil du ikke være med? Skriv til", "Wrong data, or want to be left out? Write to")} <a href={`mailto:${site.contact}`}>{site.contact}</a>.</span>}
        <TipFooter />
      </footer>
    </div>
  );
}
