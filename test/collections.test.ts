import { beforeEach, expect, it, vi } from "vitest";
import {
  loadCollections,
  mergeCreatorIds,
  saveCollections,
} from "../src/data/collections";
const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});
it("merges without duplicates and preserves IDs absent from the current catalog", () => {
  const ids = mergeCreatorIds([1, 999], [1, 2, 2]);
  expect(ids).toEqual([1, 999, 2]);
  const collections = [{ id: "a", name: "GL booths", ids }];
  expect(saveCollections(collections)).toBe(true);
  expect(loadCollections()).toEqual(collections);
  expect(values.has("flutter.favorite_creator_ids")).toBe(false);
});
it("handles malformed storage and reports write failures", () => {
  values.set("cf23.collections.v1", "broken");
  expect(loadCollections()).toEqual([]);
  values.set(
    "cf23.collections.v1",
    JSON.stringify([{ id: "a", name: "Test", ids: [1, "2"] }]),
  );
  expect(loadCollections()).toEqual([]);
  vi.stubGlobal("localStorage", {
    setItem: () => {
      throw new Error("full");
    },
  });
  expect(saveCollections([])).toBe(false);
});
