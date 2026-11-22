// The defaults read-through: for each system, the smallest scene a fresh agent writes
// from that system's hook, its block map and its "one line and one subject" composition (SYSTEM.md, Direction), with
// DEFAULT props. Boxes come from the composition helpers the docs name (lineAndSubject, lineInBand, heroBox,
// B.measure) and from ctx.safe, as each system's compose line says. Where a system's line asks for a choice (a crop
// focus, a model with mass, an off-centre shape), the choice is made here and its comment names the rule. One frame at its hero moment (HERO s) shows whether the subject owns the
// frame, whether the main line reads on a phone, and whether the frame is used. Facts are computed or fictional.
import type { BLOCKS } from "../../src/system/scene/blocks";
import { heroBox, lineAbove, lineAndSubject, lineInBand, lineOverPicture, turnedSafe } from "../../src/system/scene/blocks";
import { anchor } from "../../src/system/scene/context";
import { placeBehind } from "../../src/system/scene/cover";
import { standing } from "../../src/system/three/models";
import type { Ctx, Node } from "../../src/system/scene/types";

export const seconds = 3;
/** The frame the read-through looks at: after every hook has landed. */
export const HERO = 2;

/** The one line of the film: short, as the Density sections ask. */
const LINE = "Half the list goes each time.";

