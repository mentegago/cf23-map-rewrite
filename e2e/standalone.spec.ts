import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { Catalog } from "../src/domain/search";
import { encodeList } from "../src/domain/links";

const read = (name: string) =>
  JSON.parse(readFileSync(`public/data/${name}.json`, "utf8"));
const catalog = new Catalog(read("catalog-initial"), read("fandoms-initial"));
const fandom = [...catalog.fandoms.values()].find(
  (f) => f.name === "Genshin Impact",
)!;
const creator = catalog.search("", fandom.id)[0];

for (const detection of ["display-mode", "ios"] as const) {
  test(`standalone ${detection} keeps root navigation and still opens shared links`, async ({
    page,
  }) => {
    await page.route("https://**/*", (route) => route.abort());
    await page.addInitScript((mode) => {
      if (mode === "ios") {
        Object.defineProperty(navigator, "standalone", { value: true });
      } else {
        const original = window.matchMedia.bind(window);
        window.matchMedia = (query) => {
          const result = original(query);
          if (query === "(display-mode: standalone)")
            Object.defineProperty(result, "matches", { value: true });
          return result;
        };
      }
    }, detection);
    await page.goto(`/?creator_id=${creator.id}`);
    const detail = page.getByRole("region", {
      name: "Creator details",
      exact: true,
    });
    await expect(detail).toBeVisible();
    const root = new URL("/", page.url()).href;
    await expect(page).toHaveURL(root);
    const length = await page.evaluate(() => history.length);
    await page
      .getByRole("button", { name: "Close creator details", exact: true })
      .click();
    const input = page.getByRole("textbox");
    await input.fill(fandom.name);
    await page
      .getByRole("group", { name: "Creator filters" })
      .getByRole("button", { name: fandom.name, exact: true })
      .click();
    await expect(input).toHaveValue(fandom.name);
    await page.locator(".creator-select").first().click();
    await expect(detail).toBeVisible();
    await expect(page).toHaveURL(root);
    await page
      .getByRole("button", { name: "Close creator details", exact: true })
      .click();
    await input.fill(`${root}?list=${encodeList([creator.id])}`);
    await input.press("Enter");
    const list = page.getByRole("region", { name: "Booth list", exact: true });
    await expect(list).toBeVisible();
    await list.locator(".creator-select").click();
    await expect(detail).toBeVisible();
    await page
      .getByRole("button", { name: "Close creator details", exact: true })
      .click();
    await expect(list).toBeVisible();
    await expect(page).toHaveURL(root);
    expect(await page.evaluate(() => history.length)).toBe(length);
    await page.reload();
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("");
    await expect(page).toHaveURL(root);
  });
}
