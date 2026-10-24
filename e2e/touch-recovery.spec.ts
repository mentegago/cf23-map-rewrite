import { test, expect } from "@playwright/test";

for (const target of ["Expand Circle Cut", "Add to favorites"]) {
  test(`swiping up over ${target} expands the sheet without activating it`, async ({
    page,
    context,
  }, info) => {
    test.skip(info.project.name !== "mobile");
    await page.route("https://**/*", (r) => r.abort());
    await page.goto("/?creator_id=1000436");
    const sheet = page.getByRole("region", { name: "Creator details" });
    await expect
      .poll(() =>
        sheet.evaluate(
          (el) =>
            el.getAnimations().filter((a) => a.playState === "running").length,
        ),
      )
      .toBe(0);
    const button = page.getByRole("button", { name: target, exact: true });
    const box = (await button.boundingBox())!;
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    const client = await context.newCDPSession(page);
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 1, x, y }],
    });
    for (let i = 1; i <= 8; i++)
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ id: 1, x, y: y - i * 20 }],
      });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(() =>
        sheet.evaluate((el) => el.getBoundingClientRect().height / innerHeight),
      )
      .toBeCloseTo(0.94, 2);
    await expect(button).toBeVisible();
    expect(
      await page.locator(".detail-scroll").evaluate((el) => el.scrollTop),
    ).toBe(0);
  });
}
test("native content scrolling recovers and close works after scrolling settles", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "mobile");
  await page.route("https://cf23-config.nnt.gg/**", (r) => r.abort());
  await page.route("https://**/*", (r) => r.abort());
  await page.goto("/?creator_id=1000436");
  await page.getByRole("button", { name: "Expand panel", exact: true }).click();
  const sheet = page.getByRole("region", { name: "Creator details" });
  await expect
    .poll(() =>
      sheet.evaluate((el) => el.getBoundingClientRect().height / innerHeight),
    )
    .toBeCloseTo(0.94, 2);
  await expect
    .poll(() =>
      sheet.evaluate(
        (el) =>
          el.getAnimations().filter((a) => a.playState === "running").length,
      ),
    )
    .toBe(0);
  const client = await context.newCDPSession(page);
  expect(await page.locator("#app").evaluate((el) => el.scrollTop)).toBe(0);
  const touch = (
    type: string,
    touchPoints: { id: number; x: number; y: number }[],
  ) => client.send("Input.dispatchTouchEvent", { type, touchPoints });
  await touch("touchStart", [{ id: 1, x: 180, y: 650 }]);
  for (let i = 1; i <= 8; i++)
    await touch("touchMove", [{ id: 1, x: 180, y: 650 - i * 35 }]);
  await touch("touchCancel", []);
  await expect
    .poll(() => page.locator(".detail-scroll").evaluate((el) => el.scrollTop))
    .toBeGreaterThan(50);
  const before = await page
    .locator(".detail-scroll")
    .evaluate((el) => el.scrollTop);
  // A new gesture must immediately work after cancellation, in either direction.
  await touch("touchStart", [{ id: 1, x: 180, y: 300 }]);
  for (let i = 1; i <= 5; i++)
    await touch("touchMove", [{ id: 1, x: 180, y: 300 + i * 20 }]);
  await expect
    .poll(() => page.locator(".detail-scroll").evaluate((el) => el.scrollTop))
    .toBeLessThan(before - 30);
  const settled = page.locator(".detail-scroll").evaluate(
    (el) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 2000);
        el.addEventListener(
          "scrollend",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      }),
  );
  await touch("touchEnd", []);
  await settled;
  await page.getByRole("button", { name: "Close creator details" }).tap();
  await expect(sheet).toHaveCount(0);
});

test("detail content expands the sheet first and scrolls natively on the next swipe", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "mobile");
  await page.route("https://**/*", (r) => r.abort());
  await page.goto("/?creator_id=1000436");
  const sheet = page.getByRole("region", { name: "Creator details" });
  await expect
    .poll(() =>
      sheet.evaluate(
        (el) =>
          el.getAnimations().filter((a) => a.playState === "running").length,
      ),
    )
    .toBe(0);
  await expect
    .poll(() =>
      sheet.evaluate((el) => el.getBoundingClientRect().height / innerHeight),
    )
    .toBeCloseTo(0.56, 2);
  const content = page.locator(".detail-scroll");
  expect(
    await content.evaluate((el) => getComputedStyle(el).touchAction),
  ).toContain("pan-y");
  const box = (await content.boundingBox())!;
  const client = await context.newCDPSession(page);
  const x = box.x + box.width / 2,
    y = box.y + box.height - 40;
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id: 1, x, y }],
  });
  for (let i = 1; i <= 8; i++)
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ id: 1, x, y: y - i * 20 }],
    });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect(await content.evaluate((el) => el.scrollTop)).toBe(0);
  await expect
    .poll(() =>
      sheet.evaluate((el) => el.getBoundingClientRect().height / innerHeight),
    )
    .toBeCloseTo(0.94, 2);
  expect(await sheet.evaluate((el) => el.classList.contains("dragging"))).toBe(
    false,
  );
  const expanded = (await content.boundingBox())!;
  const nextY = expanded.y + expanded.height - 40;
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id: 1, x, y: nextY }],
  });
  for (let i = 1; i <= 8; i++)
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ id: 1, x, y: nextY - i * 20 }],
    });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(() => content.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(50);
  expect(
    await sheet.evaluate(
      (el) => el.getBoundingClientRect().height / innerHeight,
    ),
  ).toBeCloseTo(0.94, 2);
});
