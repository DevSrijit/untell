// The block catalog's demos as films: each demo in examples/scenes/demos.ts (the table the catalog reads), in its
// light and its dark system, at 9:16 and 16:9: `cat-<block>-<system>` and `cat-<block>-<system>-wide`.
// The scene modules are imported here by name, so the bundler sees every one.
import type { Scene, Entry } from "./film";
import { sceneEntry } from "./film";
import { DEMOS } from "../../../examples/scenes/demos";
import * as text from "../../../examples/scenes/text";
import * as title from "../../../examples/scenes/title";
import * as fitText from "../../../examples/scenes/fitText";
import * as wordSeries from "../../../examples/scenes/wordSeries";
import * as lockup from "../../../examples/scenes/lockup";
import * as drawnMark from "../../../examples/scenes/drawnMark";
import * as endCard from "../../../examples/scenes/endCard";
import * as typeOn from "../../../examples/scenes/typeOn";
import * as kineticWords from "../../../examples/scenes/kineticWords";
import * as quote from "../../../examples/scenes/quote";
import * as captions from "../../../examples/scenes/captions";
import * as lowerThird from "../../../examples/scenes/lowerThird";
import * as photo from "../../../examples/scenes/photo";
import * as product from "../../../examples/scenes/product";
import * as shadowBars from "../../../examples/scenes/shadowBars";
import * as shape from "../../../examples/scenes/shape";
import * as ground from "../../../examples/scenes/vocabulary";
import * as frameGrid from "../../../examples/scenes/frameGrid";
import * as rows from "../../../examples/scenes/rows";
import * as rule from "../../../examples/scenes/rule";
import * as curve from "../../../examples/scenes/curve";
import * as cross from "../../../examples/scenes/cross";
import * as bar from "../../../examples/scenes/bar";
import * as steps from "../../../examples/scenes/steps";
import * as split from "../../../examples/scenes/split";
import * as matrix from "../../../examples/scenes/matrix";
import * as lineChart from "../../../examples/scenes/lineChart";
import * as barChart from "../../../examples/scenes/barChart";
import * as slopeChart from "../../../examples/scenes/slopeChart";
import * as dumbbell from "../../../examples/scenes/dumbbell";
import * as areaChart from "../../../examples/scenes/areaChart";
import * as stackedBar from "../../../examples/scenes/stackedBar";
import * as waffle from "../../../examples/scenes/waffle";
import * as counter from "../../../examples/scenes/counter";
import * as bigStat from "../../../examples/scenes/bigStat";
import * as meter from "../../../examples/scenes/meter";
import * as ranking from "../../../examples/scenes/ranking";
import * as flow from "../../../examples/scenes/flow";
import * as sequence from "../../../examples/scenes/sequence";
import * as tree from "../../../examples/scenes/tree";
import * as cycle from "../../../examples/scenes/cycle";
import * as drivetrain from "../../../examples/scenes/drivetrain";
import * as hoist from "../../../examples/scenes/hoist";
import * as codeBlock from "../../../examples/scenes/codeBlock";
import * as terminal from "../../../examples/scenes/terminal";
import * as pane from "../../../examples/scenes/pane";
import * as ui from "../../../examples/scenes/ui";
import * as sound from "../../../examples/scenes/sound-beats";
import * as waveform from "../../../examples/scenes/waveform";
import * as timeline from "../../../examples/scenes/timeline";
import * as numberLine from "../../../examples/scenes/numberLine";
import * as pointer from "../../../examples/scenes/pointer";
import * as wipe from "../../../examples/scenes/wipe";
import * as carry from "../../../examples/scenes/carry";
import * as highlight from "../../../examples/scenes/highlight";
import * as annotate from "../../../examples/scenes/annotate";

type Mod = { scene: Scene; seconds?: number };
/** Each demo scene file, by its name in DEMOS. */
export const SCENES: Record<string, Mod> = {
  "text": text,
  "title": title,
  "fitText": fitText,
  "wordSeries": wordSeries,
  "lockup": lockup,
  "drawnMark": drawnMark,
  "endCard": endCard,
  "typeOn": typeOn,
  "kineticWords": kineticWords,
  "quote": quote,
  "captions": captions,
  "lowerThird": lowerThird,
  "photo": photo,
  "product": product,
  "shadowBars": shadowBars,
  "shape": shape,
  "vocabulary": ground,
  "frameGrid": frameGrid,
  "rows": rows,
  "rule": rule,
  "curve": curve,
  "cross": cross,
  "bar": bar,
  "steps": steps,
  "split": split,
  "matrix": matrix,
  "lineChart": lineChart,
  "barChart": barChart,
  "slopeChart": slopeChart,
  "dumbbell": dumbbell,
  "areaChart": areaChart,
  "stackedBar": stackedBar,
  "waffle": waffle,
  "counter": counter,
  "bigStat": bigStat,
  "meter": meter,
  "ranking": ranking,
  "flow": flow,
  "sequence": sequence,
  "tree": tree,
  "cycle": cycle,
  "drivetrain": drivetrain,
  "hoist": hoist,
  "codeBlock": codeBlock,
  "terminal": terminal,
  "pane": pane,
  "ui": ui,
  "sound-beats": sound,
  "waveform": waveform,
  "timeline": timeline,
  "numberLine": numberLine,
  "pointer": pointer,
  "wipe": wipe,
  "carry": carry,
  "highlight": highlight,
  "annotate": annotate,
};

/** The films: each demo in its light and its dark system, at 9:16 and at 16:9. One film per scene and system. */
export const FILMS: Record<string, Entry> = {};
for (const x of DEMOS) {
  const mod = SCENES[x.file];
  if (!mod) throw new Error(`catalog: no scene module for ${x.file}; import it in src/films/blocks/catalog.tsx`);
  const seconds = mod.seconds ?? x.seconds;
  for (const sys of new Set([x.light, x.dark])) {
    FILMS[`cat-${x.block}-${sys}`] = sceneEntry(mod.scene, sys, seconds, 1080, 1920, { demo: true });
    FILMS[`cat-${x.block}-${sys}-wide`] = sceneEntry(mod.scene, sys, seconds, 1920, 1080, { demo: true });
  }
}
