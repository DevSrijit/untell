// Every composition the recorder can capture, by id.
import type { ComponentType } from "react";
import { SpecCompound } from "./films/specCompound";
import { FILMS as LINE_FILMS } from "./films/blocks/lineChartDemo";
import { FILMS as REEL_FILMS } from "./films/reels";
import { FILMS as THREE_FILMS } from "./films/three";
import { FILMS as MODEL_FILMS } from "./films/models";
import { FILMS as EXTRAS_FILMS } from "./films/blocks/extras";
import { FILMS as PRIMITIVES_FILMS } from "./films/blocks/primitives";
import { FILMS as CHARTS_FILMS } from "./films/blocks/charts";
import { FILMS as PARTS_FILMS } from "./films/blocks/parts";
import { FILMS as NUMBERS_FILMS } from "./films/blocks/numbers";
import { FILMS as DIAGRAMS_FILMS } from "./films/blocks/diagrams";
import { FILMS as SIGNALS_FILMS } from "./films/blocks/signals";
import { FILMS as NARRATIVE_FILMS } from "./films/blocks/narrative";
import { FILMS as TYPE_FILMS } from "./films/blocks/type";
import { FILMS as GRAMMAR_FILMS } from "./films/blocks/grammar";
import { FILMS as HOIST_FILMS } from "./films/blocks/hoist";

type Entry = {
  component: ComponentType<any>;
  props: Record<string, unknown>;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
};

export const COMPOSITIONS: Record<string, Entry> = {};


// A system film: the Spec system in Remotion, the twin of examples/hyperframes/spec-compound.
COMPOSITIONS["spec-compound"] = { component: SpecCompound, props: {}, width: 1080, height: 1920, fps: 30, durationInFrames: 345 };

// Blocks, each shown in a light, a dark and an awkward system.
Object.assign(COMPOSITIONS, THREE_FILMS, MODEL_FILMS, REEL_FILMS, EXTRAS_FILMS, LINE_FILMS, PRIMITIVES_FILMS, CHARTS_FILMS, PARTS_FILMS, NUMBERS_FILMS, DIAGRAMS_FILMS, SIGNALS_FILMS, NARRATIVE_FILMS, TYPE_FILMS, GRAMMAR_FILMS, HOIST_FILMS);
