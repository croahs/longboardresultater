import { t } from "./lang";

/* The grade colours: the one rule for the road ribbons in 3D and the legend in the UI. */
/** Colour of a stretch by its downhill grade in percent (positive = descending): red 9 %+, orange 7–9, yellow 5–7, green under 5, blue uphill. */
export function gradeColour(down: number): string {
  if (down < 0) return "#4d8bff";
  if (down >= 9) return "#ff3b4e";
  if (down >= 7) return "#ff7a1f";
  if (down >= 5) return "#ffd23f";
  return "#43d17c";
}
export const gradeLegend = (): [string, string][] => [["#ff3b4e", "9 % +"], ["#ff7a1f", "7–9 %"], ["#ffd23f", "5–7 %"], ["#43d17c", "0–5 %"], ["#4d8bff", t("oppover", "uphill")]];

