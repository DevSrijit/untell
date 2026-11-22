// endCard passes `lines` and `markSize` to its lockup, reads `enter`, and its build warning names only its own props.
import { describe, expect, test } from "bun:test";
import { SYSTEMS } from "../../systems";
import { makeCtx } from "../context";
import type { Ctx, Node } from "../types";
import { BLOCKS } from ".";
import { endCard, type EndCardProps } from "./endCard";

const ctxOf = (id: string, w = 1080, h = 1920): Ctx => {
  const s = SYSTEMS.find((x) => x.id === id)!;
  return makeCtx(s, w, h, (t, r) => t.length * s.type[r].size * Math.min(w, h) * 0.5);
};
const warnings = <T,>(f: () => T): [T, string[]] => {
  const w = console.warn, seen: string[] = [];
  console.warn = (...a: unknown[]) => { seen.push(a.join(" ")); };
  try { return [f(), seen]; } finally { console.warn = w; }
};
const names = (ns: Node[]) => ns.filter((n) => n.kind === "text" && /-name(-l\d)?$/.test(n.id)).map((n) => n.id);

describe("endCard props", () => {
  test("lines: 2 sets the name on two lines", () => {
    const ctx = ctxOf("keynote");
    const [one] = warnings(() => BLOCKS.endCard({ id: "c", name: "Harbour Lamps", at: 2 }, ctx));
    const [two] = warnings(() => BLOCKS.endCard({ id: "c", name: "Harbour Lamps", lines: 2, at: 2 }, ctx));
    expect(names(one)).toEqual(["c-name"]);
    expect(names(two)).toEqual(["c-name", "c-name-l2"]);
  });
  test("the warning names only props that endCard has", () => {
    const ctx = ctxOf("keynote");
    const box = { x: ctx.safe.left, y: ctx.safe.top, w: 240, h: ctx.safe.bottom - ctx.safe.top };
    const [, seen] = warnings(() => BLOCKS.endCard({ id: "c", name: "Lanterns of the Northern Harbour", mark: "circle", markSize: 400, box, at: 2 }, ctx));
    const said = seen.join("\n");
    expect(said).toContain("lines: 2");
    expect(said).toContain("markSize");
    // Each prop the advice names, as a key of EndCardProps (the type check fails if one is missing).
    const has: (keyof EndCardProps)[] = ["lines", "markSize", "axis"];
    const named = [...said.matchAll(/\((\w+): /g), ...said.matchAll(/smaller (\w+)/g)].map((m) => m[1]!);
    for (const n of named) expect(has as string[]).toContain(n);
  });
  test("enter chooses the entrance in a direct call; reveal still works", () => {
    const ctx = ctxOf("keynote");
    const opacityAt = (ns: Node[]) => JSON.stringify((ns.find((n) => n.id === "c-name") as Node & { tracks: { opacity: unknown } }).tracks.opacity);
    const [cutNew] = warnings(() => endCard({ id: "c", name: "Ovenri", enter: "cut", at: 2 }, ctx));
    const [cutOld] = warnings(() => endCard({ id: "c", name: "Ovenri", reveal: "cut", at: 2 }, ctx));
    const [fade] = warnings(() => endCard({ id: "c", name: "Ovenri", enter: "fade", at: 2 }, ctx));
    expect(opacityAt(cutNew)).toBe(opacityAt(cutOld));
    expect(opacityAt(fade)).not.toBe(opacityAt(cutNew));
  });
});
