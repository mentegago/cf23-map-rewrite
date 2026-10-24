import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
test.use({ serviceWorkers: "block" });
const catalog = JSON.parse(
  readFileSync("public/data/catalog-initial.json", "utf8"),
);
const creator = catalog.exhibitors.find(
  (c: any) => c.assets.thumbnail && c.assets.gallery.length > 2,
);
test("art loaders animate, reveal decoded images, and stop on failure", async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("https://**/*", async (route) => {
    if (route.request().resourceType() !== "image") return route.abort();
    await held;
    await route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="1000"><rect width="700" height="1000" fill="#70e2ee"/></svg>',
    });
  });
  await page.goto(`/?creator_id=${creator.id}`);
  const cut = page.locator(".circle-cut");
  await expect(cut.getByRole("status")).toBeVisible();
  expect(
    await cut
      .locator(".card-front")
      .evaluate((el) =>
        el.getAnimations().some((a) => a.playState === "running"),
      ),
  ).toBe(true);
  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  const current = page.locator('.gallery-page[aria-hidden="false"]');
  await expect(current.getByRole("status")).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByRole("dialog")
        .evaluate(
          (el) =>
            el.getAnimations().filter((a) => a.playState === "running").length,
        ),
    )
    .toBe(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await current
      .locator(".card-front")
      .evaluate(
        (el) =>
          el.getAnimations().filter((a) => a.playState === "running").length,
      ),
  ).toBe(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  release();
  await expect(current.locator("img")).toHaveClass(/is-ready/);
  await expect(current.locator(".image-loading")).toBeHidden();
  await page.getByRole("button", { name: "Close gallery" }).click();
  await expect(cut.locator("img")).toHaveClass(/is-ready/);
  await expect(cut.getByRole("status")).toHaveCount(0);

  await page.unroute("https://**/*");
  await page.route("https://**/*", (route) => route.abort());
  await page.reload();
  await expect(page.locator(".art-fallback")).toBeVisible();
  await expect(cut.getByRole("status")).toHaveCount(0);
  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  await expect(
    current.getByRole("button", { name: "Retry image" }),
  ).toBeVisible();
  await expect(current.getByRole("status")).toHaveCount(0);
});
