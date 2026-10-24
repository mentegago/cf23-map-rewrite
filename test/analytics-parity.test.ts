import { APP_VERSION } from "../src/appVersion";
import { afterEach, expect, it, vi } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import { IDBFactory } from "fake-indexeddb";
import schema from "./fixtures/analytics_event_schema.json";
import {
  Analytics,
  displayName,
  recordOrder,
} from "../src/data/analyticsDelivery";
import { AnalyticsLifecycle } from "../src/data/analyticsEvents";
import { Catalog } from "../src/domain/search";
import {
  SearchTracking,
  type SearchContext,
} from "../src/domain/searchTracking";
import { eventId } from "../src/domain/eventId";
import type { CatalogDocument, RegistryDocument } from "../src/domain/types";

const registry = {
  schemaVersion: "1.0",
  fandoms: [
    {
      id: 1,
      name: "Blue Archive",
      alternateNames: ["BA", "Blue Arc"],
      parentId: null,
      kind: "work",
    },
    {
      id: 2,
      name: "No Sellers",
      alternateNames: [],
      parentId: null,
      kind: "work",
    },
    {
      id: 3,
      name: "Other",
      alternateNames: ["collision"],
      parentId: null,
      kind: "work",
    },
    {
      id: 4,
      name: "Another",
      alternateNames: ["collision"],
      parentId: null,
      kind: "work",
    },
    { id: 5, name: "東方", alternateNames: [], parentId: null, kind: "work" },
  ],
} as RegistryDocument;
const catalog = new Catalog(
  {
    schemaVersion: "1.0",
    event: { days: [] },
    exhibitors: [
      {
        id: 10,
        name: "Circle",
        spaces: [{ code: "A-01" }],
        fandomIds: [1],
        attendanceDates: [],
        assets: { gallery: [] },
        offerings: [],
        links: [],
      },
    ],
  } as unknown as CatalogDocument,
  registry,
);
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("matches Flutter's one-second search attempts, resolutions, sources, scope, and result correlation", () => {
  vi.useFakeTimers();
  const send = vi.fn();
  const context: SearchContext = {
    catalog,
    scope: "full_catalog",
    origin: "full_catalog",
  };
  const tracker = new SearchTracking(send, () => context, vi.fn());
  tracker.changed("Blue");
  vi.advanceTimersByTime(500);
  tracker.changed("Blue Archive");
  vi.advanceTimersByTime(999);
  expect(
    send.mock.calls.filter(([n]) => n === "search_performed"),
  ).toHaveLength(0);
  vi.advanceTimersByTime(1);
  const id = tracker.submit("Blue Archive");
  expect(tracker.result("Blue Archive")).toBe(id);
  tracker.select(1, "suggestion");
  expect(
    send.mock.calls.filter(([n]) => n === "search_performed"),
  ).toHaveLength(1);
  for (const query of [
    "BA",
    "collision",
    "private arbitrary text",
    "Circle",
    "A-01",
    "東方",
    "別の名前",
    "No Sellers",
  ])
    tracker.submit(query);
  tracker.submit("https://example.org/?list=abc");
  tracker.select(1, "creator_fandom_chip");
  context.scope = context.origin = "shared_list";
  tracker.submit("Blue Archive");
  const searches = send.mock.calls
    .filter(([n]) => n === "search_performed")
    .map(([, d]) => d);
  expect(searches.map((d) => d.resolution)).toEqual([
    "canonical",
    "alias",
    "ambiguous",
    "unresolved",
    "creator",
    "booth",
    "canonical",
    "unresolved",
    "canonical",
    "explicit_selection",
    "canonical",
  ]);
  expect(searches.at(-2)).toMatchObject({
    source: "creator_fandom_chip",
    trigger: "selection",
    fandom_id: 1,
  });
  expect(searches.at(-1)).toMatchObject({
    result_count: 1,
    catalog_result_count: 1,
    scope: "shared_list",
    origin_scope: "shared_list",
  });
  expect(JSON.stringify(send.mock.calls)).not.toMatch(
    /private arbitrary text|別の名前|https:\/\/example|"query"/,
  );
  tracker.reset();
});

