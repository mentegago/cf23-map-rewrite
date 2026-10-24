import { test, expect } from "@playwright/test";
test("touch pan, pinch, sheet drag and content scroll do not trigger accidental selection", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "mobile");
  await page.route("https://cf23-config.nnt.gg/**", (r) => r.abort());
  await page.goto("/");
  await expect(page.getByRole("textbox")).toBeVisible();
  const client = await context.newCDPSession(page);
  const touch = (
    type: string,
    points: { x: number; y: number; id: number }[],
  ) => client.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  const canvas = page.locator("canvas");
  const initial = await canvas.screenshot();
  await touch("touchStart", [{ id: 1, x: 130, y: 270 }]);
  for (let i = 1; i <= 8; i++)
    await touch("touchMove", [{ id: 1, x: 130 + i * 12, y: 270 + i * 5 }]);
  await touch("touchEnd", []);
  expect((await canvas.screenshot()).equals(initial)).toBe(false);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
  const beforePinch = await canvas.screenshot();
  await touch("touchStart", [
    { id: 1, x: 140, y: 300 },
    { id: 2, x: 240, y: 300 },
  ]);
  for (let i = 1; i <= 8; i++)
    await touch("touchMove", [
      { id: 1, x: 140 - i * 7, y: 300 },
      { id: 2, x: 240 + i * 7, y: 300 },
    ]);
  await touch("touchEnd", []);
  expect((await canvas.screenshot()).equals(beforePinch)).toBe(false);
  const sheet = page.getByRole("region", { name: "Creator directory" });
  const box = (await sheet.boundingBox())!;
  await touch("touchStart", [{ id: 1, x: 195, y: box.y + 14 }]);
  for (let i = 1; i <= 12; i++)
    await touch("touchMove", [{ id: 1, x: 195, y: box.y + 14 - i * 42 }]);
  await touch("touchEnd", []);
  await expect
    .poll(() =>
      sheet.evaluate((e) => e.getBoundingClientRect().height / innerHeight),
    )
    .toBeCloseTo(0.94, 1);
  await touch("touchStart", [{ id: 1, x: 180, y: 650 }]);
  for (let i = 1; i <= 10; i++)
    await touch("touchMove", [{ id: 1, x: 180, y: 650 - i * 35 }]);
  await touch("touchEnd", []);
  await expect
    .poll(() => page.getByTestId("directory").evaluate((e) => e.scrollTop))
    .toBeGreaterThan(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
  const scrollBefore = await page
    .getByTestId("directory")
    .evaluate((e) => e.scrollTop);
  const first = page
    .locator(".creator-select")
    .filter({ visible: true })
    .first();
  await first.click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Close creator details" }).click();
  await expect
    .poll(() => page.getByTestId("directory").evaluate((e) => e.scrollTop))
    .toBeGreaterThan(scrollBefore - 150);
});
