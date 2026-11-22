// The tells: source-level rules for video code. Each rule finds one thing that makes a video read as
// AI-made, or one way a scene breaks the untell contract. A rule reads source text only, so the lint
// runs in milliseconds, before any frame is rendered.
//
// Two rule sets:
// - "tell/*": for any video code (Remotion, HyperFrames, HTML, CSS, GSAP). What a viewer sees as AI-made.
// - "scene/*": for an untell scene module. What the kit owns and a scene must not set.
// Silence one finding with a comment on the same line or the line above: // untell-ignore <rule id>: <reason>
import { DIRECTION } from "../../src/system/direction";

export type Severity = "error" | "warning";
export type Finding = { rule: string; severity: Severity; line: number; col: number; text: string; message: string; fix: string };
export type Rule = {
  id: string;
  severity: Severity;
  /** One line: what it is and why a viewer reads it as a tell. */
  why: string;
  /** One line: what to do instead. */
  fix: string;
  /** Which files it reads: any video code, or only untell scene modules. */
  scope: "any" | "scene";
  /** Matches on one line (comments already removed). `match` may refine or reject a regex hit. */
  pattern?: RegExp;
  match?: (m: RegExpExecArray, line: string) => string | false | undefined;
  /** A whole-file rule: returns findings with their own lines. */
  file?: (src: string, lines: string[], raw: string[]) => { line: number; col?: number; text?: string; message?: string }[];
};

/** True when the file names a system (a scene's `export const system = "<id>"`, a page's data-system) whose direction
 * has no music: silence is that system's sound. */
export function silentSystem(src: string): boolean {
  const id = /export\s+const\s+system\s*=\s*["'`]([\w-]+)["'`]|data-system=["']([\w-]+)["']/.exec(src);
  const sys = id?.[1] ?? id?.[2];
  return !!sys && DIRECTION[sys]?.mix.music === "none";
}

/**
 * The statement that a film is silent on purpose: `export const silent = "<reason>";` in the scene module. Returns the
 * reason and its line (1-based), or null. A brief that gives no sound, or that forbids it, is the usual reason.
 */
export function silentStatement(src: string): { reason: string; line: number } | null {
  const m = /^[ \t]*export[ \t]+const[ \t]+silent[ \t]*=[ \t]*(["'`])(.*?)\1/m.exec(src);
  if (!m) return null;
  return { reason: m[2]!.trim(), line: src.slice(0, m.index).split("\n").length };
}
/** The sound blocks and nodes of a film's source. */
const SOUND = /<Audio|<audio|B\.music|B\.hit|B\.typing|kind:\s*["']audio|OffthreadVideo[^>]*(?!muted)|data-has-audio/;

/** A hex colour as hue (degrees), saturation and lightness (0-1). */
export function hsl(hex: string): { h: number; s: number; l: number } | null {
  let h = hex.replace("#", "");
  if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map((c) => c + c).join("");
  if (h.length !== 6 && h.length !== 8) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const hue = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: hue * 60, s, l };
}
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const isNavy = (c: { h: number; s: number; l: number }) => c.l < 0.22 && c.s > 0.25 && c.h >= 205 && c.h <= 275;
const isPurple = (c: { h: number; s: number; l: number }) => c.s > 0.35 && c.l > 0.2 && c.l < 0.85 && c.h >= 250 && c.h <= 315;

const ROLES = "ground|surface|rule|ink|inkMuted|accent|accent2|accent3|accentText|onAccent|series[1-5]|positive|negative";
const CLICHES = [
  "supercharge", "revolutioni[sz]e", "game[- ]chang", "seamless(ly)?", "unlock (the|your)", "unleash", "elevate your", "effortless(ly)?",
  "all[- ]in[- ]one", "next[- ]gen(eration)?", "cutting[- ]edge", "blazing(ly)? fast", "lightning[- ]fast", "10x", "powered by ai", "ai[- ]powered",
  "the future of", "take your .{1,20} to the next level", "say goodbye to", "meet your new", "built for modern teams", "for modern teams", "reimagin",
];
const PLACEHOLDERS = ["lorem ipsum", "acme", "john doe", "jane doe", "foo ?bar", "example corp", "your company", "company name", "placeholder", "todo:"];
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2728}]/u;
/** The index of the parenthesis that closes the one at `open`, skipping string literals; -1 when it does not close. */
/**
 * The source with every B.measure(...) call blanked out (its newlines kept, so line numbers hold). A measure call builds
 * a block to read its box; it is not a block of the film, so its `at` is not a start time (a first-use test:
 * B.measure("title", { at: 6 }) gave scene/no-hook).
 */
export function withoutMeasure(src: string): string {
  let out = src;
  for (const m of [...src.matchAll(/\bB\.measure\s*\(/g)].reverse()) {
    const a = m.index!, b = closeParen(src, a + m[0].length - 1);
    if (b < 0) continue;
    out = out.slice(0, a) + out.slice(a, b + 1).replace(/[^\n]/g, " ") + out.slice(b + 1);
  }
  return out;
}

export function closeParen(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i]!;
    if (ch === '"' || ch === "'" || ch === "`") {
      for (i++; i < src.length && src[i] !== ch; i++) if (src[i] === "\\") i++;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) return i;
  }
  return -1;
}
const lineAt = (src: string, i: number) => src.slice(0, i).split("\n").length;
/** Every call of block `name` in a scene (`B.name(...)`), with its full text and its line. */
export function blockCalls(src: string, name: string): { text: string; line: number }[] {
  return [...src.matchAll(new RegExp(`\\bB\\.${name}\\s*\\(`, "g"))].map((m) => {
    const end = closeParen(src, m.index! + m[0].length - 1);
    return { text: src.slice(m.index!, end < 0 ? m.index! + 400 : end + 1), line: lineAt(src, m.index!) };
  });
}
/**
 * Patches on a block's output: a `.map(` chained on a `B.<block>(...)` call (on the same line or the next), a
 * `.map(` on a const that holds one, and a deep import from `scene/blocks/<file>` (a block's internals).
 * Type-only imports and the blocks index are fine.
 */
