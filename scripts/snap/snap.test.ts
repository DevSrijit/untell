// Tests for untell snap and the align/* checks on recorded films: each check fires on its planted bad film and on the
// kiln queue frame as a review saw it, and stays quiet on the fixed films; the CLI's proposals are stable; --apply and
// --unapply round-trip the snap table in a scene's source.
// Also: check and snap name the same ids (parity), ids by commas or spaces, scene guides.
// Run: bun test scripts/snap/snap.test.ts   (it records the align films when they are missing; allow a few minutes)
import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..", "..");
const FILMS = "src/films/align.tsx";
type Finding = { check: string; severity: string; node?: string; snap?: string };

function detect(ids: string[]) {
  const r = spawnSync("bun", [join(ROOT, "scripts/detect.ts"), ...ids, "--films", FILMS, "--json"], { cwd: ROOT, encoding: "utf8", timeout: 1800000, maxBuffer: 1 << 28 });
  if (r.status !== 0 && r.status !== 1) throw new Error(`detect failed: ${r.stderr.slice(-2000)}`);
  const out = new Map<string, Finding[]>();
  for (const id of ids) out.set(id, JSON.parse(readFileSync(join(ROOT, "out/detector", id, "findings.json"), "utf8")).findings);
  return out;
}
function detectIn(films: string, ids: string[]) {
  const r = spawnSync("bun", [join(ROOT, "scripts/detect.ts"), ...ids, "--films", films, "--json"], { cwd: ROOT, encoding: "utf8", timeout: 1800000, maxBuffer: 1 << 28 });
  if (r.status !== 0 && r.status !== 1) throw new Error(`detect failed: ${r.stderr.slice(-2000)}`);
}
const AT: Record<string, string> = { "align-planted-bad": "1.5", "align-planted-good": "1.5", "align-guides": "2" };
const snap = (id: string, more: string[] = []) => {
  const r = spawnSync("bun", [join(ROOT, "scripts/snap/cli.ts"), id, "--films", FILMS, "--at", AT[id] ?? "7", ...more], { cwd: ROOT, encoding: "utf8", timeout: 300000 });
  if (r.status !== 0) throw new Error(r.stderr.slice(-2000));
  return r.stdout;
};

const res = detect(["align-planted-bad", "align-planted-good", "align-kiln", "align-kiln-snapped"]);
const checks = (id: string) => (res.get(id) ?? []).filter((f) => f.check.startsWith("align/") || f.check === "panel-near-miss");

for (const c of ["align/centre", "align/baseline", "align/near-miss", "align/rhythm", "align/half-px"]) {
  test(`${c}: fires on the planted flaw, quiet on the fix`, () => {
    expect(checks("align-planted-bad").some((f) => f.check === c && f.severity === "error")).toBe(true);
    expect(checks("align-planted-good").filter((f) => f.check === c)).toEqual([]);
  });
}

test("the kiln queue frame: cone 10 off its pill's centre, and the button's bottom off the tab rule", () => {
  const k = checks("align-kiln");
  expect(k.some((f) => f.check === "align/centre" && f.node === "row1-badge-text" && f.snap)).toBe(true);
  expect(k.some((f) => f.check === "align/near-miss" && f.node === "start-face x tabs-rule" && f.snap)).toBe(true);
  expect(checks("align-kiln-snapped")).toEqual([]);
});

test("the proposals are a stable diff", () => {
  const a = JSON.parse(snap("align-kiln", ["--json"])), b = JSON.parse(snap("align-kiln", ["--json"]));
  expect(a.proposals.map((p: { id: string }) => p.id)).toEqual(b.proposals.map((p: { id: string }) => p.id));
  const tab = a.proposals.find((p: { el: string; joins: { el: string } }) => p.el === "tabs-rule" && p.joins.el === "start-face");
  expect(tab).toMatchObject({ group: "tabs-*", delta: 18, axis: "y" });
  const cone = a.proposals.find((p: { el: string }) => p.el === "row1-badge-text");
  expect(cone).toMatchObject({ kind: "centre", delta: 6, nodes: ["row1-badge-text"] });
}, 300000);

