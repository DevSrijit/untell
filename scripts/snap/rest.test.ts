// The check's frame at a time between the capture's sampled frames: a text at rest keeps the letters that the capture
// sent last (it sends them every 0.5 s and when the ink moves). Once, snap --at 0.07 s saw no element at rest.
import { expect, test } from "bun:test";
import { frameFromDetector, REST } from "./frame";

const text = { id: "line-0", kind: "text", text: "Hold", role: "body" };
const el = (y: number) => ({ id: "line-0:div1/span0", layer: "content", x: 100, y, w: 300, h: 60, opacity: 1 });
const ink = (letters: boolean) => ({ id: "line-0", node: "line-0", text: "Hold", ink: [100, 110, 400, 150], base: 150, cap: 40, xh: 30, fontPx: 56,
  ...(letters ? { letters: [[72, 100, 110, 130, 150], [111, 132, 120, 160, 150], [108, 162, 110, 175, 150], [100, 177, 110, 205, 150]] } : {}) });
const det = { nodes: [text], ink: [[ink(true)], [ink(false)], [ink(false)], [ink(false)]] };

test("a text at rest between sampled frames keeps its last letters", () => {
  const elements = { width: 1080, height: 1920, fps: 30, frames: [[el(500)], [el(500)], [el(500)], [el(500)]] };
  const fr = frameFromDetector(det, elements, 2);
  expect(fr.els.map((e) => e.id)).toEqual(["line-0"]);
});

test("a text that left the screen between does not take letters from before it left", () => {
  const gap = { ...det, ink: [[ink(true)], [], [ink(false)], [ink(false)]] };
  const elements = { width: 1080, height: 1920, fps: 30, frames: [[el(500)], [], [el(500)], [el(500)]] };
  expect(frameFromDetector(gap, elements, 3).els).toEqual([]);
});

test("rest is a move of at most REST px from the frame before", () => {
  const elements = (dy: number) => ({ width: 1080, height: 1920, fps: 30, frames: [[el(500)], [el(500)], [el(500)], [el(500 + dy)]] });
  expect(frameFromDetector(det, elements(REST), 3).els.length).toBe(1);
  expect(frameFromDetector(det, elements(REST + 0.3), 3).els.length).toBe(0);
});
