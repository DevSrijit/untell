// untell listen says what it measured: a part that is not installed is named as not measured, never shown as a quiet
// or a zero result (two agents' cases). Runs the Python in .venv-audio when it exists.
import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const PY = join(ROOT, ".venv-audio/bin/python");
const run = (code: string) => spawnSync(PY, ["-c", code], { cwd: import.meta.dir, encoding: "utf8" });

test.skipIf(!existsSync(PY))("compare with no character tags says it has no sound match, and claims no CLAP trust", () => {
  const r = run(`import compare; print(compare.write_md("a calm bed", [{"name": "a", "score": 1.0, "match": None, "for": [], "against": []}]))`);
  expect(r.stdout).toMatch(/Ranked by structure only/);
  expect(r.stdout).not.toMatch(/CLAP zero-shot \\(medium trust\\)/);
  expect(r.stdout).toMatch(/Add it: /);
});

// A fresh agent's Ma film: one candidate, no model, and compare printed "score 0.0", which reads as a bad match.
test.skipIf(!existsSync(PY))("compare without the model gives no sound score: it says the score needs the model", () => {
  const r = run(`import compare; print(compare.write_md("a calm bed", [{"name": "a", "score": 0.0, "match": None, "for": [], "against": []}]))`);
  expect(r.stdout).toMatch(/no sound score: it needs the optional model/);
  expect(r.stdout).not.toMatch(/score 0\.0/);
});

test.skipIf(!existsSync(PY))("compare reads a tempo in the brief", () => {
  const r = run(`import compare; print(compare._bpm("a reel at 118-142 bpm"), compare._bpm("about 120 bpm"), compare._bpm("no tempo"))`);
  expect(r.stdout.trim()).toBe("(118.0, 142.0) (116.0, 124.0) None");
});

test.skipIf(!existsSync(PY))("fx with no CLAP opinion says so", () => {
  const r = run(`import fx; print(fx.write_md({"class": "click", "lufs": -25, "peakDb": -1.5, "centroidHz": 4000, "brightnessSlope": 0, "flatness": 0.1, "duration": 0.4}, "tick"))`);
  expect(r.stdout + r.stderr).not.toMatch(/CLAP hears: \\./);
});

test.skipIf(!existsSync(PY))("analyse on raw files: one folder per file, also when files share a stem; untell's own copy writes beside itself", () => {
  const r = run(`
import os, tempfile, pathlib, listen
d = pathlib.Path(tempfile.mkdtemp())
for k in ("a", "b", "c"):
    (d / k).mkdir(); (d / k / "source.mp3").write_bytes(b"x")
os.chdir(d)
outs = [listen.resolve(str(d / k / "source.mp3"))[2] for k in ("a", "b", "c")]
print(len(set(outs)) == 3, all(o.name.startswith(k + "-source-") for o, k in zip(outs, "abc")))
own = d / ".untell" / "listen" / "fs-1"; own.mkdir(parents=True); (own / "source.mp3").write_bytes(b"x")
n, f, o = listen.resolve(str(own / "source.mp3")); print(n == "fs-1", o == own)
`);
  expect(r.stdout.trim().split("\n").slice(-2)).toEqual(["True True", "True True"]);
});

// An agent's case: compare said "117 BPM, in the brief's 118-128". In range means lo <= bpm <= hi.
test.skipIf(!existsSync(PY))("compare: a tempo just outside the brief's range is outside, and says by how much", () => {
  const track = (bpm: number) => `{"rhythm": {"bpm": ${bpm}, "confidence": "high"}, "drops": [], "builds": [], "sections": [{"role": "body"}], "dynamics": {"silence": [], "loudnessRange": 6, "lufsShortTermMax": -10}, "repetition": {}, "duration": 100}`;
  const r = run(`import compare, json; print(json.dumps(compare.rank("a reel at 118-128 bpm", {"a": json.loads('${track(116.98)}'), "b": json.loads('${track(120)}'), "c": json.loads('${track(128)}')})))`);
  const out = JSON.parse(r.stdout.trim().split("\n").pop()!) as { name: string; for: string[]; against: string[] }[];
  const by = (n: string) => out.find((x) => x.name === n)!;
  expect(by("a").for.join(" ")).not.toMatch(/in the brief's/);
  expect(by("a").against.join(" ")).toMatch(/outside the brief's 118-128 by 1 BPM \(slower\)/);
  expect(by("b").for.join(" ")).toMatch(/120 BPM, in the brief's 118-128/);
  expect(by("c").for.join(" ")).toMatch(/in the brief's/);
  expect(out[0]!.name).not.toBe("a");
});

// compare finds tracks analysed by file path (.untell/listen/<name>/), not only prepared ones.
test.skipIf(!existsSync(PY))("compare ranks a track analysed by its file path", () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs") as typeof import("node:fs");
  const dir = mkdtempSync(join(require("node:os").tmpdir(), "untell-compare-"));
  mkdirSync(join(dir, ".untell/listen/beat-a1b2c3"), { recursive: true });
  writeFileSync(join(dir, ".untell/listen/beat-a1b2c3/listen.json"), JSON.stringify({ rhythm: { bpm: 120, confidence: "high" }, drops: [], builds: [], sections: [{ role: "body" }], dynamics: { silence: [], loudnessRange: 6, lufsShortTermMax: -10 }, repetition: {}, duration: 100 }));
  const r = spawnSync(PY, [join(import.meta.dir, "listen.py"), "compare", "a reel at 118-128 bpm"], { cwd: dir, encoding: "utf8", env: { ...process.env, UNTELL_ROOT: dir } });
  expect(r.stdout).toMatch(/beat-a1b2c3/);
});

test.skipIf(!existsSync(PY))("mix of a film with no effects says the effect checks do not apply", () => {
  const r = run(`import mix
d = {"render": "a.mp4", "system": "riso", "target": {"lufs": -16, "range": 2}, "lufsIntegrated": -16.0, "onTarget": True, "offTargetLu": 0,
     "truePeakDb": -1.2, "headroomDb": 0.2, "first2sLufs": -15.0, "phone": {"lufsAbove200Hz": -17.0, "lossDb": 1.0}, "hits": []}
print(mix.write_md(d))`);
  expect(r.stdout).toContain("No effects in this film: the effect checks (masking, an effect louder than the music) do not apply.");
});

// A fresh agent's Spec film: listen.md said the grid was medium trust (the tempo analysis's own confidence) and the
// music map said low (its grid trust). Both now read trust.py: listen.md prints the map's level and its reasons.
const TRACKS = ["console-music-4", "graphite-music-8", "manual-music-6", "keynote-music-2"].map((t) => join(ROOT, "assets/media", t, "listen.json")).filter(existsSync);
test.skipIf(!TRACKS.length)("listen.md's grid trust is the music map's, for each track", () => {
  const r = spawnSync("python3", ["-c", `import json, prose, trust
for p in ${JSON.stringify(TRACKS)}:
    d = json.load(open(p))
    line = next(l for l in prose.write(d).split("\\n") if l.startswith("- Tempo"))
    print(trust.grid_trust(d)[0], line.split("grid trust **")[1].split("**")[0])`], { cwd: import.meta.dir, encoding: "utf8" });
  expect(r.stderr).toBe("");
  for (const l of r.stdout.trim().split("\n")) { const [map, md] = l.split(" "); expect(md).toBe(map); }
});
