// Frames the raw outputs of build.ts into the pictures of the README and the guide.
//
// It crops, orders, scales and frames real outputs, and sets captions whose numbers it reads from the tools' JSON.
// It never draws a result: every line, mark, label and number inside a panel is the tool's own pixels. A terminal
// picture sets the captured text again in a monospace face, with three marked changes: an absolute path shows as
// "…/demo" or "~", a line too long for the card ends in "…", and each run of lines left out shows as one "…" line.
// Colour in a terminal picture follows untell's own marks (x, !, passed, failed).
//
// A still that has words of its own comes in two variants, <name>-dark.png and <name>-light.png, on a transparent
// page. The review sheets are untell's own output in its two themes (untell sheet --theme). A loop is one GIF.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import { HANDS, REELS } from "./picks";

type Theme = "dark" | "light";
const T = {
  dark: { fg: "#e6edf3", muted: "#9198a1", border: "#3d444d", card: "#151b23", red: "#ff7b72" },
  light: { fg: "#1f2328", muted: "#59636e", border: "#d1d9e0", card: "#f6f8fa", red: "#cf222e" },
} as const;
// The terminal card follows the Geist dark palette: a black ground, grey text, and the 900 steps of red, amber and green.
const TERM = { bg: "#000000", fg: "#ededed", muted: "#a1a1a1", red: "#ff6166", amber: "#ff990a", green: "#62c073", border: "#2e2e2e" };
const SANS = `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif`;
const MONO = `'Geist Mono', ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace`;
// Geist Mono and Geist, from the kit's own font files (OFL), so a picture does not depend on the fonts of the machine.
const FONTS = join(import.meta.dir, "../../registry/fonts");
const FACES = [["Geist Mono", "geist-mono-latin-400-normal", "100 900"]].map(([f, n, w]) => `@font-face{font-family:'${f}';src:url('file://${join(FONTS, n + ".woff2")}') format('woff2');font-weight:${w}}`).join("");
const WIDTH = 880;
const GAP = "…";

type Ctx = { root: string; raw: string; out: string; work: string; page: Page };
const json = (f: string) => JSON.parse(readFileSync(f, "utf8"));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function size(file: string): [number, number] {
  const [w, h] = spawnSync("magick", ["identify", "-format", "%w %h", `${file}[0]`], { encoding: "utf8" }).stdout.trim().split(" ").map(Number);
  if (!w || !h) throw new Error(`no size for ${file}`);
  return [w, h];
}

/** A crop of an image shown `w` px wide: box = [x, y, w, h] in source px. The pixels are the source's own. */
function crop(file: string, box: [number, number, number, number] | null, w: number, extra = ""): string {
  const [sw, sh] = size(file);
  const [x, y, bw, bh] = box ?? [0, 0, sw, sh];
  const s = w / bw;
  return `<div style="width:${w}px;height:${Math.round(bh * s)}px;background:url('file://${file}') ${-x * s}px ${-y * s}px / ${sw * s}px ${sh * s}px no-repeat;${extra}"></div>`;
}

function page(theme: Theme, body: string, width = WIDTH, bg = "transparent"): string {
  const c = T[theme];
  return `<!doctype html><meta charset="utf-8"><style>
  ${FACES}
  *{box-sizing:border-box;margin:0;padding:0} html,body{background:${bg}}
  #root{width:${width}px;padding:8px;color:${c.fg};font:14px/1.45 ${SANS};-webkit-font-smoothing:antialiased}
  .label{font:500 12px/1.3 ${MONO};color:${c.muted};margin:0 0 8px 2px} .label b{color:${c.fg};font-weight:600}
  .panel{border:1px solid ${c.border};border-radius:10px;overflow:hidden;background:${c.card}}
  .row{display:flex;gap:12px;align-items:flex-start}
  .name{font:600 11.5px ${SANS};margin-top:6px;color:${c.fg}} .mode{font:10.5px ${MONO};color:${c.muted}}
  </style><div id="root">${body}</div>`;
}

