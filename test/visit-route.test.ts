import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildVisitRoute, boothFront } from "../src/map/visitRoute";
import { Catalog } from "../src/domain/search";
import type { Creator, Feature, MapDocument } from "../src/domain/types";

const booth = (id: string, x: number, y: number): Feature => ({
  uid: id,
  id,
  kind: "booth",
  geometry: { x, y, width: 18, height: 18 },
});
const creator = (id: number, booths: string[]) => ({ id, booths }) as Creator;
const map = (features: Feature[]): MapDocument => ({
  schemaVersion: 2,
  bounds: { width: 120, height: 120 },
  features,
});

describe("visit routes", () => {
  it("combines paired booth suffixes in labels while retaining every map allocation", () => {
    const booths = [
      "I-10b",
      "I-09b",
      "I-11a",
      "I-09a",
      "I-10a",
      "I-12b",
      "1401",
    ];
    const result = buildVisitRoute(
      map([booth("I-09a", 30, 12)]),
      [creator(1, booths)],
      { x: 9, y: 9 },
    );
    expect(result.stops[0].booth).toBe(
      "1401 / I-09ab / I-10ab / I-11a / I-12b",
    );
    expect(result.stops[0].booths).toEqual(
      [...booths].sort((a, b) => a.localeCompare(b, "en", { numeric: true })),
    );
  });
  it("routes around a/b table strips even when they are not at the destination", () => {
    const strip: Feature = {
      uid: "table",
      id: null,
      kind: "highlight",
      type: "booth-suffix-marker",
      label: "b",
      geometry: { x: 48, y: 0, width: 12, height: 84 },
    };
    const result = buildVisitRoute(
      map([strip, booth("A-01a", 84, 12)]),
      [creator(1, ["A-01a"])],
      { x: 9, y: 9 },
    );
    expect(result.unreachable).toEqual([]);
    expect(result.points.some((p) => p.y > 84)).toBe(true);
    for (let i = 1; i < result.points.length; i++) {
      const a = result.points[i - 1],
        b = result.points[i];
      const crosses =
        a.y === b.y
          ? a.y >= 0 &&
            a.y <= 84 &&
            Math.max(a.x, b.x) >= 48 &&
            Math.min(a.x, b.x) <= 60
          : a.x >= 48 &&
            a.x <= 60 &&
            Math.max(a.y, b.y) >= 0 &&
            Math.min(a.y, b.y) <= 84;
      expect(crosses).toBe(false);
    }
  });
  it("approaches row-end booths through their matching suffix strip, not the side or back", () => {
    const doc: MapDocument = JSON.parse(
      readFileSync("public/data/map.json", "utf8"),
    );
    const markers = doc.features.filter(
      (f) => f.type === "booth-suffix-marker",
    );
    for (const [code, side] of [
      ["X-23a", "top"],
      ["X-23b", "top"],
      ["X-60a", "bottom"],
      ["X-60b", "bottom"],
    ] as const) {
      const booth = doc.features.find((f) => f.id === code)!;
      const front = boothFront(booth, markers)!;
      expect(front.side).toBe(side);
      const route = buildVisitRoute(doc, [creator(1, [code])]);
      expect(route.unreachable).toEqual([]);
      const p = route.stops[0].point;
      expect(p.x).toBeGreaterThanOrEqual(booth.geometry.x);
      expect(p.x).toBeLessThanOrEqual(booth.geometry.x + booth.geometry.width);
      if (side === "top") expect(p.y).toBeLessThan(front.edge);
      else expect(p.y).toBeGreaterThan(front.edge);
    }
  });
  it("walks around walls, visits the nearest reachable booth first and groups shared booths", () => {
    const doc = map([
      booth("A-01a", 78, 12),
      booth("A-02a", 12, 78),
      {
        uid: "wall",
        id: null,
        kind: "wall",
        geometry: { x: 48, y: 0, width: 6, height: 84 },
      },
    ]);
    const result = buildVisitRoute(
      doc,
      [creator(1, ["A-01a"]), creator(2, ["A-02a"]), creator(3, ["A-02a"])],
      { x: 9, y: 9 },
    );
    expect(result.unreachable).toEqual([]);
    expect(result.stops[0].creatorIds).toEqual([2, 3]);
    expect(result.stops).toHaveLength(2);
    expect(result.legs).toHaveLength(2);
    expect(result.legs[0][0]).toEqual(result.points[0]);
    result.legs.forEach((leg, i) => {
      expect(leg.at(-1)).toEqual(result.stops[i].point);
      if (i) expect(leg[0]).toEqual(result.stops[i - 1].point);
    });
    expect(result.points.some((p) => p.y > 84)).toBe(true);
    for (let i = 1; i < result.points.length; i++) {
      const a = result.points[i - 1],
        b = result.points[i];
      expect(a.x === b.x || a.y === b.y).toBe(true);
      const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
      for (let j = 0; j <= count; j++) {
        const x = a.x + ((b.x - a.x) * j) / count,
          y = a.y + ((b.y - a.y) * j) / count;
        for (const { geometry: g } of doc.features)
          expect(
            x > g.x && x < g.x + g.width && y > g.y && y < g.y + g.height,
          ).toBe(false);
      }
    }
  });
  it("does not invent paths to enclosed or absent booths", () => {
    const result = buildVisitRoute(
      map([
        booth("A-01a", 78, 12),
        {
          uid: "wall",
          id: null,
          kind: "wall",
          geometry: { x: 48, y: 0, width: 6, height: 120 },
        },
      ]),
      [creator(1, ["A-01a"]), creator(2, ["missing"])],
      { x: 9, y: 9 },
    );
    expect(result.stops).toEqual([]);
    expect(result.unreachable).toEqual([1, 2]);
  });
  it("visits a creator with several booths once and handles an obstructed start", () => {
    const doc = map([booth("A-01a", 30, 12), booth("A-02a", 78, 78)]);
    expect(
      buildVisitRoute(doc, [creator(1, ["A-01a", "A-02a"])], { x: 9, y: 9 })
        .stops,
    ).toHaveLength(1);
    const stop = buildVisitRoute(doc, [creator(1, ["A-02a", "A-01a"])], {
      x: 9,
      y: 9,
    }).stops[0];
    expect(stop.booths).toEqual(["A-01a", "A-02a"]);
    expect(stop.booth).toBe("A-01a / A-02a");
    expect(
      buildVisitRoute(doc, [creator(1, ["A-01a"])], { x: 33, y: 15 })
        .unreachable,
    ).toEqual([1]);
  });
  it("builds a route from the entrance using the bundled catalog and map", () => {
    const read = (name: string) =>
      JSON.parse(readFileSync(`public/data/${name}.json`, "utf8"));
    const catalog = new Catalog(
      read("catalog-initial"),
      read("fandoms-initial"),
    );
    const creators = catalog.creators
      .filter((c) => c.attendanceDates.includes("2026-10-31"))
      .slice(0, 30);
    const route = buildVisitRoute(read("map"), creators);
    expect(route.stops.length).toBeGreaterThan(10);
    expect(
      new Set([
        ...route.stops.flatMap((s) => s.creatorIds),
        ...route.unreachable,
      ]).size,
    ).toBe(creators.length);
  });
});

