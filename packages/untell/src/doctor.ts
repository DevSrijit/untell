// `untell doctor`: what is installed and what is missing, with the one command that fixes each.
// It only runs version commands and reads files. It downloads and installs nothing.
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { cacheStatus, formatBytes } from "./cache";
import { slotCount, slotsInUse } from "../../../scripts/perf/slots";
import { homedir, platform } from "node:os";
import { HARNESS_NAME, HARNESSES, SKILL_PATH, hookStates, untellInstalled, type Harness } from "./agents";
import { addCommand, detectFramework, detectPackageManager, GSAP_VERSION, hasRemotionCli, hyperframesVersion, remotionCliFix } from "./detect";
import { GSAP_FILES, gsapFiles } from "./build";
import { DETECTOR_SIZE, detectorPython, ffmpegFix, LISTEN_EXTRAS, LISTEN_MODULES, listenPython, modelPath, MODEL, newPython, PY_MIN, pyHas, pyNewEnough, pyVersion, runs, venvPython, versionOf, hfEnv } from "./env";
import { listenState } from "./listen";
import { KIT_DIR, kitMismatch } from "./kit";

export type Status = "ok" | "missing" | "optional" | "info";
export type Item = { name: string; status: Status; detail: string; fix?: string };

const chromePaths = () => platform() === "darwin" ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
  : platform() === "win32" ? ["C:/Program Files/Google/Chrome/Application/chrome.exe"]
  : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];

