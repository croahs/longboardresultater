/* The site is one page with hash routes. Everything that links somewhere builds its href here, so the
   scheme lives in one place:
     #/                      the front page
     #/r/<n>/<tab>           rider r<n>, on one of the tabs
     #/race/<event>/<list>   one result list (ids look like "2026-ekstremsportveko/nm-open")
     #/bakke/<hill>          a hill
     #/topp/<kind>           a top list */

export type Tab = "oversikt" | "utvikling" | "rivaler" | "race";
export const TABS: { id: Tab; label: string }[] = [
  { id: "oversikt", label: "Oversikt" }, { id: "utvikling", label: "Utvikling" }, { id: "rivaler", label: "Rivaler" }, { id: "race", label: "Alle race" },
];
export type TopKind = "felt" | "jevnest" | "seire";
export const TOP_KINDS: TopKind[] = ["felt", "jevnest", "seire"];

export type Route =
  | { kind: "home" }
  | { kind: "rider"; id: string; tab: Tab }
  | { kind: "race"; id: string }
  | { kind: "hill"; id: string }
  | { kind: "top"; top: TopKind };

export const href = {
  home: () => "#/",
  rider: (id: string, tab: Tab = "oversikt") => `#/r/${id.replace(/^r/, "")}${tab === "oversikt" ? "" : `/${tab}`}`,
  race: (id: string) => `#/race/${id.split("/").map(encodeURIComponent).join("/")}`,
  hill: (id: string) => `#/bakke/${encodeURIComponent(id)}`,
  top: (kind: TopKind) => `#/topp/${kind}`,
};

export function readRoute(hash = location.hash): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  if (parts[0] === "race" && parts[1]) return { kind: "race", id: parts.slice(1).join("/") };
  if (parts[0] === "bakke" && parts[1]) return { kind: "hill", id: parts[1] };
  if (parts[0] === "topp" && TOP_KINDS.includes(parts[1] as TopKind)) return { kind: "top", top: parts[1] as TopKind };
  if (parts[0] === "r" && /^\d+$/.test(parts[1] || "")) {
    const tab = TABS.find((t) => t.id === parts[2])?.id || "oversikt";
    return { kind: "rider", id: "r" + parts[1], tab };
  }
  return { kind: "home" };
}

export const go = (h: string) => { location.hash = h; };
