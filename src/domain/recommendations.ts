import { Catalog, boothKey } from "./search";
import type { Creator, Interaction, Profile, Proximity } from "./types";
import { readLocal, writeLocal } from "../data/storage";
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
): Profile {
  const old = p.creator_interactions[id];
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
    last_updated: Date.now(),
  };
  if (action === "open") {
    i.open_strength = Math.min(6, i.open_strength + 1);
    i.deliberate_open_count++;
    i.consideration = Math.min(1, i.consideration + 0.15);
  }
  if (action === "gallery") i.sample_work_views++;
  if (action === "link") i.external_link_clicks++;
  if (action === "share") i.shares++;
  if (action === "favorite") {
    i.favorite = !!favorite;
    i.consideration = favorite ? 1 : i.consideration;
  }
  return { ...p, creator_interactions: { ...p.creator_interactions, [id]: i } };
}
export function recordFandom(p: Profile, id: number): Profile {
  return {
    ...p,
    explicit_fandom_signals: {
      ...p.explicit_fandom_signals,
      [id]: {
        strength: Math.min(
          12,
          (p.explicit_fandom_signals[id]?.strength || 0) + 3,
        ),
        last_updated: Date.now(),
      },
    },
  };
}
const decay = (n: number, at: number, days: number, now: number) =>
  n * 2 ** (-Math.max(0, now - at) / (days * 86400000));
export function interests(
  catalog: Catalog,
  profile: Profile,
  favorites: Set<number>,
  now = Date.now(),
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
      (strength > 0.5
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
      catalog.fandoms.get(id)?.kind === "generic_tag" &&
      !profile.explicit_fandom_signals[id] &&
      (catalog.byFandom.get(id)?.size || 0) > catalog.creators.length * 0.1
    )
      vector.delete(id);
  const max = Math.max(0, ...vector.values());
  if (max) for (const [id, v] of vector) vector.set(id, v / max);
  return vector;
}
export function recommend(
  catalog: Catalog,
  profile: Profile,
  favorites: Set<number>,
  proximity: Proximity,
  limit = 20,
  seed = 1,
) {
  const vector = interests(catalog, profile, favorites);
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
        kind === "franchise" ? 0.58 : kind === "publisher_umbrella" ? 0.3 : 0;
      best = Math.max(best, base * 0.82 ** Math.max(0, d + other - 1));
    }
    return best;
  };
  const boothIndices = new Map(
    proximity.booths.map((b, i) => [boothKey(b), i]),
  );
  const nearby = new Map<number, number>();
  const anchors = catalog.creators
    .filter(
      (c) =>
        favorites.has(c.id) ||
        (profile.creator_interactions[c.id]?.consideration || 0) >= 0.2,
    )
    .sort((a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id)));
  for (const anchor of anchors.slice(0, favorites.size + 20)) {
    const strength = favorites.has(anchor.id)
      ? 1
      : profile.creator_interactions[anchor.id].consideration;
    for (const b of anchor.booths) {
      const idx = boothIndices.get(boothKey(b));
      if (idx === undefined) continue;
      for (const [index, distance] of [[idx, 0], ...proximity.neighbors[idx]]) {
        for (const c of catalog.byBooth.get(
          boothKey(proximity.booths[index]),
        ) || []) {
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
    if (favorites.has(c.id)) continue;
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
                  ((catalog.byFandom.get(f.id)?.size || 1) + 1),
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
        (c.assets.gallery.length ? 0.035 : 0),
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
  // Stable seeded sampling; equivalent diversity policy, independent of Dart's PRNG.
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
  while (pool.length && result.length < limit) {
    const weights = pool.map(
      (c) =>
        (c.score / max) ** 4 *
        (c.matching.some((f) => !represented.has(f)) ? 1.15 : 1),
    );
    let draw = random() * weights.reduce((a, b) => a + b, 0);
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
  return result.map((r) => r.creator);
}
