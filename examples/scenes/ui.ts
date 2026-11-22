// The ui scene: a fictional kiln-booking app built only from the ui kit. A person picks a firing, starts it,
// and a toast confirms the peak temperature. The initials are random draws for this scene. The fact: Orton
// cone 6 bends at about 1222 °C when the kiln heats at 60 °C an hour over the last 100 degrees.
// The rows keep their full names at both sizes: listRow gives each name the room it needs. The narrow 9:16 row
// shows the day; the wide row shows the day and the time.
// The cursor clicks by node id (`to`), so it lands clear of the letters of the row and the button.
import type { Ctx, Node } from "../../src/system/scene/types";
import { buttonSize, listRowHeight, listRowsStack, toolbarHeight, windowHeadHeight, type BLOCKS } from "../../src/system/scene/blocks";

export const seconds = 9;

const ROWS = [
  { title: "Stoneware mugs", who: "QN", day: "Mon", time: "09:00", cone: "cone 6" },
  { title: "Porcelain bowls", who: "GS", day: "Wed", time: "14:30", cone: "cone 10" },
  { title: "Glaze tests", who: "ZU", day: "Thu", time: "08:15", cone: "cone 6" },
  { title: "Bisque load", who: "YD", day: "Fri", time: "11:45", cone: "cone 04" },
];

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe;
  const tall = ctx.height > ctx.width;
  // At 9:16 the window ends by lowBandRight, so its lower rows and the button keep clear of the platform UI.
  const w = tall ? S.lowBandRight - S.left : Math.round((S.right - S.left) * 0.8);
  const x = tall ? S.left : Math.round((ctx.width - w) / 2);
  const pad = Math.round(ctx.size("label") * (tall ? 0.5 : 0.8));
  const cx = x + pad, cw = w - 2 * pad;
  const rows = ROWS.slice(0, 3).map((r, i) => ({ id: `row${i}`, x: cx, w: cw, title: r.title, initials: r.who, meta: tall ? r.day : `${r.day} ${r.time}`, badge: { text: r.cone } }));
  // One height for the list: when any name needs the room, every row sets its badge and meta on a second line.
  const stack = listRowsStack(ctx, rows);
  const rh = listRowHeight(ctx, stack);
  const toastH = Math.ceil(ctx.size("body") * Math.max(ctx.system.type.body.leading, 1.4)) + 2 * Math.round(ctx.size("label") * 0.6);
  const bar = windowHeadHeight(ctx);
  const btn = buttonSize(ctx, "Start firing");
  // At 16:9 the window's toolbar holds the tabs on the left and the button on the right, on one bottom line and one
  // baseline. The 9:16 text-safe area is short: there the window holds the rows and the button under them, and no tabs.
  const toolH = tall ? 0 : toolbarHeight(ctx, pad, "Start firing");
  const h = tall ? bar + pad + rows.length * rh + pad * 2 + btn.h + pad : bar + toolH + pad + rows.length * rh + pad;
  const y = tall ? S.top : Math.max(S.top + Math.round(ctx.size("label") * 0.3), Math.round((ctx.height - h - pad - toastH) / 2));
  const out: Node[] = [];
  out.push(...B.uiWindow({ id: "app", x, y, w, h, title: "Kiln queue", inset: pad, at: 0,
    ...(tall ? {} : { toolbar: { tabs: ["Queue", "Firing", "Done"], active: [{ index: 0, at: 0 }, { index: 1, at: 5.2 }], action: { text: "Start firing", press: [4.6] } } }) }, ctx));
  const cy = y + bar + toolH + pad;
  const PICK = 1;
  rows.forEach((r, i) => {
    out.push(...B.listRow({ ...r, y: cy + i * rh, stack, badge: { ...r.badge, tone: i === PICK ? "accent" : "muted" },
      selected: i === PICK ? [{ at: 2.4 }] : undefined, at: 0.2 + i * 0.1 }, ctx));
  });
  if (tall) out.push(...B.button({ id: "app-action", x: x + w - pad - btn.w, y: cy + rows.length * rh + pad * 2, text: "Start firing", press: [4.6], at: 0.6 }, ctx));
  const toast = B.toast({ id: "done", text: "Firing to 1222 °C", x, w, y: y + h + pad, at: 5.4 }, ctx);
  // The cursor: in from the lower right, to the row, click; to the button, click. It aims by id, clear of every text.
  out.push(...B.cursor({ id: "cursor", path: [{ x: x + w * 0.85, y: y + h + toastH * 0.5, at: 1.0 }, { to: `row${PICK}-box`, at: 2.3 }, { to: "app-action-box", at: 4.5 }],
    targets: [...out, ...toast], clicks: [2.4, 4.6], at: 1.0 }, ctx));
  out.push(...toast);
  out.push(...B.hold({ at: 6, until: seconds }, ctx));
  return out;
};
