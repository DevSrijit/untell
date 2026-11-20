// The Remotion renderer for scene nodes. It evaluates every track at the current frame.
// Draw order, from the back: holds (empty, see HoldNode), the scene (inside the camera), pinned nodes (screen
// space), then the scanline and grain layers above everything. The HyperFrames renderer (hyperframes.ts) builds the same elements.
// The system's motion (frame step, opaque) is applied to every track first (time.withSystemMotion).
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, Img, OffthreadVideo, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { System } from "../systems";
import { GRAIN_URIS } from "../grain/tiles.gen";
import { assetUrl, BLUR_ID, blurRegion, soundsOf, cameraOf, clipCss, colorOf, GRAIN_STYLE, GRAIN_TILES, grainOf, hasTilt, holdsOf, LIGHT_BLEND, lightMask, maskBox, maskPad, maskTravel, originCss,
  outlineFilter, perspectiveOf, runs, scanlinesOf, scanlineStyle, sweepBox, textAttrs, textStyle, type Families } from "./layout";
import { evaluate, withSystemMotion } from "./time";
import { shownFrames } from "./context";
import { Scene3DView } from "../three/remotion";
import type { ImageNode, Node, TextNode } from "./types";

/**
 * The CSS transform of a node's values, in GSAP's order (so HyperFrames draws the same thing): perspective,
 * translate, rotate, tiltY (rotateY), tiltX (rotateX), scale. `persp` is set for a node with tilt tracks.
 */
function transform(v: ReturnType<typeof evaluate>, persp?: number) {
  const parts: string[] = [];
  if (persp) parts.push(`perspective(${persp}px)`);
  if (v.x || v.y) parts.push(`translate(${v.x}px, ${v.y}px)`);
  if (v.rotate) parts.push(`rotate(${v.rotate}deg)`);
  if (persp && v.tiltY) parts.push(`rotateY(${v.tiltY}deg)`);
  if (persp && v.tiltX) parts.push(`rotateX(${v.tiltX}deg)`);
  const sx = v.scale * v.scaleX, sy = v.scale * v.scaleY;
  if (sx !== 1 || sy !== 1) parts.push(`scale(${sx}, ${sy})`);
  return parts.length ? parts.join(" ") : undefined;
}

/** Holds the render until the pictures that light layers use as masks are decoded (a CSS mask is not an <Img>). */
function useMasks(nodes: Node[]) {
  const urls = useMemo(() => [...new Set(nodes.flatMap((n) => (n.kind === "image" && n.lights?.length ? [assetUrl(n.src)] : [])))], [nodes]);
  const [handle] = useState(() => (urls.length ? delayRender("light masks") : null));
  useEffect(() => {
    if (handle === null) return;
    Promise.all(urls.map((u) => { const img = new Image(); img.src = u; return img.decode().catch(() => undefined); })).then(() => continueRender(handle));
  }, [handle, urls]);
}