async function shoot(ctx: Ctx, html: string, file: string) {
  const f = join(ctx.work, "compose", file.replace(/\.png$/, ".html"));
  writeFileSync(f, html);
  await ctx.page.goto(`file://${f}`);
  await ctx.page.evaluate(() => document.fonts.ready);
  await ctx.page.waitForLoadState("networkidle");
  await (await ctx.page.$("#root"))!.screenshot({ path: join(ctx.out, file), omitBackground: !html.includes(`background:${TERM.bg}`) });
}

async function both(ctx: Ctx, name: string, body: (t: Theme) => string, width = WIDTH) {
  for (const t of ["dark", "light"] as const) await shoot(ctx, page(t, body(t), width), `${name}-${t}.png`);
}

const term = (raw: string, name: string) => json(join(raw, "demo/term", `${name}.json`)) as { cmd: string; out: string; seconds: number; load: number[] };

function termLine(l: string): string {
  const e = esc(l);
  if (/^\s*(x |\d+\s+x )/.test(l) || /^x failed|failed/.test(l) || /^\s+\d+:\d+\s+error/.test(l)) return `<span style="color:${TERM.red}">${e}</span>`;
  if (/^\s*(! |\d+\s+! )/.test(l) || /^\s+\d+:\d+\s+warning/.test(l)) return `<span style="color:${TERM.amber}">${e}</span>`;
  if (/^passed|^@@|^\+ /.test(l)) return `<span style="color:${TERM.green}">${e}</span>`;
  if (/^- /.test(l)) return `<span style="color:${TERM.red}">${e}</span>`;
  if (/^\s+(fix|why|alt|needs|measured)\b/.test(l) || l === GAP || /^\s+- not /.test(l)) return `<span style="color:${TERM.muted}">${e}</span>`;
  return e;
}

/** The lines of a capture: `keep` picks them (true keeps); each run of lines left out becomes one "…" line. */
function linesOf(out: string, keep: (l: string, i: number) => boolean = () => true, cut = 100): string[] {
  const ls: string[] = [];
  out.split("\n").forEach((l, i) => { if (keep(l, i)) ls.push(l.length > cut ? l.slice(0, cut - 1) + "…" : l); else if (ls.at(-1) !== GAP) ls.push(GAP); });
  return ls;
}

function termCard(cmd: string, lines: string[], width = WIDTH - 16): string {
  return `<div style="background:${TERM.bg};border:1px solid ${TERM.border};border-radius:8px;overflow:hidden;width:${width}px">
  <pre style="margin:0;padding:16px 18px 18px;font:12.5px/1.6 ${MONO};color:${TERM.fg};white-space:pre"><span style="color:${TERM.green}">$</span> <span style="color:#fff">${esc(cmd)}</span>
${lines.map(termLine).join("\n")}</pre></div>`;
}

// ---------------------------------------------------------------- the top: two candidates, untell's own sheets
function top(ctx: Ctx) {
  const s = join(ctx.raw, "demo/sheets");
  for (const t of ["dark", "light"] as const) {
    copyFileSync(join(s, `one-day.${t}.sheet.jpg`), join(ctx.out, `sheet-reel-${t}.jpg`));      // candidate B: a reel
    copyFileSync(join(s, `drop-draft.${t}.sheet.jpg`), join(ctx.out, `sheet-faults-${t}.jpg`));  // candidate A: a draft
  }
}

async function reels(ctx: Ctx) {
  const { SYSTEMS } = await import(join(ctx.root, "src/system/systems.ts")) as { SYSTEMS: { id: string; name: string }[] };
  const name = (id: string) => SYSTEMS.find((s) => s.id === id)?.name ?? id;
  await both(ctx, "reels", () => `<div class="row" style="gap:8px">${REELS.map(([id]) => `<div>
    <div class="panel" style="border-radius:6px">${crop(join(ctx.raw, "reels", `${id}.jpg`), null, 100)}</div>
    <div class="name">${esc(name(id))}</div></div>`).join("")}</div>`);
}

