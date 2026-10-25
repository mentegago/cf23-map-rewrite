import { expect, it } from "vitest";
import { GridPathfinder } from "../src/map/gridPath";
import { optimizeVisitOrder } from "../src/map/optimizeVisitOrder";

function bfs(cols: number, blocked: Uint8Array, start: number, goal: number) {
  const distance = new Int32Array(blocked.length).fill(-1);
  const queue = [start];
  distance[start] = 0;
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head],
      x = cell % cols;
    if (cell === goal) return distance[cell];
    for (const next of [
      x ? cell - 1 : -1,
      x + 1 < cols ? cell + 1 : -1,
      cell - cols,
      cell + cols,
    ]) {
      if (
        next < 0 ||
        next >= blocked.length ||
        blocked[next] ||
        distance[next] >= 0
      )
        continue;
      distance[next] = distance[cell] + 1;
      queue.push(next);
    }
  }
  return -1;
}

it("A* matches exhaustive shortest paths without cutting blocked cells or wrapping rows", () => {
  const cols = 17,
    blocked = new Uint8Array(cols * 19);
  for (let y = 0; y < 17; y++) blocked[y * cols + 6] = 1;
  for (let x = 8; x < cols; x++) blocked[8 * cols + x] = 1;
  const finder = new GridPathfinder(cols, blocked);
  for (const start of [0, 9, 16, 25, 320]) {
    for (const goal of [0, 15, 140, 250, 322]) {
      const result = finder.find(start, goal);
      expect(result.cells!.length - 1).toBe(bfs(cols, blocked, start, goal));
      expect(result.cells![0]).toBe(start);
      expect(result.cells!.at(-1)).toBe(goal);
      result.cells!.forEach((cell, i, cells) => {
        expect(blocked[cell]).toBe(0);
        if (i) expect(finder.lowerBound(cells[i - 1], cell)).toBe(1);
      });
    }
  }
});

it("A* reports no path for blocked/disconnected targets and safely abandons a budgeted search", () => {
  const blocked = new Uint8Array(100);
  blocked.fill(1, 50, 60);
  const finder = new GridPathfinder(10, blocked);
  expect(finder.find(0, 99).cells).toBeNull();
  expect(finder.find(0, 50).cells).toBeNull();
  expect(finder.find(0, 49, 1).cells).toBeNull();
  expect(finder.find(0, 49).cells!.length - 1).toBe(13);
});

it("2-opt shortens a nearest-neighbor detour while preserving the start and every stop", () => {
  const seed = [1, 2, 3];
  const points = [
    [0, 0],
    [0, 1],
    [1, 0],
    [0, 4],
  ];
  const walk = (a: number, b: number) =>
    Math.abs(points[a][0] - points[b][0]) +
    Math.abs(points[a][1] - points[b][1]);
  const order = optimizeVisitOrder(0, seed, walk, walk);
  expect(order).toEqual([2, 1, 3]);
  expect(seed).toEqual([1, 2, 3]);
  expect(walk(0, 1) + walk(1, 2) + walk(2, 3)).toBe(8);
  expect(
    walk(0, order[0]) + walk(order[0], order[1]) + walk(order[1], order[2]),
  ).toBe(6);
});

it("can improve the free endpoint without moving the starting point", () => {
  const position = [0, 1, 10, 2];
  const walk = (a: number, b: number) => Math.abs(position[a] - position[b]);
  expect(optimizeVisitOrder(0, [1, 2, 3], walk, walk)).toEqual([1, 3, 2]);
});

it("keeps a valid seed when optimization candidates exceed the search budget", () => {
  const edges = new Set(["0:1", "1:2", "2:3"]);
  const distance = (a: number, b: number) =>
    edges.has(`${Math.min(a, b)}:${Math.max(a, b)}`) ? 10 : Infinity;
  expect(optimizeVisitOrder(0, [1, 2, 3], distance, () => 0)).toEqual([
    1, 2, 3,
  ]);
});
