/** Map v4: center of the left-pointing arrow between booths 1401 and 1301.
 * Coordinates are in map units, independent of screen size, pan, and zoom.
 */
export const VISIT_ROUTE_START = { x: 4970.75, y: 1407.15 } as const;
export const VISIT_OPTIMIZATION_MS = 3000;

import type { Creator, Feature, MapDocument } from "../domain/types";
import { boothKey } from "../domain/search";
import { GridPathfinder } from "./gridPath";
import { optimizeVisitOrder } from "./optimizeVisitOrder";

export interface RoutePoint {
  x: number;
  y: number;
}
export interface VisitStop {
  point: RoutePoint;
  booth: string;
  booths: string[];
  creatorIds: number[];
}
export interface VisitRoute {
  points: RoutePoint[];
  legs: RoutePoint[][];
  stops: VisitStop[];
  unreachable: number[];
}

function formatStopBooths(booths: string[]) {
  const codes = new Set(booths.map((code) => code.toLowerCase()));
  return booths
    .flatMap((code) => {
      const match = code.match(/^(.*-\d+)([ab])$/i);
      if (!match) return [code];
      const base = match[1];
      if (
        !codes.has(`${base}a`.toLowerCase()) ||
        !codes.has(`${base}b`.toLowerCase())
      )
        return [code];
      return match[2].toLowerCase() === "a" ? [`${base}ab`] : [];
    })
    .join(" / ");
}

/** The a/b label strip sits on the customer-facing edge of split booths.
 * Match the suffix as well as the shared edge: a neighboring booth's strip
 * can touch the back of the booth (especially at the end of a row).
 */
export function boothFront(booth: Feature, markers: Feature[]) {
  const suffix = booth.id?.match(/-\d+([ab])$/i)?.[1].toLowerCase();
  if (!suffix) return undefined;
  const g = booth.geometry;
  for (const marker of markers) {
    if (marker.label?.toLowerCase() !== suffix) continue;
    const m = marker.geometry;
    const overlapX =
      Math.min(g.x + g.width, m.x + m.width) - Math.max(g.x, m.x);
    const overlapY =
      Math.min(g.y + g.height, m.y + m.height) - Math.max(g.y, m.y);
    if (overlapX >= g.width * 0.8) {
      if (Math.abs(m.y + m.height - g.y) < 1)
        return { side: "top" as const, edge: m.y };
      if (Math.abs(g.y + g.height - m.y) < 1)
        return { side: "bottom" as const, edge: m.y + m.height };
    }
    if (overlapY >= g.height * 0.8) {
      if (Math.abs(m.x + m.width - g.x) < 1)
        return { side: "left" as const, edge: m.x };
      if (Math.abs(g.x + g.width - m.x) < 1)
        return { side: "right" as const, edge: m.x + m.width };
    }
  }
  return undefined;
}

/** Conservative raster: every cell touching a booth, table strip or wall is blocked. Four-way
 * movement cannot cut across corners. This is a preview, not venue navigation:
 * the source map does not describe booth entrances or restricted aisles.
 */
