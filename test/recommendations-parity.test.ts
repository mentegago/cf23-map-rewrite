import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Catalog } from "../src/domain/search";

import {
  emptyProfile,
  rankRecommendations,
  rankedInterestedFandoms,
  recordFandom,
  recordInteraction,
  type RecommendationSource,
} from "../src/domain/recommendations";
import type { Profile } from "../src/domain/types";
const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/recommendations.json", import.meta.url),
    "utf8",
  ),
);
const catalog = new Catalog(fixture.catalog, fixture.registry);
describe("Dart scoring parity with the stronger gallery bonus", () => {
  it("gives one image and many images the same 0.3 bonus", () => {
    const source = fixture.catalog.exhibitors[0];
    const data = new Catalog(
      {
        ...fixture.catalog,
        exhibitors: [0, 1, 5].map((count, index) => ({
          ...source,
          id: index + 1,
          fandomIds: [3],
          spaces: [],
          assets: {
            gallery: Array.from({ length: count }, (_, i) => `${i}.jpg`),
          },
        })),
      },
      fixture.registry,
    );
    const now = 1800000000000;
    const results = rankRecommendations(
      data,
      recordFandom(emptyProfile(), 3, now),
      new Set(),
      fixture.proximity,
      3,
      new Set(),
      now,
    );
    const scores = new Map(results.map((r) => [r.creator.id, r.score]));
    expect(scores.get(2)! - scores.get(1)!).toBeCloseTo(0.3, 12);
    expect(scores.get(3)).toBe(scores.get(2));
    expect(results.slice(0, 2).map((r) => r.creator.id)).toEqual([2, 3]);
  });
  it("uses native randomness while retaining the top two and unique eligible results", () => {
    const sample = fixture.cases[0];
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const calculate = () =>
        rankRecommendations(
          catalog,
          sample.profile,
          new Set<number>(sample.favorites),
          fixture.proximity,
          20,
          new Set<number>(sample.previousIds),
          sample.now,
        ).map((r) => r.creator.id);
      const first = calculate();
      expect(random).toHaveBeenCalledTimes(18);
      random.mockReturnValue(0.999999);
      const second = calculate();
      expect(first.slice(0, 2)).toEqual(second.slice(0, 2));
      expect(first).not.toEqual(second);
      expect(new Set(second).size).toBe(20);
      expect(second.some((id) => sample.favorites.includes(id))).toBe(false);
    } finally {
      random.mockRestore();
    }
  });
  for (const sample of fixture.cases)
    it(`matches Dart scores, limit ${sample.limit}, signal ${sample.signalId ?? "mixed"}`, () => {
      const actual = rankRecommendations(
        catalog,
        sample.profile,
        new Set<number>(sample.favorites),
        fixture.proximity,
        sample.limit,
        new Set<number>(sample.previousIds),
        sample.now,
      );
      if (sample.limit === 100)
        for (const r of actual) {
          const expected = sample.expected.find(
            (v: { id: number }) => v.id === r.creator.id,
          );
          expect(r.score, `creator ${r.creator.id}`).toBeCloseTo(
            expected.score +
              (r.creator.assets.gallery.length ? 0.3 - 0.035 : 0),
            12,
          );
          expect(r.matching, `creator ${r.creator.id}`).toEqual(
            expected.matching,
          );
        }
      expect(actual.map((r) => r.creator.id).sort((a, b) => a - b)).toEqual(
        sample.expected
          .map((r: { id: number }) => r.id)
          .sort((a: number, b: number) => a - b),
      );
      expect(
        rankedInterestedFandoms(
          catalog,
          sample.profile,
          new Set<number>(sample.favorites),
          sample.now,
        ).map((f) => f.name),
      ).toEqual(sample.homeFandoms);
    });
  it("matches Dart on the bundled production catalog", () => {
    const read = (name: string) =>
      JSON.parse(
        readFileSync(
          new URL(`../public/data/${name}.json`, import.meta.url),
          "utf8",
        ),
      );
    const sample = fixture.real;
    const actual = rankRecommendations(
      new Catalog(read("catalog-initial"), read("fandoms-initial")),
      sample.profile,
      new Set<number>(sample.favorites),
      read("booth-proximity"),
      read("catalog-initial").exhibitors.length,
      new Set(),
      sample.now,
    );
    const byId = new Map(actual.map((r) => [r.creator.id, r]));
    for (const expected of sample.expected) {
      const result = byId.get(expected.id)!;
      expect(result.score).toBeCloseTo(
        expected.score +
          (result.creator.assets.gallery.length ? 0.3 - 0.035 : 0),
        12,
      );
    }
  });
});
describe("Flutter interaction rules", () => {
  const now = 1800000000000;
  it("uses source weights and ignores map/random opens", () => {
    const weights: [RecommendationSource, number, number][] = [
      ["deeplink", 2.5, 0.3],
      ["search_result", 2, 0.2],
      ["list", 1.5, 0.1],
      ["custom_list", 1, 0.1],
      ["recommendation", 0.5, 0.1],
      ["favorites", 0.5, 1],
    ];
    for (const [source, strength, consideration] of weights) {
      const p = recordInteraction(
        emptyProfile(),
        1,
        "open",
        undefined,
        source,
        now,
      );
      expect(p.creator_interactions[1]).toMatchObject({
        open_strength: strength,
        consideration,
        deliberate_open_count: 1,
      });
      expect(
        recordInteraction(p, 1, "open", undefined, source, now + 1000),
      ).toBe(p);
      expect(
        recordInteraction(p, 1, "open", undefined, source, now + 1800000)
          .creator_interactions[1].deliberate_open_count,
      ).toBe(2);
    }
    const p = emptyProfile();
    expect(recordInteraction(p, 1, "open", undefined, "map", now)).toBe(p);
    expect(recordInteraction(p, 1, "open", undefined, "random", now)).toBe(p);
  });
  it("caps engagement and restores consideration after removing favorites", () => {
    let p: Profile = emptyProfile();
    p = recordInteraction(p, 1, "favorite", true, "list", now);
    p = recordInteraction(p, 1, "favorite", false, "list", now);
    expect(p.creator_interactions[1].consideration).toBe(0);
    for (const [action, consideration, field, cap] of [
      ["gallery", 0.5, "sample_work_views", 3],
      ["link", 0.6, "external_link_clicks", 2],
      ["share", 0.7, "shares", 2],
    ] as const) {
      for (let i = 0; i < 6; i++)
        p = recordInteraction(p, 1, action, undefined, "list", now);
      expect(p.creator_interactions[1][field]).toBe(cap);
      p = recordInteraction(p, 1, "favorite", true, "list", now);
      p = recordInteraction(p, 1, "favorite", false, "list", now);
      expect(p.creator_interactions[1].consideration).toBe(consideration);
    }
    p = recordFandom(p, 3, now);
    expect(p.explicit_fandom_signals[3].strength).toBe(5);
    for (let i = 0; i < 8; i++) p = recordFandom(p, 3, now);
    expect(p.explicit_fandom_signals[3].strength).toBe(20);
  });
});