/** Every check, in the order a person sets up a project. */
export function diagnose(projectArg: string): Item[] {
  const project = resolve(projectArg);
  const items: Item[] = [];
  const add = (name: string, status: Status, detail: string, fix?: string) => items.push({ name, status, detail, ...(fix ? { fix } : {}) });

  const major = Number(process.versions.node.split(".")[0]);
  add("Node", major >= 18 ? "ok" : "missing", `Node ${process.versions.node}${major >= 18 ? "" : " (untell needs 18 or later)"}`, major >= 18 ? undefined : "Install Node 18 or later: https://nodejs.org");

  const fw = detectFramework(project);
  let kitFw: "remotion" | "hyperframes" | null = null;
  if (fw === "remotion") {
    const v = (() => { try { return (JSON.parse(readFileSync(join(project, "node_modules/remotion/package.json"), "utf8")) as { version: string }).version; } catch { return null; } })();
    add("Framework", v ? "ok" : "missing", v ? `Remotion ${v}` : "Remotion is in package.json, but not installed", v ? undefined : "npm install");
    if (v) add("Remotion CLI", hasRemotionCli(project) ? "ok" : "missing", hasRemotionCli(project) ? "@remotion/cli (untell render runs it)" : "@remotion/cli is not installed: untell render runs remotion render", hasRemotionCli(project) ? undefined : remotionCliFix(project));
    kitFw = "remotion";
  } else if (fw === "hyperframes") {
    add("Framework", "ok", `HyperFrames (hyperframes.json)`);
    kitFw = "hyperframes";
  } else if (fw === "both") add("Framework", "missing", "both hyperframes.json and a remotion dependency", "Give --framework remotion or --framework hyperframes to untell init");
  else add("Framework", "missing", "no Remotion or HyperFrames project in this folder", "Run untell doctor in the project folder, or give --cwd <folder>");

  if (kitFw) {
    const kit = KIT_DIR[kitFw];
    const has = existsSync(join(project, kit, "systems.ts"));
    const other = has ? kitMismatch(project, kitFw) : null;
    add("untell kit", !has ? "missing" : other ? "info" : "ok", !has ? (existsSync(join(project, kit)) ? `${kit}/ has no systems.ts` : `no ${kit}/ here`) : other ? `${kit}/ is from another pack than this untell` : `${kit}/, from this untell's pack`,
      !has ? "untell init" : other ? "untell init --force (it overwrites your edits to the kit; your films stay)" : undefined);
  }

  const ff = ["ffmpeg", "ffprobe"].filter((t) => !runs(t));
  add("ffmpeg", ff.length ? "missing" : "ok", ff.length ? `${ff.join(" and ")} not on PATH (the sheet, footage and sound need them)` : (versionOf("ffmpeg", "-version") ?? "").replace(/ Copyright.*/, ""), ff.length ? ffmpegFix() : undefined);

  const venv = venvPython(project);
  const hasUv = runs("uv", "--version");
  // The Python version: the checks need PY_MIN or later. A python3 that is older is named, with what untell uses instead.
  {
    const v = pyVersion("python3"), base = newPython(), venvOk = existsSync(venv) && pyNewEnough(venv);
    const need = `Python ${PY_MIN.join(".")} or later`;
    const ok = venvOk || !!base || hasUv;
    const said = v ? `python3 is ${v.join(".")}` : "no python3 on PATH";
    add("Python", ok ? "ok" : "missing",
      `${said}${pyNewEnough("python3") ? "" : `; the checks need ${need}`}${venvOk ? `; .venv-media is ${pyVersion(venv)!.join(".")}` : existsSync(venv) ? `; .venv-media is ${pyVersion(venv)?.join(".") ?? "broken"}, too old: remove it, and untell check makes it again` : base && base !== "python3" ? `; untell makes .venv-media with ${base}` : hasUv && !pyNewEnough("python3") ? "; untell makes .venv-media with uv (Python 3.12)" : ""}`,
      ok ? undefined : `Install ${need} (or uv: https://docs.astral.sh/uv/)`);
  }
  if (existsSync(venv)) {
    const ok = pyHas(venv, ["numpy", "PIL"]), rembg = pyHas(venv, ["rembg"]);
    add("Python env", ok ? "ok" : "missing", `.venv-media${ok ? "" : " without numpy or Pillow"}`, ok ? undefined : "untell media setup");
    add("Cut-out tools", rembg ? "ok" : "optional", rembg ? "rembg in .venv-media" : "no rembg in .venv-media (only cut-outs of photos need it)", rembg ? undefined : "untell media setup");
  } else {
    const sys = pyNewEnough("python3") && pyHas("python3", ["numpy", "PIL"]);
    add("Python env", sys ? "optional" : "missing", sys ? "no .venv-media; python3 has numpy and Pillow, so the sheet and the cover check work; cut-outs need the env" : `no .venv-media, and python3 ${pyNewEnough("python3") ? "has no numpy or Pillow" : "is too old"} (the sheet and cut-outs need them)`,
      hasUv ? "untell media setup" : "Install uv (https://docs.astral.sh/uv/), then: untell media setup");
  }
  const model = modelPath();
  const where = model.startsWith(homedir()) ? `${model.replace(homedir(), "~")}: in your home folder, outside the project, shared by every project` : model;
  add("Media model", existsSync(model) ? "ok" : "optional", existsSync(model) ? `${MODEL} (${where})` : `${MODEL} not downloaded (only cut-outs need it); a download goes to ${where}`, existsSync(model) ? undefined : "untell media setup");

  // untell listen: the core (the music map, mix and compare) and each extra (stems, tags).
  const lst = listenState(project);
  if (!existsSync(listenPython(project))) add("Listen tools", "optional", "no .venv-listen (untell listen and the music map that music({ peakAt }) and beats() read need it)",
    hasUv ? "untell listen setup" : "Install uv (https://docs.astral.sh/uv/), then: untell listen setup");
  else add("Listen tools", lst.core ? "ok" : "missing", `.venv-listen${lst.core ? "" : ` without ${LISTEN_MODULES.join(", ")}`}`, lst.core ? undefined : "untell listen setup");
  if (existsSync(listenPython(project))) for (const e of Object.keys(LISTEN_EXTRAS)) {
    const on = lst.extras.includes(e);
    add(`Listen ${e}`, on ? "ok" : "optional", on ? LISTEN_EXTRAS[e]!.what : `not installed: ${LISTEN_EXTRAS[e]!.what}`, on ? undefined : `untell listen setup --extras ${e}`);
  }
  const det = detectorPython(project);
  add("Detector", det ? "ok" : "optional", det ? `${det.venv ? ".venv-media" : "python3"} has numpy, Pillow and scipy`
    : `no Python here has numpy, Pillow and scipy; untell check installs them into .venv-media the first time (${DETECTOR_SIZE})`);
  // The network: what a check and a render fetch. The kit's fonts and (HyperFrames) GSAP are files, so neither needs
  // it. Only each framework's own renderer fetches once: its headless browser, the first time it runs.
  if (kitFw) {
    const kit = KIT_DIR[kitFw];
    const gen = join(project, kit, "fonts.gen.ts");
    const fontsLocal = existsSync(join(project, kit, "fonts")) && (kitFw === "hyperframes" || (existsSync(gen) && !/https?:\/\/|google-fonts/.test(readFileSync(gen, "utf8"))));
    add("Fonts", fontsLocal ? "ok" : "missing", fontsLocal ? `files in ${kit}/fonts: a check and a render load them with no network request` : `the kit loads its fonts over the network (an older kit)`, fontsLocal ? undefined : "untell init --force (it overwrites your edits to the kit; your films stay)");
    if (kitFw === "hyperframes") {
      const g = gsapFiles(project);
      add("GSAP", g ? "ok" : "missing", g ? `the gsap package: untell build copies ${GSAP_FILES.join(" and ")} beside the page, so the page needs no network` : "no gsap package: the page loads GSAP over the network", g ? undefined : addCommand(detectPackageManager(project), [`gsap@${GSAP_VERSION}`]).join(" "));
    }
    const shell = kitFw === "remotion" && existsSync(join(project, "node_modules", ".remotion", "chrome-headless-shell"));
    add("Network", "info", kitFw === "remotion"
      ? `a check, and the render of a film with no sound and no footage, use your Chrome and no network. remotion render (a film with sound or footage) downloads its headless browser into node_modules/.remotion once, the first time${shell ? " (it is there now)" : ""}`
      : "a check uses your Chrome and no network. hyperframes render downloads its headless browser the first time it finds none, once. untell turns off the CLI's usage reports and its check for a new version");
  }
  const cs = cacheStatus(project);
  add("Recording cache", "info", `${relative(project, cs.dir) || cs.dir}: ${cs.entries} recording(s), ${formatBytes(cs.bytes)} (untell cache clear empties it)`);
  add("Machine slots", "info", `${slotCount()} (recorders and renders that run at once on this machine; UNTELL_SLOTS sets it), ${slotsInUse().filter((u) => !u.stale).length} in use now`);

  if (kitFw === "hyperframes" || existsSync(join(project, "hyperframes.json"))) {
    const local = join(project, "node_modules/.bin/hyperframes");
    const env = process.env.UNTELL_HYPERFRAMES;
    const bin = env ?? (existsSync(local) ? local : null);
    if (bin) add("HyperFrames CLI", "ok", `${env ? "UNTELL_HYPERFRAMES" : "node_modules/.bin/hyperframes"} ${versionOf(bin, "--version", hfEnv()) ?? ""}`.trim());
    else add("HyperFrames CLI", "ok", `through npx: untell check runs npx hyperframes@${hyperframesVersion(project) ?? "latest"}, as this project's scripts do`);
    const chrome = process.env.UNTELL_CHROME ?? chromePaths().find(existsSync);
    add("Chrome", chrome ? "ok" : "missing", chrome ? chrome : "no Google Chrome found (untell build and the recorder need it)", chrome ? undefined : "Install Google Chrome, or set UNTELL_CHROME to a Chrome program");
  } else {
    add("HyperFrames CLI", "info", "not needed: this is not a HyperFrames project");
    const chrome = process.env.UNTELL_CHROME ?? chromePaths().find(existsSync);
    add("Chrome", chrome ? "ok" : "optional", chrome ? chrome : "no Google Chrome found (untell check records a Remotion film in Chrome)", chrome ? undefined : "Install Google Chrome, or set UNTELL_CHROME to a Chrome program");
  }

  // The agent harnesses: the program, the skill where it reads it, and the lint-after-edit hook.
  const states = hookStates(project);
  for (const h of HARNESSES) {
    const prog = versionOf(h === "claude" ? "claude" : "codex");
    const skill = existsSync(join(project, SKILL_PATH[h]));
    const hook = states.find((s) => s.harness === h)!;
    const parts = [prog ? prog : "not installed on this machine", skill ? `skill at ${SKILL_PATH[h]}` : "no skill here", hook.on ? "lint hook on" : "lint hook off (the written rule in the skill and AGENTS.md)"];
    add(HARNESS_NAME[h], skill ? "ok" : prog ? "optional" : "info", parts.join("; "), skill ? (hook.on ? undefined : `untell hooks on --agent ${h} (optional)`) : `untell init --agent ${h}`);
  }
  const agents = existsSync(join(project, "AGENTS.md")) && readFileSync(join(project, "AGENTS.md"), "utf8").includes("<!-- untell:start -->");
  if (kitFw) add("AGENTS.md", agents ? "ok" : "missing", agents ? "has the untell section" : "no untell section", agents ? undefined : "untell init");
  if (states.some((s) => s.on) && !untellInstalled(project)) add("Hook runner", "missing", "a lint hook is on, but untell is not in node_modules, so npx --no-install untell fails", "npm install --save-dev untell");
  return items;
}

