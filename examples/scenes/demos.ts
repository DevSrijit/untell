// The demo of each block in the catalog (systems/BLOCKS.md): the scene file under examples/scenes, the demo's length,
// and the two systems that suit the block best (one light, one dark; one system twice when only it allows the block).
// Plain data. src/films/blocks/catalog.tsx turns it into films (cat-<block>-<system>[-wide]); scripts/export_catalog.ts
// writes it into the catalog; contract.test.ts checks that each block's demo calls the block.
export type Demo = { block: string; file: string; seconds: number; light: string; dark: string };

export const DEMOS: Demo[] = [
  // Text and title
  { block: "title", file: "title", seconds: 8, light: "studio", dark: "graphite" },
  { block: "text", file: "text", seconds: 7, light: "riso", dark: "schematic" },
  { block: "fitText", file: "fitText", seconds: 6, light: "cutout", dark: "nocturne" },
  { block: "wordSeries", file: "wordSeries", seconds: 6, light: "cutout", dark: "kinetic" },
  { block: "kineticWords", file: "kineticWords", seconds: 12.5, light: "cutout", dark: "kinetic" },
  { block: "typeOn", file: "typeOn", seconds: 8, light: "spec", dark: "console" },
  { block: "quote", file: "quote", seconds: 10, light: "ma", dark: "nocturne" },
  { block: "captions", file: "captions", seconds: 10, light: "pop", dark: "graphite" },
  { block: "lowerThird", file: "lowerThird", seconds: 5.5, light: "studio", dark: "noir" },
  { block: "lockup", file: "lockup", seconds: 6, light: "mark", dark: "keynote" },
  { block: "endCard", file: "endCard", seconds: 9.5, light: "studio", dark: "matte" },
  // Pictures
  { block: "photo", file: "photo", seconds: 6, light: "ma", dark: "noir" },
  // Only Noir allows the shadow-bars effect: no light system suits the block.
  { block: "shadowBars", file: "shadowBars", seconds: 5, light: "noir", dark: "noir" },
  { block: "shape", file: "shape", seconds: 7, light: "primary", dark: "graphite" },
  { block: "drawnMark", file: "drawnMark", seconds: 7, light: "mark", dark: "keynote" },
  // Layout and grounds
  { block: "ground", file: "vocabulary", seconds: 9, light: "spec", dark: "kinetic" },
  { block: "frameGrid", file: "frameGrid", seconds: 6, light: "mark", dark: "console" },
  { block: "rows", file: "rows", seconds: 5, light: "spec", dark: "graphite" },
  { block: "rule", file: "rule", seconds: 6.5, light: "ma", dark: "nocturne" },
  { block: "curve", file: "curve", seconds: 5, light: "spec", dark: "schematic" },
  { block: "cross", file: "cross", seconds: 6.5, light: "mark", dark: "schematic" },
  { block: "box", file: "pointer", seconds: 8, light: "raw", dark: "schematic" },
  { block: "steps", file: "steps", seconds: 13, light: "manual", dark: "graphite" },
  { block: "split", file: "split", seconds: 8, light: "pop", dark: "graphite" },
  { block: "matrix", file: "matrix", seconds: 8, light: "raw", dark: "console" },
  // Data
  { block: "lineChart", file: "lineChart", seconds: 6.5, light: "spec", dark: "graphite" },
  { block: "barChart", file: "barChart", seconds: 5, light: "spec", dark: "console" },
  { block: "bar", file: "bar", seconds: 6, light: "spec", dark: "graphite" },
  { block: "slopeChart", file: "slopeChart", seconds: 8, light: "manual", dark: "graphite" },
  { block: "dumbbell", file: "dumbbell", seconds: 8, light: "spec", dark: "schematic" },
  { block: "areaChart", file: "areaChart", seconds: 5.5, light: "riso", dark: "graphite" },
  { block: "stackedBar", file: "stackedBar", seconds: 7, light: "pop", dark: "graphite" },
  { block: "waffle", file: "waffle", seconds: 7, light: "pop", dark: "console" },
  { block: "counter", file: "counter", seconds: 6, light: "raw", dark: "console" },
  { block: "bigStat", file: "bigStat", seconds: 6, light: "spec", dark: "keynote" },
  { block: "meter", file: "meter", seconds: 6, light: "pop", dark: "graphite" },
  { block: "ranking", file: "ranking", seconds: 8, light: "mark", dark: "courtside" },
  // Diagrams and drawings
  { block: "flow", file: "flow", seconds: 14, light: "spec", dark: "schematic" },
  { block: "sequence", file: "sequence", seconds: 13.5, light: "manual", dark: "graphite" },
  { block: "tree", file: "tree", seconds: 10.5, light: "spec", dark: "console" },
  { block: "cycle", file: "cycle", seconds: 13.5, light: "primary", dark: "schematic" },
  { block: "sheet", file: "drivetrain", seconds: 10, light: "spec", dark: "schematic" },
  { block: "gear", file: "drivetrain", seconds: 10, light: "spec", dark: "schematic" },
  { block: "belt", file: "drivetrain", seconds: 10, light: "spec", dark: "schematic" },
  // The hoist stands on Schematic's figure place at 9:16 (figureBox); in Spec, which states none, it keeps room under
  // the drawing and on its left for the rise's dimension (examples/scenes/hoist.ts).
  { block: "pulley", file: "hoist", seconds: 12, light: "spec", dark: "schematic" },
  { block: "rope", file: "hoist", seconds: 12, light: "spec", dark: "schematic" },
  { block: "callout", file: "drivetrain", seconds: 10, light: "spec", dark: "schematic" },
  { block: "dimension", file: "drivetrain", seconds: 10, light: "spec", dark: "schematic" },
  { block: "formula", file: "drivetrain", seconds: 10, light: "spec", dark: "schematic" },
  { block: "arrow", file: "pointer", seconds: 8, light: "raw", dark: "schematic" },
  { block: "annotate", file: "annotate", seconds: 7, light: "spec", dark: "graphite" },
  { block: "highlight", file: "highlight", seconds: 12.3, light: "primary", dark: "graphite" },
  // Code and UI
  { block: "codeBlock", file: "codeBlock", seconds: 10.5, light: "manual", dark: "console" },
  { block: "terminal", file: "terminal", seconds: 14.5, light: "manual", dark: "console" },
  { block: "pane", file: "pane", seconds: 11, light: "manual", dark: "console" },
  { block: "ui", file: "ui", seconds: 9, light: "pop", dark: "graphite" },
  // 3D
  { block: "product", file: "product", seconds: 9, light: "studio", dark: "matte" },
  // Sound
  { block: "sound", file: "sound-beats", seconds: 8, light: "studio", dark: "console" },
  // Signals, camera and time
  { block: "waveform", file: "waveform", seconds: 9, light: "spec", dark: "schematic" },
  { block: "timeline", file: "timeline", seconds: 9, light: "mark", dark: "graphite" },
  { block: "numberLine", file: "numberLine", seconds: 9, light: "spec", dark: "graphite" },
  // The pointer scene moves the camera in any system; the whip (examples/scenes/whip.ts) needs motion-blur (Courtside, Kinetic).
  { block: "camera", file: "pointer", seconds: 8, light: "manual", dark: "schematic" },
  { block: "carry", file: "carry", seconds: 8, light: "primary", dark: "kinetic" },
  { block: "wipe", file: "wipe", seconds: 7, light: "riso", dark: "noir" },
  { block: "hold", file: "endCard", seconds: 9.5, light: "ma", dark: "title" },
  { block: "reveal", file: "highlight", seconds: 12.3, light: "spec", dark: "graphite" },
];
