import { test, expect } from "@playwright/test";

test("search list fades during snapping and follows sheet drag progress", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "mobile");
  await page.route("https://**/*", (r) => r.abort());
  await page.goto("/");
  const list = page.getByTestId("directory");
  const sheet = page.getByRole("region", { name: "Creator directory" });
  const opacity = () =>
    list.evaluate((el) => Number(getComputedStyle(el).opacity));
  await expect.poll(opacity).toBe(0);
  // Sample every frame so we verify interpolation, not only the endpoints.
  const sampleSnap = () =>
    sheet.evaluate(async (el) => {
      (el.querySelector(".grip") as HTMLButtonElement).click();
      const samples: number[] = [];
      const start = performance.now();
      while (performance.now() - start < 400) {
        await new Promise(requestAnimationFrame);
        samples.push(
          Number(getComputedStyle(el.querySelector(".directory")!).opacity),
        );
      }
      return samples;
    });
  expect((await sampleSnap()).some((n) => n > 0.05 && n < 0.95)).toBe(true);
  await expect.poll(opacity).toBe(1);
  expect((await sampleSnap()).some((n) => n > 0.05 && n < 0.95)).toBe(true);
  await expect.poll(opacity).toBe(0);
  const box = (await sheet.boundingBox())!;
  const client = await context.newCDPSession(page);
  const x = box.x + box.width / 2,
    y = box.y + 14;
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id: 1, x, y }],
  });
  for (let i = 1; i <= 6; i++)
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ id: 1, x, y: y - i * 35 }],
    });
  const progress = await sheet.evaluate((el) => {
    const collapsed = Number(
      getComputedStyle(el).getPropertyValue("--collapsed-extent"),
    );
    const extent =
      el.getBoundingClientRect().height /
      document.getElementById("app")!.clientHeight;
    return (extent - collapsed) / (0.94 - collapsed);
  });
  expect(progress).toBeGreaterThan(0.1);
  expect(progress).toBeLessThan(0.9);
  expect(await opacity()).toBeCloseTo(progress, 2);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
});
