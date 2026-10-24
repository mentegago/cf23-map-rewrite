import { expect, it } from "vitest";
import type { Feature } from "../src/domain/types";
import { paint, type PaintState } from "../src/map/paint";
import { SpatialIndex } from "../src/map/geometry";

const booth = (id: string, x: number): Feature => ({
  uid: id,
  id,
  kind: "booth",
  geometry: { x, y: 0, width: 20, height: 20 },
});
const a = booth("A-01a", 0),
  b = booth("A-02a", 20);

it.each([false, true])(
  "paints active shared edges last (dark=%s), including after a filter changes",
  (dark) => {
    const strokes: number[] = [];
    let x = 0;
    const ctx = new Proxy(
      {
        roundRect: (left: number) => {
          x = left;
        },
        stroke: () => strokes.push(x),
        measureText: () => ({ width: 10 }),
      },
      { get: (target, key) => Reflect.get(target, key) ?? (() => {}) },
    ) as unknown as CanvasRenderingContext2D;
    const state: PaintState = {
      map: {
        schemaVersion: 2,
        bounds: { width: 40, height: 20 },
        features: [a, b],
      },
      transform: { x: 0, y: 0, scale: 1 },
      dark,
      curated: false,
      activeBooths: new Set(["a1a"]),
      selected: new Set(),
      reference: 20,
    };
    paint(ctx, 40, 20, 1, state);
    expect(strokes).toEqual([20, 0]);
    strokes.length = 0;
    state.activeBooths = new Set(["a2a"]);
    state.curated = true;
    paint(ctx, 40, 20, 1, state);
    expect(strokes).toEqual([0, 20]);
  },
);

it("hits the active booth at a shared edge and retains inactive booth access", () => {
  const index = new SpatialIndex([a, b]);
  expect(index.hit(20, 10, new Set(["a1a"]))).toBe(a);
  expect(index.hit(20, 10, new Set(["a2a"]))).toBe(b);
  expect(index.hit(30, 10, new Set(["a1a"]))).toBe(b);
  expect(index.hit(20, 10, new Set())).toBe(b);
});
