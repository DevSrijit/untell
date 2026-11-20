// Entry for dist/vs-hyperframes.js: exposes the renderer, the blocks and the motion helpers as `VS`.
import { BLOCKS } from "./blocks";
import { appear, go, lines, present, seq } from "./context";
import { mount } from "./hyperframes";

(globalThis as unknown as { VS: unknown }).VS = { mount, blocks: BLOCKS, helpers: { appear, go, lines, present, seq } };
