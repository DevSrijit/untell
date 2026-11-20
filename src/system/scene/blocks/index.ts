// Every block, by name. Both renderers use this table: Remotion through <Blocks build>, HyperFrames
// through VS.mount(..., (ctx, B) => B.name(props, ctx)).
import { lineChart } from "./lineChart";
import { arrow } from "./arrow";
import { box } from "./box";
import { camera } from "./camera";
import { shape } from "./shape";
import { product } from "./product";
import { photo } from "./photo";
import { music, hit, typing } from "./sound";
import { text } from "./text";
import { title } from "./title";
import { rule } from "./rule";
import { bar } from "./bar";
import { typeOn } from "./typeOn";
import { cross } from "./cross";
import { frameGrid } from "./frameGrid";
import { barChart } from "./barChart";
import { slopeChart } from "./slopeChart";
import { dumbbell } from "./dumbbell";
import { stackedBar } from "./stackedBar";
import { waffle } from "./waffle";
import { areaChart } from "./areaChart";
import { counter } from "./counter";
import { bigStat } from "./bigStat";
import { meter } from "./meter";
import { ranking } from "./ranking";
import { flow } from "./flow";
import { sequence } from "./sequence";
import { tree } from "./tree";
import { cycle } from "./cycle";
import { waveform } from "./waveform";
import { timeline } from "./timeline";
import { numberLine } from "./numberLine";
import { steps } from "./steps";
import { split } from "./split";
import { matrix } from "./matrix";
import { quote } from "./quote";
import { kineticWords } from "./kineticWords";
import { captions } from "./captions";
import { lowerThird } from "./lowerThird";
import { codeBlock } from "./codeBlock";
import { terminal } from "./terminal";
import { carry } from "./carry";
import { wipe } from "./wipe";
import { highlight } from "./highlight";
import { annotate } from "./annotate";
import { rows } from "./rows";
import { hold } from "./hold";
import { reveal } from "./reveal";
import { ground } from "./ground";
import { fitText } from "./fitText";
import { wordSeries } from "./wordSeries";
import { lockup } from "./lockup";
import { endCard } from "./endCard";
import { pane } from "./pane";
import { gear } from "./gear";
import { belt } from "./belt";
import { pulley } from "./pulley";
import { rope } from "./rope";
import { drawnMark } from "./drawnMark";
import { callout } from "./callout";
import { dimension } from "./dimension";
import { formula } from "./formula";
import { sheet } from "./sheet";
import { shadowBars } from "./shadowBars";
import { uiWindow, listRow, button, cursor, badge, tab, toast, field } from "./ui";
import { curve } from "./curve";
import { guarded } from "./guard";
import { measureBlock } from "./measureBlock";
import type { Ctx } from "../types";

const RAW = {
  lineChart,
  arrow,
  box,
  camera,
  shape,
  product,
  photo,
  music,
  hit,
  typing,
  text,
  title,
  rule,
  curve,
  bar,
  typeOn,
  cross,
  frameGrid,
  barChart,
  slopeChart,
  dumbbell,
  stackedBar,
  waffle,
  areaChart,
  counter,
  bigStat,
  meter,
  ranking,
  flow,
  sequence,
  tree,
  cycle,
  waveform,
  timeline,
  numberLine,
  steps,
  split,
  matrix,
  quote,
  kineticWords,
  captions,
  lowerThird,
  codeBlock,
  terminal,
  carry,
  wipe,
  highlight,
  annotate,
  rows,
  hold,
  reveal,
  ground,
  fitText,
  wordSeries,
  lockup,
  endCard,
  drawnMark,
  pane,
  gear,
  belt,
  pulley,
  rope,
  callout,
  dimension,
  formula,
  sheet,
  shadowBars,
  uiWindow,
  listRow,
  button,
  field,
  cursor,
  badge,
  tab,
  toast,
};

/**
 * Every block, each behind the guard (blocks/guard.ts): the guard checks the times a scene gives and the tracks a
 * block gives back, and folds keys before 0 so `at` before the film shows a block at rest on frame 0.
 */
