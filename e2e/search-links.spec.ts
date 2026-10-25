import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { Catalog } from "../src/domain/search";
import { encodeList } from "../src/domain/links";
const read = (name: string) =>
  JSON.parse(readFileSync(`public/data/${name}.json`, "utf8"));
const catalog = new Catalog(read("catalog-initial"), read("fandoms-initial"));
const creator = catalog.creators[0];
const ids = catalog.creators.slice(0, 3).map((c) => c.id);
const fandom = [...catalog.fandoms.values()].find(
  (f) => f.name === "Genshin Impact",
)!;

test("search previews supported links and opens them by tap or Enter", async ({
  page,
}, info) => {
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/");
  const input = page.getByRole("textbox");
  await input.fill(`https://cf23.nnt.gg/?creator_id=${creator.id}`);
  const openCreator = page.getByRole("button", {
    name: "Open creator",
    exact: true,
  });
  await expect(openCreator).toContainText(creator.name);
  await expect(page.getByText("No creators found.")).toHaveCount(0);
  await page
    .getByTestId("directory")
    .screenshot({ path: info.outputPath("creator-link-preview.png") });
  await openCreator.click();
  await expect(
    page.getByRole("heading", { name: creator.name, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close creator details", exact: true })
    .click();
  await input.fill(
    `https://cf23.nnt.gg/?creator=${encodeURIComponent(creator.name)}`,
  );
  await expect(openCreator).toContainText(creator.name);
  await input.press("Enter");
  await expect(
    page.getByRole("heading", { name: creator.name, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close creator details", exact: true })
    .click();
  await input.fill(`https://cf23.nnt.gg/?list=${encodeList(ids)}`);
  const openList = page.getByRole("button", {
    name: "Open booth list",
    exact: true,
  });
  await expect(openList).toContainText("3 creators");
  await openList.click();
  await expect(
    page.getByRole("region", { name: "Booth list", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".search-box input")).not.toBeFocused();
  await page
    .getByRole("button", { name: "Close booth list", exact: true })
    .click();
  await input.fill(`https://cf23.nnt.gg/?fandom=${fandom.id}`);
  const openFandom = page.getByRole("button", {
    name: "Open fandom",
    exact: true,
  });
  await expect(openFandom).toContainText(fandom.name);
  await openFandom.click();
  await expect(input).toHaveValue(fandom.name);
  await expect(page).toHaveURL(new RegExp(`fandom=${fandom.id}`));
  await expect(page.locator(".search-box input")).not.toBeFocused();
  for (const link of [
    "?list=%%%",
    "?creator_id=999999999",
    "?fandom=999999999",
    `?custom_list=${creator.id},999999999`,
  ]) {
    await input.fill(`https://cf23.nnt.gg/${link}`);
    await expect(page.getByText("This link isn't available")).toBeVisible();
    await expect(page.locator(".search-link-card")).toHaveCount(0);
  }
  await input.fill("genshin");
  await expect(page.getByText("This link isn't available")).toHaveCount(0);
  await expect(
    page.locator(".directory .creator-select").first(),
  ).toBeVisible();
});