// ---------------------------------------------------------------- the check: the real first screen
async function check(ctx: Ctx) {
  const c = term(ctx.raw, "check-draft");
  const ls = c.out.split("\n");
  const every = ls.findIndex((l) => /^\s+every finding/.test(l)), next = ls.findIndex((l) => /^next\b/.test(l));
  if (every < 0 || next < 0) throw new Error("the check screen changed: no 'every finding' or no 'next' line");
  await shoot(ctx, page("dark", termCard(c.cmd, linesOf(c.out, (_l, i) => i < every || i >= next))), "check.png");
}

// ---------------------------------------------------------------- alignment: before, the overlay with the guides, after
async function align(ctx: Ctx) {
  const d = join(ctx.raw, "demo/snap");
  const n = (json(join(d, "analysis.json")).proposals ?? []).length;
  const cropPage = join(d, "preview-3.png");
  await both(ctx, "align", () => `
  <div class="row">
    <div><div class="label"><b>before</b></div><div class="panel">${crop(join(d, "before.png"), null, 248)}</div></div>
    <div><div class="label"><b>untell snap --preview</b> · ${n} misses</div><div class="panel">${crop(join(d, "preview-2.png"), [0, 34, 2000, 843], 336)}</div></div>
    <div><div class="label"><b>after</b></div><div class="panel">${crop(join(d, "after.png"), null, 248)}</div></div>
  </div>
  <div class="row" style="margin-top:14px">
    <div style="flex:1"><div class="label"><b>4x</b> · the caption 3 px off the baseline grid</div><div class="panel">${crop(cropPage, [300, 1095, 1280, 150], 423)}</div></div>
    <div style="flex:1"><div class="label"><b>4x</b> · after: on the line</div><div class="panel">${crop(cropPage, [300, 1300, 1280, 150], 423)}</div></div>
  </div>`);
}

// ---------------------------------------------------------------- sound: the film, what untell hears, what it sees
async function sound(ctx: Ctx) {
  const frames = join(ctx.work, "frames/drop");
  const sheet = join(ctx.raw, "demo/sheets/drop.mastered.sheet.jpg");
  const sj = json(join(ctx.raw, "demo/sheets/drop.mastered.sheet.json"));
  const music = json(join(ctx.raw, "demo/listen/music.json"));
  const entry = json(join(ctx.raw, "demo/drop-entry.json")) as { from: number; drop: number; peakAt: number };
  const drop = music.drops.find((d: { t: number }) => Math.abs(d.t - entry.drop) < 0.01);
  const cut = sj.cuts.find((c: number) => c >= entry.peakAt - 0.01 && c <= entry.peakAt + 0.1);
  if (!drop || cut === undefined) throw new Error(`no drop at ${entry.drop} s in the map, or no cut at ${entry.peakAt} s in the sheet`);
  const pick = [6, 24, 37, 49, 73].map((i) => join(frames, `f${String(i).padStart(4, "0")}.png`));
  const [, lh] = size(join(ctx.raw, "demo/listen/listen.png"));
  await both(ctx, "sound", (t) => `
  <div class="row" style="gap:8px">${pick.map((p) => `<div class="panel">${crop(p, null, 164)}</div>`).join("")}</div>
  <div class="label" style="margin-top:16px"><b>untell listen</b> · sections, the drops, loudness and tension</div>
  <div class="panel">${crop(join(ctx.raw, "demo/listen/listen.png"), [0, 0, 1800, Math.min(lh, 1032)], 864)}</div>
  <div class="label" style="margin-top:16px"><b>untell check --sheet</b> · the film's motion and sound; the cut at ${cut.toFixed(2)} s</div>
  <div class="panel">${crop(sheet, [0, 470, 1832, 90], 864)}</div>
  <p style="font:13px/1.45 ${SANS};color:${T[t].muted};margin:10px 2px 0">The drop at ${drop.t.toFixed(2)} s in the track (+${drop.rise} dB) lands on the cut: <code style="font-family:${MONO};color:${T[t].fg}">music({ media: "pulse", peakAt: ${entry.peakAt} })</code>.</p>`);
}

