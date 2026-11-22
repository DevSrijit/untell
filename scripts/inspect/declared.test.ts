// Declaration ids: a declared block id covers its own parts, not another block whose id starts with it
// ("tick" does not cover "tick-dim"); "tick-*" covers every id that starts with "tick-"; a template id on the next line
// is read as that prefix; and a written template id ("tick-") says why it matched nothing.
import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { declares } from "../../src/system/scene/align";

const INSPECT = join(import.meta.dir);
const py = (code: string) => spawnSync("python3", ["-c", `import sys; sys.path[:0] = ["${INSPECT}", "${join(INSPECT, "checks")}"]\n${code}`], { encoding: "utf8" });

test("node ids: whole block ids, explicit prefixes, template ids", () => {
  const r = py(`from detect import node_match
print(node_match("tick", "tick-dim", ["tick", "tick-dim"]), node_match("tick", "tick-0", ["tick", "tick-dim"]), node_match("tick", "tick-dim-0", ["tick", "tick-dim"]),
      node_match("tick-*", "tick-3"), node_match("tick-*", "ticker"), node_match("joint-line", "joint-line-0", ["joint-line"]))`);
  expect(r.stderr).toBe("");
  expect(r.stdout.trim()).toBe("False True False True False True");
});

test("a template id on the next line binds as its prefix; a written one says it cannot be read", () => {
  const d = mkdtempSync(join(tmpdir(), "untell-decl-"));
  const f = join(d, "scene.ts");
  writeFileSync(f, ["// untell-ignore reading-time: short labels on purpose", "  ...B.text({ id: `tick-${i}`, text: t }, ctx),", "// untell-ignore reading-time tick-: written by hand", ""].join("\n"));
  const r = py(`import json
from detect import declarations, why_unused
class F: id = "x"
import detect
detect.DET_DIR = __import__("pathlib").Path("${d}")
(__import__("pathlib").Path("${d}") / "x").mkdir(exist_ok=True)
(__import__("pathlib").Path("${d}") / "x" / "sources.json").write_text(json.dumps(["${f}"]))
ds, why = declarations(F(), ["reading-time"])
print(json.dumps([d["nodes"] for d in ds]))
print(why_unused(ds[1], [], {}))`);
  expect(r.stderr).toBe("");
  const [nodes, why] = r.stdout.trim().split("\n");
  expect(JSON.parse(nodes!)).toEqual([["tick-*"], ["tick-"]]);
  expect(why).toMatch(/template id .* declare tick-\*/);
});

test("align declarations take tick-* as a prefix", () => {
  const i = { check: "align/near-miss", nodes: ["tick-*"], reason: "r" };
  expect(declares(i, "align/near-miss", ["tick-4-label"])).toBe(true);
  expect(declares(i, "align/near-miss", ["ticker"])).toBe(false);
});

test("a block's text-safe warning that off-safe did not measure is a finding; one that off-safe found stays a note", () => {
  const r = py(`import detect
class F:
    seconds = 4.0
    notes = [{"check": "block-warning", "node": "cap", "message": "text cap: outside the text-safe area", "measuredBy": "off-safe"},
             {"check": "block-warning", "node": "tag", "message": "callout tag: outside the text-safe area", "measuredBy": "off-safe"}]
    def t(self, f): return f / 30
import block_warning
block_warning.span = lambda film, node: (30, 60)
out = detect.promoted_block_warnings(F(), [{"check": "off-safe", "node": "tag-0"}])
print([(f["check"], f["node"], f["severity"]) for f in out])`);
  expect(r.stderr).toBe("");
  expect(r.stdout.trim()).toBe("[('block-warning', 'cap', 'warning')]");
});

test("every check that a system's direction names is a real rule id", () => {
  const r = py(`import re, rules
ids = {r["id"] for r in rules.RULES}
s = open("${join(INSPECT, "../../src/system/direction.ts")}").read()
print(sorted(u for u in set(re.findall(r'measurable: \\{ check: "([^"]+)"', s)) if u not in ids and not any(i.startswith(u + "/") for i in ids)))`);
  expect(r.stderr).toBe("");
  expect(r.stdout.trim()).toBe("[]");
});

