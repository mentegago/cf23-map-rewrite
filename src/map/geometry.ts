import type { Feature, MapDocument } from "../domain/types";
import { boothKey } from "../domain/search";
export const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
export interface Transform {
  x: number;
  y: number;
  scale: number;
}
export function zoomAt(
  t: Transform,
  x: number,
  y: number,
  factor: number,
): Transform {
  const scale = clamp(t.scale * factor, 0.04, 8);
  return {
    scale,
    x: x - ((x - t.x) * scale) / t.scale,
    y: y - ((y - t.y) * scale) / t.scale,
  };
}
export function referenceSize(map: MapDocument) {
  let sizes = map.features
    .filter(
      (f) =>
        f.status !== "suggestion" && f.kind === "booth" && f.id?.includes("-"),
    )
    .map((f) => Math.sqrt(f.geometry.width * f.geometry.height))
    .filter((s) => s > 0)
    .sort((a, b) => a - b);
  if (!sizes.length) sizes = [40];
  return sizes[Math.floor(sizes.length / 2)];
}
export function focusTransform(
  features: Feature[],
  width: number,
  height: number,
  reference: number,
  mobile: boolean,
): Transform | null {
  if (!features.length) return null;
  const left = Math.min(...features.map((f) => f.geometry.x)),
    right = Math.max(...features.map((f) => f.geometry.x + f.geometry.width)),
    top = Math.min(...features.map((f) => f.geometry.y)),
    bottom = Math.max(...features.map((f) => f.geometry.y + f.geometry.height));
  const scale = clamp(
    Math.min(
      ((features[0].id!.indexOf("-") > 1 ? 0.6 : 0.8) * 40) / reference,
      (width * 0.62) / Math.max(24, right - left),
      (height * 0.46) / Math.max(24, bottom - top),
    ),
    0.45,
    6,
  );
  return {
    x: width / 2 - ((left + right) / 2) * scale,
    y: height / (mobile ? 3 : 2) - ((top + bottom) / 2) * scale,
    scale,
  };
}
export class SpatialIndex {
  private buckets = new Map<string, Feature[]>();
  constructor(features: Feature[]) {
    for (const f of features) {
      if (f.kind !== "booth" || f.status === "suggestion") continue;
      const g = f.geometry;
      for (
        let x = Math.floor(g.x / 96);
        x <= Math.floor((g.x + g.width) / 96);
        x++
      )
        for (
          let y = Math.floor(g.y / 96);
          y <= Math.floor((g.y + g.height) / 96);
          y++
        ) {
          const key = `${x},${y}`;
          this.buckets.set(key, [...(this.buckets.get(key) || []), f]);
        }
    }
  }
  hit(x: number, y: number, activeBooths?: ReadonlySet<string>) {
    const bucket =
      this.buckets.get(`${Math.floor(x / 96)},${Math.floor(y / 96)}`) || [];
    let inactive: Feature | undefined;
    for (let i = bucket.length - 1; i >= 0; i--) {
      const f = bucket[i],
        g = f.geometry;
      if (x >= g.x && x <= g.x + g.width && y >= g.y && y <= g.y + g.height) {
        if (!activeBooths || activeBooths.has(boothKey(f.id || ""))) return f;
        inactive ??= f;
      }
    }
    return inactive;
  }
}
