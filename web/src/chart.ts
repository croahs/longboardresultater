import { useEffect, useRef, useState } from "react";

/* What the charts share: a block's width to draw to, round tick values, and colours for lines by rider. */

/** The width of the block the chart is drawn into, kept up to date. */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(760);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Round tick values from lo to hi: at most six, at a step of 1, 2 or 5 times a power of ten. */
export function ticks(lo: number, hi: number): number[] {
  const span = Math.max(hi - lo, 1), p = 10 ** Math.floor(Math.log10(span / 4));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => span / s <= 6) || 10 * p;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** Colours for lines told apart by rider, in the order riders are listed; inks that hold on paper. */
export const PALETTE = ["#17150f", "#2b5fb3", "#b4501a", "#2a7a4b", "#b8336a", "#6b4fb3", "#1f8a84", "#a08400", "#c8322b", "#7a766c"];
