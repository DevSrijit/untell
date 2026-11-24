import { describe, expect, test } from "bun:test";
import { IGNORED, withIgnores } from "../src/init";

describe("withIgnores", () => {
  test("makes a .gitignore when there is none", () => {
    const r = withIgnores(null);
    expect(r.added).toEqual(IGNORED);
    expect(r.text).toBe("# untell\n.untell/\n.venv-media/\n.venv-listen/\n");
  });
  test("adds only the missing lines, after the user's own", () => {
    const r = withIgnores("node_modules\n.untell/\n");
    expect(r.added).toEqual([".venv-media/", ".venv-listen/"]);
    expect(r.text).toBe("node_modules\n.untell/\n\n# untell\n.venv-media/\n.venv-listen/\n");
  });
  test("counts a line without its slash as present", () => {
    expect(withIgnores(".untell\n.venv-media\n.venv-listen\n").added).toEqual([]);
  });
  test("ends the user's last line before it adds", () => {
    expect(withIgnores("dist").text).toBe("dist\n\n# untell\n.untell/\n.venv-media/\n.venv-listen/\n");
  });
});
