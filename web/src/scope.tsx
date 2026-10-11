import { t } from "./lang";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/* «Norge | Verden», in the top bar on every page. Norge keeps the riders in the Norway view (a Norwegian
   nationality in a list, or a start in a race in Norway; sitedata.py marks them) and the races run in Norway.
   It is the default and sticks in this browser. */
interface Scope { norge: boolean; setNorge: (v: boolean) => void }
const Ctx = createContext<Scope>({ norge: true, setNorge: () => {} });
export const useNorge = () => useContext(Ctx).norge;
const KEY = "scope";

export function ScopeProvider({ children }: { children: ReactNode }) {
  const [norge, setNorge] = useState(() => { try { return localStorage.getItem(KEY) !== "verden"; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem(KEY, norge ? "norge" : "verden"); } catch { /* storage blocked: the choice lasts the visit */ } }, [norge]);
  return <Ctx.Provider value={{ norge, setNorge }}>{children}</Ctx.Provider>;
}

export function ScopeToggle() {
  const { norge, setNorge } = useContext(Ctx);
  return (
    <div className="chips scope" role="group" aria-label={t("Utvalg", "Scope")}>
      <button type="button" className="chip" aria-pressed={norge} onClick={() => setNorge(true)} title={t("Nordmenn og alle som har kjørt race i Norge, og racene i Norge", "Norwegians and everyone who has raced in Norway, and the races in Norway")}>{t("Norge", "Norway")}</button>
      <button type="button" className="chip" aria-pressed={!norge} onClick={() => setNorge(false)} title={t("Alle kjørere og alle race", "All riders and all races")}>{t("Verden", "World")}</button>
    </div>
  );
}

/** What the lists are drawn from, for leads and empty states. */
export const useUtvalg = () => (useNorge() ? t("Norge-utvalget", "the Norway view") : t("alle", "everyone"));
