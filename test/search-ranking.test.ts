import { expect, it } from "vitest";
import { Catalog } from "../src/domain/search";
import type { CatalogDocument, RegistryDocument } from "../src/domain/types";

function fixture(names: string[], fandomName: string, aliases: string[] = []) {
  const registry: RegistryDocument = {
    schemaVersion: "1.0",
    fandoms: [
      {
        id: 1,
        name: fandomName,
        alternateNames: aliases,
        kind: "work",
        parentId: null,
      },
    ],
  };
  const document: CatalogDocument = {
    schemaVersion: "1.0",
    event: { id: "test", name: "Test", days: [] },
    exhibitors: names.map((name, id) => ({
      id,
      name,
      catalogUrl: null,
      spaces: [],
      attendanceDates: [],
      offerings: [],
      links: [],
      assets: { gallery: [] },
      fandomIds: id === 0 ? [1] : [],
    })),
  };
  return new Catalog(document, registry);
}

it("prioritizes full creator words over exact fandoms without changing fandom selection", () => {
  const catalog = fixture(
    ["A seller", "Yorushika Indonesia", "Yorushika"],
    "Yorushika",
  );
  expect(catalog.search("yorushika").map((c) => c.name)).toEqual([
    "Yorushika",
    "Yorushika Indonesia",
    "A seller",
  ]);
  expect(catalog.search("", 1).map((c) => c.name)).toEqual(["A seller"]);
});

it("prioritizes Muse Indonesia over partial or fuzzy fandom matches", () => {
  const catalog = fixture(
    ["Haluminium", "Muse Indonesia", "Museum Club"],
    "Uma Musume: Pretty Derby",
    ["Uma Museum"],
  );
  expect(catalog.search("Muse").map((c) => c.name)).toEqual([
    "Muse Indonesia",
    "Museum Club",
    "Haluminium",
  ]);
});

it("keeps exact fandom names and aliases above incomplete creator matches", () => {
  const catalog = fixture(["Z seller", "Umami", "Kumakuma"], "Uma Musume", [
    "uma",
  ]);
  expect(catalog.search("uma").map((c) => c.name)).toEqual([
    "Z seller",
    "Umami",
    "Kumakuma",
  ]);
});

it("ranks prefixes by matched-word coverage, not total creator name length", () => {
  const catalog = fixture(
    ["Seller", "A Yorushikaverse", "Z Yorushika Indonesia Community"],
    "Other",
  );
  expect(catalog.search("yorushi").map((c) => c.name)).toEqual([
    "Z Yorushika Indonesia Community",
    "A Yorushikaverse",
  ]);
});

it("ranks inside-word matches by coverage while keeping word prefixes ahead", () => {
  const catalog = fixture(
    ["Seller", "A Amusement", "Z Amuse", "Museum"],
    "Other",
  );
  expect(catalog.search("muse").map((c) => c.name)).toEqual([
    "Museum",
    "Z Amuse",
    "A Amusement",
  ]);
});

it("matches complete and partial phrases across punctuation without promoting scattered words", () => {
  const catalog = fixture(
    ["Seller", "Blue-Moon Studio", "Blue Moondust", "Blue Art Moon"],
    "Blue Moon",
  );
  const results = catalog.search("blue moon").map((c) => c.name);
  expect(results.slice(0, 3)).toEqual([
    "Blue-Moon Studio",
    "Seller",
    "Blue Moondust",
  ]);
  expect(catalog.search("blue moo")[0].name).toBe("Blue-Moon Studio");
});
