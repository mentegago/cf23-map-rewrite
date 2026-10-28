import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createBoothMatcher, formatBooths } from "../src/domain/booths";
import { Catalog } from "../src/domain/search";
import { SearchTracking } from "../src/domain/searchTracking";

const read = (name: string) =>
  JSON.parse(readFileSync(`public/data/${name}.json`, "utf8"));
const catalog = new Catalog(read("catalog-initial"), read("fandoms-initial"));

it.each(["AC03", "ac-03", "AC3", "AC 003"])(
  "ranks exact table %s ahead of longer booth prefixes",
  (query) => {
    const exact = catalog.creators.filter((c) =>
      c.booths.some((b) => createBoothMatcher("AC03")(b) === "exact"),
    );
    expect(exact.length).toBeGreaterThan(0);
    expect(catalog.search(query).slice(0, exact.length)).toEqual(exact);
    expect(createBoothMatcher(query)("AC-30")).toBe("prefix");
    expect(createBoothMatcher(query)("A-03")).toBeUndefined();
  },
);

it("matches either half of an ab query without matching other tables or suffixes", () => {
  const match = createBoothMatcher("f47ab");
  for (const code of ["F-47a", "F-47b", "f047ab"])
    expect(match(code)).toBe("exact");
  for (const code of ["F-470a", "F-48b", "AF-47a", "F-47"])
    expect(match(code)).toBeUndefined();
  expect(createBoothMatcher("F47a")("F-47b")).toBeUndefined();
  const expected = catalog.creators.filter((c) =>
    c.booths.some((b) => match(b) === "exact"),
  );
  expect(expected.length).toBeGreaterThan(0);
  expect(catalog.search("F47ab").slice(0, expected.length)).toEqual(expected);
});

it("compacts paired halves in first-appearance order without changing source codes", () => {
  const codes = ["K-28a", "K-28b", "K-29a", "K-29b"];
  expect(formatBooths(codes)).toBe("K-28ab, K-29ab");
  expect(codes).toHaveLength(4);
  expect(formatBooths(["K-28b", "K-29a", "K-28a", "K-28a"], " / ")).toBe(
    "K-28ab / K-29a",
  );
  expect(formatBooths(["ac03", "F-47ab", "F-47a", "1401", "Unknown"])).toBe(
    "AC-03, F-47ab, 1401, Unknown",
  );
  expect(formatBooths([])).toBe("");
});

it("classifies compact split-table searches as booth searches without fandom attribution", () => {
  const send = vi.fn();
  const tracking = new SearchTracking(
    send,
    () => ({ catalog, scope: "full_catalog", origin: "full_catalog" }),
    vi.fn(),
  );
  for (const query of ["AC03", "F47ab"]) tracking.submit(query);
  const events = send.mock.calls.filter(
    ([name]) => name === "search_performed",
  );
  expect(events).toHaveLength(2);
  for (const [, event] of events) {
    expect(event.resolution).toBe("booth");
    expect(event).not.toHaveProperty("fandom_id");
  }
});
