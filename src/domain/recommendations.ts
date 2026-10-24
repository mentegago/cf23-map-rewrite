import { Catalog } from "./search";
import type { Creator, Interaction, Profile, Proximity } from "./types";
import { readLocal, writeLocal } from "../data/storage";
// Deliberately stronger than Flutter's 0.035; gallery size never adds more weight.
const galleryBonus = 0.3;
export type RecommendationSource =
  | "search_result"
  | "list"
  | "recommendation"
  | "favorites"
  | "custom_list"
  | "map"
  | "random"
  | "deeplink";
export const emptyProfile = (): Profile => ({
  schema_version: 2,
  creator_interactions: {},
  explicit_fandom_signals: {},
});
export function loadProfile(): Profile {
  try {
    const raw = readLocal<string>("flutter.recommendation_profile_v2", "");
    const p = JSON.parse(raw);
    return p.schema_version === 2 &&
      p.creator_interactions &&
      p.explicit_fandom_signals
      ? p
      : emptyProfile();
  } catch {
    return emptyProfile();
  }
}
export function saveProfile(p: Profile) {
  writeLocal("flutter.recommendation_profile_v2", JSON.stringify(p));
}
export function recordInteraction(
  p: Profile,
  id: number,
  action: "open" | "gallery" | "link" | "share" | "favorite",
  favorite?: boolean,
  source: RecommendationSource = "list",
  now = Date.now(),
): Profile {
  const old = p.creator_interactions[id];
  if (
    action === "open" &&
    (source === "map" ||
      source === "random" ||
      (old &&
        old.deliberate_open_count > 0 &&
        now - old.last_updated < 30 * 60000))
  )
    return p;
  const i: Interaction = {
    ...(old ?? {
      open_strength: 0,
      deliberate_open_count: 0,
      sample_work_views: 0,
      external_link_clicks: 0,
      shares: 0,
      favorite: false,
      consideration: 0,
      last_updated: 0,
    }),
    last_updated: now,
  };
  if (action === "open") {
    const weights: Record<RecommendationSource, [number, number]> = {
      deeplink: [2.5, 0.3],
      search_result: [2, 0.2],
      list: [1.5, 0.1],
      custom_list: [1, 0.1],
      recommendation: [0.5, 0.1],
      favorites: [0.5, 1],
      map: [0, 0],
      random: [0, 0],
    };
    const [strength, consideration] = weights[source];
    i.open_strength = Math.min(6, i.open_strength + strength);
    i.deliberate_open_count = Math.min(5, i.deliberate_open_count + 1);
    i.consideration = Math.max(i.consideration, consideration);
  }
  if (action === "gallery") {
    i.sample_work_views = Math.min(3, i.sample_work_views + 1);
    i.consideration = Math.max(i.consideration, 0.5);
  }
  if (action === "link") {
    i.external_link_clicks = Math.min(2, i.external_link_clicks + 1);
    i.consideration = Math.max(i.consideration, 0.6);
  }
  if (action === "share") {
    i.shares = Math.min(2, i.shares + 1);
    i.consideration = Math.max(i.consideration, 0.7);
  }
  if (action === "favorite") {
    i.favorite = !!favorite;
    i.consideration = favorite
      ? 1
      : i.shares > 0
        ? 0.7
        : i.external_link_clicks > 0
          ? 0.6
          : i.sample_work_views > 0
            ? 0.5
            : i.deliberate_open_count >= 2
              ? 0.25
              : i.deliberate_open_count === 1
                ? 0.1
                : 0;
  }
  return { ...p, creator_interactions: { ...p.creator_interactions, [id]: i } };
}
export function recordFandom(
  p: Profile,
  id: number,
  now = Date.now(),
): Profile {
  return {
    ...p,
    explicit_fandom_signals: {
      ...p.explicit_fandom_signals,
      [id]: {
        strength: Math.min(
          20,
          (p.explicit_fandom_signals[id]?.strength || 0) + 5,
        ),
        last_updated: now,
      },
    },
  };
}
const decay = (n: number, at: number, days: number, now: number) =>
  at <= 0 ? n : n * 2 ** (-Math.max(0, now - at) / (days * 86400000));