/** Runs f with the block warnings off: for a measure whose warning the scene answers at once. */
const quietly = <T,>(f: () => T): T => { const w = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = w; } };

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, x = S.left, w = S.right - S.left;
  const full = { x: 0, y: 0, w: ctx.width, h: ctx.height };
  // The composition of one line and one subject (centred), and the line alone at the optical centre (picture).
  // The line's real height: the title as it will set (B.measure), so a title that takes three lines keeps them.
  // The line's real height: the title as it sets (B.measure), and room for its glyphs past the line box.
  const titleH = (role: "display" | "headline" | "body") => Math.ceil(B.measure("title", { id: "m", x, y: S.top, w, text: LINE, role, maxLines: 3, at: -10 }, ctx).h + ctx.size(role) * 0.5);
  // A line over a picture: on its calm part, never across the subject (lineOverPicture).
  const overPicture = (plate: Node[], role: "display" | "headline" | "body", prefer: "top" | "centre", o: object = {}) => {
    const rows = (bw: number) => Math.ceil(B.measure("title", { id: "m", x, y: S.top, w: bw, text: LINE, role, maxLines: 4, at: -10 }, ctx).h + ctx.size(role) * 0.5);
    const P = lineOverPicture(ctx, plate.find((n) => n.kind === "image")!, titleH(role), { prefer, rows });
    return [...plate, ...title({ x: P.line.x, y: P.line.y, w: P.line.w }, { role, maxLines: 4, ...o })];
  };
  // The line's height at a width, as the title sets it (B.measure): for a column narrower than the text-safe width.
  const rowsAt = (role: "display" | "headline" | "body") => (bw: number) => Math.ceil(B.measure("title", { id: "m", x, y: S.top, w: bw, text: LINE, role, maxLines: 4, at: -10 }, ctx).h + ctx.size(role) * 0.5);
  const pair = (role: "display" | "headline" | "body", aspect = 1) => lineAndSubject(ctx, { lineH: titleH(role), aspect });
  const title = (box: { x: number; y: number; w: number }, o: object = {}) => B.title({ id: "line", ...box, text: LINE, maxLines: 3, at: 0.2, ...o }, ctx);
  const photo = (media: string, o: object = {}) => B.photo({ id: "hero", media, box: full, at: 0, ...o }, ctx);
  const product = (o: object = {}) => B.product({ id: "hero", objects: [standing("lamp", "model-lantern", { height: 2.6 })], at: 0, ...o }, ctx);
  switch (ctx.system.id) {
    // Product systems: the product frames itself under the top third (hook area); the line sits above it.
    // Product systems: the product frames itself (hook area); the line sits a clear gap above its drawn bounds at
    // their largest (the start and end of the shot), never touching the handle.
    case "studio": case "keynote": case "matte": {
      // The line takes the text-safe top; the product keeps to the room under it, a clear gap below the line.
      // Matte's type is small, in a corner: the line keeps to the left 62 % of the text-safe width (its compose line).
      const corner = ctx.system.id === "matte", lw = corner ? Math.round(w * 0.62) : w;
      const lineH = corner ? rowsAt("headline")(lw) : titleH("headline");
      const gap = ctx.lineHeight("body"), top = S.top + lineH + gap;
      // The room keeps the system's margin at the sides (the picture-safe area), so an orbit never brings an arm or a
      // handle near the frame's edge.
      const m = Math.ceil(ctx.system.margin * Math.min(ctx.width, ctx.height));
      const room = { x: m, y: top, w: ctx.width - 2 * m, h: Math.round(ctx.height * 0.97) - top };
      // Matte's product film: an object with mass (the armchair), so it owns the middle and lower frame; its floor
      // reflection carries the foot. A tall, thin object leaves the frame's middle empty.
      const objects = ctx.system.id === "matte" ? [standing("chair", "model-armchair", { height: 2.6 })] : undefined;
      const shot = product({ shot: ctx.system.id === "studio" ? "turntable" : ctx.system.id === "keynote" ? "push" : "orbit", room, ...(objects ? { objects } : {}) });
      const obj = anchor(shot, "hero-object-extent");
      const at = lineAbove(ctx, obj, lineH);
      return [...shot, ...title({ ...at, w: lw }, { role: "headline", maxLines: 4 })];
    }
    // Ma: a small picture in a large field of paper (its identity, rules and compose line): the picture at about 40 %
    // of the width (heroBox at area 0.1, over the hook's 8 % floor), right of centre and a little above the middle; the
    // line small (body, the phone floor) on the text-safe left, in two short rows, a wide gap of paper under the
    // picture. The pair is asymmetric: never a centred card. At least 70 % of the frame stays paper.
    case "ma": {
      const tall = ctx.height > ctx.width;
      const pic = heroBox(ctx, 1, { area: 0.1 });
      const px = tall ? Math.round(ctx.width * 0.52 - pic.w * 0.25) : Math.round(ctx.width * 0.58);
      const py = Math.round(ctx.height * (tall ? 0.26 : 0.22));
      const plate = B.photo({ id: "hero", media: "ma-palm", box: { x: px, y: py, w: pic.w, h: pic.h }, motion: "still", at: 0 }, ctx);
      // Two body rows, a wide gap of paper under the picture, inside the text-safe foot.
      const lineY = tall ? Math.round(Math.min(py + pic.h + ctx.lineHeight("body") * 1.8, S.bottom - ctx.lineHeight("body") * 2.4)) : Math.round(py + pic.h * 0.62);
      return [...plate, ...title({ x, y: lineY, w: tall ? w : Math.round(px - x - ctx.lineHeight("body") * 2) }, { role: "body", text: ["Half the list", "goes each time."] })];
    }
    // Spec: the key number owns the top third (fitText in display), a dimension under it names what it measures,
    // and the figure carries the number: twenty marks, one for each look.
    case "spec": {
      const top = { x, y: S.top, w, h: Math.round((S.bottom - S.top) * 0.55) };
      const cell = Math.floor(w / 5) - 16;
      const gridY = top.y + top.h + 150;
      return [...B.sheet({ id: "sheet", grid: "marks", at: 0 }, ctx),
        ...B.fitText({ id: "stat", text: "20", ...top, role: "display", at: 0 }, ctx),
        ...B.dimension({ id: "dim", from: { x, y: top.y + top.h + 40 }, to: { x: x + w, y: top.y + top.h + 40 }, offset: 30, text: "looks for 1 000 000 numbers", at: 0.4 }, ctx),
        ...Array.from({ length: 20 }, (_, k) => B.shape({ id: `look${k}`, kind: "square", x: x + (k % 5) * (cell + 16), y: gridY + Math.floor(k / 5) * (cell + 16), w: cell, h: cell, stroke: "ink", fill: undefined, enter: "cut", at: 0.6 + k * 0.03 }, ctx)).flat()];
    }
    case "manual": {
      // Manual's page is code and its run: the question at the text-safe top, the code straight under it, and the
      // run under the code (a terminal: the command and its result in headline), so the pane and its result fill
      // the page to the text-safe foot. Each part sizes to its rows (B.measure).
      // Lines short enough for the code column where it reaches the lower band at 9:16 (B.measure reports a wrap).
      const code = ["def find(xs, t):", "  lo, hi = 0, len(xs)", "  while lo < hi:", "    m = (lo+hi) // 2", "  return lo"];
      const gap = Math.round(ctx.lineHeight("body") * 0.75);
      // The question's height as it sets (B.measure), with no extra room: the page is full.
      const qH = B.measure("title", { id: "m", x, y: S.top, w, text: LINE, role: "headline", maxLines: 3, at: -10 }, ctx).h;
      const codeY = Math.round(S.top + qH + gap);
      // The pane as wide as its code needs to reach the text-safe edge (B.measure), so the block need not widen it.
      const C0 = { id: "code", x, y: codeY, w, title: "find.py", lines: code, at: 0 };
      const C = { ...C0, w: Math.round(quietly(() => B.measure("codeBlock", C0, ctx)).w) };
      const CM = B.measure("codeBlock", C, ctx), codeH = CM.h;
      // The run's pane shares the code pane's edges (the code pane may widen to reach the text-safe edge).
      const T = { id: "run", x, w: Math.round(CM.w), session: [{ command: "python3 find.py", pause: 0.3, output: [{ text: "20 looks", result: true }] }], resultRole: "headline" as const, end: "result" as const, at: -0.5 };
      const runY = codeY + codeH + gap;
      const runH = B.measure("terminal", { ...T, y: runY }, ctx).h;
      // The run ends on its proof (end "result"). At 9:16 its pane's body runs on to the picture-safe foot (a picture in
      // the low band; the result stays where it prints).
      void runH;
      const foot = ctx.height > ctx.width ? { foot: ctx.height - Math.ceil(ctx.system.margin * ctx.width) } : {};
      return [...title({ x, y: S.top, w }, { role: "headline" }), ...B.codeBlock(C, ctx), ...B.terminal({ ...T, y: runY, ...foot }, ctx)];
    }
    // Primary: a large primary shape off centre (its hook): the pair as lineAndSubject gives it, the circle moved
    // right until its edge passes the frame's edge (a graphic may leave the frame), the line kept on the left.
    // The question runs on a 45-degree axis (title `angle`), rising to the right across the text-safe area's optical
    // centre; the circle sits one gap under its foot, tangent to it, low and right, past the frame's edges. The widest
    // room along the axis whose turned lines all stay in the text-safe area wins.
    case "primary": {
      const tall = ctx.height > ctx.width;
      const r = Math.round(tall ? ctx.width * 0.5 : ctx.height * 0.52);
      const k = Math.SQRT1_2, g = Math.round(ctx.lineHeight("headline") * 0.35);
      // The centre of the turned text: the optical centre of the text-safe area (a little left of it in a wide frame).
      const tx = S.left + (S.right - S.left) * (tall ? 0.5 : 0.42), ty = S.top + (S.bottom - S.top) * 0.46;
      const place = (bw: number) => {
        const m = quietly(() => B.measure("title", { id: "m", x: 0, y: 0, w: bw, text: LINE, role: "headline", maxLines: 3, at: -10 }, ctx));
        const H = m.h, Wt = m.w;
        // The unturned box's top left, so that its centre turns onto (tx, ty).
        const x0 = tx - (Wt / 2) * k - (H / 2) * k, y0 = ty + (Wt / 2) * k - (H / 2) * k;
        // The block's own check: every corner of every turned line in the text-safe area (turnedSafe).
        const ok = quietly(() => turnedSafe({ id: "m", x: Math.round(x0), y: Math.round(y0), w: bw, text: LINE, role: "headline", maxLines: 3, angle: -45, at: 0 }, ctx));
        return { x: Math.round(x0), y: Math.round(y0), w: bw, H, ok };
      };
      let best = place(Math.round(w * 0.5));
      for (let tw = w; tw >= w * 0.5; tw -= 10) { const c = place(tw); if (c.ok) { best = c; break; } }
      // The circle: tangent to the text's foot, one gap below it.
      const d = best.H / 2 + g + r, cx = Math.round(tx + d * k), cy = Math.round(ty + d * k);
      return [...B.shape({ id: "hero", kind: "circle", x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, fill: "accent", at: 0 }, ctx),
        ...B.title({ id: "line", x: best.x, y: best.y, w: best.w, text: LINE, role: "headline", maxLines: 3, angle: -45, at: 0.2 }, ctx)];
    }
    // Pop: the character owns the middle of the frame (its hook asks for it large): a third of the frame, over the hook's floor.
    case "pop": { const L = lineAndSubject(ctx, { lineH: titleH("headline"), area: 0.3 }); return [...B.shape({ id: "hero", kind: "circle", ...L.subject, fill: "accent", at: 0 }, ctx), ...title(L.line, { role: "headline" })]; }
    // Mark: the pair keeps inside the frame grid (its frame is the text-safe area): it moves up when the module would
    // pass the grid's foot.
    case "mark": { const L0 = pair("headline"), up = Math.max(0, L0.subject.y + L0.subject.h - S.bottom), L = { line: { ...L0.line, y: L0.line.y - up }, subject: { ...L0.subject, y: L0.subject.y - up } }; return [...B.frameGrid({ id: "grid", at: 0 }, ctx), ...B.shape({ id: "module", kind: "square", ...L.subject, fill: "accent", at: 0 }, ctx), ...title(L.line, { role: "headline" })]; }
    case "cutout": {
      // The slab is a graphic (the picture-safe area); the word inside it keeps to the text-safe part of the slab.
      const slab = heroBox(ctx, 1.6);
      const tx = Math.max(slab.x, S.left), tr = Math.min(slab.x + slab.w, S.right);
      // The one hot slab carries the word (the action, once in the frame): onAccent on the accent.
      return [...B.shape({ id: "slab", kind: "rect", ...slab, fill: "accent", at: 0 }, ctx), ...B.fitText({ id: "line", text: "HALF", x: tx, y: slab.y, w: tr - tx, h: slab.h, role: "display", color: "onAccent", at: 0.2 }, ctx)];
    }
    // Picture systems: the plate fills the frame; the line sits on the part of it clear of the subject (its mask).
    // Riso prints ink over ink, so a line laid on the print loses its contrast. The line takes the paper: a band at
    // the top where the print's inks are knocked out, the line in display on it, and the print fills the frame under
    // it (lineInBand), cropped on its subject.
    case "riso": {
      const linesAt = (bw: number) => quietly(() => B.title({ id: "m", x, y: S.top, w: bw, text: LINE, role: "display", maxLines: 4, at: -10 }, ctx)).filter((n) => n.kind === "text").map((n) => (n as { text: string }).text);
      const L = lineInBand(ctx, { lineH: titleH("display"), rows: rowsAt("display"), lines: linesAt });
      return [...photo("riso-brayer-hands", { box: L.picture, motion: "still" }), ...title(L.line, { role: "display", maxLines: 4 })];
    }
    // Noir: the figure is the film. No calm part of the bridge holds the line, and type behind the figure loses
    // letters, so the line takes a band of the dark ground at the top and the plate fills the frame under it, its
    // top eased into the ground (fade "top"), the figure whole (lineInBand).
    case "noir": {
      const L = lineInBand(ctx, { lineH: titleH("headline"), gap: ctx.lineHeight("headline"), rows: rowsAt("headline") });
      return [...photo("noir-bridge", { box: L.picture, ...(L.side === "top" ? { fade: "top" as const } : {}), motion: "push", amount: 0.03 }), ...title(L.line, { role: "headline", maxLines: 4 })];
    }
    // Title: the title in display on the plate's calm part, centred across.
    // Title: one small centred line (headline) on the plate's calm band (its identity: a small line that holds).
    case "title": return overPicture(photo("title-beam", { dim: true }), "headline", "top", { align: "center" });
    // Nocturne: the statement is the image, on the dark ground: no plate behind it (no decoration).
    case "nocturne": return [...B.quote({ id: "q", x, y: S.top, w, h: S.bottom - S.top, text: LINE, name: "Ilse Varo", role: "display", at: 0 }, ctx)];
    case "raw": {
      // A full page (Raw's hook): the typed line and, under it, a table of what is left after each look; the page's
      // border round both (B.measure plus a pad), its middle on the optical centre. It reaches the low band at 9:16, so
      // it keeps to the low band's text-safe right edge.
      const pw = S.lowBandRight - x, pad = 30, iw = pw - 2 * pad;
      const typedP = { id: "line", x: x + pad, w: iw, text: LINE, role: "headline" as const, cursor: true, pace: "human" as const, at: 0 };
      const tableP = (y: number) => ({ id: "table", x: x + pad, y, w: iw, h: 420, columns: ["left"], rows: [["1", "500 000"], ["2", "250 000"], ["3", "125 000"], ["20", "1"]].map(([label, n]) => ({ label: `look ${label}`, cells: [n!] })), at: 0.6 });
      const lineH = B.measure("typeOn", { ...typedP, y: S.top + 60, at: -10 }, ctx).h;
      // The page holds a link row under the table: the one colour of Raw.
      const linkRow = Math.round(ctx.lineHeight("headline") * 1.3);
      const pageH = pad + lineH + ctx.lineHeight("body") + 420 + linkRow + pad;
      const py = Math.round(Math.max(S.top, Math.min(S.bottom - pageH, ctx.height * 0.46 - pageH / 2)));
      // The one colour of Raw: a link, underlined blue, on the page's last row.
      const linkY = py + pad + lineH + ctx.lineHeight("body") + 420 + Math.round(linkRow * 0.15), link = "Why it halves";
      return [...B.box({ id: "page", x, y: py, w: pw, h: pageH, at: 0 }, ctx), ...B.typeOn({ ...typedP, y: py + pad }, ctx),
        ...B.matrix(tableP(py + pad + lineH + ctx.lineHeight("body")), ctx),
        // The link in headline: Raw's body is under the phone floor.
        ...B.text({ id: "link", text: link, role: "headline", color: "accentText", x: x + pad, y: linkY, at: 0.6 }, ctx),
        ...B.rule({ id: "link-rule", x1: x + pad, y1: linkY + ctx.lineHeight("headline") * 0.92, x2: x + pad + ctx.measure(link, "headline"), y2: linkY + ctx.lineHeight("headline") * 0.92, color: "accent", enter: "cut", at: 0.6 }, ctx)];
    }
    case "graphite": {
      // The line at the text-safe top; the window takes the system's box under it (windowBox: to the text-safe foot,
      // across the picture-safe width), and its rows fill it (never an empty panel). The accent marks the one row that
      // matters: the selected one.
      const names = ["Kiln 2", "Glaze batch 14", "Shelf 3 cooling", "Order 2207 packed"];
      return [...title({ x, y: S.top, w }, { role: "headline" }),
        ...B.uiWindow({ id: "app", title: "Queue", lineH: titleH("headline"), rows: names.map((t, i) => ({ id: `row${i}`, title: t, meta: `${20 + i}:00`,
          // The one element in the accent: the selected row, its bar and its status badge.
          ...(i === 0 ? { selected: [{ at: 0.6 }], badge: { text: "Firing", tone: "accent" as const } } : {}) })), at: 0 }, ctx)];
    }
    // Console: a full terminal (history in muted output, a status line), in headline, at the text-safe width.
    case "console": {
      const session = [{ command: "ls", output: [{ text: "find.py nums.txt", tone: "muted" as const }] }, { command: "wc -l nums.txt", output: [{ text: "1000000 nums.txt", tone: "muted" as const }] },
        { command: "python3 find.py", output: [{ text: "looks: 20", result: true }] }];
      // The session in headline, so the command reads at a glance on a phone (commands short enough for one row); it
      // starts before the film (at -5): the last command types in the first second, and its result prints in the accent
      // (the one result that matters) at 1.25 s, before HERO;
      // the panel at the text-safe width, its middle at the optical centre.
      const T = { id: "term", x, w, session, role: "headline" as const, status: { left: "search", right: "py 3.12" }, at: -5 };
      // At 9:16 the terminal is the screen: from the text-safe top, its body runs to the picture-safe foot (a picture
      // that hangs into the low band; the status line moves to its top, the space under the prompt is its own). At 16:9
      // it holds its rows, its middle on the optical centre.
      if (ctx.height > ctx.width) return [...B.terminal({ ...T, y: S.top, foot: ctx.height - Math.ceil(ctx.system.margin * ctx.width) }, ctx)];
      const h = B.measure("terminal", { ...T, y: S.top }, ctx).h;
      const y = Math.round(Math.min(S.bottom - h, Math.max(S.top, ctx.height * 0.46 - h / 2)));
      return [...B.terminal({ ...T, y }, ctx)];
    }
    case "kinetic": return [...B.kineticWords({ id: "words", x, y: S.top, w, h: S.bottom - S.top, phrases: [{ text: "HALF", at: 0 }, { text: "HALF EACH TIME", at: 0.6 }] }, ctx)];
    case "courtside": {
      // The words in a band of the ground at the top, the shoes under them, and the shoes cut out in front of the
      // words' foot (type behind the subject). placeBehind keeps every letter readable. The subject is a thing, not a
      // person: a frame that might show a young person does not ship.
      // The first word on frame 0, the second on the kick after it: the hook moves in its first second.
      const K = { id: "words", x, w, h: (S.bottom - S.top) * 0.4, phrases: [{ text: "TWO", at: 0 }, { text: "TWO LENGTHS", at: 0.8 }] };
      const m = B.measure("kineticWords", { ...K, y: S.top }, ctx);
      const wordsH = Math.ceil(m.h), off = m.y - S.top;
      // The picture starts above the words, on the photo's dark top, so the subject can rise into the words' foot.
      // Its top eases into the ground (fade "top"), so the picture has no edge under the words.
      const L = lineInBand(ctx, { lineH: wordsH, gap: 0, overlap: wordsH, role: "display" });
      // A wide frame: the words in the band's column, the shoes beside them (no type behind them there).
      if (L.side === "left") {
        // The display role bleeds from margin to margin, across the picture; in the column the words take headline.
        const Kw = { ...K, role: "headline" as const, x: L.line.x, w: L.line.w, h: ctx.safe.bottom - ctx.safe.top, y: ctx.safe.top };
        return [...photo("courtside-shoes", { box: L.picture, motion: "push", amount: 0.02 }), ...B.kineticWords(Kw, ctx)];
      }
      const shot = photo("courtside-shoes", { box: L.picture, motion: "push", amount: 0.02, fade: "top", over: true });
      const words = (y: number) => B.kineticWords({ ...K, y: y - off }, ctx);
      const plan = placeBehind(ctx, shot, Array.from({ length: 12 }, (_, k) => L.line.y + k * 16), words,
        // A letter's foot carries its name (an L with its foot hidden reads as an I): the subject only tucks behind.
        { from: 0.5, to: seconds, quiet: true, letterMax: 0.08, wordMax: 0.04 });
      return [...shot, ...words(plan.ok ? plan.pick : L.line.y)];
    }
    case "schematic": {
      const L = pair("headline");
      // The active part lights in blue: the driving gear is the accent.
      return [...B.sheet({ id: "sheet", grid: "lines", at: 0 }, ctx), ...B.gear({ id: "gear", cx: L.subject.x + L.subject.w / 2, cy: L.subject.y + L.subject.h / 2, r: L.subject.w / 2, teeth: 24, color: "accent", at: 0 }, ctx), ...title(L.line, { role: "headline", pinned: true })];
    }
  }
  return [];
};