const GUARDED = Object.fromEntries(Object.entries(RAW).map(([k, f]) => [k, guarded(k, f as never)])) as unknown as typeof RAW;
export const BLOCKS = {
  ...GUARDED,
  /**
   * The box a block draws with these props, at rest: `B.measure("terminal", props, ctx)`. Use it to stack a thing
   * under a block instead of guessing its height (blocks/measureBlock.ts).
   */
  measure: <K extends keyof typeof RAW>(name: K, props: Parameters<(typeof RAW)[K]>[0], ctx: Ctx) => measureBlock(GUARDED, name, props as never, ctx),
};
/** A block's name (measure is a helper, not a block). */
export type BlockName = keyof typeof RAW;

// Helpers a scene may use, from one public module. A scene imports them from here, never from a block file
// (the lint rule scene/patched-block warns on a deep import). Two names change on the way: text's `wrap` is
// `wrapText` (rows' `wrap`, the one scenes use today, keeps its name), and codeBlock's `fitText` (cut a string
// to a width with an ellipsis) is `truncateText`.
export { caseCtx, overflow, lineSafe, edge, room, wrap as wrapText, layoutLines } from "./text";
export { turnedSafe } from "./title";
export { wipeTimes, wipeOut, type WipeProps } from "./wipe";
export { carryMotion, carryTracks, textPlace } from "./carry";
export { safeBox, rowBoxes, atBottom, linesAtBottom, linesAtTop, settle, wrap, type Row } from "./rows";
export { stamped, onOff } from "./shape";
export { pointOf, pointAt, followPoint, boxAt, type ShapePoint, type PointName } from "./parts";
export { metricsOf, baselineOf, layoutOf, inkOf, markerFill, highlightBounds, wordBox, type HighlightProps } from "./highlight";
export { counterLayout, counterNodes, steadyLines } from "./counter";
export { snap, codeRole, rowPitch, fitText as truncateText, windows, typeTimes, typed, highlightSyntax, syntaxSegments } from "./codeBlock";
export { annotateLayout, type AnnotateProps } from "./annotate";
export { keyTimes, typeOnEnd } from "./typeOn";
export { holdFor } from "./kineticWords";
export { markSize, shown, drawKeys } from "./rule";
export { bigStatRole, smallerRole } from "./bigStat";
export { photoUpscale, upscaleMessage, UPSCALE, traceOn } from "./photo";
export { curvePoints, smoothPath } from "./curve";
export { heroCap, HERO_SHARE } from "./kineticWords";
export { fitLayout } from "./fitText";
export { lockupLayout } from "./lockup";
export { markArtOf, markAspect } from "./drawnMark";
export { endCardLead } from "./endCard";
export { paneLayout, paneStack, paneInset, paneTitleHeight } from "./pane";
export { signature, tintAlpha, type Syntax } from "./signature";
export { pitchRadius, ratioTurns, tipRadius, sprocketPath, turnKeys } from "./gear";
export { outerTangents, beltGeometry } from "./belt";
export { rollDegrees } from "./pulley";
export { ropeStrandLength } from "./rope";
export { followOffsets, type Follow } from "./callout";
export { sheetLayout, fitDrawing, figureBox, pictureSafe, drawingWeight, type DrawingFit } from "./sheet";
export { figure, type Figure, type Side } from "./figure";
export { badgeSize, buttonSize, listRowHeight, listRowLayout, listRowsStack, toolbarLayout, toolbarHeight, tabHeight, avatarRadius, windowHead, windowHeadHeight, aimAt, arrowBox, cursorSize, nodeBox, type WindowHead, type CursorPoint } from "./ui";
export { fitWords } from "./util";
export { musicFrom, duckBed, effectLevel, effectVolume, type Duck } from "./sound";
export { terminalHeight, terminalRows, terminalTimes, type TerminalTimes } from "./terminal";
export { boxOf, landOn, type MeasuredBox } from "./measureBlock";
// A block of your own goes behind the same guard as the kit's blocks: export const mine = guarded("mine", drawMine).
export { guarded } from "./guard";
export { fitOf, steppedDown, type FitPolicy } from "./fit";
export { hand, barEnd, tagParts, HANDS, PLAIN, GESTURES, type Hand } from "./hand";
export { heroArea, heroBox, lineAndBlock, lineAndSubject, lineAbove, lineInBand, lineOverPicture, unionBox } from "./compose";