const frequencies = new WeakMap<Catalog, Map<number, number>>();
function canonicalBooth(booth: string) {
  const match = /^(?:([A-Z]+)-)?0*(\d+)([A-Z]?)$/.exec(
    booth.trim().toUpperCase(),
  );
  if (!match) return booth.trim();
  return `${match[1] ? `${match[1]}-` : ""}${Number(match[2])}${match[3].toLowerCase()}`;
}
function documentFrequency(catalog: Catalog) {
  let result = frequencies.get(catalog);
  if (!result) {
    result = new Map();
    for (const c of catalog.creators) {
      const ids = new Set(
        c.fandoms.flatMap((f) =>
          f.parentId == null ? [f.id] : [f.id, f.parentId],
        ),
      );
      for (const id of ids) result.set(id, (result.get(id) || 0) + 1);
    }
    frequencies.set(catalog, result);
  }
  return result;
}
export function interests(
  catalog: Catalog,
  profile: Profile,
  favorites: Set<number>,
  now = Date.now(),
  qualifyGeneric = true,
) {
  const vector = new Map<number, number>();
  for (const [id, s] of Object.entries(profile.explicit_fandom_signals)) {
    const v = decay(s.strength, s.last_updated, 4, now);
    if (v > 0.01) vector.set(+id, v);
  }
  for (const c of catalog.creators) {
    const i = profile.creator_interactions[c.id];
    const strength = i
      ? Math.min(i.open_strength, 6) +
        Math.min(i.sample_work_views, 3) * 4 +
        Math.min(i.external_link_clicks, 2) * 5 +
        Math.min(i.shares, 2) * 4
      : 0;
    const v =
      (i && (strength > 0.5 || favorites.has(c.id))
        ? decay(Math.min(strength, 5), i.last_updated, 2, now)
        : 0) + (favorites.has(c.id) ? 10 : 0);
    if (v <= 0.01) continue;
    for (const f of c.fandoms)
      vector.set(
        f.id,
        (vector.get(f.id) || 0) + v / Math.sqrt(c.fandoms.length),
      );
  }
  for (const [id] of vector)
    if (
      qualifyGeneric &&
      catalog.fandoms.get(id)?.kind === "generic_tag" &&
      !profile.explicit_fandom_signals[id] &&
      (documentFrequency(catalog).get(id) || 0) > catalog.creators.length * 0.1
    )
      vector.delete(id);
  const max = Math.max(0, ...vector.values());
  if (max) for (const [id, v] of vector) vector.set(id, v / max);
  return vector;
}
export function rankedInterestedFandoms(
  catalog: Catalog,
  profile: Profile,
  favorites: Set<number>,
  now = Date.now(),
) {
  const displayed = new Set(catalog.creators.flatMap((c) => c.fandomIds));
  const frequency = documentFrequency(catalog);
  return [...interests(catalog, profile, favorites, now, false)]
    .filter(([id]) => displayed.has(id) && catalog.fandoms.has(id))
    .sort(
      (a, b) =>
        b[1] - a[1] ||
        (frequency.get(b[0]) || 0) - (frequency.get(a[0]) || 0) ||
        a[0] - b[0],
    )
    .map(([id]) => catalog.fandoms.get(id)!);
}
export function rankRecommendations(
  catalog: Catalog,
  profile: Profile,
  favorites: Set<number>,
  proximity: Proximity,
  limit = 20,
  previousIds: ReadonlySet<number> = new Set(),
  now = Date.now(),
) {
  if (limit <= 0 || !catalog.creators.length) return [];
  const vector = interests(catalog, profile, favorites, now);
  if (!vector.size) return [];
  const ancestorCache = new Map<number, Map<number, number>>();
  const ancestors = (id: number) => {
    if (!ancestorCache.has(id)) ancestorCache.set(id, catalog.ancestors(id));
    return ancestorCache.get(id)!;
  };
  const relation = (a: number, b: number) => {
    if (a === b)
      return catalog.fandoms.get(a)?.kind === "publisher_umbrella" ? 0.55 : 1;
    let best = 0;
    for (const [id, d] of ancestors(a)) {
      const other = ancestors(b).get(id);
      if (other === undefined) continue;
      const kind = catalog.fandoms.get(id)?.kind;
      const base =
        kind === "franchise"
          ? 0.58
          : kind === "publisher_umbrella" || kind == null
            ? 0.3
            : 0;
      best = Math.max(best, base * 0.82 ** Math.max(0, d + other - 1));
    }
    return best;
  };
  const boothIndices = new Map(proximity.booths.map((b, i) => [b, i]));
  const creatorsByBooth = new Map<string, Creator[]>();
  for (const creator of catalog.creators)
    for (const booth of creator.booths) {
      const key = canonicalBooth(booth);
      const entries = creatorsByBooth.get(key) || [];
      entries.push(creator);
      creatorsByBooth.set(key, entries);
    }
  const nearby = new Map<number, number>();
  const anchors = catalog.creators
    .filter(
      (c) =>
        c.booths.length > 0 &&
        (favorites.has(c.id) ||
          (profile.creator_interactions[c.id]?.consideration || 0) >= 0.2),
    )
    .sort(
      (a, b) =>
        (favorites.has(b.id)
          ? 1
          : Math.min(1, profile.creator_interactions[b.id].consideration)) -
        (favorites.has(a.id)
          ? 1
          : Math.min(1, profile.creator_interactions[a.id].consideration)),
    );
  for (const anchor of [
    ...anchors.filter((c) => favorites.has(c.id)),
    ...anchors.filter((c) => !favorites.has(c.id)).slice(0, 20),
  ]) {
    const strength = favorites.has(anchor.id)
      ? 1
      : Math.min(1, profile.creator_interactions[anchor.id].consideration);
    for (const b of anchor.booths) {
      const idx = boothIndices.get(b) ?? boothIndices.get(canonicalBooth(b));
      for (const [booth, distance] of [
        [canonicalBooth(b), 0] as const,
        ...(idx === undefined
          ? []
          : proximity.neighbors[idx].map(
              ([index, distance]) =>
                [proximity.booths[index], distance] as const,
            )),
      ]) {
        for (const c of creatorsByBooth.get(booth) || []) {
          if (
            c.id !== anchor.id &&
            c.attendanceDates.some((d) => anchor.attendanceDates.includes(d))
          )
            nearby.set(
              c.id,
              Math.max(
                nearby.get(c.id) || 0,
                strength * Math.exp(-distance / 8),
              ),
            );
        }
      }
    }
  }
  const candidates: { creator: Creator; score: number; matching: string[] }[] =
    [];
  for (const c of catalog.creators) {
    if (c.id === -1 || favorites.has(c.id)) continue;
    const matches = c.fandoms
      .map((f) => ({
        name: f.name,
        value:
          Math.max(0, ...[...vector].map(([id, v]) => v * relation(f.id, id))) *
          Math.max(
            0.7,
            Math.min(
              1,
              Math.log(
                (catalog.creators.length + 1) /
                  ((documentFrequency(catalog).get(f.id) ?? 1) + 1),
              ) / 4,
            ),
          ),
      }))
      .filter((m) => m.value > 0)
      .sort((a, b) => b.value - a.value);
    if (!matches.length) continue;
    const affinity = Math.min(
      1,
      ((matches[0]?.value || 0) +
        (matches[1]?.value || 0) * 0.4 +
        (matches[2]?.value || 0) * 0.2) /
        1.45,
    );
    candidates.push({
      creator: c,
      score:
        affinity +
        0.08 * (nearby.get(c.id) || 0) +
        (c.assets.gallery.length ? galleryBonus : 0),
      matching: matches.slice(0, 3).map((m) => m.name),
    });
  }
  candidates.sort((a, b) => b.score - a.score || a.creator.id - b.creator.id);
  const strong = candidates.filter(
    (c) => c.score >= (candidates[0]?.score || 0) * 0.6,
  );
  const pool = strong.length >= limit ? strong : candidates;
  const result = pool.splice(0, Math.min(2, limit));
  const max = result[0]?.score || 1;
  const represented = new Set(result.flatMap((r) => r.matching));
  while (pool.length && result.length < limit) {
    const weights = pool.map(
      (c) =>
        (c.score / max) ** 4 *
        (c.matching.some((f) => !represented.has(f)) ? 1.15 : 1) *
        (previousIds.has(c.creator.id) ? 1.2 : 1),
    );
    let draw = Math.random() * weights.reduce((a, b) => a + b, 0);
    let index = weights.length - 1;
    for (let i = 0; i < weights.length; i++) {
      draw -= weights[i];
      if (draw <= 0) {
        index = i;
        break;
      }
    }
    const next = pool.splice(index, 1)[0];
    result.push(next);
    next.matching.forEach((f) => represented.add(f));
  }
  return result;
}
export function recommend(...args: Parameters<typeof rankRecommendations>) {
  return rankRecommendations(...args).map((r) => r.creator);
}
