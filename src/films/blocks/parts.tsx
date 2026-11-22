// Demo films for the parts group: stackedBar, waffle and areaChart.
// Each block shows in Spec, Graphite and Pop at 9:16, in Spec at 16:9, and in Console (a one-frame system).
import { DEMO_SYSTEMS, filmsFor, type Entry } from "./film";
import { scene as waffle } from "../../../examples/scenes/waffle";
import { scene as waffleStress, seconds as waffleStressSeconds } from "../../../examples/scenes/waffleStress";
import { scene as areaChart } from "../../../examples/scenes/areaChart";
import { scene as areaChartStress, seconds as areaChartStressSeconds } from "../../../examples/scenes/areaChartStress";
import { scene as stackedBar } from "../../../examples/scenes/stackedBar";
import { scene as stackedBarStress, seconds as stackedBarStressSeconds } from "../../../examples/scenes/stackedBarStress";

const WITH_CONSOLE = [...DEMO_SYSTEMS, "console"] as const;

export const FILMS: Record<string, Entry> = {
  ...filmsFor("block-stackedBar", stackedBar, 7, { wide: true, systems: WITH_CONSOLE }),
  ...filmsFor("block-stackedBar-stress", stackedBarStress, stackedBarStressSeconds, { wide: true, systems: ["spec", "pop"] }),
  ...filmsFor("block-waffle", waffle, 7, { wide: true, systems: WITH_CONSOLE }),
  ...filmsFor("block-waffle-stress", waffleStress, waffleStressSeconds, { wide: true, systems: ["spec", "pop"] }),
  ...filmsFor("block-areaChart", areaChart, 7, { wide: true, systems: WITH_CONSOLE }),
  ...filmsFor("block-areaChart-stress", areaChartStress, areaChartStressSeconds, { wide: true, systems: ["spec", "pop"] }),
};
