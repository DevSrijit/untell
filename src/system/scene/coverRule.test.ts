// One cover verdict for the kit and the detector: judgeCover (scene/cover.ts) is a port of
// scripts/inspect/checks/cover_rule.py `judge`. Both read the same cases (examples/detector/cover_rule_cases.json).
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { judgeCover } from "./cover";

const cases = JSON.parse(readFileSync(resolve(import.meta.dir, "../../../examples/detector/cover_rule_cases.json"), "utf8")).cases as
  { name: string; letters: [string, number, number, number | null][]; fails: string[]; letter?: number; word?: number }[];

for (const c of cases) {
  test(`cover rule: ${c.name}`, () => {
    const j = judgeCover(c.letters.map(([ch, h, a, k]) => [ch, h, a, k ?? undefined] as [string, number, number, number?]));
    expect([...j.fails].sort() as string[]).toEqual([...c.fails].sort());
    if (c.letter !== undefined) expect(j.letter).toBeCloseTo(c.letter, 3);
    if (c.word !== undefined) expect(j.word).toBeCloseTo(c.word, 3);
  });
}
