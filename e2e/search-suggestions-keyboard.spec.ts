import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test("fandom suggestions dock above the keyboard and return on dismissal", async ({
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
  await input.fill("genshin");
  const floating = page.locator(".keyboard-suggestions");
  const resize = async (height: number, scale = 1) => {
    await page.evaluate(
      ({ height, scale }) => {
        Object.defineProperty(visualViewport, "height", {
          configurable: true,
          value: height,
        });
        Object.defineProperty(visualViewport, "scale", {
          configurable: true,
          value: scale,
        });
        visualViewport!.dispatchEvent(new Event("resize"));
      },
      { height, scale },
    );
  };
  const fullHeight = await page.evaluate(() => innerHeight);
  const headerStrip = page.locator(".header-suggestions .suggestions");
  const floatingStrip = floating.locator(".suggestions");
  await page.evaluate(() => document.fonts.ready);
  await expect(
    headerStrip.getByRole("button", { name: "Genshiken", exact: true }),
  ).toBeVisible();
  await headerStrip.evaluate((el) => {
    el.scrollLeft = 8;
    el.dispatchEvent(new Event("scroll"));
  });
  await expect.poll(() => headerStrip.evaluate((el) => el.scrollLeft)).toBe(8);
  await expect(floating).toBeHidden();
  await resize(fullHeight - 60);
  await expect(floating).toBeHidden();
  await resize(400, 2);
  await expect(floating).toBeHidden();
  await resize(400);
  await expect(floating).toBeVisible();
  await expect
    .poll(() => floatingStrip.evaluate((el) => el.scrollLeft))
    .toBe(8);
  await floatingStrip.evaluate((el) => {
    el.scrollLeft = 12;
    el.dispatchEvent(new Event("scroll"));
  });
  await resize(fullHeight);
  await expect.poll(() => headerStrip.evaluate((el) => el.scrollLeft)).toBe(12);
  await resize(400);
  await expect
    .poll(() => floatingStrip.evaluate((el) => el.scrollLeft))
    .toBe(12);
  await expect(page.locator(".header-suggestions")).toBeHidden();
  await expect(input).toBeFocused();
  await expect(floating.getByRole("button", { name: "Favorites" })).toHaveCount(
    0,
  );
  await page.waitForTimeout(250);
  const bounds = (await floating.boundingBox())!;
  expect(bounds.y + bounds.height).toBeCloseTo(392, 0);
  await page.screenshot({ path: info.outputPath("keyboard-suggestions.png") });
  await input.fill("no-such-fandom-xyz");
  await expect(floating).toBeHidden();
  await input.fill("genshin");
  await expect(floating).toBeVisible();
  await expect
    .poll(() => floatingStrip.evaluate((el) => el.scrollLeft))
    .toBe(0);
  await resize(fullHeight);
  await expect(floating).toBeHidden();
  await expect(page.locator(".header-suggestions")).toBeVisible();
  await resize(400);
  await floating
    .getByRole("button", { name: "Genshin Impact", exact: true })
    .tap();
  await expect(page).toHaveURL(/fandom=/);
  await expect(floating).toBeHidden();
  await expect(page.locator(".header-suggestions")).toBeVisible();
  await input.fill("");
  await resize(400);
  const favorites = floating.getByRole("button", {
    name: "Favorites",
    exact: true,
  });
  await expect(favorites).toBeVisible();
  await expect(favorites).toHaveText("Favorites 1");
  await favorites.tap();
  await expect(
    page.getByRole("button", { name: "Close favorites" }),
  ).toBeVisible();
  await expect(floating).toBeHidden();
});