export function buildVisitRoute(
  map: MapDocument,
  creators: Creator[],
  start: RoutePoint = VISIT_ROUTE_START,
  endCreatorIds: number[] = [],
  optimizationMs = VISIT_OPTIMIZATION_MS,
): VisitRoute {
  const deadline = performance.now() + optimizationMs;
  const endIds = new Set(endCreatorIds);
  const step = 6,
    cols = Math.ceil(map.bounds.width / step),
    rows = Math.ceil(map.bounds.height / step);
  const size = cols * rows,
    blocked = new Uint8Array(size);
  const point = (i: number) => ({
    x: ((i % cols) + 0.5) * step,
    y: (Math.floor(i / cols) + 0.5) * step,
  });
  const index = (p: RoutePoint) =>
    Math.floor(p.y / step) * cols + Math.floor(p.x / step);
  const features = map.features.filter(
    (f) =>
      f.status !== "suggestion" &&
      (f.kind === "booth" ||
        f.kind === "wall" ||
        f.type === "booth-suffix-marker"),
  );
  for (const f of features) {
    const g = f.geometry,
      pad = f.kind === "wall" ? (f.thickness || 1) / 2 : 0;
    for (
      let y = Math.max(0, Math.floor((g.y - pad) / step));
      y <= Math.min(rows - 1, Math.floor((g.y + g.height + pad) / step));
      y++
    )
      for (
        let x = Math.max(0, Math.floor((g.x - pad) / step));
        x <= Math.min(cols - 1, Math.floor((g.x + g.width + pad) / step));
        x++
      )
        blocked[y * cols + x] = 1;
  }
  const remaining = new Set(creators.map((c) => c.id));
  const result: VisitRoute = {
    points: [],
    legs: [],
    stops: [],
    unreachable: [],
  };
  let current = index(start);
  if (
    start.x < 0 ||
    start.y < 0 ||
    start.x >= map.bounds.width ||
    start.y >= map.bounds.height ||
    blocked[current]
  )
    return { ...result, unreachable: [...remaining] };
  const byBooth = new Map<string, number[]>();
  const byCreator = new Map(creators.map((creator) => [creator.id, creator]));
  for (const c of creators)
    for (const code of c.booths) {
      const key = boothKey(code);
      byBooth.set(key, [...(byBooth.get(key) || []), c.id]);
    }
  const targets = new Map<number, { booth: string; ids: number[] }[]>();
  const markers = map.features.filter(
    (f) => f.type === "booth-suffix-marker" && f.status !== "suggestion",
  );
  for (const f of features) {
    if (f.kind !== "booth" || !f.id) continue;
    const ids = byBooth.get(boothKey(f.id));
    if (!ids) continue;
    const g = f.geometry;
    const front = boothFront(f, markers);
    const left = front?.side === "left" ? front.edge : g.x;
    const right = front?.side === "right" ? front.edge : g.x + g.width;
    const top = front?.side === "top" ? front.edge : g.y;
    const bottom = front?.side === "bottom" ? front.edge : g.y + g.height;
    for (
      let y = Math.max(0, Math.floor(top / step) - 2);
      y <= Math.min(rows - 1, Math.floor(bottom / step) + 2);
      y++
    )
      for (
        let x = Math.max(0, Math.floor(left / step) - 2);
        x <= Math.min(cols - 1, Math.floor(right / step) + 2);
        x++
      ) {
        const i = y * cols + x,
          p = point(i);
        // Approach a face, not a diagonal corner or an arbitrary distant cell.
        const beside =
          p.y >= g.y &&
          p.y <= g.y + g.height &&
          Math.min(Math.abs(p.x - g.x), Math.abs(p.x - g.x - g.width)) <=
            step * 1.5;
        const above =
          p.x >= g.x &&
          p.x <= g.x + g.width &&
          Math.min(Math.abs(p.y - g.y), Math.abs(p.y - g.y - g.height)) <=
            step * 1.5;
        const atFront = !front
          ? beside || above
          : front.side === "top"
            ? p.x >= g.x &&
              p.x <= g.x + g.width &&
              p.y < top &&
              top - p.y <= step * 1.5
            : front.side === "bottom"
              ? p.x >= g.x &&
                p.x <= g.x + g.width &&
                p.y > bottom &&
                p.y - bottom <= step * 1.5
              : front.side === "left"
                ? p.y >= g.y &&
                  p.y <= g.y + g.height &&
                  p.x < left &&
                  left - p.x <= step * 1.5
                : p.y >= g.y &&
                  p.y <= g.y + g.height &&
                  p.x > right &&
                  p.x - right <= step * 1.5;
        if (!blocked[i] && atFront)
          targets.set(i, [...(targets.get(i) || []), { booth: f.id, ids }]);
      }
  }
  const previous = new Int32Array(size),
    queue = new Int32Array(size);
  result.points.push(point(current));
  // Multi-target BFS builds a feasible nearest-neighbor seed and chooses accessible faces.
  while (remaining.size) {
    const ordinary = [...remaining].some((id) => !endIds.has(id));
    const eligible = (id: number) =>
      remaining.has(id) && (!ordinary || !endIds.has(id));
    previous.fill(-1);
    previous[current] = current;
    let head = 0,
      tail = 1,
      found = -1;
    queue[0] = current;
    while (head < tail) {
      const i = queue[head++];
      const groups = targets.get(i);
      if (
        groups?.some((t) => t.ids.some(eligible)) &&
        (ordinary ||
          [...remaining].every((id) => groups.some((t) => t.ids.includes(id))))
      ) {
        found = i;
        break;
      }
      const x = i % cols;
      for (const next of [
        x > 0 ? i - 1 : -1,
        x < cols - 1 ? i + 1 : -1,
        i - cols,
        i + cols,
      ]) {
        if (next < 0 || next >= size || blocked[next] || previous[next] !== -1)
          continue;
        previous[next] = i;
        queue[tail++] = next;
      }
    }
    if (found < 0) {
      if (ordinary && [...remaining].some((id) => endIds.has(id))) {
        for (const id of [...remaining])
          if (!endIds.has(id)) {
            result.unreachable.push(id);
            remaining.delete(id);
          }
        continue;
      }
      break;
    }
    const leg: number[] = [];
    for (let i = found; i !== current; i = previous[i]) leg.push(i);
    const legPoints = leg.reverse().map(point);
    result.legs.push(simplifyRoute([point(current), ...legPoints]));
    result.points.push(...legPoints);
    const reached = targets.get(found)!.filter((t) => t.ids.some(eligible));
    const ids = [...new Set(reached.flatMap((t) => t.ids).filter(eligible))];
    const allocation = new Map<string, string>();
    for (const id of ids)
      for (const code of byCreator.get(id)!.booths)
        allocation.set(boothKey(code), code);
    const booths = [...allocation.values()].sort((a, b) =>
      a.localeCompare(b, "en", { numeric: true }),
    );
    result.stops.push({
      point: point(found),
      booth: formatStopBooths(booths),
      booths,
      creatorIds: ids,
    });
    ids.forEach((id) => remaining.delete(id));
    current = found;
  }
  // Retain only turns; each resulting segment follows the same collision-free cells.
  result.points = simplifyRoute(result.points);
  result.unreachable.push(...remaining);
  if (result.stops.length > 1) {
    const pathfinder = new GridPathfinder(cols, blocked);
    const paths = new Map<string, { distance: number; points: RoutePoint[] }>();
    const key = (a: number, b: number) => `${Math.min(a, b)}:${Math.max(a, b)}`;
    const save = (a: number, b: number, points: RoutePoint[]) => {
      const distance =
        points
          .slice(1)
          .reduce(
            (sum, p, i) =>
              sum + Math.abs(p.x - points[i].x) + Math.abs(p.y - points[i].y),
            0,
          ) / step;
      paths.set(key(a, b), {
        distance,
        points: a <= b ? points : [...points].reverse(),
      });
    };
    let from = index(start);
    for (let i = 0; i < result.stops.length; i++) {
      const to = index(result.stops[i].point);
      save(from, to, result.legs[i]);
      from = to;
    }
    // Bound exploratory work, not path quality: an unfinished candidate is discarded.
    let budget = 4_000_000;
    const distance = (a: number, b: number) => {
      if (a === b) return 0;
      const cached = paths.get(key(a, b));
      if (cached) return cached.distance;
      if (budget <= 0 || performance.now() >= deadline) return Infinity;
      const found = pathfinder.find(
        a,
        b,
        budget,
        () => performance.now() >= deadline,
      );
      budget -= found.expanded;
      if (!found.cells) return Infinity;
      save(a, b, simplifyRoute(found.cells.map(point)));
      return found.cells.length - 1;
    };
    const stops = result.stops;
    const cells = stops.map((stop) => index(stop.point));
    const startCell = index(start);
    const cell = (id: number) => (id < 0 ? startCell : cells[id]);
    const end = stops.findIndex((stop) =>
      stop.creatorIds.some((id) => endIds.has(id)),
    );
    const options = {
      end: end < 0 ? undefined : end,
      shouldStop: () => performance.now() >= deadline || budget <= 0,
    };
    let order = optimizeVisitOrder(
      -1,
      stops.map((_, i) => i),
      (a, b) => distance(cell(a), cell(b)),
      (a, b) => pathfinder.lowerBound(cell(a), cell(b)),
      options,
    );
    // Reconsider accessible approach cells using both adjacent legs, including multibooths.
    for (const [position, id] of order.entries()) {
      if (options.shouldStop()) break;
      const previousCell = position ? cells[order[position - 1]] : startCell;
      const nextCell =
        position + 1 < order.length ? cells[order[position + 1]] : undefined;
      let best =
        distance(previousCell, cells[id]) +
        (nextCell === undefined ? 0 : distance(cells[id], nextCell));
      const candidates = [...targets]
        .filter(([, groups]) =>
          stops[id].creatorIds.every((creatorId) =>
            groups.some((g) => g.ids.includes(creatorId)),
          ),
        )
        .map(([candidate]) => candidate)
        .sort(
          (a, b) =>
            pathfinder.lowerBound(previousCell, a) +
            (nextCell === undefined ? 0 : pathfinder.lowerBound(a, nextCell)) -
            (pathfinder.lowerBound(previousCell, b) +
              (nextCell === undefined
                ? 0
                : pathfinder.lowerBound(b, nextCell))),
        )
        .slice(0, 12);
      for (const candidate of candidates) {
        if (options.shouldStop()) break;
        const total =
          distance(previousCell, candidate) +
          (nextCell === undefined ? 0 : distance(candidate, nextCell));
        if (total < best) {
          best = total;
          cells[id] = candidate;
        }
      }
    }
    order = optimizeVisitOrder(
      -1,
      order,
      (a, b) => distance(cell(a), cell(b)),
      (a, b) => pathfinder.lowerBound(cell(a), cell(b)),
      options,
    );
    result.stops = order.map((id) => ({
      ...stops[id],
      point: point(cells[id]),
    }));
    from = index(start);
    result.legs = order.map((id) => {
      const to = cells[id];
      const points =
        from === to ? [point(to)] : paths.get(key(from, to))!.points;
      const leg = from <= to ? points : [...points].reverse();
      from = to;
      return leg;
    });
    result.points = simplifyRoute(
      result.legs.flatMap((leg, i) => (i ? leg.slice(1) : leg)),
    );
  }
  return result;
}

function simplifyRoute(points: RoutePoint[]) {
  return points.filter(
    (p, i, all) =>
      i === 0 ||
      i === all.length - 1 ||
      (p.x - all[i - 1].x) * (all[i + 1].y - p.y) !==
        (p.y - all[i - 1].y) * (all[i + 1].x - p.x) ||
      (p.x - all[i - 1].x) * (all[i + 1].x - p.x) +
        (p.y - all[i - 1].y) * (all[i + 1].y - p.y) <=
        0,
  );
}
