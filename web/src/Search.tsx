import { useEffect, useMemo, useRef, useState } from "react";
import type { IndexRider } from "./data";
import { count, fold } from "./format";
import { t } from "./lang";
import { go, href } from "./nav";
import { addRecent, clearRecent, getRecent, type Recent } from "./recent";
import { useNorge } from "./scope";
import { Icon } from "./ui";

/* The rider search: type two letters and the list fills with riders, most races first. With nothing typed
   it shows the riders this browser opened last. Picking one opens the rider's page. */
export default function Search({ index, current, big, autoFocus }: { index: IndexRider[]; current?: string | null; big?: boolean; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [recent, setRecent] = useState<Recent[]>([]);
  const norge = useNorge();
  const box = useRef<HTMLDivElement>(null);
  const keyed = useMemo(() => index.map((r) => [fold(r.name), r] as const), [index]);
  const hits = useMemo(() => {
    const s = fold(q.trim());
    if (s.length < 2) return [];
    const words = s.split(/\s+/);
    // The Norway view puts its riders first, then most races first.
    return keyed.filter(([k]) => words.every((w) => k.includes(w))).map(([, r]) => r).sort((a, b) => (norge ? Number(!!b.no) - Number(!!a.no) : 0) || b.races - a.races).slice(0, 10);
  }, [q, keyed, norge]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const pick = (r: { id: string; name: string }) => { addRecent({ id: r.id, name: r.name, club: "" }); go(href.rider(r.id)); setQ(""); setOpen(false); (document.activeElement as HTMLElement)?.blur(); };
  const typing = q.trim().length >= 2;
  const list: { id: string; name: string; races?: number }[] = typing ? hits : recent.filter((r) => r.id !== current);
  const show = open && (typing || list.length > 0);
  return (
    <div className={`search${big ? " big" : ""}`} ref={box}>
      <Icon.search />
      <input type="search" role="combobox" aria-expanded={show} aria-controls="rider-hits" aria-autocomplete="list" autoFocus={autoFocus}
        placeholder={big ? t("Søk etter en kjører …", "Search for a rider …") : t("Søk kjører", "Search riders")} aria-label={t("Søk etter kjører", "Search for a rider")} value={q} autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => { setRecent(getRecent()); setHi(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, list.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          if (e.key === "Enter" && show && list[hi]) { e.preventDefault(); pick(list[hi]); }
          if (e.key === "Escape") setOpen(false);
        }} />
      {show && (
        <ul className="hits" id="rider-hits" role="listbox" aria-label={typing ? t("Kjørere", "Riders") : t("Sist besøkt", "Recently viewed")}>
          {!typing && <li className="hits-head" role="presentation"><span>{t("Sist besøkt", "Recently viewed")}</span>
            <button type="button" className="linkish" onMouseDown={(e) => { e.preventDefault(); clearRecent(); setRecent([]); setOpen(false); }}>{t("Tøm", "Clear")}</button></li>}
          {typing && hits.length === 0 && <li className="none">{t("Ingen kjører med det navnet i listene.", "No rider by that name in the lists.")}</li>}
          {list.map((r, i) => (
            <li key={r.id} role="option" aria-selected={i === hi} onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); pick(r); }}>
              <b>{r.name}</b>{r.races != null && <small className="tnum">{count(r.races, "race", "race")}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