export function Scene({ nodes: given, system, families }: { nodes: Node[]; system: System; families: Families }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const nodes = useMemo(() => withSystemMotion(system, given, fps), [system, given, fps]);
  useMasks(nodes);
  const persp = perspectiveOf(width, height);
  const tilt = (n: Node) => (hasTilt(n.tracks) ? persp : undefined);
  const t = frame / fps;
  const short = Math.min(width, height);
  const c = (r: Parameters<typeof colorOf>[1]) => colorOf(system, r);
  const box = (n: Node) => {
    if (n.kind !== "rect") return null;
    const v = evaluate(system, n.tracks, t);
    return (
      <div key={n.id} data-el={n.id} data-group={n.group} data-state={n.state} style={{
        position: "absolute", left: n.x, top: n.y, width: n.w, height: n.h, background: c(n.fill), borderRadius: n.radius,
        ...(n.stroke ? { boxShadow: `inset 0 0 0 ${n.strokeWidth ?? 1}px ${c(n.stroke)}` } : {}),
        opacity: v.opacity, visibility: v.opacity > 0 ? "visible" : "hidden", transform: transform(v, tilt(n)), ...originCss(n),
        ...(n.blend ? { mixBlendMode: n.blend } : {}),
      }} />
    );
  };
  // A picture clipped to its box (and to its clip polygon). A mover inside carries the inner tracks, so the picture
  // and its lights move together; it is isolated, so a light mixes only with its picture.
  const picture = (n: ImageNode) => {
    const v = evaluate(system, n.tracks, t);
    const iv = evaluate(system, n.inner, t);
    const [fx, fy] = n.focus ?? [0.5, 0.5];
    const ol = n.outline?.length ? outlineFilter(system, n) : null;
    const pictureStyle: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: n.fit ?? "cover",
      objectPosition: `${fx * 100}% ${fy * 100}%`, ...(ol ? { filter: `url(#${ol.id})` } : {}) };
    return (
      <div key={n.id} data-el={n.id} data-group={n.group} data-cutout={n.cutout ? "" : undefined} style={{ position: "absolute", left: n.x, top: n.y, width: n.w, height: n.h, overflow: "hidden", borderRadius: n.radius,
        opacity: v.opacity, visibility: v.opacity > 0 ? "visible" : "hidden", transform: transform(v, tilt(n)), ...originCss(n),
        ...(n.clip ? { clipPath: clipCss(n.clip) } : {}), ...(n.blend ? { mixBlendMode: n.blend } : {}) }}>
        {ol ? (
          <svg width={0} height={0} style={{ position: "absolute" }}>
            <filter id={ol.id} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
              {ol.rings.flatMap((g) => [
                <feMorphology key={`${g.key}m`} in="SourceAlpha" operator="dilate" radius={g.radius} result={`${g.key}grown`} />,
                <feFlood key={`${g.key}f`} floodColor={g.color} result={`${g.key}ink`} />,
                <feComposite key={`${g.key}c`} in={`${g.key}ink`} in2={`${g.key}grown`} operator="in" result={g.key} />,
              ])}
              <feMerge>{ol.rings.map((g) => <feMergeNode key={g.key} in={g.key} />)}<feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </svg>
        ) : null}
        <div style={{ position: "absolute", inset: 0, isolation: "isolate", transform: transform(iv), transformOrigin: `${fx * 100}% ${fy * 100}%` }}>
          {n.video ? (
            // Footage plays only inside its window, on the frame grid of the node's opacity (shownFrames): a clip that
            // ends at t and a block that starts at t meet on one frame. The renderer extracts each frame exactly.
            (() => { const v = n.video!, F = shownFrames(v.at, v.until), media = (v.from ?? 0) + (F.on / fps - v.at) * (v.rate ?? 1);
              return F.off <= F.on ? null : (
              <Sequence from={F.on} durationInFrames={F.off - F.on} layout="none">
                <OffthreadVideo src={assetUrl(n.src)} muted trimBefore={Math.max(0, Math.round(media * fps))} playbackRate={v.rate ?? 1} style={pictureStyle} />
              </Sequence>); })()
          ) : (
            <Img src={assetUrl(n.src)} style={pictureStyle} />
          )}
          {(n.lights ?? []).map((l) => {
            const lv = evaluate(system, l.tracks, t);
            const sw = l.kind === "sweep" ? sweepBox(n, l) : null;
            return (
              // Light is not layout: the HyperFrames checks skip it (data-layout-ignore), in both renderers.
              <div key={l.id} data-el={l.id} data-layout-ignore="" style={{ position: "absolute", inset: 0, ...(lightMask(n, l) as CSSProperties), mixBlendMode: LIGHT_BLEND,
                opacity: lv.opacity, visibility: lv.opacity > 0 ? "visible" : "hidden", ...(sw ? {} : { background: c(l.color) }) }}>
                {sw ? (
                  <div style={{ position: "absolute", left: sw.left, top: sw.top, width: sw.side, height: sw.side, transform: `rotate(${l.angle}deg)` }}>
                    <div style={{ position: "absolute", left: sw.band, top: 0, width: l.width, height: sw.side, background: c(l.color), transform: transform(lv) }} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  const shape = (n: Node) => {
    const v = evaluate(system, n.tracks, t);
    const common = {
      "data-el": n.id, "data-group": n.kind === "audio" ? undefined : n.group, opacity: v.opacity, visibility: v.opacity > 0 ? "visible" : "hidden",
      style: { transform: transform(v), ...originCss(n) } as CSSProperties,
    } as const;
    if (n.kind === "circle") {
      return <circle key={n.id} {...common} cx={n.cx} cy={n.cy} r={n.r} fill={n.fill ? c(n.fill) : "none"} stroke={n.stroke ? c(n.stroke) : undefined} strokeWidth={n.width} />;
    }
    if (n.kind !== "path") return null;
    const drawn = n.tracks?.draw !== undefined;
    const stroke = n.stroke ? c(n.stroke) : undefined;
    const fill = n.fill ? c(n.fill) : "none";
    if (drawn && n.dash) {
      // A dashed line draws through a mask, so the dash pattern and the reveal do not fight.
      const mid = `m-${n.id}`;
      return (
        <g key={n.id} {...common}>
          {/* The mask reaches well past the frame: after a camera pan a drawn line can sit outside 0..width. */}
          <mask id={mid} maskUnits="userSpaceOnUse" x={-width} y={-height} width={width * 3} height={height * 4}>
            <path d={n.d} pathLength={1} stroke="#fff" strokeWidth={(n.width ?? 1) + 4} fill="none" strokeDasharray="1 1" strokeDashoffset={1 - v.draw} strokeLinecap="butt" />
          </mask>
          <path d={n.d} stroke={stroke} strokeWidth={n.width} fill={fill} strokeDasharray={n.dash.join(" ")} strokeLinecap={n.cap} strokeLinejoin={n.join} mask={`url(#${mid})`} />
        </g>
      );
    }
    return (
      <path key={n.id} {...common} d={n.d} stroke={stroke} strokeWidth={n.width} fill={fill} strokeLinecap={n.cap} strokeLinejoin={n.join}
        {...(n.fillRule ? { fillRule: n.fillRule } : {})}
        {...(n.dash ? { strokeDasharray: n.dash.join(" ") } : {})}
        {...(drawn ? { pathLength: 1, strokeDasharray: "1 1", strokeDashoffset: 1 - v.draw } : {})} />
    );
  };
  const text = (n: TextNode) => {
    const v = evaluate(system, n.tracks, t);
    const style = textStyle(system, families, n.role, short, n.keepCase, n.weight, n.italic) as CSSProperties;
    // A masked line: the clip box sits round the text's own box, padded to the font's ink (layout.maskPad), so the
    // text and its origin stay where the block put them and the mask never cuts a glyph at rest.
    const pad = maskPad(system, n.role, short, { weight: n.weight, text: n.text, italic: n.italic });
    const outer: CSSProperties = {
      position: "absolute", left: n.x, top: n.y, color: c(n.color),
      ...(n.width ? { width: n.width, textAlign: n.align ?? "left" } : {}),
      opacity: v.opacity, visibility: v.opacity > 0 ? "visible" : "hidden", transform: transform(v, tilt(n)),
      ...originCss(n),
      ...(n.blend ? { mixBlendMode: n.blend } : {}),
    };
    // The attributes go on the box and on the span: the HyperFrames check reads the span's own attributes.
    const attrs = textAttrs(system, n);
    return (
      <div key={n.id} data-el={n.id} data-group={n.group} data-role={n.role} data-content={n.content} data-state={n.state} style={outer} {...attrs}>
        {n.mask ? <div style={maskBox(pad)}><span {...attrs} style={{ ...style, display: "block", transform: `translateY(${(v.reveal / 100) * maskTravel(system, n.role, short, { weight: n.weight, text: n.text, italic: n.italic })}px)` }}>{n.text}</span></div>
          : <span {...attrs} style={style}>{n.text}</span>}
      </div>
    );
  };
  // The camera: the whole scene pans and zooms about the frame centre (see CameraNode).
  const cam = cameraOf(nodes);
  const cv = cam ? evaluate(system, cam.tracks, t) : null;
  // GSAP's order for the camera in HyperFrames: perspective (with tilt), translate, rotateY, rotateX, scale.
  const camTilt = cam && hasTilt(cam.tracks);
  // A whip's motion blur (camera blurX, blurY): one SVG Gaussian blur on the world, as in HyperFrames.
  const camBlur = !!(cam?.tracks?.blurX?.length || cam?.tracks?.blurY?.length);
  const camStyle: CSSProperties = cv ? { transform: [camTilt ? `perspective(${persp}px)` : "", `translate(${-cv.x}px, ${-cv.y}px)`,
    camTilt && cv.tiltY ? `rotateY(${cv.tiltY}deg)` : "", camTilt && cv.tiltX ? `rotateX(${cv.tiltX}deg)` : "", `scale(${cv.scale})`].filter(Boolean).join(" "),
    transformOrigin: `${width / 2}px ${height / 2}px`, ...(camBlur && (cv.blurX || cv.blurY) ? { filter: `url(#${BLUR_ID})` } : {}) } : {};
  // Grain: one tile per frame, in a fixed order, at the system's strength (see layout.ts).
  const grain = grainOf(system);
  // Scanlines: one still layer of hard dark lines over the frame (see layout.ts), as in HyperFrames.
  const scan = scanlinesOf(system);
  const draw = (r: ReturnType<typeof runs>[number], i: number) => r.kind === "shapes" ? (
    // One SVG per run of lines and circles. It takes no pointer events, so it never counts as covering text.
    <svg key={`s${i}`} data-el={i === 0 ? "scene-shapes" : `scene-shapes-${i}`} viewBox={`0 0 ${width} ${height}`} width={width} height={height}
      style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none", ...(r.blend ? { mixBlendMode: r.blend } : {}) }}>
      {r.nodes.map(shape)}
    </svg>
  ) : r.kind === "rect" ? box(r.node) : r.kind === "image" ? picture(r.node) : r.kind === "scene3d" ? (
    <div key={r.node.id} data-el={r.node.id} data-layout-allow-overflow={r.node.bleed ? "" : undefined} style={{ position: "absolute", inset: 0, opacity: evaluate(system, r.node.tracks, t).opacity }}>
      <Scene3DView spec={r.node.spec} system={system} />
    </div>
  ) : text(r.node);
  // Pinned nodes: screen space, above the world. Their SVG runs are numbered after the world's, so ids stay unique.
  const worldRuns = runs(nodes).length;
  const screen = runs(nodes, "screen").map((r, i) => draw(r, worldRuns + i));
  return (
    <>
      {soundsOf(nodes).map((n) => {
        const from = Math.round(n.at * fps);
        const len = n.until !== undefined ? Math.round((n.until - n.at) * fps) : Infinity;
        const vol = n.volume ?? 1, fi = (n.fadeIn ?? 0) * fps, fo = (n.fadeOut ?? 0) * fps;
        // Volume by frame inside the Sequence: linear fades in and out, as HyperFrames' data-fade-in/out.
        const volume = (f: number) => vol * Math.min(fi > 0 ? interpolate(f, [0, fi], [0, 1], { extrapolateRight: "clamp" }) : 1,
          fo > 0 && Number.isFinite(len) ? interpolate(f, [len - fo, len], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1);
        return (
          <Sequence key={n.id} from={from} durationInFrames={len} layout="none">
            <Audio src={assetUrl(n.src)} trimBefore={Math.round((n.from ?? 0) * fps)} volume={volume} />
          </Sequence>
        );
      })}
      {holdsOf(nodes).map((n) => {
        const v = evaluate(system, n.tracks, t);
        return <div key={n.id} data-el={n.id} data-hold="" data-layout-ignore="" style={{ position: "absolute", left: 0, top: 0, width, height, pointerEvents: "none",
          opacity: v.opacity, visibility: v.opacity > 0 ? "visible" : "hidden" }} />;
      })}
      {camBlur && cv ? (
        <svg width={0} height={0} style={{ position: "absolute" }}>
          <filter id={BLUR_ID} {...(() => { const r = blurRegion(cam!, width, height); return { x: r.x, y: r.y, width: r.w, height: r.h }; })()} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation={`${cv.blurX} ${cv.blurY}`} edgeMode="duplicate" />
          </filter>
        </svg>
      ) : null}
      <AbsoluteFill data-el={cam ? "world" : undefined} data-camera={cv ? `${width / 2 + cv.x},${height / 2 + cv.y},${cv.scale}` : undefined} style={camStyle}>
        {runs(nodes).map(draw)}
      </AbsoluteFill>
      {screen.length ? <AbsoluteFill data-el="screen">{screen}</AbsoluteFill> : null}
      {scan > 0 ? <div data-el="texture" data-layout-ignore="" style={{ ...scanlineStyle(Math.min(width, height)), opacity: scan } as CSSProperties} /> : null}
      {grain > 0 ? <div data-el="texture" data-layout-ignore="" style={{ ...GRAIN_STYLE, opacity: grain, backgroundImage: `url(${GRAIN_URIS[frame % GRAIN_TILES]})` }} /> : null}
    </>
  );
}
