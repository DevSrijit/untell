// The Raw reel: an ad for the Metuno Repair Club (a fictional club; the name is a random draw).
// The film is one plain web page in three states, cut hard. Someone writes the page live: a text
// cursor blinks after the last thing written. The page tells the life of one radio as a changelog.
// The changelog is fiction. The arithmetic is real: 2026 - 1949 = 77 years.
//
// Three parts, with hard cuts at 3.4 s and 6.7 s:
// 1. 0 to 3.4 s. "One radio." Then "77 years." and Fig. 1, the radio, in a bordered window.
// 2. 3.4 to 6.7 s. "Changelog". A bordered table adds one row at a time: made, went quiet, fixed.
//    Fig. 2, a hand that solders a wire, comes in with the row "Fixed".
// 3. 6.7 s to the end. "Bring yours." The day, then the place as a blue underlined link. Then a default form button
//    ("Join"), pressed in one frame, and the club's name as a heading; the page holds. The fix stays under the call
//    until the form takes its place.
// Pictures: raw-radio and raw-solder (their source and licence are in assets/media.json), shown as they are,
// never cropped.
// Sound: no music. One plain click when something appears or is pressed, at most 6 in any 10 s.
import type { Ctx, Key, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import type { ColorRole } from "../../src/system/scene/roles";
import type { TypeRole } from "../../src/system/systems";
import { present, px } from "../../src/system/scene/context";
import { inkOf, snap, windows } from "../../src/system/scene/blocks";

export const system = "raw";
export const seconds = 12.5;

// The cuts and the events, on the frame grid (snap). Raw is a one-frame system.
// Nothing on the page holds still for more than 1.5 s (Raw's stillness), so the events come at most 1.4 s apart.
const CUT1 = snap(3.4), CUT2 = snap(6.7), END = seconds;
const T = {
  years: snap(0.9), // "77 years." and the radio
  fig1: snap(2.2), // its figure label
  row1: snap(3.9), row2: snap(4.4), row3: snap(4.9), // the changelog rows; Fig. 2 comes with row 3
  day: snap(7.5), link: snap(8.3),
  button: snap(9.1), press: snap(9.9), name: snap(10.7), // the form's button, pressed in one frame, then the name
};

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const s = ctx.safe;
  const out: Node[] = [];
  const st = ctx.stroke;

  // The page column. Borders sit on x0 and x1. Text starts one cell pad inside, on the safe left edge.
  const pad = s.left - Math.round(ctx.width * 0.0833); // 30 px at 1080
  const x0 = s.left - pad, x1 = ctx.width - x0;
  const W = x1 - x0;
  const lh = (r: TypeRole) => ctx.lineHeight(r);

  // A straight line or a closed outline that appears and leaves in one frame.
  const path = (id: string, d: string, color: ColorRole, at: number, until?: number): Node =>
    ({ id, kind: "path", d, stroke: color, width: st, cap: "butt", join: "miter", tracks: present(at, until) });
  // A hairline of an odd width sits on a half px, so it covers whole rows of px and stays sharp.
  const halfPx = (st % 2) / 2;
  const hLine = (id: string, y: number, color: ColorRole, at: number, until?: number) => path(id, `M${px(x0)} ${Math.round(y) + halfPx}H${px(x1)}`, color, at, until);

  // A text cursor after a line of text: it blinks, 0.5 s on and 0.5 s off, from `at` to `until`.
  const caret = (id: string, x: number, y: number, role: TypeRole, at: number, until: number) => {
    const ink = inkOf(ctx, role, y);
    const spans: [number, number][] = [];
    for (let u = at; u < until - 1e-6; u += 1) spans.push([snap(u), snap(Math.min(u + 0.5, until))]);
    const opacity: Key[] = at <= 0 ? [{ t: 0, v: 1 }, ...windows(spans).slice(2)] : windows(spans);
    out.push({ id, kind: "rect", x: px(x + ctx.size(role) * 0.08), y: px(ink.top), w: st * 2, h: px(ink.bottom - ink.top), fill: "ink", tracks: { opacity } });
  };
  const after = (text: string, role: TypeRole) => s.left + ctx.measure(text, role);

  // The page header: the site name, the page count and a hairline. It stays across the cuts; only the
  // page count changes.
  const yHead = s.top + Math.ceil(Math.max(0, ctx.size("label") * 1.4 - lh("label")) / 2) + 1;
  out.push(...B.text({ id: "site", x: s.left, y: yHead, text: "metuno repair club", role: "label", color: "inkMuted", at: 0 }, ctx));
  ([[0, CUT1, "1/3"], [CUT1, CUT2, "2/3"], [CUT2, END, "3/3"]] as const).forEach(([a, b, t], i) => {
    // A box only as wide as the count, on the right edge, so it does not share the site name's place.
    const cw = Math.ceil(ctx.measure("0/0", "label")) + 4;
    out.push(...B.text({ id: `page-${i}`, x: s.right - cw, y: yHead, w: cw, align: "right", text: t, role: "label", color: "inkMuted",
      ...(i > 0 ? { replaces: `page-${i - 1}` } : {}), at: a, ...(b < END ? { until: b } : {}) }, ctx));
  });
  const yRule = yHead + lh("label") + Math.round(pad * 0.5);
  out.push(hLine("head-rule", yRule, "rule", 0));

  // The shared grid of every page: a big line at the top, then a figure label and a window low down.
  const yTop = yRule + Math.round(pad * 1.5);
  const winH = Math.round(W * 853 / 1280); // the photos' own ratio, so nothing is cropped
  const winY = Math.round(Math.min(ctx.height - x0 * 3 - winH, s.lowBandTop + pad * 3));
  const yFig = winY - Math.round(pad * 0.4) - lh("label");

  // A window: a picture as it is, inside a border of the system stroke. The empty border shows from
  // `frameAt` (the start of its part), so the low band is never blank; the picture fills it at `at`.
  const windowAt = (id: string, media: string | null, at: number, until?: number, frameAt = at) => {
    if (media) out.push(...B.photo({ id: `${id}-photo`, media, motion: "still", at, ...(until ? { until } : {}),
      box: { x: x0 + st / 2, y: winY + st / 2, w: W - st, h: winH - st } }, ctx));
    else {
      // No picture: the empty image box of a plain page, crossed corner to corner.
      out.push(path(`${id}-x1`, `M${px(x0)} ${px(winY)}L${px(x1)} ${px(winY + winH)}`, "rule", at, until));
      out.push(path(`${id}-x2`, `M${px(x1)} ${px(winY)}L${px(x0)} ${px(winY + winH)}`, "rule", at, until));
    }
    out.push(path(`${id}-frame`, `M${px(x0)} ${px(winY)}H${px(x1)}V${px(winY + winH)}H${px(x0)}Z`, "ink", frameAt, until));
  };
  const figure = (id: string, text: string, at: number, until?: number) =>
    out.push(...B.text({ id, x: s.left, y: yFig, text, role: "label", color: "inkMuted", at, ...(until ? { until } : {}) }, ctx));

  // Part 1. "One radio." from frame 0, then "77 years." with the radio.
  const yL2 = yTop + lh("display");
  out.push(...B.text({ id: "one", x: s.left, y: yTop, text: "One radio.", role: "display", at: 0, until: CUT1 }, ctx));
  // The second line types on at a human pace, its block cursor at its end (Raw's direction: every line that writes itself).
  out.push(...B.typeOn({ id: "years", x: s.left, y: yL2, text: "77 years.", role: "display", cursor: true, pace: "human", at: T.years, until: CUT1 }, ctx));
  caret("caret-1a", after("One radio.", "display"), yTop, "display", 0, T.years);
  figure("fig-1", "Fig. 1  The radio", T.fig1, CUT1);
  windowAt("win-1", "raw-radio", T.years, CUT1, 0);

  // Part 2. The changelog: a two-column table with a border on every cell. Each row brings its own
  // bottom border and its part of the side and middle borders, so the table grows down one row at a time.
  out.push(...B.text({ id: "log", x: s.left, y: yTop, text: "Changelog", role: "headline", at: CUT1, until: CUT2 }, ctx));
  const rows = [
    { year: "1949", text: "Made.", at: T.row1 },
    { year: "1994", text: "Went quiet.", at: T.row2 },
    { year: "2026", text: "Fixed. Plays again.", at: T.row3 },
  ];
  const cellPad = Math.round(pad * 0.6);
  const rowH = lh("body") + cellPad * 2;
  const tTop = yTop + lh("headline") + pad;
  const xMid = s.left + ctx.measure("0000", "body") + pad;
  const xText = xMid + pad;
  caret("caret-2a", s.left + ctx.measure("Changelog", "headline"), yTop, "headline", CUT1, T.row1);
  out.push(hLine("tab-top", tTop, "ink", T.row1, CUT2));
  rows.forEach((r, i) => {
    const y = tTop + i * rowH, ty = y + cellPad;
    out.push(path(`tab-r${i}-sides`, `M${px(x0)} ${px(y)}V${px(y + rowH)}M${px(xMid)} ${px(y)}V${px(y + rowH)}M${px(x1)} ${px(y)}V${px(y + rowH)}`, "ink", r.at, CUT2));
    out.push(hLine(`tab-r${i}-bottom`, y + rowH, "ink", r.at, CUT2));
    out.push(...B.text({ id: `tab-r${i}-year`, x: s.left, y: ty, text: r.year, role: "body", color: "inkMuted", at: r.at, until: CUT2 }, ctx));
    out.push(...B.text({ id: `tab-r${i}-text`, x: xText, y: ty, w: s.right - xText, text: r.text, role: "body", at: r.at, until: CUT2 }, ctx));
    caret(`caret-2${"bcd"[i]}`, xText + ctx.measure(r.text, "body"), ty, "body", r.at, rows[i + 1]?.at ?? CUT2);
  });
  // The fix stays on the page after the cut, under "Bring yours.", until the form takes its place.
  figure("fig-2", "Fig. 2  The fix", T.row3, T.button);
  windowAt("win-2", "raw-solder", T.row3, T.button, CUT1);

  // Part 3. The call: the day, then the place as a link. The link is the frame's one accent element.
  const yDay = yTop + lh("display") + pad;
  const yLink = yDay + lh("body") + Math.round(pad * 0.4);
  const day = "Saturdays, 10:00 to 14:00", place = "Metuno Hall, room 2";
  out.push(...B.text({ id: "bring", x: s.left, y: yTop, text: "Bring yours.", role: "display", at: CUT2 }, ctx));
  // The reveal: the invitation, the largest line of the film.
  out.push(...B.reveal({ at: CUT2, of: "bring" }, ctx));
  out.push(...B.text({ id: "day", x: s.left, y: yDay, text: day, role: "body", at: T.day }, ctx));
  out.push(...B.text({ id: "place", x: s.left, y: yLink, text: place, role: "body", color: "accentText", at: T.link }, ctx));
  const under = inkOf(ctx, "body", yLink, place).baseline + Math.round(ctx.size("body") * 0.12);
  out.push({ id: "place-underline", kind: "rect", x: s.left, y: px(under), w: px(ctx.measure(place, "body")), h: st, fill: "accent", tracks: present(T.link) });
  caret("caret-3a", after("Bring yours.", "display"), yTop, "display", CUT2, T.day);
  caret("caret-3b", after(day, "body"), yDay, "body", T.day, T.link);
  caret("caret-3c", after(place, "body"), yLink, "body", T.link, T.button);

  // The end: a default form button the viewer can act on, where the window was. It is pressed in one frame (it turns
  // to ink, its label to the ground), then the club's name comes as a heading under it, and the page holds.
  const by = winY;
  const button = B.button({ id: "join", x: s.left, y: by, text: "Join", kind: "secondary", press: [T.press], at: T.button }, ctx);
  out.push(...button);
  const bh = B.measure("button", { id: "join", x: s.left, y: by, text: "Join", kind: "secondary", press: [T.press], at: T.button }, ctx).h;
  out.push(...B.text({ id: "club", x: s.left, y: Math.round(by + bh + pad), w: s.lowBandRight - s.left, text: "Metuno Repair Club", role: "headline", at: T.name }, ctx));
  out.push(...B.hold({ at: T.name, until: END }, ctx));

  // Sound: one click for each thing that appears inside a part. The cuts stay silent.
  [T.years, T.row1, T.row2, T.row3, T.link, T.press].forEach((at, i) => out.push(...B.hit({ id: `click-${i}`, media: "raw-click", at }, ctx)));
  return out;
};