it("matches Flutter creator lifetimes and visible UTC-minute activity deduplication", () => {
  let time = 120000,
    visible = true;
  const send = vi.fn();
  const a = new AnalyticsLifecycle(
    send,
    () => time,
    () => visible,
  );
  a.emit("search_opened", {});
  a.emit("search_opened", {});
  a.emit("creator_opened", { creator_id: 10, source: "map" });
  time += 100;
  a.emit("creator_opened", { creator_id: 10, source: "list" });
  time += 400;
  a.emit("creator_opened", { creator_id: 11, source: "recommendation" });
  time += 200;
  a.emit("creator_closed", { reason: "search_opened" });
  a.emit("creator_closed", { reason: "dismissed" });
  expect(
    send.mock.calls.filter(([n]) => n === "creator_closed").map(([, d]) => d),
  ).toEqual([
    { creator_id: 10, reason: "replaced", duration_ms: 500 },
    { creator_id: 11, reason: "search_opened", duration_ms: 200 },
  ]);
  expect(send.mock.calls.filter(([n]) => n === "search_opened")).toHaveLength(
    1,
  );
  visible = false;
  time += 60000;
  a.activity();
  expect(send.mock.calls.filter(([n]) => n === "active_minute")).toHaveLength(
    1,
  );
  visible = true;
  a.activity();
  a.activity();
  expect(send.mock.calls.filter(([n]) => n === "active_minute")).toHaveLength(
    2,
  );
});

it("delivers all 19 event types against the shared versioned schema and canonical pageview", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.stubEnv("PROD", true);
  vi.stubEnv("VITE_UMAMI_ENDPOINT", "https://analytics.invalid/api/send");
  vi.stubEnv("VITE_UMAMI_WEBSITE_ID", "test");
  vi.stubEnv("VITE_UMAMI_HOSTNAME", "test.invalid");
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("document", { visibilityState: "visible" });
  const navigator = { onLine: false, language: "en-US" };
  vi.stubGlobal("navigator", navigator);
  vi.stubGlobal("screen", { width: 100, height: 200 });
  const sent: {
    payload: {
      name?: string;
      data?: Record<string, unknown>;
      [key: string]: unknown;
    };
  }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      sent.push(JSON.parse(init.body));
      return new Response('{"cache":"session"}', { status: 200 });
    }),
  );
  const a = new Analytics();
  a.configure(catalog, 83);
  a.emit("app_ready", { duration_ms: 42, source: "cache" });
  a.emit("search_opened", {});
  a.emit("search_cleared", {});
  a.emit("search_performed", {
    search_id: eventId(),
    source: "suggestion",
    trigger: "selection",
    resolution: "explicit_selection",
    fandom_id: 1,
    result_count: 1,
    catalog_result_count: 1,
    scope: "full_catalog",
  });
  a.emit("search_closed", { reason: "creator_selected" });
  a.emit("creator_opened", {
    creator_id: 10,
    source: "search_result",
    search_id: eventId(),
    result_position: 1,
  });
  a.emit("creator_closed", { reason: "dismissed" });
  a.emit("bookmark_changed", {
    creator_id: 10,
    action: "add",
    source: "bulk",
    operation_id: eventId(),
  });
  a.emit("map_interacted", { action: "both" });
  a.emit("booth_selected", { count: 2, outcome: "chooser" });
  a.emit("list_scope_changed", {
    scope: "shared_list",
    origin_scope: "shared_list",
    count: 1,
  });
  a.emit("sheet_state_changed", {
    sheet: "detail",
    state: "partiallyExpanded",
    source: "gesture",
  });
  a.emit("creator_action", {
    creator_id: 10,
    action: "circle_cut",
    expanded: true,
    success: true,
  });
  a.emit("gallery_action", { creator_id: 10, action: "open", count: 2 });
  a.emit("favorites_action", {
    action: "bulk_add",
    success: true,
    requested: 2,
    added: 1,
    skipped: 1,
    failed: 0,
    operation_id: eventId(),
  });
  a.emit("deeplink_processed", {
    type: "creator_id",
    success: true,
    count: 1,
    source: "initial",
  });
  a.emit("update_action", { action: "shown" });
  a.emit("operation_failed", { operation: "clipboard", code: "unavailable" });
  await a.flushBeforeReload();
  navigator.onLine = true;
  await a.flushBeforeReload();
  expect(sent[0].payload).toEqual({
    website: "test",
    hostname: "test.invalid",
    referrer: "",
    language: "en-US",
    screen: "100x200",
    url: "/",
    title: "CF23 Booth Map",
  });
  const validate = new Ajv2020({ strict: false }).compile(schema);
  const domain = sent
    .slice(1)
    .map((e) => ({ name: e.payload.name, data: e.payload.data! }));
  expect(new Set(domain.map((e) => e.name)).size).toBe(19);
  for (const event of domain) {
    expect(validate(event), JSON.stringify(validate.errors)).toBe(true);
    expect(event.data.app_version).toBe(APP_VERSION);
    if (event.data.creator_id === 10)
      expect(event.data.creator_name).toBe("Circle");
    if (event.data.fandom_id === 1)
      expect(event.data.fandom_name).toBe("Blue Archive");
  }
  expect(domain.map((e) => e.data.sequence)).toEqual(
    domain.map((_, i) => i + 1),
  );
});

