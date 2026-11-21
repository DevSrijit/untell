// The sequence scene: the TLS 1.3 full handshake, as RFC 8446 (section 2, figure 1) draws it.
// The client can send its request after one round trip. Braces mark messages that the handshake
// keys protect; square brackets mark application data. Shared by Remotion and HyperFrames.
// No line over it: the note in the diagram says the point, and a line would pass the word budget (Graphite: 8).
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { pairOf } from "./chartFrame";

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => [
  ...pairOf(ctx, B, "", (box) => B.sequence({
    id: "tls", ...box,
    title: "TLS 1.3 handshake, RFC 8446",
    actors: [{ id: "c", label: "Client" }, { id: "s", label: "Server" }],
    steps: [
      { from: "c", to: "s", label: "ClientHello + key_share" },
      { from: "s", to: "c", label: "ServerHello + key_share" },
      { note: "Both sides now have the keys. { } means encrypted.", over: ["c", "s"] },
      { from: "s", to: "c", label: "{Certificate} {CertificateVerify} {Finished}" },
      { from: "c", to: "s", label: "{Finished}" },
      { from: "c", to: "s", label: "[Application Data]" },
    ],
    at: 0.3,
    every: 1.7,
  }, ctx)),
];