test("sound checks compare the figure they print, and read the bed by its true peak", () => {
  const r = py(`import numpy as np, sound_checks as sc
# A sine at a quarter of the sample rate, phase-shifted: its samples miss the crest by 3 dB; the true peak finds it.
n = np.arange(4000); x = np.sin(2 * np.pi * n / 4 + np.pi / 4)[:, None] * 0.5
env = sc.true_peak_envelope(np.hstack([x, x * 0.1]))
print(round(float(np.abs(x).max()), 3), round(float(env.max()), 2))
print(sc.OVER_DB, bool(round(5.96, 1) < sc.OVER_DB))`);
  expect(r.stderr).toBe("");
  const [peaks, over] = r.stdout.trim().split("\n");
  const [sample, tp] = peaks!.split(" ").map(Number);
  expect(tp! - sample!).toBeGreaterThan(0.1);
  expect(over).toBe("6.0 False");
});

test("hook: rules that meet end to end and close are a shape; an open chain is not", () => {
  const r = py(`import sys; sys.path.insert(0, "${join(INSPECT, "checks")}")
import hook
class F:
    nodes = [{"id": "a", "kind": "path", "d": "M97.5 1540L481 701"}, {"id": "b", "kind": "path", "d": "M481 701L982.5 1540"},
             {"id": "c", "kind": "path", "d": "M982.5 1540L97.5 1540"}, {"id": "d", "kind": "path", "d": "M100 100L500 100"}]
    def node(self, i): return next((n for n in self.nodes if n["id"] == i), None)
print(hook.closed_lines(F(), ["a", "b", "c"]), hook.closed_lines(F(), ["a", "b", "d"]))`);
  expect(r.stderr).toBe("");
  expect(r.stdout.trim()).toBe("(97.5, 701.0, 982.5, 1540.0) None");
});

test("hit-double reads the part a hit plays (hit's part), not the whole file", () => {
  const r = py(`import numpy as np, sound_checks as sc
sr = sc.SR_BANDS
x = np.zeros(int(0.6 * sr)); x[int(0.02 * sr):int(0.05 * sr)] = 0.8; x[int(0.4 * sr):int(0.43 * sr)] = 0.8
print(len(sc.transients(x, sr=sr)), len(sc.transients(x[:int(0.2 * sr)], sr=sr)))`);
  expect(r.stderr).toBe("");
  expect(r.stdout.trim()).toBe("2 1");
});

test("a lint rule's declaration is untell lint's: the check never counts it as unused, so lint and check agree", () => {
  const d = mkdtempSync(join(tmpdir(), "untell-decl-"));
  const f = join(d, "scene.ts");
  writeFileSync(f, ["// untell-ignore tell/silent: the system is near silent", "export const seconds = 12;", "// untell-ignore reading-time: short labels", "  ...B.text({ id: \"cap\", text: t }, ctx),", ""].join("\n"));
  const r = py(`import json, pathlib
import detect
class F: id = "x"
detect.DET_DIR = pathlib.Path("${d}")
(pathlib.Path("${d}") / "x").mkdir(exist_ok=True)
(pathlib.Path("${d}") / "x" / "sources.json").write_text(json.dumps(["${f}"]))
ds, why = detect.declarations(F(), ["reading-time"])
notes = detect.settle(ds, [], {})
print(json.dumps([[d["rule"], bool(d.get("lint")), d["known"]] for d in ds]))
print(json.dumps([n["unused"] for n in notes]))`);
  expect(r.stderr).toBe("");
  const [decl, unused] = r.stdout.trim().split("\n");
  expect(JSON.parse(decl!)).toEqual([["tell/silent", true, true], ["reading-time", false, true]]);
  // Only the detector rule that matched nothing is unused; the lint rule is not.
  expect(JSON.parse(unused!)).toEqual(["scene.ts:3: reading-time cap"]);
});