it("resolves unique prefixes across the entire registry, deduplicates aliases, and never assigns ambiguous IDs", () => {
  const send = vi.fn();
  const tracker = new SearchTracking(
    send,
    () => ({
      catalog,
      scope: "shared_list",
      origin: "shared_list",
    }),
    vi.fn(),
  );
  for (const query of [
    "  BLUE   AR ",
    "B",
    "No S",
    "col",
    "東",
    "Circle",
    "A-01",
    "BA",
    "Blue Archive",
  ])
    tracker.submit(query);
  const events = send.mock.calls
    .filter(([name]) => name === "search_performed")
    .map(([, data]) => data);
  expect(events.map((e) => [e.resolution, e.fandom_id])).toEqual([
    ["unique_prefix", 1],
    ["unique_prefix", 1],
    ["unique_prefix", 2],
    ["ambiguous", undefined],
    ["unique_prefix", 5],
    ["creator", undefined],
    ["booth", undefined],
    ["alias", 1],
    ["canonical", 1],
  ]);
  expect(events[0].result_count).toBe(1);
  const validate = new Ajv2020({ strict: false }).compile(schema);
  const common = {
    schema_version: 2,
    event_edition: "comic-frontier-23",
    app_version: APP_VERSION,
    client_event_id: eventId(),
    occurred_at_ms: 123,
    app_run_id: eventId(),
    sequence: 1,
  };
  for (const event of events)
    expect(
      validate({ name: "search_performed", data: { ...common, ...event } }),
      JSON.stringify(validate.errors),
    ).toBe(true);
  const prefix = {
    name: "search_performed",
    data: { ...common, ...events[0] },
  };
  expect(
    validate({ ...prefix, data: { ...prefix.data, schema_version: 1 } }),
  ).toBe(false);
  expect(
    validate({
      name: "search_performed",
      data: { ...common, ...events[3], fandom_id: 3 },
    }),
  ).toBe(false);
  expect(
    validate({
      name: "search_performed",
      data: { ...common, ...events[8], schema_version: 1 },
    }),
  ).toBe(true);
});

it("keeps Unicode labels within the server limit and same-time records in sequence", () => {
  expect(displayName("a".repeat(499) + "😀suffix")).toBe("a".repeat(499));
  const records = [3, 1, 2].map((sequence) => ({
    id: String(4 - sequence),
    created: 100,
    event: {
      type: "event" as const,
      payload: { data: { app_run_id: "run", sequence } },
    },
  }));
  expect(
    records.sort(recordOrder).map((r) => r.event.payload.data.sequence),
  ).toEqual([1, 2, 3]);
});

function deliveryHarness(memoryOnly = true) {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.stubEnv("PROD", true);
  vi.stubEnv("VITE_UMAMI_ENDPOINT", "https://analytics.invalid/api/send");
  vi.stubEnv("VITE_UMAMI_WEBSITE_ID", "test");
  vi.stubEnv("VITE_UMAMI_HOSTNAME", "test.invalid");
  vi.stubGlobal(
    "indexedDB",
    memoryOnly
      ? {
          open() {
            throw Error("Storage blocked");
          },
        }
      : new IDBFactory(),
  );
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("document", { visibilityState: "visible" });
  const navigator = { onLine: false, language: "en-US" };
  vi.stubGlobal("navigator", navigator);
  vi.stubGlobal("screen", { width: 100, height: 200 });
  const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  return { a: new Analytics(), navigator, fetch };
}

