// The number-line scene: how long a signal takes to cross a distance, one way, on a log scale.
// (Spec lists light's trip to the Moon as a subject to avoid, so the scale ends at a satellite hop.)
// Every value is computed here from distance / speed. Light in a vacuum travels 299,792.458 km/s.
// In optical fibre it is slower by the glass's group index, about 1.468, so about 204,218 km/s.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { chartFrame } from "./chartFrame";

const C = 299_792.458; // km/s, exact by definition of the metre
const FIBRE = C / 1.468; // km/s
const ms = (km: number, speed = C) => (km / speed) * 1000;

const fibre100 = ms(100, FIBRE); // 0.49 ms
const equator = ms(40_075); // 133.7 ms: once around the Earth at the equator
const geoHop = ms(2 * 35_786); // 238.7 ms: up to a geostationary satellite and down again
const atlantic = ms(5_600, FIBRE); // 27.4 ms: a 5,600 km cable across the Atlantic
const frame = (fps: number) => 1000 / fps; // one video frame, from 60 fps (16.7 ms) to 24 fps (41.7 ms)

const msText = (v: number) => `${v >= 100 ? Math.round(v).toLocaleString("en-US") : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ms`;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  // (The low-axis form of a tall box leaves labels out with this many events, so the demo keeps the vertical form in
  // the text-safe area; see the block's header.)
  const F = chartFrame(ctx, B, "A satellite hop costs a quarter second");
  return [
    ...F.nodes,
    ...B.numberLine({
      id: "light", ...F.box,
      orientation: F.tall ? "vertical" : "horizontal",
      title: "Signal travel time, one way, in milliseconds (log scale)",
      min: 0.1, max: 1_000, scale: "log",
      markers: [
        { value: fibre100, valueLabel: msText(fibre100), label: "100 km of fibre", at: 1.2 },
        { value: equator, valueLabel: msText(equator), label: "Round the equator", at: 2.2 },
        { value: geoHop, valueLabel: msText(geoHop), label: "Via one satellite", key: true, at: 3.2 },
        { value: atlantic, valueLabel: msText(atlantic), label: "Atlantic by fibre", at: 4.2 },
      ],
      ranges: [{ from: frame(60), to: frame(24), valueLabel: `${frame(60).toFixed(1)}–${frame(24).toFixed(1)} ms`, label: "One video frame", at: 5.2 }],
      at: 0.3,
    }, ctx),
    ...B.hold({ at: 6.2, until: 9 }, ctx),
  ];

};
