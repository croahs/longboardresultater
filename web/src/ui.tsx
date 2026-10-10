import type { ReactNode } from "react";
import type { RaceType } from "./data";
import { TYPE_LABEL } from "./format";

/* Small shared pieces: icons drawn inline, the brand mark, empty and loading states. */

const I = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
export const Icon = {
  search: () => <I d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2-4.3-4.3" />,
  overview: () => <I d="M4 20V10m6 10V4m6 16v-7m4 7H4" />,
  trend: () => <I d="M3 17l6-6 4 4 8-8m0 0h-5m5 0v5" />,
  rivals: () => <I d="M8 21v-4a4 4 0 0 1 8 0v4M12 3v4m-6 3a2 2 0 1 0 4 0 2 2 0 0 0-4 0zm8 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0z" />,
  races: () => <I d="M4 6h16M4 12h16M4 18h10" />,
  hill: () => <I d="M3 20 10 6l4 7 3-4 4 11z" />,
  flag: () => <I d="M5 21V4m0 0h12l-2 4 2 4H5" />,
  play: () => <I d="M6 4l14 8-14 8z" />,
  out: () => <I d="M14 4h6v6m0-6L10 14M20 14v6H4V4h6" />,
  back: () => <I d="M19 12H5m0 0 7-7m-7 7 7 7" />,
  close: () => <I d="M6 6l12 12M18 6 6 18" />,
};

/** The mark: a steep road in two stripes. */
export const BrandMark = () => (
  <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="var(--ink)" /><path d="M5 8h9l13 16h-9z" fill="var(--accent)" /><path d="M5 24h5l3-4H8z" fill="var(--bg)" /></svg>
);

export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => <div className="empty"><b>{title}</b>{children}</div>;
export const Loading = ({ what }: { what: string }) => <div className="loading" role="status">Henter {what} …</div>;

/** The class a race was run in, as a pill in the kind's colour: "Masters", "Open Eurotour", "Tidskjøring". */
export const Cls = ({ type, cls, big }: { type: RaceType; cls?: string; big?: boolean }) => <span className={`pill type-${type}${big ? " big" : ""}`}>{cls || TYPE_LABEL[type]}</span>;

/** The share of the field beaten, as a bar. */
export const Beaten = ({ v }: { v: number }) => <span className="beaten" aria-hidden="true"><i style={{ width: `${Math.max(2, Math.min(100, v))}%` }} /></span>;
