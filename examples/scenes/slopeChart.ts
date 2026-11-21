// The slope-chart scene: hours of daylight on the June and the December solstice, by latitude.
// Every value is computed: day length = 24/π · arccos(−tan φ · tan δ), with the sun's declination
// δ = ±23.44°. It is the geometric day (sun's centre on the horizon, no refraction), so real
// sunrise-to-sunset times run a few minutes longer. At the equator the day stays 12 hours all year.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { pairOf } from "./chartFrame";

const rad = Math.PI / 180;
const day = (lat: number, decl: number) => (24 / Math.PI) * Math.acos(-Math.tan(lat * rad) * Math.tan(decl * rad));
const lats = [0, 10, 20, 40, 50, 60];

export const seconds = 8;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => [
  ...pairOf(ctx, B, "Far north, the year swings hardest", (box) => B.slopeChart({
    id: "daylight", ...box,
    title: "Hours of daylight at the solstices, by latitude",
    fromLabel: "June", toLabel: "December",
    items: lats.map((l) => ({ label: l === 0 ? "0°" : `${l}° N`, from: day(l, 23.44), to: day(l, -23.44) })),
    key: 5,
    format: { decimals: 1 },
    at: 0.3,
  }, ctx)),
  ...B.hold({ at: 4.5, until: seconds }, ctx),
];
