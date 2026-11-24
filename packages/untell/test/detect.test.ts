// Unit tests for project detection: framework, package manager, Remotion version and the packages to add.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addCommand, detectFramework, detectPackageManager, hyperframesVersion, packagesFor, remotionVersion } from "../src/detect";

const dirs: string[] = [];
function project(files: Record<string, string | object>) {
  const d = mkdtempSync(join(tmpdir(), "untell-test-"));
  dirs.push(d);
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(d, rel, ".."), { recursive: true });
    writeFileSync(join(d, rel), typeof body === "string" ? body : JSON.stringify(body));
  }
  return d;
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe("detectFramework", () => {
  test("hyperframes.json marks HyperFrames", () => expect(detectFramework(project({ "hyperframes.json": {} }))).toBe("hyperframes"));
  test("a remotion dependency marks Remotion", () => expect(detectFramework(project({ "package.json": { dependencies: { remotion: "4.0.545" } } }))).toBe("remotion"));
  test("@remotion/cli in devDependencies marks Remotion", () => expect(detectFramework(project({ "package.json": { devDependencies: { "@remotion/cli": "4.0.545" } } }))).toBe("remotion"));
  test("both markers give both", () => expect(detectFramework(project({ "hyperframes.json": {}, "package.json": { dependencies: { remotion: "4" } } }))).toBe("both"));
  test("neither gives null", () => expect(detectFramework(project({ "package.json": { dependencies: { react: "19" } } }))).toBeNull());
});

describe("detectPackageManager", () => {
  const env = {};
  test("bun.lock gives bun", () => expect(detectPackageManager(project({ "bun.lock": "" }), env)).toBe("bun"));
  test("bun.lockb gives bun", () => expect(detectPackageManager(project({ "bun.lockb": "" }), env)).toBe("bun"));
  test("pnpm-lock.yaml gives pnpm", () => expect(detectPackageManager(project({ "pnpm-lock.yaml": "" }), env)).toBe("pnpm"));
  test("yarn.lock gives yarn", () => expect(detectPackageManager(project({ "yarn.lock": "" }), env)).toBe("yarn"));
  test("package-lock.json gives npm", () => expect(detectPackageManager(project({ "package-lock.json": "{}" }), env)).toBe("npm"));
  test("the lock file wins over the packageManager field", () =>
    expect(detectPackageManager(project({ "yarn.lock": "", "package.json": { packageManager: "pnpm@9.0.0" } }), env)).toBe("yarn"));
  test("the packageManager field counts without a lock file", () =>
    expect(detectPackageManager(project({ "package.json": { packageManager: "pnpm@9.0.0" } }), env)).toBe("pnpm"));
  test("the user agent counts without a lock file or field", () =>
    expect(detectPackageManager(project({ "package.json": {} }), { npm_config_user_agent: "bun/1.4.4 npm/? node/v24" })).toBe("bun"));
  test("npm is the default", () => expect(detectPackageManager(project({}), env)).toBe("npm"));
});

describe("addCommand", () => {
  test("every manager pins exact versions", () => {
    expect(addCommand("bun", ["three@0.182.0"])).toEqual(["bun", "add", "--exact", "three@0.182.0"]);
    expect(addCommand("npm", ["three@0.182.0"], true)).toEqual(["npm", "install", "--save-exact", "--save-dev", "three@0.182.0"]);
    expect(addCommand("pnpm", ["a"])).toEqual(["pnpm", "add", "--save-exact", "a"]);
    expect(addCommand("yarn", ["a"], true)).toEqual(["yarn", "add", "--exact", "--dev", "a"]);
  });
});

describe("remotionVersion", () => {
  test("the installed version wins over a range in package.json", () => {
    const d = project({ "package.json": { dependencies: { remotion: "4" } }, "node_modules/remotion/package.json": { version: "4.0.545" } });
    expect(remotionVersion(d)).toEqual({ version: "4.0.545", source: "installed" });
  });
  test("an exact version in package.json counts without an install", () =>
    expect(remotionVersion(project({ "package.json": { dependencies: { remotion: "4.0.300" } } }))).toEqual({ version: "4.0.300", source: "package.json" }));
  test("a range without an install is an error that says to install", () =>
    expect(() => remotionVersion(project({ "package.json": { dependencies: { remotion: "^4.0.0" } } }))).toThrow(/Install your packages first/));
});

describe("packagesFor", () => {
  test("Remotion: three and the Player at the Remotion version, and the types the kit compiles with", () => {
    const d = project({ "package.json": { dependencies: { remotion: "^4" } }, "node_modules/remotion/package.json": { version: "4.0.545" }, "node_modules/react/package.json": { version: "19.3.1" } });
    expect(packagesFor("remotion", d)).toEqual({ deps: ["three@0.182.0", "@remotion/player@4.0.545"], devDeps: ["@types/three@0.182.0", "@types/react@19", "typescript@5.9.3", "@remotion/cli@4.0.545"] });
    const e = project({ "package.json": { dependencies: { remotion: "4.0.545" }, devDependencies: { typescript: "5.9.3", "@types/react": "19.3.0", "@remotion/cli": "4.0.545" } }, "node_modules/remotion/package.json": { version: "4.0.545" }, "node_modules/react/package.json": { version: "19.3.1" } });
    expect(packagesFor("remotion", e).devDeps).toEqual(["@types/three@0.182.0"]);
  });
  test("Remotion without its CLI: init adds @remotion/cli at the project's version, and the fix is one command", () => {
    const { remotionCliFix, hasRemotionCli } = require("../src/detect") as typeof import("../src/detect");
    const d = project({ "package.json": { dependencies: { remotion: "4.0.545" } }, "node_modules/remotion/package.json": { version: "4.0.545" } });
    expect(hasRemotionCli(d)).toBe(false);
    expect(packagesFor("remotion", d).devDeps).toContain("@remotion/cli@4.0.545");
    expect(remotionCliFix(d)).toBe("npm install --save-exact --save-dev @remotion/cli@4.0.545");
  });
  test("HyperFrames: three, and the CLI at the scripts' version when the project has none", () => {
    expect(packagesFor("hyperframes", project({ "package.json": { scripts: { check: "npx --yes hyperframes@0.9.70 check" } } }))).toEqual({ deps: ["three@0.182.0", "gsap@3.15.0"], devDeps: ["hyperframes@0.9.70"] });
    expect(packagesFor("hyperframes", project({ "package.json": { devDependencies: { hyperframes: "0.9.70" } } })).devDeps).toEqual([]);
  });
});

test("hyperframesVersion reads the version from the project's scripts", () => {
  expect(hyperframesVersion(project({ "package.json": { scripts: { check: "npx --yes hyperframes@0.9.70 check" } } }))).toBe("0.9.70");
  expect(hyperframesVersion(project({ "package.json": {} }))).toBeNull();
});
