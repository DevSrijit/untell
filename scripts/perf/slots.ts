// The machine-wide job limit. Every untell command that starts a browser or a renderer takes a slot first,
// so ten agents on one Mac do not start ten Chromes at once. A slot is a directory under the system's temp
// folder: mkdir is atomic, so two processes cannot take the same slot. The directory holds the owner's pid,
// command and start time. A slot whose owner process is gone is stale; the next job removes it and takes it.
//
// The pool size is UNTELL_SLOTS, or half the CPU cores (at least 2). A job that must wait says once what it
// waits for (which commands hold the slots), then waits without a busy loop.
//
// Locks for one film use the same mechanism (lockPath), so two runs never record the same film into the same
// folder at the same time.
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { join } from "node:path";

export const SLOT_DIR = process.env.UNTELL_SLOT_DIR ?? join(tmpdir(), "untell-slots");
export const slotCount = () => Math.max(1, Number(process.env.UNTELL_SLOTS) || Math.max(2, Math.floor(cpus().length / 2)));

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; } };

type Owner = { pid: number; what: string; since: number };
const ownerOf = (dir: string): Owner | null => { try { return JSON.parse(readFileSync(join(dir, "owner.json"), "utf8")); } catch { return null; } };

/** Takes the lock directory `dir` if it is free or stale. Returns true when this process holds it. */
function tryTake(dir: string, what: string) {
  try {
    mkdirSync(dir);
  } catch {
    const o = ownerOf(dir);
    // A lock with no owner file may be in the moment between mkdir and write: it is stale only when old.
    const stale = o ? !alive(o.pid) : (() => { try { return Date.now() - statSync(dir).mtimeMs > 10000; } catch { return true; } })();
    if (!stale) return false;
    rmSync(dir, { recursive: true, force: true });
    try { mkdirSync(dir); } catch { return false; }
  }
  writeFileSync(join(dir, "owner.json"), JSON.stringify({ pid: process.pid, what, since: Date.now() } satisfies Owner));
  return true;
}

const held = new Set<string>();
let hooked = false;
function hookExit() {
  if (hooked) return;
  hooked = true;
  const free = () => { for (const d of held) { const o = ownerOf(d); if (o?.pid === process.pid) rmSync(d, { recursive: true, force: true }); } held.clear(); };
  process.on("exit", free);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(sig, () => { free(); process.exit(130); });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits until it holds the lock `dir`. `say` prints once what it waits for. Returns a release function. */
export async function lock(dir: string, what: string, say: (msg: string) => void = (m) => console.error(m)) {
  hookExit();
  let told = false;
  for (let wait = 50; ; wait = Math.min(1000, wait * 1.5)) {
    if (tryTake(dir, what)) { held.add(dir); break; }
    if (!told) { const o = ownerOf(dir); say(`waiting: ${what} waits for pid ${o?.pid ?? "?"} (${o?.what ?? "starting"})`); told = true; }
    await sleep(wait);
  }
  return () => { held.delete(dir); rmSync(dir, { recursive: true, force: true }); };
}

/** Takes one slot of the machine pool. Returns a release function. UNTELL_SLOTS=0 turns the pool off. */
export async function slot(what: string, say: (msg: string) => void = (m) => console.error(m)) {
  if (process.env.UNTELL_SLOTS === "0") return () => {};
  hookExit();
  mkdirSync(SLOT_DIR, { recursive: true });
  const n = slotCount();
  let told = false;
  for (let wait = 50; ; wait = Math.min(1000, wait * 1.5)) {
    for (let i = 0; i < n; i++) {
      const dir = join(SLOT_DIR, `slot-${i}`);
      if (tryTake(dir, what)) { held.add(dir); return () => { held.delete(dir); rmSync(dir, { recursive: true, force: true }); }; }
    }
    if (!told) {
      const busy = Array.from({ length: n }, (_, i) => ownerOf(join(SLOT_DIR, `slot-${i}`))).filter(Boolean).map((o) => `pid ${o!.pid}: ${o!.what}`);
      say(`waiting for a machine slot (${n} in use): ${busy.join("; ")}`);
      told = true;
    }
    await sleep(wait);
  }
}

/** Takes a free slot if one is free now, without waiting. Returns a release function, or null. */
export function trySlot(what: string) {
  if (process.env.UNTELL_SLOTS === "0") return () => {};
  hookExit();
  mkdirSync(SLOT_DIR, { recursive: true });
  for (let i = 0; i < slotCount(); i++) {
    const dir = join(SLOT_DIR, `slot-${i}`);
    if (tryTake(dir, what)) { held.add(dir); return () => { held.delete(dir); rmSync(dir, { recursive: true, force: true }); }; }
  }
  return null;
}

/** The slots in use now, for `untell slots`. */
export function slotsInUse() {
  if (!existsSync(SLOT_DIR)) return [];
  return readdirSync(SLOT_DIR).map((d) => ({ slot: d, owner: ownerOf(join(SLOT_DIR, d)) })).map((x) => ({ ...x, stale: x.owner ? !alive(x.owner.pid) : true }));
}

if (import.meta.main) {
  const n = slotCount();
  const use = slotsInUse();
  console.log(`${n} slots (UNTELL_SLOTS, default half the cores) at ${SLOT_DIR}`);
  for (const u of use) console.log(`  ${u.slot}: ${u.owner ? `pid ${u.owner.pid}, ${u.owner.what}, ${((Date.now() - u.owner.since) / 1000).toFixed(0)} s` : "no owner"}${u.stale ? " (stale: the next job takes it)" : ""}`);
  if (!use.length) console.log("  all free");
}
