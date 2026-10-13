import type { RaceType } from "./data";
import { isEn, t } from "./lang";

const TYPE_NO: Record<RaceType, string> = { Open: "Open", Women: "Damer", Junior: "Junior", Masters: "Masters", Luge: "Luge", Adaptive: "Adaptive", Inline: "Inline", Other: "Annet" };
/** The class name in the current language; the English one is the RaceType itself. */
export const typeLabel = (k: RaceType) => (isEn() ? k : TYPE_NO[k]);
export const TYPE_LC: Record<RaceType, string> = { Open: "open", Women: "damer", Junior: "junior", Masters: "masters", Luge: "luge", Adaptive: "adaptive", Inline: "inline", Other: "andre klasser" };
export const TYPE_VAR: Record<RaceType, string> = { Open: "var(--open)", Women: "var(--women)", Junior: "var(--junior)", Masters: "var(--masters)", Luge: "var(--luge)", Adaptive: "var(--adaptive)", Inline: "var(--inline)", Other: "var(--other)" };

const MON = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "5. okt" or "5 Oct" */
export const dateShort = (s: string) => { const [, m, d] = s.split("-").map(Number); return isEn() ? `${d} ${MON_EN[m - 1]}` : `${d}. ${MON[m - 1]}`; };
export const dateLong = (s: string) => `${dateShort(s)} ${s.slice(0, 4)}`;

/** A decimal with the current language's separator: "1,5" or "1.5". */
export const num = (v: number, digits: number) => (isEn() ? v.toFixed(digits) : v.toFixed(digits).replace(".", ","));
/** A whole number with thousands grouped: "12 345" or "12,345". */
export const int = (n?: number) => (n == null ? "–" : n.toLocaleString(isEn() ? "en-GB" : "nb-NO"));
/** A decimal from the data as it is ("0.01"), with the current separator. */
export const raw = (v: number) => (isEn() ? String(v) : String(v).replace(".", ","));

export const pct = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined || Number.isNaN(v) ? "–" : `${num(v, digits)} %`;
export const dec = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || Number.isNaN(v) ? "–" : num(v, digits);

/** A place: "3." or "3rd". */
export const ord = (n: number) => {
  if (!isEn()) return `${n}.`;
  const k = n % 100 >= 11 && n % 100 <= 13 ? 0 : n % 10;
  return `${n}${k === 1 ? "st" : k === 2 ? "nd" : k === 3 ? "rd" : "th"}`;
};
/** A place in a field: "3. av 12" or "3rd of 12". */
export const placeOf = (place: number, field: number) => `${ord(place)} ${t("av", "of")} ${field}`;
/** A count with its noun: "3 race" or "3 races". Norwegian takes [one, many] when they differ; English adds an s
    past one unless told the plural. */
export const count = (n: number, no: string | [string, string], en: string, enMany = `${en}s`) =>
  `${n} ${isEn() ? (n === 1 ? en : enMany) : typeof no === "string" ? no : no[n === 1 ? 0 : 1]}`;

/** "2025" or "2024–2026" */
export const span = (ys: number[]) => (!ys.length ? "" : ys[0] === ys[ys.length - 1] ? String(ys[0]) : `${ys[0]}–${ys[ys.length - 1]}`);

/** Seconds as a race clock: 69.5 -> "1:09,50" ("1:09.50" in English), 17.3 -> "17,30". Downhill runs are timed to the hundredth. */
export const clock = (s: number | null | undefined) => {
  if (s == null || Number.isNaN(s)) return "–";
  const neg = s < 0; s = Math.abs(s);
  const m = Math.floor(s / 60), x = s - m * 60;
  const sec = num(x, 2);
  return (neg ? "−" : "") + (m ? `${m}:${x < 10 ? "0" : ""}${sec}` : sec);
};

export const initials = (n: string) =>
  n.replace(/[^\p{L} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

export const firstName = (n: string) => n.split(" ")[0];

export const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ø/g, "o").replace(/æ/g, "ae");

export const listNo = (a: string[]) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} ${t("og", "and")} ${a[a.length - 1]}` : a.join(""));
