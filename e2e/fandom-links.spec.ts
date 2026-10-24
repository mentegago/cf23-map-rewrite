import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { Catalog } from "../src/domain/search";

const read = (name: string) =>
  JSON.parse(readFileSync(`public/data/${name}.json`, "utf8"));
const source = read("catalog-initial");
const registry = read("fandoms-initial");
const catalog = new Catalog(source, registry);
const fandom = [...catalog.fandoms.values()].find(
  (f) => f.name === "Genshin Impact",
)!;
const creators = catalog.search("", fandom.id);
const detailCreator = creators.find((c) => c.fandomIds.includes(fandom.id))!;

test("parent fandom search and selection expose child fandom pills", async ({
  page,
}) => {
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("textbox").fill("hoyoverse");
  const pills = page.getByRole("group", { name: "Creator filters" });
  const child = pills.getByRole("button", {
    name: "Genshin Impact",
    exact: true,
  });
  await expect(child).toBeAttached();
  await pills.getByRole("button", { name: "HoYoverse", exact: true }).click();
  await expect(child).toBeAttached();
  await expect(
    pills.getByRole("button", { name: "Honkai: Star Rail", exact: true }),
  ).toBeAttached();
  await child.click();
  await expect(page).toHaveURL(new RegExp(`\\?fandom=${fandom.id}$`));
  await expect(page.getByRole("textbox")).toHaveValue(fandom.name);
});

test("detail fandom tags, reload, and history retain the exact ID filter", async ({
  page,
}) => {
  await page.route("https://**/*", (route) => route.abort());
  await page.goto(`/?creator_id=${detailCreator.id}`);
  await page
    .locator(".detail-section")
    .getByRole("button", { name: fandom.name, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`\\?fandom=${fandom.id}$`));
  const input = page.getByRole("textbox");
  await expect(input).toHaveValue(fandom.name);
  await expect(
    page.getByText(`${creators.length} results`, { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(input).toHaveValue(fandom.name);
  await expect(
    page.getByText(`${creators.length} results`, { exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: detailCreator.name, exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(input).toHaveValue(fandom.name);
  await input.fill("different query");
  await expect(page).not.toHaveURL(/fandom=/);
});

test("fandom mode has one history entry and survives opening and closing a creator", async ({
  page,
}, info) => {
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/");
  const input = page.getByRole("textbox");
  await input.fill(fandom.name);
  const tag = page
    .getByRole("group", { name: "Creator filters" })
    .getByRole("button", { name: fandom.name, exact: true });
  await tag.click();
  const historyLength = await page.evaluate(() => history.length);
  await tag.click();
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await page.locator(".creator-select").first().click();
  await expect(page).toHaveURL(/creator_id=/);
  await page.reload();
  const close = "Close creator details";
  await page.getByRole("button", { name: close, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`\\?fandom=${fandom.id}$`));
  await expect(input).toHaveValue(fandom.name);
  await expect(
    page.getByText(`${creators.length} results`, { exact: true }),
  ).toBeVisible();
  await page.locator(".creator-select").first().click();
  await expect(input).toHaveCount(0);
  await page.getByRole("button", { name: close, exact: true }).click();
  await input.fill("plain text");
  await expect(page).not.toHaveURL(/fandom=|creator_id=/);
  await expect(input).toHaveValue("plain text");
});

test("selected fandom follows data updates and clears if its ID is removed", async ({
  page,
}) => {
  let version = read("last-updated-initial").creator_data_version;
  let updatedRegistry = structuredClone(registry);
  let updatedCatalog = structuredClone(source);
  await page.route("https://**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "cf23-config.nnt.gg") return route.abort();
    const body =
      url.pathname === "/manifest.json"
        ? {
            schemaVersion: "1.0",
            catalog: "catalog.json",
            fandomRegistry: "fandoms.json",
          }
        : url.pathname === "/last-updated.json"
          ? { creator_data_version: version }
          : url.pathname === "/catalog.json"
            ? updatedCatalog
            : url.pathname === "/fandoms.json"
              ? updatedRegistry
              : null;
    if (!body) return route.abort();
    await route.fulfill({ json: body });
  });
  await page.goto(`/?fandom=${fandom.id}`);
  const input = page.getByRole("textbox");
  await expect(input).toHaveValue(fandom.name);
  // Let the startup update finish before triggering the next snapshot.
  await page.waitForTimeout(1600);
  updatedRegistry.fandoms.find((f: { id: number }) => f.id === fandom.id).name =
    "Renamed fandom";
  updatedCatalog.exhibitors = updatedCatalog.exhibitors.filter(
    (c: { id: number }) => Number(c.id) !== creators[0].id,
  );
  version++;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(input).toHaveValue("Renamed fandom");
  await expect(
    page.getByText(`${creators.length - 1} results`, { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`fandom=${fandom.id}$`));
  updatedRegistry.fandoms = updatedRegistry.fandoms.filter(
    (f: { id: number }) => f.id !== fandom.id,
  );
  version++;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(input).toHaveValue("");
  await expect(page).not.toHaveURL(/fandom=/);
  await expect(
    page.getByText(
      "This fandom is no longer in the catalog. Showing all creators.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("missing fandom links recover to the directory", async ({ page }) => {
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/?fandom=9007199254740991");
  await expect(page.getByRole("textbox")).toHaveValue("");
  await expect(page).not.toHaveURL(/fandom=/);
  await expect(
    page.getByText(
      "This fandom is no longer in the catalog. Showing all creators.",
      { exact: true },
    ),
  ).toBeVisible();
});