// ---------------------------------------------------------------- the systems and one chart in six hands
async function systems(ctx: Ctx) {
  const dir = join(ctx.raw, "systems");
  const list = json(join(dir, "systems.json")) as { id: string; name: string; mode: string }[];
  await both(ctx, "systems", () => `
  <div style="display:grid;grid-template-columns:repeat(10,1fr);gap:8px 6px">${list.map((s) => `<div>
    <div class="panel" style="border-radius:6px">${crop(join(dir, `${s.id}.jpg`), null, 78)}</div>
    <div class="name">${esc(s.name)}</div><div class="mode">${s.mode}</div></div>`).join("")}</div>`);
  await both(ctx, "charts", () => `<div class="row" style="gap:8px">${HANDS.map((h) => `<div>
    <div class="panel" style="border-radius:6px">${crop(join(ctx.raw, "charts", `${h}.jpg`), null, 136)}</div>
    <div class="name">${esc(list.find((s) => s.id === h)?.name ?? h)}</div></div>`).join("")}</div>`);
}

// ---------------------------------------------------------------- the guide's terminal pictures and the film loop
async function guide(ctx: Ctx) {
  const shots: [string, string, string[]][] = [];
  const init = term(ctx.raw, "init");
  shots.push(["term-init", init.cmd, linesOf(init.out, (l) => !/^added \d+ packages|To render the example|import \{|<Composition|Then render it|npx remotion render/.test(l))]);
  const snap = term(ctx.raw, "snap");
  shots.push(["term-snap", snap.cmd, linesOf(snap.out)]);
  const add = term(ctx.raw, "media-add");
  shots.push(["term-listen", add.cmd, linesOf(add.out, (l) => !/^cross-check skipped/.test(l))]);
  const render = term(ctx.raw, "render-final");
  shots.push(["term-render", render.cmd, linesOf(render.out)]);
  const lint = term(ctx.raw, "lint-tell");
  let n = 0;
  shots.push(["term-lint", lint.cmd, linesOf(lint.out, (l) => !/^\s{11}(?!fix)/.test(l) && n++ < 30)]);
  for (const [name, cmd, lines] of shots) await shoot(ctx, page("dark", termCard(cmd, lines)), `${name}.png`);
  const frames = join(ctx.work, "frames/drop");
  const list = join(ctx.work, "compose/film.txt");
  const files = readdirSync(frames).filter((f) => f.endsWith(".png")).sort();
  writeFileSync(list, files.map((f) => `file '${join(frames, f)}'\nduration ${1 / 12}`).join("\n") + `\nfile '${join(frames, files.at(-1)!)}'\n`);
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-vf",
    "scale=270:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=none", "-loop", "0", join(ctx.out, "film-drop.gif")], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
}

export async function composeAll(o: { root: string; raw: string; out: string; work: string }) {
  mkdirSync(join(o.work, "compose"), { recursive: true });
  for (const f of readdirSync(o.out)) if (/\.(png|gif|jpg)$/.test(f)) rmSync(join(o.out, f));
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const pg = await (await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1000, height: 800 } })).newPage();
  const ctx: Ctx = { ...o, page: pg };
  try {
    top(ctx);
    await reels(ctx); await check(ctx); await align(ctx); await sound(ctx); await systems(ctx); await guide(ctx);
  } finally { await browser.close(); }
  if (!existsSync(join(o.out, "check.png"))) throw new Error("no check picture");
}
