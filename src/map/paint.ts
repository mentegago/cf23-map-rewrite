import type { Feature, MapDocument } from "../domain/types";
import { boothKey } from "../domain/search";
import { clamp, type Transform } from "./geometry";
const light = [
  "#ffd9e8",
  "#c9f7fc",
  "#ffe99a",
  "#e6e0ff",
  "#ffd9c8",
  "#d5f4df",
  "#ffe0f1",
  "#d8e8ff",
];
const dark = [
  "#652443",
  "#12505a",
  "#65531c",
  "#43366f",
  "#693523",
  "#24553a",
  "#5e294e",
  "#29456b",
];
const borders = [
  "#ff3d8d",
  "#009fb2",
  "#c39200",
  "#7657ff",
  "#e25b31",
  "#218c52",
  "#d63a91",
  "#3775cc",
];
export interface PaintState {
  map: MapDocument;
  transform: Transform;
  dark: boolean;
  activeBooths: Set<string>;
  selected: Set<string>;
  hover?: Feature;
  curated: boolean;
  reference: number;
}
function colors(f: Feature, s: PaintState) {
  const ink = s.dark ? "#fff6e8" : "#191522",
    muted = s.dark ? "#292331" : "#f0e8de";
  let fill = f.color || "#64748b",
    border = fill,
    text = ink;
  if (f.type === "section-marker") {
    fill = s.dark ? "#5b4812" : "#ffd84d";
    border = s.dark ? "#ff8a50" : "#e64a19";
    text = s.dark ? "#ffb74d" : "#e65100";
  } else if (f.type === "booth-suffix-marker") {
    fill = muted;
    border = s.dark ? "#4a4a4a" : "#bdbdbd";
    text = s.dark ? "#aaa" : "#616161";
  } else if (f.kind === "booth") {
    const active = s.activeBooths.has(boothKey(f.id || ""));
    const section = f.id?.includes("-") ? f.id.split("-")[0] : "CORPORATE";
    const hash = [...section].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 8;
    fill = active
      ? s.curated
        ? "#ff00bf"
        : (s.dark ? dark : light)[hash]
      : muted;
    border = active
      ? s.curated
        ? "#ff88cd"
        : borders[hash]
      : s.dark
        ? "#4a4a4a"
        : "#bdbdbd";
    text = active && (s.dark || s.curated) ? "#fff" : ink;
  } else if (f.kind === "area") fill += "0a";
  else if (f.kind === "hall") fill += "2e";
  else if (f.kind === "highlight") {
    fill += "b8";
    text = "#111827";
  } else if (f.kind === "text") text = f.themeAware ? ink : fill;
  return { fill, border, text };
}
function feature(ctx: CanvasRenderingContext2D, f: Feature, s: PaintState) {
  const g = f.geometry;
  const c = colors(f, s);
  ctx.save();
  if (f.kind === "arrow" || (f.kind === "wall" && f.lineStart)) {
    const start = f.lineStart || { x: 0, y: 0.5 },
      end = f.lineEnd || { x: 1, y: 0.5 },
      x1 = g.x + g.width * start.x,
      y1 = g.y + g.height * start.y,
      x2 = g.x + g.width * end.x,
      y2 = g.y + g.height * end.y;
    ctx.strokeStyle = f.themeAware
      ? s.dark
        ? "#e5e7eb"
        : "#111827"
      : f.color || "#64748b";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = Math.max(0.5, f.thickness || 1);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    if (f.kind === "arrow") {
      const a = Math.atan2(y2 - y1, x2 - x1),
        size = Math.min(
          Math.hypot(x2 - x1, y2 - y1) * 0.38,
          Math.max((f.thickness || 1) * 3, 8),
        );
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(
        x2 - size * Math.cos(a) + size * 0.52 * Math.sin(a),
        y2 - size * Math.sin(a) - size * 0.52 * Math.cos(a),
      );
      ctx.lineTo(
        x2 - size * Math.cos(a) - size * 0.52 * Math.sin(a),
        y2 - size * Math.sin(a) + size * 0.52 * Math.cos(a),
      );
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  if (f.kind !== "text") {
    ctx.fillStyle = c.fill;
    ctx.strokeStyle = c.border;
    ctx.lineWidth = f.kind === "booth" ? 1.25 : 1;
    ctx.beginPath();
    ctx.roundRect(
      g.x,
      g.y,
      g.width,
      g.height,
      Math.min(2.5, g.width * 0.1, g.height * 0.1),
    );
    ctx.fill();
    if (f.kind === "area") ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  let text =
    f.kind === "booth"
      ? (f.id || "")
          .split("-")
          .at(-1)!
          .replace(/(\d)[ab]$/i, "$1")
      : f.label || "";
  if (text && g.width >= 3 && g.height >= 3) {
    const rotated = Math.abs(f.rotation || 0) === 90,
      w = rotated ? g.height : g.width,
      h = rotated ? g.width : g.height;
    const corporate = f.kind === "booth" && !f.id?.includes("-");
    const base = clamp(s.reference * 0.8, 6, 18),
      category =
        f.kind === "booth"
          ? 1.35
          : f.kind === "text"
            ? 2.25
            : f.kind === "area"
              ? 1.8
              : f.type === "booth-suffix-marker"
                ? 0.8
                : 1.3;
    const natural = Math.max(
      3,
      Math.min(
        h * (f.kind === "text" ? 0.52 : corporate ? 0.3 : 0.42),
        w / Math.max(1, text.length * (corporate ? 0.7 : 0.58)),
      ),
    );
    const size = Math.max(
      3,
      Math.min(
        f.fontSize || Math.min(natural, base * category),
        h * 0.9,
        w / Math.max(1, text.length * 0.52),
      ),
    );
    if (size * s.transform.scale >= 2) {
      ctx.translate(g.x + g.width / 2, g.y + g.height / 2);
      ctx.rotate(((f.rotation || 0) * Math.PI) / 180);
      ctx.fillStyle = c.text;
      const weight = f.kind === "booth" || f.kind === "highlight" ? 700 : 600;
      const font = (px: number) =>
        `${weight} ${px}px "Plus Jakarta Sans", system-ui, sans-serif`;
      ctx.font = font(size);
      // Fit the actual glyph widths uniformly; fillText(maxWidth) would squash
      // the wider Jakarta letterforms horizontally in narrow booth cells.
      const fitted = Math.min(
        size,
        (size * (w * 0.88)) / Math.max(1, ctx.measureText(text).width),
      );
      ctx.font = font(fitted);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 0, 0);
    }
  }
  ctx.restore();
}
export function paint(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  s: PaintState,
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = s.dark ? "#15111e" : "#fff8ed";
  ctx.fillRect(0, 0, width, height);
  const t = s.transform;
  ctx.translate(t.x, t.y);
  ctx.scale(t.scale, t.scale);
  const visible = (f: Feature) => {
    const g = f.geometry;
    return (
      (g.x + g.width) * t.scale + t.x >= -30 &&
      g.x * t.scale + t.x <= width + 30 &&
      (g.y + g.height) * t.scale + t.y >= -30 &&
      g.y * t.scale + t.y <= height + 30
    );
  };
  for (const booth of [false, true])
    for (const f of s.map.features)
      if (
        f.status !== "suggestion" &&
        (f.kind === "booth") === booth &&
        visible(f)
      )
        feature(ctx, f, s);
  for (const f of s.map.features) {
    if (f.status === "suggestion") continue;
    const selected = f.kind === "booth" && s.selected.has(boothKey(f.id || ""));
    if (!selected && s.hover !== f) continue;
    const g = f.geometry;
    ctx.fillStyle = selected ? "#ff3d8d66" : "#00c8e044";
    ctx.fillRect(g.x, g.y, g.width, g.height);
    ctx.strokeStyle = selected ? (s.dark ? "#ffdc60" : "#ff3d8d") : "#00c8e0";
    ctx.lineWidth = 3 / t.scale;
    ctx.strokeRect(
      g.x - 2 / t.scale,
      g.y - 2 / t.scale,
      g.width + 4 / t.scale,
      g.height + 4 / t.scale,
    );
  }
}
