// The Remotion adapter for the design systems. A film wraps itself in <SystemFilm system="spec"> and
// builds with the components below. They take roles, positions in px and times in seconds; the
// system decides every colour, font, size, weight, curve and duration. The film never sets one.
//
// The components mirror the HyperFrames idioms in examples/hyperframes (masked line rises, typed
// labels, drawn hairlines, growing bars), so one design reads the same in both frameworks.
import { createContext, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { AbsoluteFill, continueRender, delayRender, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { makeCtx } from "./scene/context";
import { checkReplaces } from "./scene/blocks/handover";
import { makeMeasure } from "./scene/measure";
import { Scene } from "./scene/remotion";
import type { Ctx as SceneCtx, Node } from "./scene/types";
import { hex } from "./color";
import { FONT_LOADERS } from "./fonts.gen";
import { frameFor } from "./frame";
import { FALLBACK_SUBSETS, fallbackFonts, SYSTEMS, type System, type TypeRole } from "./systems";
import { GRAIN_URIS } from "./grain/tiles.gen";
import { grainOf } from "./scene/layout";

export type ColorRole =
  | "ground" | "surface" | "rule" | "ink" | "inkMuted" | "accent" | "accent2" | "accent3" | "accentText" | "onAccent"
  | "series1" | "series2" | "series3" | "series4" | "series5" | "positive" | "negative";
type Curve = "enter" | "move" | "exit";

type Ctx = { s: System; colors: Record<string, string>; families: Record<"display" | "text" | "mono", string> & { fallback?: string }; geo: ReturnType<typeof frameFor> };
const SystemContext = createContext<Ctx | null>(null);

// Fonts load once per family and weight set, the first time a system needs them.
const loaded = new Map<string, { family: string; done: Promise<unknown> }>();
function loadFamily(family: string, weights: number[], subsets = ["latin"]) {
  const key = `${family}:${weights.join(",")}:${subsets.join(",")}`;
  if (!loaded.has(key)) {
    const loader = FONT_LOADERS[family];
    if (!loader) throw new Error(`No font loader for ${family}: FONT_LOADERS in fonts.gen.ts has none. Give the system a family that FONT_LOADERS lists, or add a loader for ${family} there (a function that loads the font files and returns fontFamily and waitUntilDone). untell system check names the families.`);
    const f = loader("normal", { weights: weights.map(String), subsets });
    loaded.set(key, { family: f.fontFamily, done: f.waitUntilDone() });
  }
  return loaded.get(key)!;
}

export function getSystem(id: string): System {
  const s = SYSTEMS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown system "${id}". Systems: ${SYSTEMS.map((x) => x.id).join(", ")}`);
  return s;
}

/** The root of every system film: the flat ground, the fonts, and data-system for the inspect tools. */
export function SystemFilm({ system, children }: { system: string; children: ReactNode }) {
  const { width, height } = useVideoConfig();
  const s = getSystem(system);
  const colors = Object.fromEntries(Object.entries(s.roles).map(([k, v]) => [k, hex(v as never)]));
  const families = { display: "", text: "", mono: "" } as Ctx["families"];
  const waits: Promise<unknown>[] = [];
  for (const slot of ["display", "text", "mono"] as const) {
    const family = s.fonts[slot];
    if (!family) continue;
    const weights = [...new Set(Object.values(s.type).filter((t) => t.font === slot).map((t) => t.weight))];
    const f = loadFamily(family, weights);
    families[slot] = `"${f.family}"`;
    waits.push(f.done);
  }
  // The symbol fallback fonts, after the main family (see System.fonts.fallback). One weight, 400.
  families.fallback = fallbackFonts(s).map((family) => {
    const f = loadFamily(family, [400], FALLBACK_SUBSETS[family] ?? ["latin"]);
    waits.push(f.done);
    return `"${f.family}"`;
  }).join(", ");
  // The grain tiles decode before the first frame, so frame 0 has its grain.
  if (grainOf(s) > 0) for (const u of GRAIN_URIS) { const img = new Image(); img.src = u; waits.push(img.decode()); }
  // Blocks measure text, so nothing renders until the fonts are in. A render waits too (delayRender).
  const [handle] = useState(() => delayRender(`fonts for ${s.id}`));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all(waits).then(() => document.fonts.ready).then(() => {
      if (live) setReady(true);
      continueRender(handle);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.id]);
  const ctx: Ctx = { s, colors, families, geo: frameFor(s, width, height) };
  return (
    <SystemContext.Provider value={ctx}>
      <AbsoluteFill data-system={s.id} data-ready={ready ? "" : undefined} style={{ background: colors.ground, color: colors.ink }}>
        {ready ? children : null}
      </AbsoluteFill>
    </SystemContext.Provider>
  );
}

export function useSystem() {
  const ctx = useContext(SystemContext);
  if (!ctx) throw new Error("Use the system components inside <SystemFilm>.");
  return ctx;
}

/** A colour role as a value, for SVG strokes and fills. */
export function useColor(role: ColorRole) {
  const { colors } = useSystem();
  const v = colors[role];
  if (!v) throw new Error(`This system has no "${role}" role.`);
  return v;
}

/** The full text style for a type role, in px for this frame size. */
export function useType(role: TypeRole): CSSProperties {
  const { s, families, geo } = useSystem();
  const t = s.type[role];
  return {
    fontFamily: [families[t.font] || families.text, families.fallback].filter(Boolean).join(", "), fontSize: geo.type[role].px, fontWeight: t.weight,
    letterSpacing: `${t.tracking}em`, lineHeight: t.leading, textTransform: t.uppercase ? "uppercase" : "none",
    fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
  };
}

/** 0 to 1 along one of the system's curves, starting at `at` seconds. `scale` stretches the duration. */
export function useProgress(at: number, curve: Curve, scale = 1) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { s } = useSystem();
  const dur = Math.max(1, (s.motion.frames[curve] * scale * fps) / 30);
  const [a, b, c, d] = s.motion[curve];
  return interpolate(frame, [at * fps, at * fps + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(a, b, c, d) });
}

/** The system's stagger between items, in seconds. */
export function useStagger() {
  const { s } = useSystem();
  return s.motion.frames.stagger / 30;
}

type Place = { x: number; y: number; width?: number };
const placed = (p: Place): CSSProperties => ({ position: "absolute", left: p.x, top: p.y, ...(p.width ? { width: p.width } : {}) });

function Line({ text, at, until, style }: { text: string; at: number; until?: number; style: CSSProperties }) {
  const inP = useProgress(at, "enter");
  const outP = useProgress(until ?? 1e9, "exit");
  const y = until !== undefined && outP > 0 ? -105 * outP : 105 * (1 - inP);
  return (
    <span style={{ display: "block", overflow: "hidden" }}>
      <span style={{ ...style, display: "inline-block", transform: `translateY(${y}%)` }}>{text}</span>
    </span>
  );
}

/**
 * Lines of text that rise out of their own masks, one after another, and sink the same way at `until`.
 * Before `at` and after the exit, the block is hidden, so nothing reads it while it is off screen.
 */
export function Lines({ lines, role, color = "ink", at, until, ...p }: Place & { lines: string[]; role: TypeRole; color?: ColorRole; at: number; until?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { s } = useSystem();
  const type = useType(role);
  const c = useColor(color);
  const stagger = useStagger();
  const gone = until !== undefined && frame >= (until + (s.motion.frames.exit + s.motion.frames.stagger * lines.length) / 30) * fps;
  const visible = frame >= at * fps && !gone;
  return (
    <div style={{ ...placed(p), visibility: visible ? "visible" : "hidden" }}>
      {lines.map((text, i) => (
        <Line key={i} text={text} at={at + i * stagger} until={until !== undefined ? until + i * stagger : undefined} style={{ ...type, color: c }} />
      ))}
    </div>
  );
}

/** Text that types on, character by character, like a label being written. */
export function TypeOn({ text, role = "label", color = "inkMuted", at, ...p }: Place & { text: string; role?: TypeRole; color?: ColorRole; at: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const type = useType(role);
  const c = useColor(color);
  const shown = Math.max(0, Math.min(text.length, Math.floor((frame / fps - at) / 0.025) + 1));
  return (
    <div style={{ ...placed(p), ...type, color: c, visibility: frame >= at * fps ? "visible" : "hidden", clipPath: `inset(0 ${100 - (100 * shown) / text.length}% 0 0)` }}>
      {text}
    </div>
  );
}

/** Anything that fades in and rises 12 px, and leaves the same way at `until`. */
export function Show({ at, until, children, ...p }: Place & { at: number; until?: number; children: ReactNode }) {
  const inP = useProgress(at, "enter");
  const outP = useProgress(until ?? 1e9, "exit");
  const o = inP * (1 - outP);
  return <div style={{ ...placed(p), opacity: o, visibility: o > 0 ? "visible" : "hidden", transform: `translateY(${12 * (1 - inP)}px)` }}>{children}</div>;
}

/** Text in a role and colour, placed; use it inside <Show> or alone. */
export function Text({ children, role, color = "ink", ...p }: Partial<Place> & { children: ReactNode; role: TypeRole; color?: ColorRole }) {
  const type = useType(role);
  const c = useColor(color);
  return <div style={{ ...(p.x !== undefined && p.y !== undefined ? placed(p as Place) : {}), ...type, color: c }}>{children}</div>;
}

/** A solid bar that grows from its start edge along an axis. Its length is the data's, not the grid's. */
export function Bar({ at, x, y, w, h, color = "series1", axis = "x" }: { at: number; x: number; y: number; w: number; h: number; color?: ColorRole; axis?: "x" | "y" }) {
  const p = useProgress(at, "move", 1.4);
  const c = useColor(color);
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, background: c,
      transformOrigin: axis === "x" ? "0 50%" : "50% 100%", transform: axis === "x" ? `scaleX(${p})` : `scaleY(${p})` }} />
  );
}

/** A full-frame SVG layer for hairlines and marks. Decoration: the inspect tools treat it as one graphic. */
export function Drawing({ children }: { children: ReactNode }) {
  const { width, height } = useVideoConfig();
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      {children}
    </svg>
  );
}

/** A straight line that draws itself from its first point. Use inside <Drawing>. */
export function Rule({ x1, y1, x2, y2, at, color = "rule", duration = "move" }: { x1: number; y1: number; x2: number; y2: number; at: number; color?: ColorRole; duration?: Curve }) {
  const { geo } = useSystem();
  const p = useProgress(at, duration === "move" ? "move" : "enter");
  const c = useColor(color);
  const len = Math.hypot(x2 - x1, y2 - y1);
  return <path d={`M${x1} ${y1}L${x2} ${y2}`} stroke={c} strokeWidth={geo.stroke} fill="none" strokeDasharray={len} strokeDashoffset={len * (1 - p)} opacity={p > 0 ? 1 : 0} />;
}

/** A + mark where two grid lines cross. Use inside <Drawing>. */
export function Cross({ x, y, at, size = 24 }: { x: number; y: number; at: number; size?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { geo } = useSystem();
  const c = useColor("ink");
  const h = size / 2;
  return frame >= at * fps ? <path d={`M${x - h} ${y}h${size}M${x} ${y - h}v${size}`} stroke={c} strokeWidth={geo.stroke} fill="none" /> : null;
}

/** The area where text may go in this frame (see src/system/frame.ts). */
export function useSafeArea() {
  const { geo } = useSystem();
  const { width, height } = geo;
  const s = geo.safe;
  return { left: s.left, right: width - s.right, top: s.top, bottom: height - s.bottom, lowBandTop: s.lowBandTop, lowBandRight: width - s.lowBandRight };
}

/**
 * Renders blocks. `build` receives the scene context (system, frame size, text measure, durations) and
 * returns nodes, usually by calling block functions: build={(ctx) => [...lineChart({...}, ctx)]}.
 * Keep `build` stable (define it outside the component) so the scene is built once.
 */
export function Blocks({ build }: { build: (ctx: SceneCtx) => Node[] }) {
  const { s, families } = useSystem();
  const { width, height } = useVideoConfig();
  const nodes = useMemo(() => {
    const ctx = makeCtx(s, width, height, makeMeasure(s, families, Math.min(width, height)));
    const nodes = build(ctx);
    checkReplaces(ctx); // a replaces whose block the scene never built
    return nodes;
  }, [s, families.display, families.text, families.mono, width, height, build]);
  return <Scene nodes={nodes} system={s} families={families} />;
}