it("reserves the chosen finish, including shared and multibooth creators", () => {
  const doc = map([
    booth("A-01a", 30, 12),
    booth("A-02a", 78, 12),
    booth("A-03a", 12, 78),
  ]);
  const people = [
    creator(1, ["A-01a", "A-02a"]),
    creator(2, ["A-01a"]),
    creator(3, ["A-03a"]),
  ];
  const route = buildVisitRoute(doc, people, { x: 9, y: 9 }, [1, 2]);
  expect(route.unreachable).toEqual([]);
  expect(route.stops.at(-1)!.creatorIds.sort()).toEqual([1, 2]);
  expect(new Set(route.stops.flatMap((s) => s.creatorIds))).toEqual(
    new Set([1, 2, 3]),
  );
  route.legs.forEach((leg, i) =>
    expect(leg.at(-1)).toEqual(route.stops[i].point),
  );
});

it("still reaches the finish when an intermediate booth is inaccessible", () => {
  const doc = map([
    booth("A-01a", 12, 12),
    booth("A-02a", 78, 12),
    {
      uid: "wall",
      id: null,
      kind: "wall",
      geometry: { x: 48, y: 0, width: 6, height: 120 },
    },
  ]);
  const route = buildVisitRoute(
    doc,
    [creator(1, ["A-01a"]), creator(2, ["A-02a"])],
    { x: 9, y: 9 },
    [1],
  );
  expect(route.unreachable).toEqual([2]);
  expect(route.stops.at(-1)!.creatorIds).toEqual([1]);
});

it("keeps a complete route with a fixed end when the optimization budget expires", () => {
  const doc = map([
    booth("A-01a", 30, 12),
    booth("A-02a", 78, 12),
    booth("A-03a", 12, 78),
  ]);
  const people = [
    creator(1, ["A-01a"]),
    creator(2, ["A-02a"]),
    creator(3, ["A-03a"]),
  ];
  const route = buildVisitRoute(doc, people, { x: 9, y: 9 }, [1], 0);
  expect(route.stops.at(-1)!.creatorIds).toEqual([1]);
  expect(route.stops).toHaveLength(3);
  expect(route.legs).toHaveLength(3);
});
