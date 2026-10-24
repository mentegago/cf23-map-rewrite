import { test, expect } from "@playwright/test";

test("native search scrolling reaches the top before a new swipe can collapse the sheet", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "mobile");
  await page.route("https://**/*", (r) => r.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Expand panel", exact: true }).tap();
  const sheet = page.getByRole("region", { name: "Creator directory" });
  const content = page.getByTestId("directory");
  const extent = () =>
    sheet.evaluate((el) => el.getBoundingClientRect().height / innerHeight);
  await expect.poll(extent).toBeCloseTo(0.94, 2);
  await expect
    .poll(() => sheet.evaluate((el) => el.getAnimations().length))
    .toBe(0);
  const box = (await content.boundingBox())!;
  const x = box.x + box.width / 2;
  const client = await context.newCDPSession(page);
  const touch = (type: string, y?: number) =>
    client.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: y === undefined ? [] : [{ id: 1, x, y }],
    });
  const drag = async (y: number, dy: number, end = "touchEnd") => {
    await touch("touchStart", y);
    for (let i = 1; i <= 12; i++) await touch("touchMove", y + (dy * i) / 12);
    await touch(end);
  };
  // Native upward scroll from the very top; cancellation avoids fling timing.
  await drag(box.y + box.height - 30, -180, "touchCancel");
  await expect
    .poll(() => content.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(80);
  await expect.poll(extent).toBeCloseTo(0.94, 2);
  // This swipe starts away from the top and continues well past reaching it.
  await drag(box.y + 30, 400, "touchCancel");
  await expect.poll(() => content.evaluate((el) => el.scrollTop)).toBe(0);
  await expect.poll(extent).toBeCloseTo(0.94, 2);
  await expect(sheet).not.toHaveClass(/dragging/);
  // Only a fresh downward swipe at the top collapses.
  await drag(box.y + 30, 400);
  await expect.poll(extent).toBeLessThan(0.3);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
  await expect(page.getByRole("textbox")).not.toBeFocused();

  // Reopen, cancel a short sheet drag, then verify native scrolling recovers.
  await page.getByRole("button", { name: "Expand panel", exact: true }).tap();
  await expect.poll(extent).toBeCloseTo(0.94, 2);
  await drag(box.y + 30, 60, "touchCancel");
  await expect(sheet).not.toHaveClass(/dragging/);
  await expect.poll(extent).toBeCloseTo(0.94, 2);
  await drag(box.y + box.height - 30, -180, "touchCancel");
  await expect
    .poll(() => content.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(80);
  await expect.poll(extent).toBeCloseTo(0.94, 2);

  // Repeat with actual touchEnd/momentum, not only the cancellation path above.
  const settleScroll = async () => {
    let previous = -1;
    let stable = 0;
    await expect
      .poll(
        async () => {
          const top = await content.evaluate((el) => el.scrollTop);
          stable = Math.abs(top - previous) < 0.5 ? stable + 1 : 0;
          previous = top;
          return stable;
        },
        { intervals: [100], timeout: 10000 },
      )
      .toBeGreaterThanOrEqual(3);
  };
  for (let cycle = 0; cycle < 3; cycle++) {
    await settleScroll();
    for (
      let attempt = 0;
      attempt < 15 && (await content.evaluate((el) => el.scrollTop)) > 1;
      attempt++
    ) {
      await drag(box.y + 30, 400);
      await settleScroll();
      await expect.poll(extent).toBeCloseTo(0.94, 2);
    }
    await expect
      .poll(() => content.evaluate((el) => el.scrollTop))
      .toBeLessThanOrEqual(1);
    await drag(box.y + 30, 400);
    await expect.poll(extent).toBeLessThan(0.3);
    await page.getByRole("button", { name: "Expand panel", exact: true }).tap();
    await expect.poll(extent).toBeCloseTo(0.94, 2);
    await drag(box.y + box.height - 30, -180);
    await expect
      .poll(() => content.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(80);
  }
});
