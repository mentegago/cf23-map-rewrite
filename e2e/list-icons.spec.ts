import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
test.use({ serviceWorkers: "block" });
const source = JSON.parse(
  readFileSync("public/data/catalog-initial.json", "utf8"),
);
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1sAAAAASUVORK5CYII=",
  "base64",
);
test("list icons load lazily, retain the booth badge, and fall back on errors or old catalogs", async ({
  page,
}, info) => {
  await page.route("https://**/*", (route) => route.abort());
  const exhibitors = source.exhibitors.slice(0, 3).map((c: any, i: number) => ({
    ...c,
    name: `Icon test ${i}`,
    assets: {
      ...c.assets,
      ...(i < 2 ? { icon: `https://icons.example/${i}.png` } : {}),
    },
  }));
  await page.route("**/data/catalog-initial.json", (route) =>
    route.fulfill({ json: { ...source, exhibitors } }),
  );
  await page.route("https://icons.example/0.png", (route) =>
    route.fulfill({ contentType: "image/png", body: pixel }),
  );
  await page.route("https://icons.example/1.png", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.goto("/");
  if (info.project.name === "mobile")
    await page
      .getByRole("button", { name: "Expand panel", exact: true })
      .click();
  const avatars = page.locator(".directory .booth-avatar");
  await expect(avatars).toHaveCount(3);
  await expect(avatars.nth(0)).toHaveClass(/has-icon/);
  await expect(avatars.nth(0).locator("img")).toHaveAttribute(
    "loading",
    "lazy",
  );
  await expect(avatars.nth(0).locator(".booth-section-badge")).toBeVisible();
  await expect(avatars.nth(1).locator("img")).toHaveCount(0);
  await expect(avatars.nth(1)).not.toHaveClass(/has-icon/);
  await expect(avatars.nth(2).locator("img")).toHaveCount(0);
  const before = await avatars.nth(0).boundingBox();
  const fallback = await avatars.nth(1).boundingBox();
  expect(before!.width).toBe(fallback!.width);
  expect(before!.height).toBe(fallback!.height);
  await page.screenshot({ path: info.outputPath("list-icons.png") });
});
