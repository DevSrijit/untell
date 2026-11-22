// A film that throws while it draws frame 1. The fast seek must fail at once with the film's own error, not wait
// for a commit that never comes (and not record the Player's error screen, as the old seek did).
import { useCurrentFrame } from "remotion";

function Throws() {
  const frame = useCurrentFrame();
  if (frame === 1) throw new Error("planted error on frame 1");
  return <div style={{ position: "absolute", inset: 0, background: "#123" }} />;
}

export const FILMS = { "throws-on-1": { component: Throws, props: {}, width: 1080, height: 1920, fps: 30, durationInFrames: 10 } };
