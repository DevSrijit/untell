// Measures text with the real font and the exact CSS the renderers use (tracking, case, tabular
// figures, symbol fallback), through a hidden span. The font must be loaded first; both renderers wait for it.
import type { System, TypeRole } from "../systems";
import { textStyle, type Families } from "./layout";

export function makeMeasure(s: System, families: Families, short: number) {
  const span = document.createElement("span");
  span.setAttribute("aria-hidden", "true");
  Object.assign(span.style, { position: "absolute", left: "-99999px", top: "0", visibility: "hidden", whiteSpace: "pre" });
  document.body.appendChild(span);
  const cache = new Map<string, number>();
  // keepCase, weight and italic change the width (capitals and bold are wider), so they are part of the cache key.
  return (text: string, role: TypeRole, opts?: { keepCase?: boolean; weight?: number; italic?: boolean }) => {
    const keep = !!opts?.keepCase;
    const key = `${role}|${keep ? "k" : ""}|${opts?.weight ?? ""}|${opts?.italic ? "i" : ""}|${text}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    // The span keeps the style of the last text it measured: an upright text after an italic one sets it back.
    span.style.fontStyle = ""; span.style.removeProperty("font-synthesis-style");
    Object.assign(span.style, textStyle(s, families, role, short, keep, opts?.weight, !!opts?.italic));
    span.textContent = text;
    const w = span.getBoundingClientRect().width;
    cache.set(key, w);
    return w;
  };
}
