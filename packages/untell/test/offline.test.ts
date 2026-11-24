// A check and a render need no network. The recorder fails every request to another host when UNTELL_OFFLINE=1, and
// names each such request as a page warning in any case. The proof: in a fresh Remotion project, a check and a render
// with the network blocked pass, ask for no URL, and record the same pictures as a check with the network open.
// It records with Chrome: UNTELL_SKIP_E2E=1 skips it, and it skips itself when Chrome is missing.
import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { isLocalUrl } from "../src/record";
import { hfPage } from "../src/templates";

const PKG = resolve(import.meta.dir, "..");
const LAB = resolve(PKG, "../..");
const CLI = join(PKG, "dist/cli.js");
const node = (args: string[], cwd: string, env: Record<string, string> = {}) =>
  spawnSync("node", [CLI, ...args], { cwd, encoding: "utf8", env: { ...process.env, ...env }, timeout: 900000, maxBuffer: 1 << 28 });

describe("a page that needs no network", () => {
  test("a local URL is a file, inline data or this machine; any other host is the network", () => {
    for (const u of ["file:///a/b.woff2", "data:font/woff2;base64,AA", "blob:file:///x", "about:blank", "http://localhost:3000/x", "http://127.0.0.1:9/x", "http://[::1]/"]) expect(isLocalUrl(u), u).toBe(true);
    for (const u of ["https://fonts.example.com/a.woff2", "https://cdn.example.net/x.js", "http://localhost.example.com/"]) expect(isLocalUrl(u), u).toBe(false);
  });
  test("a HyperFrames page with GSAP beside it names no URL on the network", () => {
    const html = hfPage({ system: "riso", seconds: 4.8, width: 1080, height: 1920, scene: "films/x.ts" }, undefined, "assets/vendor");
    expect(html).toContain('<script src="assets/vendor/gsap.min.js">');
    expect(html).not.toMatch(/https?:\/\//);
  });
  test("the kit's font loaders import local files only", () => {
    const gen = readFileSync(join(PKG, "registry", "kit", "fonts.gen.ts"), "utf8");
    expect(gen).not.toMatch(/https?:\/\/|google-fonts|@fontsource/);
    const files = [...gen.matchAll(/from "\.\/fonts\/([\w-]+\.woff2)"/g)].map((m) => m[1]!);
    expect(files.length).toBeGreaterThan(20);
    for (const f of files) expect(existsSync(join(PKG, "registry", "fonts", f)), f).toBe(true);
  });
});

const chrome = process.env.UNTELL_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const e2e = process.env.UNTELL_SKIP_E2E !== "1" && existsSync(chrome) && existsSync(join(LAB, "node_modules", "@remotion", "player"));
/** Copies the recording's frames to <d>/frames-<name>, so that a second recording can be compared with the first. */
const keep = (d: string, name: string) => {
  const to = join(d, `frames-${name}`);
  cpSync(join(d, ".untell", "recordings", "untell-example", "frames"), to, { recursive: true });
  return to;
};
/** The frames of two recordings that differ as pictures. Two recordings of one film are not equal byte for byte: the
 *  edge of one thin moving shape changed by up to 7 levels of 255 in a region of 8 by 56 px between two runs with the
 *  same network. So a frame differs here only when a pixel moves by more than 16 levels, or more than 0.1 % of its
 *  pixels move by more than 4: a missing font changes whole lines of text by far more than that. */
const differ = (a: string, b: string): string[] => {
  const r = spawnSync("python3", ["-c", `import sys, os, json
import numpy as np
from PIL import Image
a, b = sys.argv[1], sys.argv[2]
names = sorted(f for f in os.listdir(a) if f.endswith(".jpg"))
out = [f for f in sorted(os.listdir(b)) if f.endswith(".jpg") and f not in names]
for f in names:
    if not os.path.exists(os.path.join(b, f)):
        out.append(f); continue
    x = np.asarray(Image.open(os.path.join(a, f)).convert("RGB"), dtype=np.int16)
    y = np.asarray(Image.open(os.path.join(b, f)).convert("RGB"), dtype=np.int16)
    if x.shape != y.shape:
        out.append(f); continue
    d = np.abs(x - y).max(axis=2)
    if d.max() > 16 or (d > 4).mean() > 0.001:
        out.append(f)
print(json.dumps(out))`, a, b], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`frame compare failed: ${r.stderr.slice(-600)}`);
  return JSON.parse(r.stdout) as string[];
};
test.skipIf(!e2e)("Remotion: a check and a render with the network blocked pass, ask for no URL, and give the frames of an open network", () => {
  const d = mkdtempSync(join(tmpdir(), "untell-offline-"));
  const rv = (JSON.parse(readFileSync(join(LAB, "node_modules", "remotion", "package.json"), "utf8")) as { version: string }).version;
  writeFileSync(join(d, "package.json"), JSON.stringify({ name: "offline", dependencies: { remotion: rv, "@remotion/player": rv } }));
  symlinkSync(join(LAB, "node_modules"), join(d, "node_modules"));
  expect(node(["init", "--no-install", "--agent", "codex"], d).status).toBe(0);
  const film = "src/films/untell-example.ts";
  const env = { UNTELL_CACHE: join(d, ".untell", "cache") };
  const off = { ...env, UNTELL_OFFLINE: "1" };
  const blocked = node(["check", film, "--json", "--no-cache"], d, off);
  const r1 = JSON.parse(blocked.stdout) as { ok: boolean; errors: number; warnings: number };
  expect([blocked.status, r1.ok, r1.errors, r1.warnings], blocked.stderr.slice(-2000)).toEqual([0, true, 0, 0]);
  expect(blocked.stderr).not.toContain("network:");
  const a = keep(d, "blocked");
  const open = node(["check", film, "--json", "--no-cache"], d, env);
  expect(open.status, open.stderr.slice(-2000)).toBe(0);
  expect(open.stderr).not.toContain("network:");
  expect(differ(a, keep(d, "open"))).toEqual([]);
  const r = node(["render", film, "--json", "--no-cache"], d, off);
  expect(r.status, r.stderr.slice(-2000)).toBe(0);
  const rep = JSON.parse(r.stdout) as { final: string };
  const onRender = node(["check", film, "--render", rep.final, "--json", "--no-cache"], d, off);
  expect(onRender.status, onRender.stderr.slice(-2000)).toBe(0);
  expect(onRender.stderr).not.toContain("network:");
  // The page the check drew: its fonts are files beside it, and its code names no font service.
  const page = join(d, ".untell", "check", "page", "untell-example");
  expect(readdirSync(join(page, "fonts")).some((f) => f.endsWith(".woff2"))).toBe(true);
  expect(readFileSync(join(page, "page.js"), "utf8")).not.toMatch(/fonts\.(gstatic|googleapis)\.com/);
  rmSync(d, { recursive: true, force: true });
}, 900000);

describe("what a power loss leaves", () => {
  test("a part folder of a process that no longer runs is removed; one of a live process stays", () => {
    const { removeStaleParts } = require("../src/record") as typeof import("../src/record");
    const { mkdirSync, mkdtempSync, existsSync } = require("node:fs") as typeof import("node:fs");
    const d = mkdtempSync(join(tmpdir(), "untell-parts-"));
    // A pid far over any live one, and this process's parent (alive).
    for (const n of [".film.part-99999999", `.film.part-${process.ppid}`, ".other.part-99999999"]) mkdirSync(join(d, n));
    expect(removeStaleParts(d, "film")).toBe(1);
    expect([existsSync(join(d, ".film.part-99999999")), existsSync(join(d, `.film.part-${process.ppid}`)), existsSync(join(d, ".other.part-99999999"))]).toEqual([false, true, true]);
  });
});

describe("the Python version", () => {
  test("a Python older than 3.10 is not new enough, and the line names both versions", () => {
    const { pyNewEnough, pyTooOld, PY_MIN } = require("../src/env") as typeof import("../src/env");
    expect(PY_MIN).toEqual([3, 10]);
    if (existsSync("/usr/bin/python3")) {
      const old = pyNewEnough("/usr/bin/python3");
      const line = pyTooOld("/usr/bin/python3");
      expect(line).toMatch(/is Python \d+\.\d+, and untell's checks need Python 3\.10 or later/);
      void old;
    }
    expect(pyNewEnough("/no/such/python")).toBe(false);
  });
});