test("a declared reveal whose block shows in the frame 7 frames late, or 15 frames early, is a warning; within the step it passes", () => {
  // Before: B.reveal({ at: 7.2, of }) passed with its word 7 frames late under a wipe (the word was on, but covered).
  const d = mkdtempSync(join(tmpdir(), "untell-late-"));
  const r = py(`import json, pathlib, numpy as np
from PIL import Image
import reveal_size
d = pathlib.Path("${d}")
(d / "frames").mkdir()
W, H = 120, 80
def run(shows_from, step, f0=3):
    for f in range(30):
        a = np.full((H, W, 3), 240, dtype=np.uint8)
        if f >= shows_from:
            a[30:50, 20:100] = (10, 10, 10)
        Image.fromarray(a).save(d / "frames" / f"f{f:04d}.jpg", quality=95)
    class Rec: dir = d
    class F:
        fps, n, rec, notes = 30, 30, Rec(), []
        tokens = {"step": step} if step else {}
        ink = [[{"id": "e1", "node": "w-hour", "text": "HOUR", "opacity": 1, "color": "rgb(10, 10, 10)", "letters": [[72, 20, 30, 100, 50]]}] for _ in range(30)]
        def t(self, f): return f / 30
        def label(self, i): return i
    return reveal_size.late_reveal(F(), "w-hour", f0, f0 / 30, "declared")
late = run(10, 12)
print(json.dumps([[x["check"], x["measured"]["framesLate"]] for x in late]))
print(json.dumps(run(5, 12)), json.dumps(run(4, 0)), json.dumps([[x["check"], x["measured"]["framesEarly"]] for x in run(5, 0, 20)]), sep="|")`);
  expect(r.stderr).toBe("");
  const [late, ok1, ok2, early] = r.stdout.trim().split("\n")[0]!.length ? [r.stdout.trim().split("\n")[0], ...r.stdout.trim().split("\n")[1]!.split("|")] : [];
  // Early: on screen from frame 5 under a reveal declared at frame 20 (a result out at 9.8 s for a reveal at 10.5 s).
  expect(JSON.parse(early!)).toEqual([["reveal-size", 15]]);
  expect(JSON.parse(late!)).toEqual([["reveal-size", 7]]);
  expect(JSON.parse(ok1!)).toEqual([]);
  expect(JSON.parse(ok2!)).toEqual([]);
});

// Each part of the signature rule has its own cause on the first screen: an accent that never shows, an accent on too
// many parts, a signature move that does not show. Before, all three took the first title, also over the second's fix.
test("a signature group's title says which part of the rule it found", () => {
  const r = py(`import json
from detect import groups_of
f = lambda m, sev, fix, a: {"check": "signature", "severity": sev, "from": a, "to": a + 1, "fix": fix, "measured": m}
gs = groups_of([f({"accentShareMax": 0}, "error", "Put the accent on screen.", 0), f({"accentElements": 3, "frames": [1]}, "warning", "Keep the accent on one point at a time.", 3),
                f({"move": "The accent word grows."}, "warning", "The signature move does not show.", 6)])
print(json.dumps([g["title"] for g in gs]))`);
  expect(r.stderr).toBe("");
  expect(JSON.parse(r.stdout.trim())).toEqual(["the system's accent never shows", "the accent on more parts at once than the system allows", "the signature move does not show"]);
});

// A thin accent line joins the accent parts it runs between: Schematic's lever film drew its long arm's 2 px extension
// line and its callout's 1 px leader in the accent, and at half size they blended away, so one active path counted as
// two accent elements. The line's px join parts; the ink, the rule colour and the ground do not.
test("a 1 px accent line on a half px is an accent line; ink, rule and ground are not", () => {
  const r = py(`import json, numpy as np
import signature as sg
c = json.load(open("${join(INSPECT, "../../systems/schematic/tokens.json")}"))["colors"]
h = lambda s: [int(s[i:i + 2], 16) for i in (1, 3, 5)]
g, sf, acc_t = np.array(h(c["ground"])), np.array(h(c["surface"])), np.array(h(c["accentText"]))
px = [acc_t, (sf + 0.75 * (acc_t - sf)).round(), np.array(h(c["ink"])), np.array(h(c["rule"])), sf, g]
im = np.array([px], dtype=np.int16)
print(json.dumps(sg.accent_lines(im, c)[0].tolist()))`);
  expect(r.stderr).toBe("");
  expect(JSON.parse(r.stdout.trim())).toEqual([true, true, false, false, false, false]);
});

// change-offset reads what a viewer can see: a part wholly outside the frame keeps no geometry, so a move between two
// such frames is no change (the Graphite reel's inbox rules moved by half a px while the camera showed the other view).
test("change-offset: a part outside the frame on both frames does not change; one that comes into the frame does", () => {
  const r = py(`import json
from change_offset import _diff
off = (None, None, None, None, 1, None, "#fff")
on = (10, 20, 300, 2, 1, None, "#fff")
print(json.dumps([_diff({"p": off}, {"p": off}), _diff({"p": off}, {"p": on}), _diff({"p": on}, {"p": (13, 20, 300, 2, 1, None, "#fff")})]))`);
  expect(r.stderr).toBe("");
  expect(JSON.parse(r.stdout.trim())).toEqual([[false, false], [true, false], [true, true]]);
});
