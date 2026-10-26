import { test, expect } from "@playwright/test";

test("detail content scrolls natively and a new swipe at the top collapses repeatedly", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "mobile");
  await page.route("https://**/*", (r) => r.abort());
  await page.goto("/?creator_id=1000436");
  const sheet = page.getByRole("region", { name: "Creator details" });
  const content = page.locator(".detail-scroll");
  const extent = () =>
    sheet.evaluate(
      (el) =>
        el.getBoundingClientRect().height /
        document.getElementById("app")!.clientHeight,
    );
  const client = await context.newCDPSession(page);
  const settle = async () => {
    let previous = -1,
      stable = 0;
    await expect
      .poll(
        async () => {
          const top = await content.evaluate((el) => el.scrollTop);
          stable = Math.abs(top - previous) < 0.5 ? stable + 1 : 0;
          previous = top;
          return stable;
        },
        { intervals: [100] },
      )
      .toBeGreaterThanOrEqual(3);
  };
  const drag = async (x: number, y: number, distance: number) => {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 1, x, y }],
    });
    for (let i = 1; i <= 12; i++)
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ id: 1, x, y: y + (distance * i) / 12 }],
      });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  };
  for (let cycle = 0; cycle < 2; cycle++) {
    await sheet
      .getByRole("button", { name: "Expand panel", exact: true })
      .tap();
    await expect.poll(extent).toBeCloseTo(0.94, 2);
    const box = (await content.boundingBox())!;
    const x = box.x + box.width / 2;
    // Start below the floating detail actions; those buttons are not the scroller.
    const scrollStartY = box.y + 90;
    expect(
      await page.evaluate(
        ({ x, y }) => !!document.elementFromPoint(x, y)?.closest("button"),
        { x, y: scrollStartY },
      ),
    ).toBe(false);
    await drag(x, box.y + box.height - 30, -180);
    await expect
      .poll(() => content.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(50);
    await settle();
    for (
      let n = 0;
      n < 15 && (await content.evaluate((el) => el.scrollTop)) > 1;
      n++
    ) {
      await drag(x, scrollStartY, 400);
      await settle();
      await expect.poll(extent).toBeCloseTo(0.94, 2);
    }
    await expect
      .poll(() => content.evaluate((el) => el.scrollTop))
      .toBeLessThanOrEqual(1);
    await drag(x, scrollStartY, 430);
    await expect.poll(extent).toBeCloseTo(0.28, 2);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(sheet).not.toHaveClass(/dragging/);
  }
  await page.getByRole("button", { name: "Close creator details" }).tap();
  await expect(sheet).toHaveCount(0);
});