function patchedBlocks(src: string): { line: number; message: string }[] {
  const out: { line: number; message: string }[] = [];
  const held = new Map<string, string>();
  for (const m of src.matchAll(/(?:\b(?:const|let)\s+(\w+)\s*=\s*)?\bB\.(\w+)\s*\(/g)) {
    const end = closeParen(src, m.index! + m[0].length - 1);
    if (end < 0) continue;
    if (/^\s*\.map\s*\(/.test(src.slice(end + 1))) out.push({ line: lineAt(src, end + 1 + src.slice(end + 1).search(/\./)), message: `a .map over the output of B.${m[2]}` });
    else if (m[1]) held.set(m[1], m[2]!);
  }
  for (const [name, block] of held)
    for (const m of src.matchAll(new RegExp(`\\b${name}\\s*\\.map\\s*\\(`, "g"))) out.push({ line: lineAt(src, m.index!), message: `a .map over ${name}, the output of B.${block}` });
  for (const m of src.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']*scene\/blocks\/(?!index["'])[^"']+)["']/gm))
    out.push({ line: lineAt(src, m.index! + m[0].search(/\S/)), message: `a deep import from ${m[1]}` });
  return out;
}
/** Raw nodes a scene builds by hand where a block draws the same kind of thing. */
const HAND_BUILT_MIN = 6;
const HAND_BLOCKS: Record<string, string> = { rect: "box, shape or bar", path: "shape, rule or arrow", text: "text, title or typeOn" };

/** The block names that the systems' block maps know: a comment that names one names the block it tried. */
const KNOWN_BLOCKS = [...new Set(Object.values(DIRECTION).flatMap((d) => [...d.blocks.map((b) => b.block), ...d.avoid.map((b) => b.block)]))];
/** How far above a raw node its comment may stand, in lines (a helper that builds several nodes has one comment). */
const WHY_REACH = 15;
/** Raw nodes in a scene (outside a block call) with no comment above them that names the block tried (hard rule 14). */
function rawWithoutWhy(src: string, raw: string[]): { line: number; message: string }[] {
  const calls = [...src.matchAll(/\bB\.\w+\s*\(/g)].map((m) => [m.index!, closeParen(src, m.index! + m[0].length - 1)] as const);
  const why = (line: number) => raw.slice(Math.max(0, line - 1 - WHY_REACH), line).some((l) => {
    const c = l.match(/\/\/(.*)$/)?.[1] ?? "";
    return /\b(tried|lacks|has no|no prop|no block)\b/i.test(c) && KNOWN_BLOCKS.some((b) => new RegExp(`\\b${b}\\b`).test(c));
  });
  const out: { line: number; message: string }[] = [];
  let last = -Infinity;
  for (const h of src.matchAll(/\bkind\s*:\s*["'](rect|path|text|circle)["']/g)) {
    if (calls.some(([a, b]) => h.index! > a && (b < 0 || h.index! < b))) continue;
    // A node has an id; an object with a kind and no id is data (a type, a list of pieces), not a node.
    const open = src.lastIndexOf("{", h.index!), close = src.indexOf("}", h.index!);
    if (open < 0 || !/[{,]\s*id\s*[:,]/.test(src.slice(open, close < 0 ? undefined : close))) continue;
    const line = lineAt(src, h.index!);
    if (why(line) || line - last <= WHY_REACH) continue;
    last = line;
    out.push({ line, message: `a raw ${h[1]} node with no comment above it that names the block tried and the prop it lacks` });
  }
  return out;
}

/** On-screen text candidates on a line: quoted strings, and JSX text between tags. */
const strings = (line: string) => [
  ...[...line.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)].map((m) => ({ text: m[2]!, col: m.index! + 1 })),
  ...[...line.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)].map((m) => ({ text: m[1]!.trim(), col: m.index! + 2 })),
];

export const RULES: Rule[] = [
  // ----- Colour -----
  { id: "tell/navy-ground", severity: "error", scope: "any",
    why: "A dark blue or ink-blue background is the purple gradient of video: the default every model reaches for.",
    fix: "Use a system's ground. For your own palette, take a neutral near-black or a light ground.",
    file: (_s, lines) => lines.flatMap((l, i) => { const d = /(background(?:-?[cC]olor)?|\bbg)\s*[:=][^;\n]*/.exec(l); if (!d) return []; return [...d[0].matchAll(HEX)].filter((m) => { const c = hsl(m[0]); return !!c && isNavy(c); }).slice(0, 1).map((m) => ({ line: i + 1, col: d.index + m.index! + 1, text: m[0], message: `${m[0]} is a dark blue ground` })); }) },
  { id: "tell/purple", severity: "warning", scope: "any",
    why: "Purple and violet accents, alone or in a blue-to-pink sweep, mark a video as AI-made at a glance.",
    fix: "Use one accent from a system. No system uses purple or violet.",
    file: (_s, lines) => lines.flatMap((l, i) => [...l.matchAll(HEX)].filter((m) => { const c = hsl(m[0]); return !!c && isPurple(c); }).map((m) => ({ line: i + 1, col: m.index! + 1, text: m[0], message: `${m[0]} is a purple or violet` }))) },
  { id: "tell/gradient", severity: "error", scope: "any",
    why: "A gradient behind content, most of all a radial glow or a soft blob, is the most common tell.",
    fix: "Use a flat ground. Depth comes from layout, pictures and motion, not from a glow.",
    pattern: /\b(radial|linear|conic)-gradient\s*\(/, match: (m) => `a ${m[1]} gradient` },
  { id: "tell/gradient-text", severity: "error", scope: "any",
    why: "Gradient-filled headline text (background-clip: text) is a landing-page cliché that reads as generated.",
    fix: "Set type in one ink. Mark one word with the accent if one word matters.",
    pattern: /(-webkit-)?background-?[cC]lip\s*[:=]\s*["'`]?text|WebkitBackgroundClip|WebkitTextFillColor\s*:\s*["'`]transparent/ },
  { id: "tell/glow", severity: "error", scope: "any",
    why: "Coloured glows, blurred blobs and frosted panels are decoration with no cause on screen.",
    fix: "Remove it. A system allows only the effects its Texture section lists.",
    pattern: /\bblur\s*\(\s*\d|backdrop-?[fF]ilter|(box|text)-?[sS]hadow\s*[:=]\s*["'`][^"'`]*\b(\d{2,})px[^"'`]*(#|rgb|hsl)|drop-shadow\s*\(/ },
  // ----- Type -----
  { id: "tell/default-font", severity: "warning", scope: "any",
    why: "Inter, Roboto, Arial, Helvetica and system-ui are what code reaches for with no art direction.",
    fix: "Use a system's fonts. Each system names its families and loads them.",
    pattern: /font-?[fF]amily\s*[:=]\s*["'`]?[^;\n]*?\b(Inter|Roboto|Arial|Helvetica(?: Neue)?|system-ui|sans-serif["'`]?\s*[;,}]|Poppins|Montserrat)\b/, match: (m) => `font ${m[1]!.replace(/["'`;,}\s]+$/, "")}` },
  { id: "tell/eyebrow", severity: "warning", scope: "any",
    why: "A tiny, wide-tracked capital line over a headline (\"INTRODUCING\") is the template opener.",
    fix: "Open on the idea itself. If a label is needed, use the system's label role.",
    pattern: /["'`>]\s*(INTRODUCING|ANNOUNCING|NEW|PRESENTING|WELCOME TO|MEET)\s*["'`<]/, match: (m) => `the eyebrow "${m[1]}"` },
  { id: "tell/emoji", severity: "warning", scope: "any",
    why: "Emoji as icons or bullets (a rocket, sparkles) read as chat output pasted into a video.",
    fix: "Draw a shape or use type. A system has no emoji.",
    file: (_s, lines) => lines.flatMap((l, i) => strings(l).filter((s) => EMOJI.test(s.text)).map((s) => ({ line: i + 1, col: s.col, text: s.text.slice(0, 40), message: "an emoji in on-screen text" }))) },
  // ----- Copy -----
  { id: "tell/cliche-copy", severity: "warning", scope: "any",
    why: "Stock marketing phrases say nothing, and a viewer has seen each one a thousand times.",
    fix: "Say the specific thing: a number, a fact, what it does. Short and concrete.",
    file: (_s, lines) => { const re = new RegExp(`\\b(${CLICHES.join("|")})\\b`, "i"); return lines.flatMap((l, i) => strings(l).flatMap((s) => { const m = re.exec(s.text); return m ? [{ line: i + 1, col: s.col, text: s.text.slice(0, 60), message: `the stock phrase "${m[0]}"` }] : []; })); } },
  { id: "tell/placeholder", severity: "error", scope: "any",
    why: "Placeholder names and filler text show that nobody decided what the video says.",
    fix: "Write the real content. For a fictional name, draw one at random for this film.",
    file: (_s, lines) => { const re = new RegExp(`\\b(${PLACEHOLDERS.join("|")})\\b`, "i"); return lines.flatMap((l, i) => strings(l).flatMap((s) => { const m = re.exec(s.text); return m ? [{ line: i + 1, col: s.col, text: s.text.slice(0, 60), message: `the placeholder "${m[0]}"` }] : []; })); } },
  { id: "tell/feature-cards", severity: "warning", scope: "any",
    why: "\"Key Features\" over three icon cards is a slide, not a film: the slideshow tell.",
    fix: "Show one thing at a time, working. One idea per scene.",
    pattern: /["'`>]\s*(Key Features|Features|Why Choose Us|How It Works|Benefits|Our Solution|The Problem|The Solution)\s*["'`<]/i, match: (m) => `the slide title "${m[1]}"` },
  // ----- Motion -----
  { id: "tell/default-ease", severity: "warning", scope: "any",
    why: "ease-in-out, linear and library defaults (power2.inOut, a bare spring) make every move feel the same and slow to start.",
    fix: "Use the system's three curves: enter, move, exit. They are cubic-beziers tuned per system.",
    pattern: /["'`](ease-in-out|ease-in|ease|linear|power[1-4]\.(?:inOut|in|out)|sine\.inOut|back\.out(?:\([\d.]*\))?|elastic\.out(?:\([^)]*\))?)["'`]|\bEasing\.(inOut|linear|ease|bounce|elastic)\b|\bspring\s*\(\s*\{\s*frame\s*,\s*fps\s*\}?\s*\)/, // Constant motion (a wheel turning, a progress bar) is linear on purpose: a track key that names it is not a default.
    match: (m, line) => (/curve\s*:\s*["']linear["']/.test(line) ? false : `the easing ${(m[1] ?? m[0]).replace(/["'`]/g, "")}`) },
  { id: "tell/fade-everything", severity: "warning", scope: "any",
    why: "When every element only fades in, the video is a slideshow with dissolves.",
    fix: "Give entrances a direction and a cause: a masked rise, a draw, a cut on the beat.",
    file: (src, lines) => { const fades = [...src.matchAll(/opacity\s*:\s*(?:interpolate|\[?\s*0\s*,\s*1|0\s*[,}])|fadeIn|autoAlpha\s*:\s*0/g)].length; const moves = [...src.matchAll(/\b(translate[XY]?|x\s*:|y\s*:|scale|rotate|clip-?[pP]ath|reveal|draw|strokeDashoffset)\b/g)].length; return fades >= 5 && moves <= fades / 3 ? [{ line: lines.findIndex((l) => /opacity|fadeIn|autoAlpha/.test(l)) + 1, message: `${fades} fades and ${moves} other moves: nearly every entrance is a fade` }] : []; } },
  { id: "tell/uniform-stagger", severity: "warning", scope: "any",
    why: "One stagger value on every list (0.1 s, forever) is the rhythm of a template.",
    fix: "Take the stagger from the system, and land groups on the music's beats.",
    file: (src, lines) => { const vals = [...src.matchAll(/stagger\s*:\s*([\d.]+)/g)].map((m) => m[1]!); return vals.length >= 4 && new Set(vals).size === 1 ? [{ line: lines.findIndex((l) => /stagger\s*:/.test(l)) + 1, message: `stagger ${vals[0]} used ${vals.length} times` }] : []; } },
  { id: "tell/random", severity: "error", scope: "any",
    why: "Math.random() and Date in a frame make every render different: flicker, and frames nobody can check.",
    fix: "Derive every value from the frame number or a seeded function.",
    pattern: /\bMath\.random\s*\(|\bDate\.now\s*\(|\bnew Date\s*\(\s*\)|\bperformance\.now\s*\(/ },
  { id: "tell/silent", severity: "warning", scope: "any",
    why: "A film over about 10 s with no sound reads as unfinished; a viewer notices silence before any frame.",
    fix: "Add a music bed and a few effects with a cause on screen. Or, when the brief gives no sound or forbids it, state that the film is silent in the scene: export const silent = \"<the reason>\";",
    // A scene in a system whose direction has no music (mix.music "none") may be silent: the system asks for it, so no
    // statement is needed. A scene that states `export const silent = "<reason>"` is silent on purpose: untell check
    // lists the statement with the declarations.
    file: (src, _lines, raw) => { const secs = Number(/(?:seconds|durationInSeconds)\s*=\s*([\d.]+)/.exec(src)?.[1] ?? /data-duration=["']([\d.]+)/.exec(src)?.[1] ?? 0); const said = silentStatement(raw.join("\n")); return secs >= 10 && !silentSystem(src) && !(said && said.reason) && !SOUND.test(src) ? [{ line: 1, message: `a ${secs} s film with no sound` }] : []; } },
  { id: "tell/scale-from-zero", severity: "warning", scope: "any",
    why: "A thing that grows from scale 0 comes from nowhere. Nothing in the world appears from a point.",
    fix: "Enter from a mask or an edge, or from near full size (0.9 or more) with a fade.",
    pattern: /\bscale[XY]?\s*:\s*0(?:\.0+)?\s*[,}\]]|\bscale[XY]?\s*:\s*\[\s*0(?:\.0+)?\s*,|scale\(\s*0(?:\.0+)?\s*\)|\bfrom\s*:\s*\{[^}]*\bscale\s*:\s*0\b/ },
  { id: "tell/bounce", severity: "warning", scope: "any",
    why: "A loose spring (low damping, high bounce) on every entrance is the default of a motion library, and it reads as a toy.",
    fix: "Use the system's enter curve. Keep bounce for a system that allows it, and for one thing in a film.",
    pattern: /\bdamping\s*:\s*([1-7](?:\.\d+)?)\s*[,}]|\bbounce\s*:\s*(0\.[4-9]\d*|1(?:\.0+)?)\s*[,}]|\bEasing\.(?:bounce|elastic|back)\b/, match: (m) => (m[1] ? `a spring with damping ${m[1]}` : m[2] ? `a spring with bounce ${m[2]}` : undefined) },
  { id: "tell/slow-open", severity: "warning", scope: "any",
    why: "A film that fades up from nothing for most of a second makes the viewer wait on frame 0, where they decide to stay.",
    fix: "Show the subject at full strength on frame 0. Let something move, not fade in.",
    pattern: /opacity\s*[:=]\s*interpolate\(\s*frame\s*,\s*\[\s*0\s*,\s*(\d+)/, match: (m) => (Number(m[1]) >= 20 ? `opacity rises from frame 0 to frame ${m[1]}` : false) },
  { id: "tell/uniform-scenes", severity: "warning", scope: "any",
    why: "Four or more scenes of the same length are a slideshow: the film has a metronome, not a rhythm.",
    fix: "Give each beat the time its content needs, and take cut times from the music's bars.",
    file: (src, lines) => { const vals = [...src.matchAll(/durationInFrames\s*=\s*\{\s*(\d+)\s*\}|data-duration=["']([\d.]+)["']/g)].map((m) => m[1] ?? m[2]!); const top = [...new Set(vals)].map((v) => [v, vals.filter((x) => x === v).length] as const).sort((a, b) => b[1] - a[1])[0]; return top && top[1] >= 4 && top[1] >= vals.length * 0.75 ? [{ line: lines.findIndex((l) => /durationInFrames\s*=|data-duration=/.test(l)) + 1, message: `${top[1]} of ${vals.length} scenes last ${top[0]}` }] : []; } },
  // ----- Decoration -----
  { id: "tell/particles", severity: "warning", scope: "any",
    why: "Confetti, sparkles, a star field or floating orbs behind content are filler: motion with no cause.",
    fix: "Remove it. Let the subject move. A system allows only the textures its Texture section lists.",
    pattern: /\b(confetti|particles?|sparkles?|star-?field|bokeh|floating(?:Orbs|Shapes|Blobs)|orbs?|blobs?)\b\s*[=:({<]|<(?:Particles|Confetti|Sparkles|Stars)\b|tsparticles/i, match: (m) => `the decoration "${(m[1] ?? m[0]).trim()}"` },
  { id: "tell/window-chrome", severity: "warning", scope: "any",
    why: "Three traffic-light dots on a rounded dark card is the stock mock of a code window, seen in every generated video.",
    fix: "Show the code or the terminal in the system's own panel (the terminal, codeBlock or pane block).",
    pattern: /#(?:ff5f5[67]|ffbd2e|27c93f|28c840|febc2e|ff605c|00ca4e)\b/i },
  { id: "tell/icon-library", severity: "warning", scope: "any",
    why: "Icons from a UI icon set (Lucide, Heroicons, Font Awesome) make a film read as an app template.",
    fix: "Draw the one mark the film needs with the shape blocks, or use a picture.",
    pattern: /from\s+["'](?:lucide-react|@heroicons\/[\w/-]+|react-icons(?:\/\w+)?|@fortawesome\/[\w-]+|@tabler\/icons-react|phosphor-react|@phosphor-icons\/react)["']|\bclassName=["'][^"']*\bfa-[\w-]+/ },
  { id: "tell/text-shadow", severity: "warning", scope: "any",
    why: "A shadow under text is a patch for text that the layout put on a busy picture.",
    fix: "Put the text on a calm area or a plate, or dim the picture. The check type-over-media measures the result.",
    pattern: /\btext-?[sS]hadow\s*[:=]\s*["'`](?!none)/ },
  { id: "tell/centred-stack", severity: "warning", scope: "any",
    why: "When every text is centred in the middle of the frame, each scene is a title slide.",
    fix: "Set type on the system's grid: an edge, a column, a size that fills the frame. Centre one thing a film, if any.",
    file: (src, lines) => { const c = [...src.matchAll(/text-?[aA]lign\s*[:=]\s*["']?center/g)].length; const other = /text-?[aA]lign\s*[:=]\s*["']?(left|right|start|end|justify)/.test(src); return c >= 5 && !other ? [{ line: lines.findIndex((l) => /text-?[aA]lign\s*[:=]\s*["']?center/.test(l)) + 1, message: `${c} centred texts and none on an edge` }] : []; } },
  // ----- The untell scene contract -----
  { id: "scene/raw-colour", severity: "error", scope: "scene",
    why: "A scene names colour roles. A colour value breaks the system's palette and its contrast checks.",
    fix: `Use a role: ${ROLES.replace(/\|/g, ", ").replace("series[1-5]", "series1-5")}.`,
    pattern: /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch|oklab)\s*\(/ },
  { id: "scene/raw-type", severity: "error", scope: "scene",
    why: "A scene names type roles. A font, size or weight breaks the system's scale.",
    fix: "Use a role: display, headline, body, label or caption.",
    pattern: /\bfont(Size|Family|Weight)\s*:|\bletterSpacing\s*:|\blineHeight\s*:\s*[\d"']/ },
  { id: "scene/raw-motion", severity: "error", scope: "scene",
    why: "A scene takes durations and curves from the system. A literal curve or library easing breaks its motion.",
    fix: "Use go(), appear(), lines() and ctx.dur; pass a curve name (enter, move, exit).",
    pattern: /cubic-bezier\s*\(|\bEasing\.|\bspring\s*\(|\binterpolate\s*\(|curve\s*:\s*\[\s*[\d.]/ },
  { id: "scene/effect", severity: "error", scope: "scene",
    why: "The renderers support no gradient, glow, blur or shadow, on purpose.",
    fix: "Remove it. Use layout, a picture or motion.",
    pattern: /\b(boxShadow|textShadow|filter|backdropFilter)\s*:|gradient\s*\(/ },
  { id: "scene/magic-position", severity: "warning", scope: "scene",
    why: "A literal x or y works at one frame size and one system only, and often lands outside the safe area.",
    fix: "Place from ctx.safe, ctx.width and ctx.height, and measure text with ctx.measure.",
    pattern: /[{,]\s*(x|y)\s*:\s*(\d{3,4})\s*[,}]/, match: (m) => `${m[1]}: ${m[2]}` },
  { id: "scene/unsafe-text", severity: "warning", scope: "scene",
    why: "Text placed from the frame edge (x: 0, y: 0) sits under the platform's own UI at 9:16.",
    fix: "Start text at ctx.safe.left and ctx.safe.top.",
    pattern: /B\.(text|title|typeOn|quote|kineticWords)\(\s*\{[^}]*\b(x|y)\s*:\s*0\s*[,}]/, match: (m) => `B.${m[1]} at ${m[2]}: 0` },
  { id: "scene/duplicate-id", severity: "error", scope: "scene",
    why: "Two blocks with one id overwrite each other's nodes in both renderers.",
    fix: "Give every block call its own id.",
    file: (_s, lines) => { const seen = new Map<string, number>(); const out: { line: number; message: string }[] = []; lines.forEach((l, i) => { for (const m of l.matchAll(/B\.\w+\(\s*\{\s*id\s*:\s*["']([^"'$]+)["']/g)) { if (seen.has(m[1]!)) out.push({ line: i + 1, message: `id "${m[1]}" is also on line ${seen.get(m[1]!)}` }); else seen.set(m[1]!, i + 1); } }); return out; } },
  { id: "scene/no-hook", severity: "warning", scope: "scene",
    why: "A film whose first block starts after 0.5 s opens on an empty frame, and a viewer leaves in the first second.",
    fix: "Start the first block at 0, so it shows from frame 0, and put the subject in the first second.",
    // Typed start times only (a negative one is a block at rest on frame 0); the `at` of a B.measure call is not one.
    file: (src0, lines) => { const src = withoutMeasure(src0); const ats = [...src.matchAll(/\bat\s*:\s*(-?[\d.]+)\s*[,}]/g)].map((m) => Number(m[1])); return ats.length && Math.min(...ats) > 0.5 ? [{ line: lineAt(src, src.search(/\bat\s*:\s*[\d.]/)), message: `nothing starts before ${Math.min(...ats)} s` }] : []; } },
  { id: "scene/case-collision", severity: "error", scope: "any",
    why: "Two film files whose names differ only by case are one file on a disk that ignores case (macOS by default): TypeScript fails with TS1261 or imports the wrong one.",
    fix: "Rename one: name the composition after the scene with .film.tsx (halving.ts and halving.film.tsx).",
    // A folder rule: one source cannot see its neighbours. caseCollisions() runs it over the files that lint reads.
    file: () => [] },
  { id: "scene/patched-block", severity: "warning", scope: "scene",
    why: "A scene that patches a block's nodes (a .map over its output, a block's internals imported) breaks the block's rules: most one-frame accidents in the reels came from these patches.",
    fix: "Use the block's props. If a prop is missing, name the block and the prop in a comment and ask for it; read the system's block map in SYSTEM.md first.",
    file: (src) => patchedBlocks(src) },
  { id: "scene/hand-built", severity: "warning", scope: "scene",
    why: `A scene with ${HAND_BUILT_MIN} or more raw rect, path or text nodes rebuilds what blocks draw, and hand-built geometry is where the errors are (a chain through its ring, panes 6 px apart).`,
    fix: "Use the blocks in the system's block map. If none fits, name the block you tried and the prop it lacks in a comment.",
    file: (src, lines) => {
      // A kind inside a block call is a prop (B.shape({ kind: "rect" })), not a raw node.
      const calls = [...src.matchAll(/\bB\.\w+\s*\(/g)].map((m) => [m.index!, closeParen(src, m.index! + m[0].length - 1)] as const);
      const hits = [...src.matchAll(/\bkind\s*:\s*["'](rect|path|text)["']/g)].filter((h) => !calls.some(([a, b]) => h.index! > a && (b < 0 || h.index! < b)));
      if (hits.length < HAND_BUILT_MIN) return [];
      const n = (k: string) => hits.filter((h) => h[1] === k).length;
      const kinds = Object.keys(HAND_BLOCKS).filter((k) => n(k) > 0);
      const line = lineAt(src, hits[0]!.index!);
      return [{ line, text: lines[line - 1], message: `${hits.length} raw nodes (${kinds.map((k) => `${n(k)} ${k}`).join(", ")}); the blocks for them: ${kinds.map((k) => HAND_BLOCKS[k]).join("; ")}` }];
    } },
  { id: "scene/raw-node-why", severity: "warning", scope: "scene",
    why: "A raw rect, path, text or circle node is geometry the kit does not check. Hard rule 14 asks for a comment that names the block tried and the prop it lacks, so the gap in the blocks is known and can be closed.",
    fix: "Use a block from the system's block map. If none fits, write a comment above the node (within 15 lines): `// Tried <block>: it has no <prop> for <what>.`",
    file: (src, _lines, raw) => rawWithoutWhy(src, raw) },
  { id: "scene/music-entry", severity: "warning", scope: "scene",
    why: "A music bed entered at a typed number (from: 12.4) was placed by guess: the drop and the bars land where they land.",
    fix: "Use peakAt (the film time of the reveal) or align, and read the track with untell listen first.",
    file: (src) => blockCalls(src, "music").filter((c) => /\bfrom\s*:\s*[\d.]+\s*[,}]/.test(c.text) && !/\b(peakAt|align)\s*:/.test(c.text)).map((c) => ({ line: c.line, message: "music enters the track at a typed number" })) },
  { id: "scene/fixed-volume", severity: "warning", scope: "scene",
    why: "A typed music volume skips the level the block computes from the track and the system's mix target, so the mix drifts from film to film.",
    fix: "Leave volume out. The block sets it; untell master brings the final mix to the target.",
    file: (src) => blockCalls(src, "music").filter((c) => /\bvolume\s*:\s*[\d.]+\s*[,}]/.test(c.text)).map((c) => ({ line: c.line, message: "music has a typed volume" })) },
  { id: "scene/typed-times", severity: "warning", scope: "scene",
    why: "A film with music whose times are typed numbers is cut by guess: cuts and entrances miss the beat by a few frames, and that reads as an error.",
    fix: "Build the times from beats() (scene/beats) after you place the music, and land each cut and entrance on a beat or a bar.",
    file: (src, lines) => { if (!blockCalls(src, "music").length || /\bbeats\s*\(|\bonBeat\s*\(|\bBEAT\b|\bbeat\b\s*[*)]/.test(src)) return []; const typed = [...withoutMeasure(src).matchAll(/\bat\s*:\s*\d+(?:\.\d+)?\s*[,}]/g)].filter((m) => !/\bat\s*:\s*0\s*[,}]/.test(m[0])); return typed.length >= 4 ? [{ line: lineAt(src, typed[0]!.index!), text: lines[lineAt(src, typed[0]!.index!) - 1], message: `${typed.length} typed times beside a music bed, and no beat grid` }] : []; } },
  { id: "scene/typed-hit", severity: "warning", scope: "scene",
    why: "An effect placed at a typed time drifts from its picture when the scene's times change, and a sound off its cause reads as a mistake.",
    fix: "Use hit({ on: { nodes, id } }) so the sound lands when that node has arrived, or pass the time of the event from the beat grid.",
    file: (src) => blockCalls(src, "hit").filter((c) => /\bat\s*:\s*\d+(?:\.\d+)?\s*[,}]/.test(c.text)).map((c) => ({ line: c.line, message: "a hit at a typed time" })) },
  { id: "scene/silent", severity: "error", scope: "scene",
    why: "`export const silent` states that the film has no sound on purpose. A statement with no reason, or one beside a sound block, says two things at once.",
    fix: "Give the reason in the string (export const silent = \"the brief forbids sound\";), or remove the statement when the film plays sound.",
    file: (_s, _lines, raw) => {
      const said = silentStatement(raw.join("\n"));
      if (!said) return [];
      if (!said.reason) return [{ line: said.line, message: "the film states that it is silent, with no reason" }];
      const sound = raw.findIndex((l) => !/^\s*\/\//.test(l) && SOUND.test(l));
      return sound >= 0 ? [{ line: sound + 1, message: "the film states that it is silent, and this line plays sound" }] : [];
    } },
  { id: "scene/real-name", severity: "warning", scope: "scene",
    why: "A real brand or a stock cast name that the film invents or borrows is a liability and a tell.",
    fix: "Use a fictional name drawn at random for this film. When the user's own brief names this brand (their product), it is the subject: declare it with that reason.",
    file: (_s, lines) => { const re = /\b(Contoso|Initech|Globex|Stripe|Google|Apple|Nike|OpenAI|Vercel|Linear|Notion|Slack|Figma)\b/; return lines.flatMap((l, i) => strings(l).flatMap((s) => { const m = re.exec(s.text); return m ? [{ line: i + 1, col: s.col, text: s.text.slice(0, 60), message: `the name "${m[0]}"` }] : []; })); } },
];

/** True for an untell scene module: it exports `scene` and `system`. */
export const isScene = (src: string) => /export const scene\b/.test(src) && /export const system\b/.test(src);

/** Lints one file's source. `scope`: "auto" picks scene rules for a scene module. */
export function lint(src: string, opts: { scope?: "auto" | "any" | "scene"; rules?: Rule[] } = {}): Finding[] {
  const scene = opts.scope === "scene" || ((opts.scope ?? "auto") === "auto" && isScene(src));
  const raw = src.split("\n");
  // Comments are not code: blank them, but keep the columns and the ignore markers.
  let inBlock = false;
  const lines = raw.map((l) => {
    let out = "";
    for (let i = 0; i < l.length; i++) {
      if (inBlock) { if (l.startsWith("*/", i)) { inBlock = false; i++; out += "  "; } else out += " "; continue; }
      if (l.startsWith("/*", i)) { inBlock = true; i++; out += "  "; continue; }
      if (l.startsWith("//", i) && !/["'`:]$/.test(l.slice(Math.max(0, i - 1), i))) { out += " ".repeat(l.length - i); break; }
      out += l[i];
    }
    return out;
  });
  const ignored = (rule: string, line: number) => [raw[line - 1], raw[line - 2]].some((l) => { const m = /untell-ignore\s+([\w/,* -]+?)(?::|$)/.exec(l ?? ""); return !!m && m[1]!.split(/[\s,]+/).some((r) => r === rule || r === "*" || (r.endsWith("/*") && rule.startsWith(r.slice(0, -1)))); });
  const out: Finding[] = [];
  for (const rule of opts.rules ?? RULES) {
    // In a scene the kit owns colour, type and motion: the scene rules cover them, more strictly.
    if (rule.scope === "scene" && !scene) continue;
    const add = (line: number, col: number, text: string, message?: string) => { if (!ignored(rule.id, line)) out.push({ rule: rule.id, severity: rule.severity, line, col, text: text.trim().slice(0, 120), message: message ?? rule.why, fix: rule.fix }); };
    if (rule.pattern) lines.forEach((l, i) => {
      const m = new RegExp(rule.pattern!.source, rule.pattern!.flags.replace("g", "")).exec(l);
      if (!m) return;
      const msg = rule.match ? rule.match(m, l) : undefined;
      if (msg === false) return;
      add(i + 1, m.index + 1, raw[i]!, msg || undefined);
    });
    if (rule.file) for (const f of rule.file(lines.join("\n"), lines, raw)) add(Math.max(1, f.line), f.col ?? 1, f.text ?? raw[Math.max(0, f.line - 1)] ?? "", f.message);
  }
  return out.sort((a, b) => a.line - b.line || a.col - b.col);
}

/**
 * scene/case-collision over a list of paths: each pair of files in one folder whose names, without the extension,
 * are equal but for case (halving.ts and Halving.tsx). Returns [the later file, the earlier one].
 */
export function caseCollisions(paths: string[]): [string, string][] {
  const out: [string, string][] = [];
  const seen = new Map<string, string>();
  for (const p of [...new Set(paths)].sort()) {
    const slash = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
    const dir = p.slice(0, slash + 1), base = p.slice(slash + 1).replace(/\.(tsx?|jsx?)$/, "");
    const key = dir.toLowerCase() + base.toLowerCase();
    const other = seen.get(key);
    if (other !== undefined && other.slice(other.lastIndexOf("/") + 1).replace(/\.(tsx?|jsx?)$/, "") !== base) out.push([p, other]);
    else if (other === undefined) seen.set(key, p);
  }
  return out;
}
