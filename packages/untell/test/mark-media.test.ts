// A brand mark as media: untell media add reads an SVG once, keeps it as mark.svg, and writes its paths into the kit's
// marks table, which the drawnMark block reads. A file with something untell does not read is refused, and leaves no entry.
import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { media, mediaState } from "../src/media";
import { kindOfExt } from "../src/media-paths";
import { marksSource } from "../../../src/system/scene/markArt";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
/** A HyperFrames project with a kit that has an empty marks table. */
function project() {
  const d = mkdtempSync(join(tmpdir(), "untell-mark-"));
  dirs.push(d);
  mkdirSync(join(d, "untell"), { recursive: true });
  writeFileSync(join(d, "untell", "marks.gen.ts"), marksSource({}));
  return d;
}
const args = (positional: string[], opts: Record<string, string>) => ({ positional, opt: (n: string) => opts[n], flag: () => false });
const quiet = async <T,>(f: () => Promise<T>): Promise<T> => { const l = console.log; console.log = () => {}; try { return await f(); } finally { console.log = l; } };

test("an .svg is a mark", () => expect(kindOfExt(".SVG")).toBe("mark"));

test("media add of an SVG mark writes its paths into the kit's marks table", async () => {
  const d = project();
  const f = join(d, "brand.svg");
  writeFileSync(f, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120"><g fill="#123456"><rect x="0" y="0" width="100" height="40"/><circle cx="50" cy="90" r="30" fill="#ff0000"/></g><path d="M0 0L100 120" fill="none" stroke="#000" stroke-width="4"/></svg>`);
  await quiet(() => media(d, "add", args([f], { "--as": "brand", "--source": "the client", "--licence": "theirs" })));
  expect(existsSync(join(d, "assets/media/brand/mark.svg"))).toBe(true);
  const manifest = JSON.parse(readFileSync(join(d, "untell-media.json"), "utf8"));
  expect(manifest.brand.kind).toBe("mark");
  const table = readFileSync(join(d, "untell", "marks.gen.ts"), "utf8");
  expect(table).toContain('"brand"');
  const meta = JSON.parse(readFileSync(join(d, "assets/media/brand/meta.json"), "utf8"));
  expect(meta.art.viewBox).toEqual([0, 0, 100, 120]);
  expect(meta.art.paths.map((p: { paint: string }) => p.paint)).toEqual(["fill", "fill", "stroke"]);
  expect(mediaState("mark", meta)).toBe("mark.svg, 3 path(s)");
});

test("an SVG with a transform is refused with the fix, and leaves no entry", async () => {
  const d = project();
  const f = join(d, "bad.svg");
  writeFileSync(f, `<svg viewBox="0 0 10 10"><g transform="translate(2 2)"><rect width="5" height="5"/></g></svg>`);
  await expect(quiet(() => media(d, "add", args([f], { "--as": "bad" })))).rejects.toThrow(/transform.*apply the transforms/i);
  expect(existsSync(join(d, "untell-media.json")) ? Object.keys(JSON.parse(readFileSync(join(d, "untell-media.json"), "utf8"))) : []).toEqual([]);
  expect(existsSync(join(d, "assets/media/bad"))).toBe(false);
});
