import type { RaceType } from "./data";

export const TYPE_LABEL: Record<RaceType, string> = { Open: "Open", Women: "Damer", Junior: "Junior", Masters: "Masters", Luge: "Luge", Adaptive: "Adaptive", Inline: "Inline", Other: "Annet" };
export const TYPE_LC: Record<RaceType, string> = { Open: "open", Women: "damer", Junior: "junior", Masters: "masters", Luge: "luge", Adaptive: "adaptive", Inline: "inline", Other: "andre klasser" };
export const TYPE_VAR: Record<RaceType, string> = { Open: "var(--open)", Women: "var(--women)", Junior: "var(--junior)", Masters: "var(--masters)", Luge: "var(--luge)", Adaptive: "var(--adaptive)", Inline: "var(--inline)", Other: "var(--other)" };

const MON = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
export const dateLong = (s: string) => { const [y, m, d] = s.split("-").map(Number); return `${d}. ${MON[m - 1]} ${y}`; };
export const dateShort = (s: string) => { const [, m, d] = s.split("-").map(Number); return `${d}. ${MON[m - 1]}`; };

export const pct = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined || Number.isNaN(v) ? "–" : `${v.toFixed(digits).replace(".", ",")} %`;
export const dec = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || Number.isNaN(v) ? "–" : v.toFixed(digits).replace(".", ",");

/** "2025" or "2024–2026" */
export const span = (ys: number[]) => (!ys.length ? "" : ys[0] === ys[ys.length - 1] ? String(ys[0]) : `${ys[0]}–${ys[ys.length - 1]}`);

/** Seconds as a race clock: 69.5 -> "1:09,50", 17.3 -> "17,30". Downhill runs are timed to the hundredth. */
export const clock = (s: number | null | undefined) => {
  if (s == null || Number.isNaN(s)) return "–";
  const neg = s < 0; s = Math.abs(s);
  const m = Math.floor(s / 60), x = s - m * 60;
  const sec = x.toFixed(2).replace(".", ",");
  return (neg ? "−" : "") + (m ? `${m}:${x < 10 ? "0" : ""}${sec}` : sec);
};

export const initials = (n: string) =>
  n.replace(/[^\p{L} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

export const firstName = (n: string) => n.split(" ")[0];

export const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ø/g, "o").replace(/æ/g, "ae");

export const listNo = (a: string[]) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} og ${a[a.length - 1]}` : a.join(""));
