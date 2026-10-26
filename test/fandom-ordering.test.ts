import { describe, expect, it } from "vitest";
import {
  fandomRanks,
  orderCreatorFandoms,
  searchFandomRanks,
} from "../src/domain/fandomOrdering";
import { Catalog } from "../src/domain/search";
import {
  emptyProfile,
  rankRecommendations,
  recordFandom,
} from "../src/domain/recommendations";
import type { Fandom } from "../src/domain/types";

const fandoms: Fandom[] = ["Original", "Alpha", "Zelda", "Persona", "Beta"].map(
  (name, i) => ({
    id: i + 1,
    name,
    kind: "franchise",
    parentId: null,
    alternateNames: [],
  }),
);
const names = (items: Fandom[]) => items.map((f) => f.name);
const interests = fandomRanks([4, 3]);
const registry = {
  schemaVersion: "1.0",
  fandoms: [
    ...fandoms,
    {
      id: 6,
      name: "Publisher",
      kind: "publisher_umbrella",
      parentId: null,
      alternateNames: ["Studio"],
    },
    {
      id: 7,
      name: "Child game",
      kind: "franchise",
      parentId: 6,
      alternateNames: [],
    },
  ],
};
const catalog = new Catalog(
  {
    schemaVersion: "1.0",
    event: { id: "test", name: "Test", days: [] },
    exhibitors: [
      {
        id: 1,
        name: "Unrelated creator name",
        catalogUrl: null,
        spaces: [],
        attendanceDates: [],
        offerings: [],
        links: [],
        assets: { gallery: [] },
        fandomIds: registry.fandoms.map((f) => f.id),
      },
    ],
  },
  registry,
);

describe("creator row fandom ordering", () => {
  it("puts recommendation reasons before interests, then alphabetical without duplicates", () => {
    const input = [...fandoms, fandoms[2]];
    expect(
      names(
        orderCreatorFandoms(input, {
          priority: fandomRanks([3, 2, 3]),
          interests,
        }),
      ),
    ).toEqual(["Zelda", "Alpha", "Persona", "Beta", "Original"]);
    expect(input).toHaveLength(6);
  });
  it("puts Original before interests only for the all-creators mode", () => {
    expect(
      names(orderCreatorFandoms(fandoms, { originalFirst: true, interests })),
    ).toEqual(["Original", "Persona", "Zelda", "Alpha", "Beta"]);
    expect(names(orderCreatorFandoms(fandoms))).toEqual([
      "Alpha",
      "Beta",
      "Original",
      "Persona",
      "Zelda",
    ]);
  });
  it("uses search match relevance ahead of interests and falls back for name-only matches", () => {
    expect(
      names(
        orderCreatorFandoms(fandoms, {
          priority: searchFandomRanks(catalog, "zel"),
          interests,
        }),
      ),
    ).toEqual(["Zelda", "Persona", "Alpha", "Beta", "Original"]);
    expect(
      names(
        orderCreatorFandoms(fandoms, {
          priority: searchFandomRanks(catalog, "Unrelated creator name"),
          interests,
        }),
      ),
    ).toEqual(["Persona", "Zelda", "Alpha", "Beta", "Original"]);
  });
  it("recognizes aliases and descendants for both text and ID search without adding absent tags", () => {
    const child = registry.fandoms.find((f) => f.id === 7)!;
    for (const priority of [
      searchFandomRanks(catalog, "Studio"),
      searchFandomRanks(catalog, "", 6),
    ]) {
      expect(
        names(
          orderCreatorFandoms([...fandoms, child], { priority, interests }),
        ),
      ).toEqual([
        "Child game",
        "Persona",
        "Zelda",
        "Alpha",
        "Beta",
        "Original",
      ]);
    }
    expect(searchFandomRanks(catalog, "", 999).size).toBe(0);
  });
  it("retains the scoring engine's ordered reason IDs", () => {
    const now = 1800000000000;
    const result = rankRecommendations(
      catalog,
      recordFandom(emptyProfile(), 3, now),
      new Set(),
      { schema_version: 1, booths: [], neighbors: [] },
      1,
      new Set(),
      now,
    )[0];
    expect(result.matchingIds).toEqual([3]);
    expect(
      result.matchingIds.map((id) => catalog.fandoms.get(id)!.name),
    ).toEqual(result.matching);
    expect(
      orderCreatorFandoms(result.creator.fandoms, {
        priority: fandomRanks(result.matchingIds),
        interests,
      })[0].name,
    ).toBe("Zelda");
  });
});
