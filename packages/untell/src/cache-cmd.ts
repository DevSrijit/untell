// `untell cache status|clear`: the recording cache of the project (.untell/cache) and the machine slots.
import { rmSync } from "node:fs";
import { relative } from "node:path";
import { cacheDir, cacheStatus, formatBytes } from "./cache";
import { UsageError } from "./errors";
import { slotCount, slotsInUse, SLOT_DIR } from "../../../scripts/perf/slots";

export function cacheCommand(project: string, sub: string | undefined, json: boolean): number {
  if (sub === "status" || sub === undefined) {
    const s = cacheStatus(project);
    const slots = { count: slotCount(), dir: SLOT_DIR, inUse: slotsInUse().filter((u) => !u.stale).length };
    if (json) { console.log(JSON.stringify({ version: 1, dir: s.dir, bytes: s.bytes, entries: s.entries, kinds: s.kinds, slots }, null, 1)); return 0; }
    console.log(`recording cache: ${relative(project, s.dir) || s.dir}: ${s.entries} recording(s), ${formatBytes(s.bytes)} (net copy ${formatBytes(s.kinds.net!.bytes)})`);
    console.log(`machine slots: ${slots.count} (UNTELL_SLOTS; default half the CPU cores), ${slots.inUse} in use now`);
    console.log("untell cache clear deletes the cache. The next untell check records every frame again.");
    return 0;
  }
  if (sub === "clear") {
    const s = cacheStatus(project);
    rmSync(cacheDir(project), { recursive: true, force: true });
    if (json) console.log(JSON.stringify({ version: 1, dir: s.dir, removed: s.bytes }, null, 1));
    else console.log(`removed ${relative(project, s.dir) || s.dir} (${formatBytes(s.bytes)}). The next untell check records every frame again.`);
    return 0;
  }
  throw new UsageError(`untell cache takes status or clear, not "${sub}".`, "cache");
}
