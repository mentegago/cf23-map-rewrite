import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Catalog, boothKey, fuzzyScore } from "../src/domain/search";
import {
  decodeList,
  encodeList,
  parseLink,
  safeURL,
} from "../src/domain/links";
import {
  SpatialIndex,
  zoomAt,
  focusTransform,
  referenceSize,
} from "../src/map/geometry";
import { snapExtent, searchCollapsed } from "../src/components/Sheet";
import { validSnapshot } from "../src/data/snapshots";
import {
  emptyProfile,
  recordFandom,
  recommend,
} from "../src/domain/recommendations";
import type { Snapshot } from "../src/domain/types";
const read = (file: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../public/data/${file}.json`, import.meta.url),
      "utf8",
    ),
  );
const snapshot: Snapshot = {
  catalog: read("catalog-initial"),
  registry: read("fandoms-initial"),
  map: read("map"),
  proximity: read("booth-proximity"),
  version: 83,
  mapVersion: 2,
};
const catalog = new Catalog(snapshot.catalog, snapshot.registry);
describe("Flutter link compatibility", () => {
  it("matches known delta varint bytes", () => {
    expect(encodeList([300, 1, 128])).toBe("AX-sAQ");
    expect(decodeList("AX-sAQ")).toEqual([1, 128, 300]);
  });
  it("round trips large IDs and rejects truncated or invalid data", () => {
    const ids = [1000001, 3654, 42, 128, 0];
    expect(decodeList(encodeList(ids))).toEqual(ids.sort((a, b) => a - b));
    expect(decodeList("gA")).toEqual([]);
    expect(decodeList("%%%")).toEqual([]);
  });
  it("supports legacy names, numeric IDs and custom lists", () => {
    expect(parseLink("/?custom_list=12,42")).toEqual({
      kind: "list",
      ids: [12, 42],
    });
    expect(parseLink("/?creator_id=42")).toEqual({ kind: "creator", id: 42 });
    expect(parseLink("/?fandom=42")).toEqual({ kind: "fandom", id: 42 });
    for (const value of ["", "-1", "1.2", "abc", "9007199254740992"]) {
      expect(parseLink(`/?fandom=${value}`)).toEqual({ kind: "invalid" });
    }
    expect(parseLink("/?creator=Hello%20World")).toEqual({
      kind: "name",
      name: "Hello World",
    });
    expect(parseLink("/?list=%%%")).toEqual({ kind: "invalid" });
    expect(safeURL("javascript:alert(1)")).toBeUndefined();
  });
});
describe("real catalog search", () => {
  it("uses the same alphabetical order for equally relevant text results and fandom selection", () => {
    const names = [
      "~La Creatura~",
      "Zebra",
      "alpha",
      ".png",
      "Éclair",
      "7ikanz",
    ];
    const fandom = {
      id: 1,
      name: "HoYoverse",
      kind: "company",
      parentId: null,
      alternateNames: [],
    };
    const fixture = new Catalog(
      {
        ...snapshot.catalog,
        exhibitors: names.map((name, index) => ({
          ...snapshot.catalog.exhibitors[0],
          id: index + 1,
          name,
          fandomIds: [fandom.id],
        })),
      },
      { schemaVersion: "1.0", fandoms: [fandom] },
    );
    const selected = fixture.search("", fandom.id).map((c) => c.name);
    expect(fixture.search("hoyoverse").map((c) => c.name)).toEqual(selected);
    expect(fixture.creators.map((c) => c.name)).toEqual(selected);
    expect(selected.indexOf("~La Creatura~")).toBeGreaterThan(
      selected.indexOf("Zebra"),
    );
  });
  it("indexes all source creators and normalizes zero-padded booths", () => {
    expect(catalog.creators.length).toBe(snapshot.catalog.exhibitors.length);
    const c = catalog.creators.find((c) =>
      c.booths.some((b) => /^[A-Z]-0\d/.test(b)),
    )!;
    const booth = c.booths.find((b) => /^[A-Z]-0\d/.test(b))!;
    expect(catalog.search(boothKey(booth))).toContain(c);
  });
  it("finds an exact creator before weak matches", () => {
    const c = catalog.creators.find((c) => c.name === "Sky")!;
    expect(catalog.search("Sky")[0]).toBe(c);
  });
  it("searches fandom aliases and includes descendants", () => {
    const f = [...catalog.fandoms.values()].find(
      (f) => f.name === "Honkai: Star Rail",
    )!;
    expect(catalog.fandomMatches("hsr").some((m) => m.fandom.id === f.id)).toBe(
      true,
    );
    const parent = [...catalog.fandoms.values()].find(
      (f) => f.name === "HoYoverse",
    )!;
    expect(catalog.search(parent.name, parent.id).length).toBeGreaterThan(
      catalog.search(f.name, f.id).length,
    );
    for (const pills of [
      catalog.suggestions("hoyoverse"),
      catalog.suggestions("", parent.id),
    ]) {
      expect(pills[0].id).toBe(parent.id);
      expect(pills.map((p) => p.name)).toContain("Genshin Impact");
      expect(pills.map((p) => p.id)).toContain(f.id);
      expect(new Set(pills.map((p) => p.id)).size).toBe(pills.length);
    }
    expect(
      catalog.suggestions("hoyoverse", f.id).map((p) => p.id),
    ).not.toContain(parent.id);
  });
  it("handles punctuation-only queries without returning the entire catalog", () => {
    expect(catalog.search("---")).toEqual([]);
    expect(fuzzyScore("abc", "Alphabet Bot Club")).toBeGreaterThan(0.7);
  });
});
describe("map and gesture behavior", () => {
  it("hits actual booth centers and rejects blank space", () => {
    const index = new SpatialIndex(snapshot.map.features);
    const f = snapshot.map.features.find((f) => f.kind === "booth")!,
      g = f.geometry;
    expect(index.hit(g.x + g.width / 2, g.y + g.height / 2)?.id).toBe(f.id);
    expect(index.hit(-100, -100)).toBeUndefined();
  });
  it("keeps the world point beneath the pinch anchor unchanged", () => {
    const before = { x: -300, y: 40, scale: 0.8 };
    const after = zoomAt(before, 200, 150, 2);
    expect((200 - after.x) / after.scale).toBe((200 - before.x) / before.scale);
    expect((150 - after.y) / after.scale).toBe((150 - before.y) / before.scale);
  });
  it("focuses above the mobile sheet and fits multi-booth groups", () => {
    const booths = snapshot.map.features
      .filter((f) => f.kind === "booth")
      .slice(0, 3);
    const t = focusTransform(
      booths,
      390,
      844,
      referenceSize(snapshot.map),
      true,
    )!;
    expect(t.scale).toBeGreaterThanOrEqual(0.45);
    expect(Number.isFinite(t.x + t.y)).toBe(true);
  });
  it("matches sheet detents, velocity snaps and short-screen safe areas", () => {
    expect(searchCollapsed(844, 34)).toBeCloseTo(166 / 844);
    expect(searchCollapsed(400, 34)).toBe(0.24);
    expect(snapExtent(0.5, -600, [0.28, 0.56, 0.94])).toBe(0.56);
    expect(snapExtent(0.8, 600, [0.28, 0.56, 0.94])).toBe(0.56);
    expect(snapExtent(0.91, 0, [0.28, 0.56, 0.94])).toBe(0.94);
  });
});
describe("snapshots and recommendations", () => {
  it("validates bundled data and rejects corrupt or partial replacements", () => {
    expect(validSnapshot(snapshot)).toBe(true);
    expect(validSnapshot({ ...snapshot, registry: null })).toBe(false);
    expect(
      validSnapshot({
        ...snapshot,
        map: { ...snapshot.map, bounds: { width: Infinity, height: 5 } },
      }),
    ).toBe(false);
  });
  it("uses explicit interests and excludes favorites", () => {
    const f = [...catalog.fandoms.values()].find(
      (f) => f.name === "Honkai: Star Rail",
    )!;
    const profile = recordFandom(emptyProfile(), f.id);
    const favorite = catalog.search(f.name, f.id)[0];
    const result = recommend(
      catalog,
      profile,
      new Set([favorite.id]),
      snapshot.proximity,
      20,
    );
    expect(result).toHaveLength(20);
    expect(result.some((c) => c.id === favorite.id)).toBe(false);
    expect(result[0].fandomIds).toContain(f.id);
    expect(
      recommend(catalog, emptyProfile(), new Set(), snapshot.proximity),
    ).toEqual([]);
  });
});
