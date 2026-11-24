// The skill text from agents' films: one text for both harnesses, each step a command with the result to expect,
// untell render for the final file, the media rules, the HyperFrames CLI, and no two file names that differ by case.
import { describe, expect, test } from "bun:test";
import { agentsSection, skill } from "../src/templates";

describe("the skill text", () => {
  for (const fw of ["remotion", "hyperframes"] as const) {
    const s = skill(fw);
    test(`${fw}: no two files it names differ only by the case of a letter`, () => {
      const names = [...s.matchAll(/`([\w./<>-]+\.(?:tsx?|html))`/g)].map((m) => m[1]!);
      const seen = new Map<string, string>();
      for (const n of names) {
        const k = n.toLowerCase().replace(/\.tsx?$/, "");
        const other = seen.get(k);
        if (other && other !== n) throw new Error(`${n} and ${other} differ only by case or extension`);
        seen.set(k, n);
      }
    });
    test(`${fw}: it says what to do when the brief gives no media, and names no source`, () => {
      expect(s).toMatch(/When the brief gives no files and lets you fetch them, find them yourself/);
      // A brief with no files and no downloads, and a film with no sound, each have their path.
      expect(s).toMatch(/forbids downloads, or asks for type and shapes only: add no media/);
      expect(s).toMatch(/export const silent = "<the reason>";/);
      expect(s).toMatch(/With no sound/);
      expect(s).toMatch(/--source <where it came from> --licence <the licence and its page>/);
      expect(s).toMatch(/does not check a licence/);
      expect(s).toMatch(/child whose face a viewer can identify/);
      expect(s).toMatch(/Prefer pictures with no identifiable face/);
      expect(s).not.toMatch(/https?:\/\/|www\./);
    });
    test(`${fw}: the final file comes from untell render, and the framework's render command is never named`, () => {
      expect(s).toContain("npx untell render films".replace("films", fw === "remotion" ? "src/films" : "films"));
      expect(s + agentsSection(fw)).not.toMatch(/npx (remotion|hyperframes) render/);
      expect(s).toMatch(/Only after step 6 passes/);
      expect(s).toMatch(/--render <final file> --sheet/);
      expect(s).toMatch(/listen mix <final file>/);
      expect(s).toMatch(/no effect louder than the music's peak/);
    });
    test(`${fw}: every numbered step says when it is done`, () => {
      const steps = s.slice(s.indexOf("## Steps"), s.indexOf("## Rules")).split(/\n(?=\d+\. \*\*)/).slice(1);
      expect(steps.length).toBe(11);
      for (const st of steps) expect(st).toMatch(/Done (when|where)|^\d+\. \*\*(Critique|Done)/);
    });
    test(`${fw}: one cause at a time, declared findings with a reason, snap after a preview with ids by commas or spaces`, () => {
      expect(s).toMatch(/Make one fix per cause: fix the first cause, then run the check again/);
      expect(s).toMatch(/`passed with <n> warnings: fix or declare each before delivery`/);
      expect(s).toMatch(/the text-safe area \(`ctx.safe`\) ends at 65 % of the height/i);
      expect(s).toMatch(/low trust .* cut on `cuts` all the same/);
      expect(s).toMatch(/\/\/ untell-ignore <rule> \[node\]: <reason>/);
      expect(s).toMatch(/Ids go with commas or spaces/);
      expect(s).toMatch(/refuses a hunk that you did not preview/);
    });
    test(`${fw}: the playbooks in their order, with the craft floor read once, and the two levels`, () => {
      const at = ["shape.md", "craft.md", "critique.md", "polish.md"].map((f) => s.indexOf(`\`${f}\``));
      expect([...at].sort((a, b) => a - b)).toEqual(at);
      expect(s).toMatch(/Read `craft-floor.md` once before you start/);
      expect(s).not.toMatch(/before each edit/);
      // Draft is the default level: no FILM.md, no critique, no polish, one render. A finish is bounded.
      expect(s).toMatch(/\*\*Draft is the default\.\*\*/);
      expect(s.indexOf("**Draft: a first film, fast.**")).toBeLessThan(s.indexOf("**Finish: a film to publish.**"));
      expect(s).toMatch(/Do not do the critique or the polish in a draft\. Do not loop\./);
      expect(s).toMatch(/at most three moves, one at a time, with step 6 after each move\. Do not render between moves/);
    });
  }
  test("use it your way: a film that is not an untell scene, a block and a system of your own", () => {
    for (const fw of ["remotion", "hyperframes"] as const) {
      const s = skill(fw);
      expect(s).toContain("npx untell check <video> --sheet");
      expect(s).toContain("--no-scene");
      expect(s).toContain("docs/playbooks/BLOCK.md");
      expect(s).toContain("npx untell system new <name> --from <id>");
      expect(s).toContain(`${fw === "remotion" ? "src/systems" : "systems"}/<name>/system.ts`);
    }
  });
  test("HyperFrames: how untell finds the CLI, and no bare npx hyperframes", () => {
    const s = skill("hyperframes");
    expect(s).toContain("UNTELL_HYPERFRAMES");
    expect(s).toContain("node_modules/.bin/hyperframes");
    expect(s).toMatch(/Do not run a bare `npx hyperframes`/);
  });
  test("Remotion: tsc is a step, and a film needs no Root entry", () => {
    const s = skill("remotion");
    expect(s).toContain("npx tsc --noEmit");
    expect(s).toMatch(/needs no entry in your Root/);
  });
});
