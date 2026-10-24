import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const catalog = JSON.parse(
  readFileSync("public/data/catalog-initial.json", "utf8"),
);
const creator = catalog.exhibitors.find(
  (c: any) => c.assets.gallery.length > 2 && c.assets.thumbnail,
);
test("circle artwork interpolates and gallery pages follow a drag before settling", async ({
  page,
}, info) => {
  await page.route("https://cf23-config.nnt.gg/**", (r) => r.abort());
  await page.route("https://**/*", async (r) => {
    if (r.request().resourceType() === "image")
      await r.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="1000"><rect width="700" height="1000" fill="#70e2ee"/><circle cx="350" cy="400" r="180" fill="#ff3d8d"/></svg>',
      });
    else await r.abort();
  });
  await page.goto(`/?creator_id=${creator.id}`);
  await expect(
    page.getByRole("heading", { name: creator.name, exact: true }),
  ).toBeVisible();
  if (info.project.name === "mobile")
    await page
      .getByRole("button", { name: "Expand panel", exact: true })
      .click();
  const cut = page.locator(".circle-cut");
  await expect
    .poll(() => cut.evaluate((el) => el.clientWidth / el.clientHeight))
    .toBeCloseTo(2, 1);
  await page
    .getByRole("button", { name: "Expand Circle Cut", exact: true })
    .click();
  expect(await cut.evaluate((el) => el.getAnimations().length)).toBeGreaterThan(
    0,
  );
  await expect
    .poll(() => cut.evaluate((el) => el.clientWidth / el.clientHeight))
    .toBeCloseTo(0.7, 1);
  await page
    .getByRole("button", { name: "Collapse Circle Cut", exact: true })
    .click();
  await expect
    .poll(() => cut.evaluate((el) => el.clientWidth / el.clientHeight))
    .toBeCloseTo(2, 1);
  await page.getByRole("button", { name: "Catalog", exact: true }).click();
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
  const stage = page.locator(".gallery-stage");
  const box = (await stage.boundingBox())!;
  const x = box.x + box.width * 0.7,
    y = box.y + box.height * 0.5;
  const touch =
    info.project.name === "mobile"
      ? await page.context().newCDPSession(page)
      : null;
  if (touch) {
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 1, x, y }],
    });
    for (let i = 1; i <= 8; i++)
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ id: 1, x: x - (box.width * 0.65 * i) / 8, y }],
      });
  } else {
    await page.mouse.move(x, y);
    await page.mouse.wheel(box.width * 0.65, 0);
  }
  await expect
    .poll(() => stage.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(box.width * 0.2);
  if (touch)
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  await expect(
    page
      .getByRole("dialog")
      .getByText(`2 / ${creator.assets.gallery.length}`, { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next image" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByText(`3 / ${creator.assets.gallery.length}`, { exact: true }),
  ).toBeVisible();
  if (touch) {
    const height = await page.locator("#app").evaluate((el) => el.clientHeight);
    await touch.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
    await expect.poll(() => page.evaluate(() => visualViewport!.scale)).toBe(2);
    expect(await page.locator("#app").evaluate((el) => el.clientHeight)).toBe(
      height,
    );
    await touch.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  }
  await page.getByRole("button", { name: "Close gallery" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Close creator details",
    })
    .click();
  if (info.project.name === "mobile") {
    await expect(page.locator(".detail-presence.exiting")).toHaveCount(1);
    await expect(page.locator(".detail-presence")).toHaveCount(0);
  }
  await expect(page.getByRole("textbox")).toBeVisible();
});
