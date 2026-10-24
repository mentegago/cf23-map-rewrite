import "fake-indexeddb/auto";
import { beforeEach, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  readSnapshot,
  cacheSnapshot,
  loadFavorites,
  saveFavorites,
} from "../src/data/storage";
import { loadProfile, saveProfile } from "../src/domain/recommendations";
const values = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => values.get(k) ?? null,
  setItem: (k: string, v: string) => values.set(k, v),
});
beforeEach(() => values.clear());
it("reads and writes favorite IDs in the unchanged Flutter format", () => {
  values.set("flutter.favorite_creator_ids", JSON.stringify(["42", "1000001"]));
  const ids = loadFavorites();
  expect([...ids]).toEqual([42, 1000001]);
  ids.add(76);
  saveFavorites(ids);
  expect(JSON.parse(values.get("flutter.favorite_creator_ids")!)).toEqual([
    "42",
    "1000001",
    "76",
  ]);
  expect(values.has("cf23.favorites")).toBe(false);
});
it("preserves the double-encoded SharedPreferences recommendation profile", () => {
  const profile = {
    schema_version: 2,
    creator_interactions: {
      42: {
        open_strength: 3,
        deliberate_open_count: 2,
        sample_work_views: 1,
        external_link_clicks: 1,
        shares: 0,
        favorite: true,
        consideration: 1,
        last_updated: 12345,
      },
    },
    explicit_fandom_signals: { 7: { strength: 4, last_updated: 12345 } },
  } as const;
  values.set(
    "flutter.recommendation_profile_v2",
    JSON.stringify(JSON.stringify(profile)),
  );
  expect(loadProfile()).toEqual(profile);
  saveProfile(loadProfile());
  expect(
    JSON.parse(JSON.parse(values.get("flutter.recommendation_profile_v2")!)),
  ).toEqual(profile);
});
it("ignores obsolete localStorage snapshots without moving or deleting them", async () => {
  const value = { version: 84, catalog: {}, fandomRegistry: {} };
  const raw = JSON.stringify(JSON.stringify(value));
  values.set("flutter.catalog_snapshot_v3", raw);
  expect(await readSnapshot("snapshot_v3")).toBeNull();
  expect(values.get("flutter.catalog_snapshot_v3")).toBe(raw);
});
it("writes exactly the current Flutter IndexedDB database, store, keys and string records", async () => {
  const read = (f: string) =>
    JSON.parse(
      readFileSync(
        new URL(`../public/data/${f}.json`, import.meta.url),
        "utf8",
      ),
    );
  const snapshot = {
    version: 83,
    mapVersion: 2,
    catalog: read("catalog-initial"),
    registry: read("fandoms-initial"),
    map: read("map"),
    proximity: read("booth-proximity"),
  };
  await cacheSnapshot(snapshot);
  expect(await readSnapshot("snapshot_v3")).toEqual({
    version: 83,
    catalog: snapshot.catalog,
    fandomRegistry: snapshot.registry,
  });
  expect(await readSnapshot("map_v1")).toEqual({
    version: 2,
    layout: snapshot.map,
    proximity: snapshot.proximity,
  });
  const databases = await indexedDB.databases();
  expect(databases.map((d) => d.name)).toEqual(["cf23-map"]);
  expect(databases[0].version).toBe(1);
});
