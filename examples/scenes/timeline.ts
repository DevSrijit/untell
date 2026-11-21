// The timeline scene: milestones of the telephone, 1876 to 1991. No people or companies are named.
// - 1876, 7 March: the first telephone patent is granted (US patent 174,465).
// - 1915, 25 January: the first coast-to-coast call in the United States (New York to San Francisco).
// - 1956, 25 September: the first transatlantic telephone cable opens.
// - 1973, 3 April: the first call from a handheld mobile phone (New York).
// - 1991, 1 July: the first call on a GSM network, the first 2G digital standard (Helsinki).
// Eras: the first analog cellular network (1G) opened in Tokyo in 1979; GSM (2G) began in 1991;
// the first 3G network opened in Japan in October 2001, so the 2G span ends there.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { chartFrame } from "./chartFrame";

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  // (The low-axis form of a tall box leaves labels out with this many events, so the demo keeps the vertical form in
  // the text-safe area; see the block's header.)
  const F = chartFrame(ctx, B, "Patent to pocket: 97 years");
  return [
    ...F.nodes,
    ...B.timeline({
      id: "phone", ...F.box,
      orientation: F.tall ? "vertical" : "horizontal",
      title: "The telephone: milestones by year",
      from: 1870, to: 2010,
      events: [
        { when: 1876, label: "Telephone patent" },
        { when: 1915, label: "Coast-to-coast call" },
        { when: 1956, label: "Transatlantic cable" },
        { when: 1973, label: "Handheld mobile call", key: true },
        { when: 1991, label: "First GSM call" },
      ],
      eras: [
        { from: 1979, to: 1991, label: "1G" },
        { from: 1991, to: 2001, label: "2G" },
      ],
      now: { at: 1.0, seconds: 6 },
      at: 0.3,
    }, ctx),
  ];

};