it("keeps working with blocked storage, retries transient failures, and respects backoff for new events", async () => {
  const { a, navigator, fetch } = deliveryHarness();
  await a.flushBeforeReload();
  fetch.mockResolvedValueOnce(new Response("", { status: 503 }));
  navigator.onLine = true;
  await a.flushBeforeReload();
  expect(fetch).toHaveBeenCalledTimes(1);
  a.emit("update_action", { action: "shown" });
  await a.flushBeforeReload();
  expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1300);
  await a.flushBeforeReload();
  expect(fetch).toHaveBeenCalledTimes(3);
});

it("refreshes rejected cached sessions once and drops permanent client errors without blocking later events", async () => {
  const { a, navigator, fetch } = deliveryHarness();
  fetch.mockResolvedValueOnce(
    new Response('{"cache":"session"}', { status: 200 }),
  );
  await a.flushBeforeReload();
  navigator.onLine = true;
  await a.flushBeforeReload();
  fetch.mockResolvedValueOnce(new Response("", { status: 401 }));
  a.emit("update_action", { action: "shown" });
  await a.flushBeforeReload();
  expect(
    (fetch.mock.calls as unknown as [string, RequestInit][])[1][1].headers,
  ).toHaveProperty("x-umami-cache", "session");
  fetch.mockResolvedValueOnce(new Response("", { status: 400 }));
  await vi.advanceTimersByTimeAsync(1300);
  await a.flushBeforeReload();
  expect(
    (fetch.mock.calls as unknown as [string, RequestInit][])[2][1].headers,
  ).not.toHaveProperty("x-umami-cache");
  a.emit("update_action", { action: "dismissed" });
  await a.flushBeforeReload();
  expect(fetch).toHaveBeenCalledTimes(4);
});

it("caps the persistent offline queue and honors a different tab's sender lease", async () => {
  const { a, navigator, fetch } = deliveryHarness(false);
  for (let i = 0; i < 2001; i++) a.emit("update_action", { action: "shown" });
  await a.flushBeforeReload();
  const db = await new Promise<IDBDatabase>((resolve) => {
    const r = indexedDB.open("cf23-analytics", 1);
    r.onsuccess = () => resolve(r.result);
  });
  const count = await new Promise<number>((resolve) => {
    const r = db.transaction("events").objectStore("events").count();
    r.onsuccess = () => resolve(r.result);
  });
  expect(count).toBe(2000);
  await new Promise<void>((resolve) => {
    const tx = db.transaction("leases", "readwrite");
    tx.objectStore("leases").put(
      { owner: "another-tab", until: Date.now() + 15000 },
      "sender",
    );
    tx.oncomplete = () => resolve();
  });
  navigator.onLine = true;
  await a.flushBeforeReload();
  expect(fetch).not.toHaveBeenCalled();
  db.close();
}, 15000);

it("does not let unavailable crypto break search tracking callers", () => {
  vi.stubGlobal("crypto", {
    getRandomValues() {
      throw Error("Unavailable");
    },
  });
  const tracker = new SearchTracking(
    vi.fn(),
    () => ({
      catalog,
      scope: "full_catalog",
      origin: "full_catalog",
    }),
    vi.fn(),
  );
  expect(() => tracker.submit("Circle")).not.toThrow();
});

it("preserves occurrence time and creator duration through deferred/offline delivery", async () => {
  const { a, navigator, fetch } = deliveryHarness();
  vi.setSystemTime(180000);
  a.emit(
    "creator_opened",
    { creator_id: 10, source: "map" },
    { at: 120000, visible: true },
  );
  a.emit(
    "creator_closed",
    { reason: "dismissed" },
    { at: 121500, visible: true },
  );
  a.activity({ at: 180000, visible: false });
  await a.flushBeforeReload();
  navigator.onLine = true;
  await a.flushBeforeReload();
  const payloads = (fetch.mock.calls as unknown as [string, RequestInit][]).map(
    ([, init]) => JSON.parse(String(init.body)).payload,
  );
  expect(
    payloads.find((e) => e.name === "creator_opened").data.occurred_at_ms,
  ).toBe(120000);
  expect(payloads.find((e) => e.name === "creator_closed").data).toMatchObject({
    occurred_at_ms: 121500,
    duration_ms: 1500,
  });
  expect(payloads.filter((e) => e.name === "active_minute")).toHaveLength(1);
});
