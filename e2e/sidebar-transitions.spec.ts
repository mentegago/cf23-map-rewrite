import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const creator = JSON.parse(
  readFileSync("public/data/catalog-initial.json", "utf8"),
).exhibitors[0];

test("desktop sidebar transitions retain outgoing content and close hover matches artwork control", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop");
  await page.route("https://**/*", (route) => route.abort());
  await page.goto(`/?creator_id=${creator.id}`);
  const close = page.getByRole("button", {
    name: "Close creator details",
    exact: true,
  });
  await close.hover();
  await close.evaluate((el) =>
    Promise.all(el.getAnimations().map((animation) => animation.finished)),
  );
  const background = await close.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  const expand = page.getByRole("button", {
    name: "Expand Circle Cut",
    exact: true,
  });
  await expand.hover();
  await expect(expand).toHaveCSS("background-color", background);
  await close.click();
  const exit = page.locator(".sidebar-detail.exiting");
  await expect(exit).toHaveCount(1);
  await expect(exit).toHaveAttribute("inert", "");
  await expect(page.getByRole("textbox")).toBeVisible();
  await expect(exit).toHaveCount(0);
  await page.locator(".directory .creator-select").first().click();
  await expect(page.locator(".sidebar-search.exiting")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(close).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await close.click();
  const duration = await page
    .locator(".sidebar-search")
    .evaluate((el) => parseFloat(getComputedStyle(el).animationDuration));
  expect(duration).toBeLessThanOrEqual(0.001);
  await expect(page.getByRole("textbox")).toBeVisible();
});
