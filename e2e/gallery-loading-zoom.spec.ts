import { test, expect, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
const catalog = JSON.parse(
  readFileSync("public/data/catalog-initial.json", "utf8"),
);
const creator = catalog.exhibitors.find(
  (c: any) =>
    c.assets.gallery.length >= 3 &&
    new Set(c.assets.gallery).size === c.assets.gallery.length,
);
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="1000"><rect width="700" height="1000" fill="#70e2ee"/></svg>';
test.use({ serviceWorkers: "block" });

test("gallery requests pages serially without navigation and continues after a failure", async ({
  page,
}) => {
  const pending = new Map<number, Route>();
  const started: number[] = [];
  await page.route("https://**/*", async (route) => {
    const index = creator.assets.gallery.indexOf(route.request().url());
    if (index >= 0) {
      started.push(index);
      pending.set(index, route);
      return;
    }
    if (route.request().resourceType() === "image")
      await route.fulfill({ contentType: "image/svg+xml", body: svg });
    else await route.abort();
  });
  await page.goto(`/?creator_id=${creator.id}`);
  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  await expect.poll(() => started).toEqual([0]);
  expect(await page.locator(".gallery-page img").count()).toBe(1);
  await pending.get(0)!.fulfill({ contentType: "image/svg+xml", body: svg });
  await expect.poll(() => started).toEqual([0, 1]);
  await pending.get(1)!.abort();
  await expect.poll(() => started).toEqual([0, 1, 2]);
  await pending.get(2)!.fulfill({ contentType: "image/svg+xml", body: svg });
  await expect(page.locator(".gallery-page").nth(2).locator("img")).toHaveClass(
    /is-ready/,
  );
  await expect(
    page.getByRole("button", { name: "Go to page 1", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Go to page 3", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Go to page 3", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("two-finger pinch zooms only the image, then native panning and paging recover", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "mobile");
  await page.route("https://**/*", async (route) => {
    if (route.request().resourceType() === "image")
      await route.fulfill({ contentType: "image/svg+xml", body: svg });
    else await route.abort();
  });
  await page.goto(`/?creator_id=${creator.id}`);
  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  const viewport = page.locator(
    '.gallery-page[aria-hidden="false"] .gallery-image-viewport',
  );
  const imageContent = viewport.locator(".gallery-image-content");
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
  const box = (await viewport.boundingBox())!;
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  const client = await context.newCDPSession(page);
  const touch = (
    type: string,
    points: { id: number; x: number; y: number }[],
  ) => client.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await touch("touchStart", [
    { id: 1, x: x - 40, y },
    { id: 2, x: x + 40, y },
  ]);
  for (let i = 1; i <= 8; i++)
    await touch("touchMove", [
      { id: 1, x: x - 40 - i * 8, y },
      { id: 2, x: x + 40 + i * 8, y },
    ]);
  await touch("touchEnd", []);
  await expect
    .poll(() => imageContent.evaluate((el) => parseFloat(el.style.width)))
    .toBeGreaterThan(200);
  expect(await page.evaluate(() => visualViewport!.scale)).toBe(1);
  const before = await viewport.evaluate((el) => el.scrollTop);
  await touch("touchStart", [{ id: 1, x, y }]);
  for (let i = 1; i <= 8; i++)
    await touch("touchMove", [{ id: 1, x, y: y - i * 15 }]);
  await touch("touchEnd", []);
  await expect
    .poll(() => viewport.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(before + 30);
  await touch("touchStart", [
    { id: 1, x: x - 104, y },
    { id: 2, x: x + 104, y },
  ]);
  for (let i = 1; i <= 8; i++)
    await touch("touchMove", [
      { id: 1, x: x - 104 + i * 8, y },
      { id: 2, x: x + 104 - i * 8, y },
    ]);
  await touch("touchEnd", []);
  await expect
    .poll(() => imageContent.evaluate((el) => parseFloat(el.style.width)))
    .toBeCloseTo(100, 1);
  await touch("touchStart", [{ id: 1, x: box.x + box.width - 40, y }]);
  for (let i = 1; i <= 10; i++)
    await touch("touchMove", [
      { id: 1, x: box.x + box.width - 40 - i * 25, y },
    ]);
  await touch("touchEnd", []);
  await expect(
    page.getByRole("button", { name: "Go to page 2", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("button", { name: "Zoom out", exact: true }),
  ).toBeDisabled();
});
