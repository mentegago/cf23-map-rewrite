import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
const schema = JSON.parse(
  readFileSync("test/fixtures/analytics_event_schema.json", "utf8"),
);

const catalog = JSON.parse(
  readFileSync("public/data/catalog-initial.json", "utf8"),
);
const creator = catalog.exhibitors.find(
  (c: any) => c.assets.gallery.length > 1,
);

test("bulk bookmarks share an operation ID and clipboard failure reports the actual outcome", async ({
  page,
}) => {
  test.skip(
    !process.env.ANALYTICS_E2E,
    "Requires the isolated analytics test build",
  );
  const events: { name?: string; data: Record<string, any> }[] = [];
  await page.route("https://**/*", (r) => r.abort());
  await page.route("https://analytics.invalid/api/send", async (r) => {
    events.push(r.request().postDataJSON().payload);
    await r.fulfill({ contentType: "application/json", body: "{}" });
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(Error("Denied")) },
    });
    document.execCommand = () => false;
  });
  const ids = catalog.exhibitors.slice(0, 2).map((c: any) => c.id);
  await page.goto(`/?custom_list=${ids.join(",")}`);
  const expand = page.getByRole("button", {
    name: "Expand panel",
    exact: true,
  });
  await expect(page.getByRole("textbox")).toBeVisible();
  if (await expand.isVisible()) await expand.click();
  await page.getByRole("button", { name: "Add All to Favorites" }).click();
  const named = (name: string) =>
    events.filter((e) => e.name === name).map((e) => e.data);
  await expect.poll(() => named("favorites_action").length).toBe(1);
  const bulk = named("favorites_action")[0];
  expect(bulk).toMatchObject({
    action: "bulk_add",
    requested: 2,
    added: 2,
    skipped: 0,
    failed: 0,
    success: true,
  });
  expect(named("bookmark_changed")).toHaveLength(2);
  for (const bookmark of named("bookmark_changed"))
    expect(bookmark.operation_id).toBe(bulk.operation_id);
  await page.getByRole("button", { name: "Favorites", exact: true }).click();
  await page
    .getByRole("button", { name: "Share Favorites", exact: true })
    .click();
  await expect
    .poll(() => named("favorites_action").at(-1)?.action)
    .toBe("share");
  expect(named("favorites_action").at(-1)).toMatchObject({
    success: false,
    count: 2,
  });
  expect(named("operation_failed")).toContainEqual(
    expect.objectContaining({ operation: "clipboard", code: "unavailable" }),
  );
  const validate = new Ajv2020({ strict: false }).compile(schema);
  for (const e of events.filter((e) => e.name))
    expect(
      validate({ name: e.name, data: e.data }),
      JSON.stringify(validate.errors),
    ).toBe(true);
});
test.use({ serviceWorkers: "block" });
test("real UI emits Flutter-compatible events with search correlation and no private query text", async ({
  page,
}, info) => {
  test.skip(
    !process.env.ANALYTICS_E2E,
    "Requires the isolated analytics test build",
  );
  const events: {
    name?: string;
    data?: Record<string, any>;
    title?: string;
    url: string;
  }[] = [];
  await page.route("https://**/*", (r) => r.abort());
  await page.route("https://analytics.invalid/api/send", async (r) => {
    events.push(r.request().postDataJSON().payload);
    await r.fulfill({
      contentType: "application/json",
      body: '{"cache":"test-session"}',
    });
  });
  await page.goto(`/?creator_id=${creator.id}`);
  await expect(
    page.getByRole("heading", { name: creator.name, exact: true }),
  ).toBeVisible();
  const named = (name: string) =>
    events.filter((e) => e.name === name).map((e) => e.data!);
  await expect.poll(() => named("app_ready").length).toBe(1);
  expect(events.filter((e) => !e.name)).toEqual([
    expect.objectContaining({ title: "CF23 Booth Map", url: "/" }),
  ]);
  await expect.poll(() => named("creator_opened")[0]?.source).toBe("deeplink");
  await expect.poll(() => named("deeplink_processed")[0]).toMatchObject({
    type: "creator_id",
    source: "initial",
    count: 1,
    success: true,
  });
  await page
    .getByRole("button", { name: "Add to favorites", exact: true })
    .click();
  await expect.poll(() => named("bookmark_changed").length).toBe(1);
  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  await expect.poll(() => named("gallery_action").length).toBe(1);
  expect(named("gallery_action")[0]).toMatchObject({
    action: "open",
    count: creator.assets.gallery.length,
  });
  await page.getByRole("button", { name: "Next image" }).click();
  await expect
    .poll(() =>
      named("gallery_action").some(
        (e) => e.action === "image_changed" && e.index === 1,
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Close gallery" }).click();
  await expect.poll(() => named("gallery_action").at(-1)?.action).toBe("close");
  await page
    .getByRole("button", {
      name: "Close creator details",
      exact: true,
    })
    .click();
  const search = page.getByRole("textbox", {
    name: "Search name, booth, or fandom",
  });
  await search.fill("Sky");
  await expect.poll(() => named("search_performed").length).toBe(1);
  await search.press("Enter");
  await page.getByRole("button", { name: /Sky.*1108/ }).click();
  await expect.poll(() => named("creator_opened").length).toBe(2);
  expect(named("search_performed")).toHaveLength(1);
  expect(named("creator_opened")[1]).toMatchObject({
    source: "search_result",
    search_id: named("search_performed")[0].search_id,
    result_position: 1,
  });
  await page
    .getByRole("button", {
      name: "Close creator details",
      exact: true,
    })
    .click();
  await search.fill("private-query-should-never-leave-browser");
  await expect.poll(() => named("search_performed").length).toBe(2);
  expect(JSON.stringify(events)).not.toContain(
    "private-query-should-never-leave-browser",
  );
  await search.fill("Genshin I");
  await expect.poll(() => named("search_performed").length).toBe(3);
  expect(named("search_performed").at(-1)).toMatchObject({
    schema_version: 2,
    resolution: "unique_prefix",
    fandom_id: 2,
    fandom_name: "Genshin Impact",
  });
  // Genshiken is in the full registry too, even if suggestions favor Genshin.
  await search.fill("Gensh");
  await expect.poll(() => named("search_performed").length).toBe(4);
  expect(named("search_performed").at(-1)).toMatchObject({
    resolution: "ambiguous",
  });
  expect(named("search_performed").at(-1)).not.toHaveProperty("fandom_id");
  expect(named("search_performed").at(-1)).not.toHaveProperty("fandom_name");
  const validate = new Ajv2020({ strict: false }).compile(schema);
  for (const e of events.filter((e) => e.name)) {
    expect(
      validate({ name: e.name, data: e.data }),
      JSON.stringify(validate.errors),
    ).toBe(true);
    expect(e.data!.app_version).toBe(100);
    expect(e.url).toBe("/");
  }
});