test("a hunk that builds on another brings it into a preview", () => {
  // "cone 6" in its pill is one hunk of a cause group (the badge texts and the metas of the rows ride high): alone it
  // trades one issue for another, so it needs the rest of its group, and a preview takes them all.
  const out = snap("align-kiln", ["--preview", "c-2hite", "--out", join(ROOT, "out/snap/test-needs")]);
  expect(out).toMatch(/c-2hite needs \S+; it is added/);
  expect(out).toMatch(/issues before \d+, after \d+/);
  expect(out).toMatch(/after \d+ move\(s\)/);
}, 300000);

// An agent's film: a finding named snap ids that snap did not list at the finding's time. The check's align
// pass and snap now read the same capture with one rest rule, so every id a finding names resolves (parity.ts).
test("every snap id a finding names exists in snap at the finding's time (the kiln frame, the planted frame, a moving reel)", () => {
  const SETS: [string, string[]][] = [[FILMS, ["align-kiln", "align-planted-bad"]], ["src/films/reels.tsx", ["reel-graphite"]]];
  for (const [films, ids] of SETS) {
    if (films !== FILMS) detectIn(films, [...ids]);
    const r = spawnSync("bun", [join(ROOT, "scripts/snap/parity.ts"), "--films", films, ...ids], { cwd: ROOT, encoding: "utf8", timeout: 900000 });
    // No id is ever missing, and some ids were checked. A stale check capture (a block changed after the check
    // recorded) is said, not hidden; the frozen align films, just checked, are never stale.
    const last = r.stdout.trim().split("\n").at(-1)!;
    // The frozen align films always name ids; a reel or an agent's film may name none now (then there is nothing to miss).
    expect(last).toMatch(films === FILMS ? /^[1-9]\d* id\(s\) named by findings; 0 missing in snap/ : /^\d+ id\(s\) named by findings; 0 missing in snap/);
    if (films === FILMS) expect(last).not.toContain("stale");
  }
}, 1200000);

test("ids pass by commas, by spaces, or both; an unknown id lists the ids that exist", () => {
  const all = JSON.parse(snap("align-kiln", ["--json"])).proposals.map((p: { id: string }) => p.id);
  const [a, b] = [all[0], all[1]];
  for (const form of [[`${a},${b}`], [a, b], [`${a},`, b]]) {
    const out = snap("align-kiln", ["--preview", ...form, "--out", join(ROOT, "out/snap/test-ids")]);
    expect(out).toContain("after 2 move(s)");
  }
  const r = spawnSync("bun", [join(ROOT, "scripts/snap/cli.ts"), "align-kiln", "--films", FILMS, "--at", "7", "--preview", "e-zzzzz"], { cwd: ROOT, encoding: "utf8", timeout: 300000 });
  expect(r.status).toBe(2);
  expect(r.stderr).toContain(`The proposals at 7.00 s: ${all.join(" ")}`);
}, 600000);


test("a scene's guides: the card off its column and the caption off the baseline grid, each joined to its guide", () => {
  const j = JSON.parse(snap("align-guides", ["--json"]).replace(/^[^{]*/, ""));
  const ps = j.proposals as { el: string; joins: { el: string }; delta: number; nodes: string[] }[];
  expect(ps.find((p) => p.el === "stat2-card")).toMatchObject({ joins: { el: "guide:scene.col5.left" }, delta: -6 });
  expect(ps.find((p) => p.el === "caption")).toMatchObject({ joins: { el: "guide:scene.baseline" }, delta: -3 });
}, 300000);

const scene = join(ROOT, "scripts/snap/fixtures/kilnQueueSnapped.ts");
const kept = readFileSync(scene, "utf8");
afterAll(() => writeFileSync(scene, kept));

test("--unapply and --apply round-trip the snap table", () => {
  snap("align-kiln-snapped", ["--unapply", "all"]);
  expect(readFileSync(scene, "utf8")).not.toContain("export const SNAPS");
  expect(JSON.parse(snap("align-kiln-snapped", ["--json"])).proposals.length).toBeGreaterThan(10);
  snap("align-kiln-snapped", ["--apply", "all"]);
  expect(readFileSync(scene, "utf8")).toContain("export const scene = withSnap(sceneBeforeSnap, SNAPS);");
  expect(JSON.parse(snap("align-kiln-snapped", ["--json"])).proposals).toEqual([]);
}, 600000);
