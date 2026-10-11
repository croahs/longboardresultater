import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/* «NO | EN», in the top bar next to Norge | Verden. Every UI string is written as a pair at the spot it is used,
   t("Kjørere", "Riders"); names from the result lists stay as the lists have them. Norwegian is the default and
   the choice sticks in this browser. The language also lives in a module variable, so the plain formatters in
   format.ts follow it; the provider re-renders the shell, and with it every page, when it changes. */
export type Lang = "no" | "en";
const KEY = "lang";
const read = (): Lang => { try { return localStorage.getItem(KEY) === "en" ? "en" : "no"; } catch { return "no"; } };
let cur: Lang = read();

/** The Norwegian or the English text, by the current language. */
export const t = (no: string, en: string) => (cur === "en" ? en : no);
export const isEn = () => cur === "en";

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: cur, setLang: () => {} });
/** Subscribes a component to the language; the shell uses it so a switch re-renders everything under it. */
export const useLang = () => useContext(Ctx).lang;

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setState] = useState<Lang>(cur);
  const setLang = (l: Lang) => { cur = l; setState(l); };
  useEffect(() => {
    document.documentElement.lang = lang === "en" ? "en" : "nb";
    try { localStorage.setItem(KEY, lang); } catch { /* storage blocked: the choice lasts the visit */ }
  }, [lang]);
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

export function LangToggle() {
  const { lang, setLang } = useContext(Ctx);
  return (
    <div className="chips scope" role="group" aria-label={t("Språk", "Language")}>
      <button type="button" className="chip" aria-pressed={lang === "no"} onClick={() => setLang("no")} lang="nb" title="Norsk">NO</button>
      <button type="button" className="chip" aria-pressed={lang === "en"} onClick={() => setLang("en")} lang="en" title="English">EN</button>
    </div>
  );
}
