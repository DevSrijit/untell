// The page globals that the repository's capture modules use (the repository's scripts/perf/player.tsx declares them there).
// The package compiles scripts/snap/frame.ts, which imports types from scripts/snap/capture.ts, so they are
// declared here too. The package's own pages set them in record.ts (openPage).
export {};
declare global {
  interface Window {
    __meta: { width: number; height: number; fps: number; durationInFrames: number } | null;
    __seek: (frame: number) => Promise<void>;
  }
}
