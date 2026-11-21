// The tree scene: the DNS namespace. Every name is a path from the root; www.example.com reads right
// to left: the root, then com, then example.com, then www. The names are the ones RFC 2606 reserves
// for examples. Shared by Remotion and HyperFrames.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { pairOf } from "./chartFrame";

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => [
  ...pairOf(ctx, B, "Every name is a path from the root", (box) => B.tree({
    id: "dns", ...box,
    title: "The DNS namespace: read a name right to left",
    root: {
      label: "Root", key: true, children: [
        { label: "com", key: true, children: [{ label: "example.com", key: true, children: [{ label: "www.example.com", key: true }] }] },
        { label: "org" },
        { label: "net" },
      ],
    },
    at: 0.3,
  }, ctx)),
];