/** The doctor's report. Exit code: 0 when nothing required is missing, 1 when something is. */
export function doctor(project: string, json = false): number {
  const items = diagnose(project);
  const bad = items.filter((i) => i.status === "missing");
  if (json) { console.log(JSON.stringify({ version: 1, ok: !bad.length, items }, null, 1)); return bad.length ? 1 : 0; }
  const tty = !!process.stdout.isTTY && !process.env.NO_COLOR;
  const mark: Record<Status, string> = tty
    ? { ok: "\x1b[32mok\x1b[0m     ", missing: "\x1b[31mmissing\x1b[0m", optional: "\x1b[33moptional\x1b[0m", info: "\x1b[2m-\x1b[0m      " }
    : { ok: "ok      ", missing: "missing ", optional: "optional", info: "-       " };
  const w = Math.max(...items.map((i) => i.name.length)) + 2;
  console.log(`untell doctor: ${resolve(project)}\n`);
  for (const i of items) {
    console.log(`  ${mark[i.status]} ${i.name.padEnd(w)} ${i.detail}`);
    if (i.fix) console.log(`  ${" ".repeat(8)} ${" ".repeat(w)} fix: ${i.fix}`);
  }
  console.log(bad.length ? `\n${bad.length} missing. Run each fix above, then untell doctor again.` : "\nNothing required is missing.");
  return bad.length ? 1 : 0;
}

export type { Harness };
