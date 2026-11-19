// Turns a system's short-side fractions into pixels for one frame size. Shared by the Remotion
// adapter, the CSS export and the inspect tools, so every framework measures the same way.
import type { System, TypeRole } from "./systems";

/**
 * Where text may go. At 9:16, TikTok, Instagram Reels and YouTube Shorts cover parts of the frame with their own
 * UI; this is the area all three leave clear. Below lowBandTop, TikTok's side buttons also end text at lowBandRight.
 * All values are insets in px from each edge. Other shapes need only a small margin at the top and bottom.
 */
export function safeArea(width: number, height: number) {
  const tall = height / width > 1.5;
  return tall
    ? { top: 0.15 * height, bottom: 0.35 * height, left: 0.1111 * width, right: 0.1778 * width,
        lowBandTop: 0.4375 * height, lowBandRight: 0.2778 * width }
    : { top: 0.06 * height, bottom: 0.08 * height, left: 0, right: 0, lowBandTop: height, lowBandRight: 0 };
}

export function frameFor(s: System, width: number, height: number) {
  const short = Math.min(width, height);
  const safe = safeArea(width, height);
  const margin = s.margin * short;
  // At 9:16 the columns fill the area that text may use, which is wider on the left than the margin.
  const left = Math.max(margin, safe.left), right = Math.max(margin, safe.right);
  const gutter = 0.022 * short;
  const colW = (width - left - right - (s.columns - 1) * gutter) / s.columns;
  const type = Object.fromEntries(
    (Object.keys(s.type) as TypeRole[]).map((r) => [r, { ...s.type[r], px: Math.round(s.type[r].size * short) }]),
  ) as Record<TypeRole, System["type"][TypeRole] & { px: number }>;
  return { width, height, short, margin, left, right, gutter, columns: s.columns, colW, safe, type,
    radius: (s.radius * short) / 1080, stroke: Math.max(1, (s.stroke * short) / 1080) };
}

export const ASPECTS = { "9:16": [1080, 1920], "16:9": [1920, 1080], "1:1": [1080, 1080], "4:5": [1080, 1350] } as const;
