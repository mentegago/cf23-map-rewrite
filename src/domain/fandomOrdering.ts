import { Catalog, compareNames } from "./search";
import type { Fandom } from "./types";

export function fandomRanks(ids: readonly number[]) {
  const ranks = new Map<number, number>();
  for (const id of ids) if (!ranks.has(id)) ranks.set(id, ranks.size);
  return ranks;
}

/** Use the same matches and ancestry as creator search, without the pill limit. */
export function searchFandomRanks(
  catalog: Catalog,
  query: string,
  fandomId?: number,
) {
  if (fandomId === undefined && !query.trim()) return new Map<number, number>();
  const matches = fandomRanks(
    fandomId === undefined
      ? catalog.fandomMatches(query).map(({ fandom }) => fandom.id)
      : [fandomId],
  );
  const ranks = new Map<number, number>();
  for (const id of catalog.fandoms.keys()) {
    const rank = Math.min(
      ...[...catalog.ancestors(id).keys()].map(
        (ancestor) => matches.get(ancestor) ?? Infinity,
      ),
    );
    if (Number.isFinite(rank)) ranks.set(id, rank);
  }
  return ranks;
}

export function orderCreatorFandoms(
  fandoms: readonly Fandom[],
  {
    priority = new Map<number, number>(),
    interests = new Map<number, number>(),
    originalFirst = false,
  }: {
    priority?: ReadonlyMap<number, number>;
    interests?: ReadonlyMap<number, number>;
    originalFirst?: boolean;
  } = {},
) {
  const rank = (f: Fandom) =>
    originalFirst && f.name.toLowerCase() === "original"
      ? -1
      : (priority.get(f.id) ?? Infinity);
  return [...new Map(fandoms.map((f) => [f.id, f])).values()].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (interests.get(a.id) ?? Infinity) - (interests.get(b.id) ?? Infinity) ||
      compareNames(a.name, b.name) ||
      a.id - b.id,
  );
}
