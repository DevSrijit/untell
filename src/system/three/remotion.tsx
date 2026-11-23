// The Remotion view of a 3D scene: a canvas in the spec's box that draws the frame for the current time.
//
// The canvas shows on the frames its node's opacity window shows (shownOn, the same frame grid as `windows` in
// context.ts): a shot given `at: t` first shows on frameOf(t), and a shot given `until: t` is gone on that frame. So at
// a cut the old shot's last frame and the new shot's first frame are adjacent and no frame is blank. The view draws
// only while it shows, and it draws on every frame it shows, before Remotion takes that frame.
import { useLayoutEffect, useRef, useState } from "react";
import { cancelRender, continueRender, delayRender, useCurrentFrame, useVideoConfig } from "remotion";
import type { System } from "../systems";
import { createScene3D } from "./render";
import { shownOn } from "./shown";
import type { Scene3D } from "./spec";

export function Scene3DView({ spec, system }: { spec: Scene3D; system: System }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const r3 = useRef<ReturnType<typeof createScene3D> | null>(null);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // A scene with models holds the render until they load (models can be large: allow a minute).
  const [handle] = useState(() => delayRender(`3d scene ${spec.id}`, { timeoutInMilliseconds: 60000 }));
  const now = useRef(frame / fps);
  now.current = frame / fps;
  useLayoutEffect(() => {
    let live = true;
    const r = (r3.current = createScene3D(ref.current!, spec, system));
    r.renderAt(now.current);
    // Draw the frame the player is on when the models are in, then let the render go on.
    r.ready.then(() => { if (live) r.renderAt(now.current); continueRender(handle); }, (e) => cancelRender(e));
    return () => { live = false; r.dispose(); };
    // The scene is built once; frames only change the time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const visible = shownOn(spec, frame);
  // Every frame it shows, from the time alone. A hidden view does not draw: three hidden shots cost nothing.
  useLayoutEffect(() => { if (visible) r3.current?.renderAt(frame / fps); }, [frame, fps, visible]);
  const { x, y, w, h } = spec.box;
  return <canvas ref={ref} data-el={`3d-${spec.id}`} width={w} height={h} style={{ position: "absolute", left: x, top: y, width: w, height: h, visibility: visible ? "visible" : "hidden" }} />;
}
