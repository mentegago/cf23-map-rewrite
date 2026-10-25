import { expect, it } from "vitest";
import { routeFrame } from "../src/map/routeFraming";
import type { MapDocument } from "../src/domain/types";
import type { VisitRoute } from "../src/map/visitRoute";

it.each([320, 500, 1280])(
  "keeps edge booths and table strips inside the visible map at width %s",
  (width) => {
    const map: MapDocument = {
      schemaVersion: 2,
      bounds: { width: 5500, height: 2608 },
      features: [
        {
          uid: "a",
          id: "H-17a",
          kind: "booth",
          geometry: { x: 0, y: 0, width: 100, height: 80 },
        },
        {
          uid: "strip",
          id: null,
          kind: "highlight",
          type: "booth-suffix-marker",
          label: "a",
          geometry: { x: 100, y: 0, width: 15, height: 80 },
        },
        {
          uid: "b",
          id: "E-45a",
          kind: "booth",
          geometry: { x: 5100, y: 180, width: 100, height: 80 },
        },
      ],
    };
    const origin = { x: 5080, y: 240 },
      destination = { x: 120, y: 40 };
    const route: VisitRoute = {
      points: [origin, destination],
      legs: [[origin], [origin, destination]],
      unreachable: [],
      stops: [
        { point: origin, booth: "E-45a", booths: ["E-45a"], creatorIds: [1] },
        {
          point: destination,
          booth: "H-17a",
          booths: ["H-17a"],
          creatorIds: [2],
        },
      ],
    };
    const mobile = width < 769,
      height = 886,
      safeBottom = 34;
    for (const leg of [1, -1]) {
      const t = routeFrame(
        map,
        route,
        leg,
        width,
        height,
        mobile,
        0,
        safeBottom,
      )!;
      for (const f of map.features) {
        const g = f.geometry;
        expect(g.x * t.scale + t.x).toBeGreaterThanOrEqual(31.99);
        expect((g.x + g.width) * t.scale + t.x).toBeLessThanOrEqual(
          width - 79.99,
        );
        expect(g.y * t.scale + t.y).toBeGreaterThanOrEqual(39.99);
        expect((g.y + g.height) * t.scale + t.y).toBeLessThanOrEqual(
          mobile ? height - 200 - safeBottom + 0.01 : height - 31.99,
        );
      }
    }
  },
);
