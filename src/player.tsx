// The capture page. It mounts one composition in Remotion's Player at full size and lets the
// recorder seek to any frame. The recorder reads the DOM after each seek: the Player renders the
// same React tree that a Remotion render would, so the measurements match the real video.
import { createRoot } from "react-dom/client";
import { Player, type PlayerRef } from "@remotion/player";
import { createRef } from "react";

declare global {
  interface Window {
    __meta: { width: number; height: number; fps: number; durationInFrames: number } | null;
    __seek: (frame: number) => Promise<void>;
  }
}

type Registry = Record<string, { component: import("react").ComponentType<any>; props: Record<string, unknown>; width: number; height: number; fps: number; durationInFrames: number }>;

/** Mounts one composition from `registry` (chosen by ?comp=) at full size and exposes __meta and __seek. */
export function mountPlayer(COMPOSITIONS: Registry) {
const params = new URLSearchParams(location.search);
const id = params.get("comp") ?? "";
const entry = COMPOSITIONS[id];
const playerRef = createRef<PlayerRef>();


if (!entry) {
  document.body.textContent = `Unknown composition: ${id}`;
  window.__meta = null;
} else {
  const { component, props, width, height, fps, durationInFrames } = entry;
  window.__meta = { width, height, fps, durationInFrames };
  window.__seek = async (frame: number) => {
    playerRef.current?.seekTo(frame);
    // Two animation frames: React commits the new frame, then the browser paints it.
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    await document.fonts.ready;
    // 3D models must have loaded (src/system/three/render.ts); the scene then draws the frame it is on.
    await Promise.all([...((globalThis as unknown as { __vs3dPending?: Set<Promise<unknown>> }).__vs3dPending ?? [])].map((p) => p.catch(() => {})));
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    // Pictures must be decoded before the frame is read.
    await Promise.all(Array.from(document.images).map((im) => (im.complete ? Promise.resolve() : im.decode().catch(() => {}))));
    // Footage must have finished seeking and have the frame ready.
    await Promise.all(Array.from(document.querySelectorAll("video")).map((v) => new Promise<void>((r) => {
      const ready = () => !v.seeking && v.readyState >= 2;
      if (ready()) return r();
      const tick = () => (ready() ? r() : setTimeout(tick, 10));
      setTimeout(() => r(), 3000); // never hang the recorder on one frame
      tick();
    })));
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  };
  createRoot(document.getElementById("root")!).render(
    <Player
      ref={playerRef}
      component={component}
      inputProps={props}
      durationInFrames={durationInFrames}
      fps={fps}
      compositionWidth={width}
      compositionHeight={height}
      style={{ width, height }}
      controls={false}
      clickToPlay={false}
      acknowledgeRemotionLicense
    />,
  );
}
}
