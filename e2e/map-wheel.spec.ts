import { test, expect } from "@playwright/test";

test("map wheel gestures pan both axes and pinch zooms around the pointer", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop");
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/");
  const canvas = page.locator(".map-canvas");
  await expect(canvas).toBeVisible();
  await page.getByRole("button", { name: "Zoom in map", exact: true }).click();
  await page.waitForTimeout(500);
  const transform = () =>
    canvas.evaluate((el: HTMLCanvasElement) => {
      const t = el.getContext("2d")!.getTransform();
      return { scale: t.a, x: t.e, y: t.f };
    });
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width * 0.7,
    bounds.y + bounds.height * 0.4,
  );
  const initial = await transform();
  await page.mouse.wheel(30, 40);
  await expect.poll(async () => (await transform()).x).toBeLessThan(initial.x);
  await expect.poll(async () => (await transform()).y).toBeLessThan(initial.y);
  expect((await transform()).scale).toBe(initial.scale);
  const moved = await transform();
  await page.mouse.wheel(-30, -40);
  await expect.poll(async () => (await transform()).x).toBeGreaterThan(moved.x);
  await expect.poll(async () => (await transform()).y).toBeGreaterThan(moved.y);
  expect((await transform()).scale).toBe(initial.scale);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -40);
  await page.keyboard.up("Control");
  await expect
    .poll(async () => (await transform()).scale)
    .toBeGreaterThan(initial.scale);
  expect(await page.evaluate(() => visualViewport!.scale)).toBe(1);
  await expect(page.locator(".showing-detail")).toHaveCount(0);
});
