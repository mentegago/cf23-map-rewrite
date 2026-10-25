import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test("fandoms and Favorites stay below search when the keyboard opens", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile");
  await page.route("https://**/*", (route) => route.abort());
  const catalog = JSON.parse(
    readFileSync("public/data/catalog-initial.json", "utf8"),
  );
  await page.addInitScript((id) => {
    localStorage.setItem(
      "flutter.favorite_creator_ids",
      JSON.stringify([String(id)]),
    );
  }, catalog.exhibitors[0].id);
  await page.goto("/");
  const input = page.getByRole("textbox", {
    name: "Search name, booth, or fandom",
  });
  const header = page.locator(".header-suggestions");
  const strip = header.locator(".suggestions");
  await input.tap();
  await expect(
    header.getByRole("button", { name: "Favorites", exact: true }),
  ).toBeVisible();
  await input.fill("genshin");
  await expect(
    header.getByRole("button", { name: "Genshiken", exact: true }),
  ).toBeVisible();
  await strip.evaluate((el) => {
    el.scrollLeft = 8;
  });
  for (const height of [400, 844, 400]) {
    await page.evaluate((height) => {
      Object.defineProperty(visualViewport, "height", {
        configurable: true,
        value: height,
      });
      visualViewport!.dispatchEvent(new Event("resize"));
    }, height);
    await expect(header).toBeVisible();
    await expect(input).toBeFocused();
    await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBe(8);
    const gap = await page.evaluate(() => {
      const field = document
        .querySelector(".search-box")!
        .getBoundingClientRect();
      const tags = document
        .querySelector(".header-suggestions .suggestions")!
        .getBoundingClientRect();
      return tags.top - field.bottom;
    });
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(40);
    await expect(
      page.getByRole("group", { name: "Creator filters" }),
    ).toHaveCount(1);
  }
  await input.fill("");
  const favorites = header.getByRole("button", {
    name: "Favorites",
    exact: true,
  });
  await expect(favorites).toHaveText("Favorites 1");
  await favorites.tap();
  await expect(
    page.getByRole("button", { name: "Close favorites" }),
  ).toBeVisible();
});
