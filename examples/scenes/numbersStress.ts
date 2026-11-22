// A stress scene for the numbers group: awkward values, in four parts. Each part leaves (`until`)
// before the next one enters.
// 1. Counters: a 10-digit count in a 260 px box (no role fits it, so it goes compact: 9.88B), a count
//    with three decimals and no leading zeros (a marathon, 42.195 km, set right), and a target below
//    the start (refused: no roll, set in the centre).
// 2. Big stats: a 7-digit count, the pixels in a 3840 x 2160 frame (8,294,400), rolled up from a
//    1920 x 1080 frame (2,073,600, so +300 %); a negative change (−12.5 %) where down is good; and a
//    change of zero, set in the centre.
// 3. Meters: a bar with a value just above zero (minimum fill), and a ring whose value is past its
//    target, so the scale extends and the target tick sits away from 12 o'clock.
// 4. A ranking with a tie, 7-digit values and a long label that wraps.
import type { BLOCKS } from "../../src/system/scene/blocks";
import { lines } from "../../src/system/scene/context";
import type { Ctx, Node } from "../../src/system/scene/types";
import { column } from "./counter";

export const STRESS_SECONDS = 20;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  // Content starts 24 px below the safe top: fonts reach a little above their line boxes.
  const c0 = column(ctx);
  const c = { ...c0, top: c0.top + 24 };
  const lhL = ctx.lineHeight("label");
  const narrow = c.wide ? c.w : ctx.safe.lowBandRight - c.x; // ends by lowBandRight at 9:16
  const out: Node[] = [];
  const cap = (id: string, y: number, text: string, at: number, until: number) =>
    out.push(...lines(ctx, { id, x: c.x, y, lines: [text], role: "label", color: "inkMuted", at, until }));

  // Part 1: counters, 0.3 s to 4.4 s.
  const p1 = { at: 0.3, until: 4.4 };
  const box = (y: number, w: number) => ({ x: c.x, y, w, h: ctx.lineHeight("display") + ctx.size("display") * 0.5 });
  const third = (c.bottom - c.top) / 3;
  cap("s1-cap", c.top, "Ten digits, 260 px box", p1.at, p1.until);
  out.push(...B.counter({ id: "s1", ...box(c.top + lhL, 260), value: 9876543210, ...p1 }, ctx));
  cap("s2-cap", c.top + third, "Marathon, km", p1.at, p1.until);
  out.push(...B.counter({ id: "s2", ...box(c.top + third + lhL, narrow), value: 42.195, format: { decimals: 3 }, lead: "blank", align: "right", ...p1 }, ctx));
  cap("s3-cap", c.top + 2 * third, "Below the start: no roll", p1.at, p1.until);
  out.push(...B.counter({ id: "s3", ...box(c.top + 2 * third + lhL, narrow), value: 120, from: 500, align: "center", ...p1 }, ctx));

  // Part 2: big stats, 4.8 s to 9.4 s.
  const p2 = { at: 4.8, until: 9.4 };
  const h3 = (c.bottom - c.top) / 3;
  // The rolling stat goes last, away from the safe top: its digits leave upward through the mask.
  out.push(...B.bigStat({ id: "s4", x: c.x, y: c.top + 2 * h3, w: narrow, h: h3 - 16, value: 3840 * 2160, label: "Pixels in a 3840 by 2160 frame",
    count: { from: 1920 * 1080 }, delta: { value: ((3840 * 2160) / (1920 * 1080) - 1) * 100, format: { suffix: " %" }, context: "on 1920 by 1080" }, ...p2 }, ctx));
  out.push(...B.bigStat({ id: "s5", x: c.x, y: c.top, w: narrow, h: h3 - 16, value: 1042, label: "Trirmaipe Clinic missed visits",
    delta: { value: ((1042 - 1191) / 1191) * 100, format: { suffix: " %", decimals: 1 }, context: "on 2025", good: "down" }, ...p2 }, ctx));
  out.push(...B.bigStat({ id: "s5b", x: c.x, y: c.top + h3, w: narrow, h: h3 - 16, value: 84, label: "Klykidry Academy teachers",
    delta: { value: 0, context: "on 2025" }, align: "center", ...p2 }, ctx));

  // Part 3: meters, 9.8 s to 14.2 s.
  const p3 = { at: 9.8, until: 14.2 };
  const barBox = 320;
  out.push(...B.meter({ id: "s6", x: c.x, y: c.top, w: narrow, h: barBox, title: "Disk used, GB", value: 0.3, target: 500, format: { decimals: 1 }, targetLabel: "Quota", ...p3 }, ctx));
  out.push(...B.meter({ id: "s7", x: c.x, y: c.top + barBox + 40, w: narrow, h: c.bottom - c.top - barBox - 40, title: "Gamom Jyl, steps today", value: 12400, target: 10000,
    shape: "ring", count: true, ...p3 }, ctx));

  // Part 4: a ranking with a tie, 7-digit values and a long label, 14.6 s to the end.
  out.push(...B.ranking({ id: "s8", x: c.x, y: c.top, w: narrow, h: c.bottom - c.top, title: "Visits by clinic, per year", states: ["2025", "2026"],
    rows: [
      { label: "Trirmaipe Clinic, east campus", before: 1250000, after: 1320000 },
      { label: "Trirmaipe Clinic, west", before: 980000, after: 1320000 },
      { label: "Klykidry Academy nurse", before: 990000, after: 640000 },
    ], key: 1, at: 14.6, moveAt: 16.4 }, ctx));
  return out;
};
