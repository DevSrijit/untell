export type ColorRole =
  | "ground" | "surface" | "rule" | "ink" | "inkMuted" | "accent" | "accent2" | "accent3" | "accentText" | "onAccent"
  | "series1" | "series2" | "series3" | "series4" | "series5" | "positive" | "negative";

/** Series roles in order. Series 4 and 5 are context data with low contrast: never the only carrier of meaning. */
export const SERIES: ColorRole[] = ["series1", "series2", "series3", "series4", "series5"];
