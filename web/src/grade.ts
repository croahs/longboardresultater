import { t } from "./lang";

/* The grade colours: the one rule for the road ribbons in 3D and the legend in the UI. */
/** Colour of a stretch by its downhill grade in percent (positive = descending): red 9 %+, orange 7–9, yellow 5–7, green under 5, blue uphill. */
export function gradeColour(down: number): string {
  if (down < 0) return "#2b5fb3";
  if (down >= 9) return "#c8322b";
  if (down >= 7) return "#d8761b";
  if (down >= 5) return "#d4a700";
  return "#2f8f55";
}
export const gradeLegend = (): [string, string][] => [["#c8322b", "9 % +"], ["#d8761b", "7–9 %"], ["#d4a700", "5–7 %"], ["#2f8f55", "0–5 %"], ["#2b5fb3", t("oppover", "uphill")]];

