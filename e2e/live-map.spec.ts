import { test, expect } from "@playwright/test";

test("live search updates booths without moving the map", async ({
  page,
}, info) => {
  await page.route("https://**/*", (route) => route.abort());
  await page.addInitScript(() => {
    const frames: { ms: number; active: number; transform: number[] }[] = [];
    Object.assign(window, { mapFrames: frames });
    let drawing = false,
      active = 0;
    const fillRect = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      if (this.canvas.classList.contains("map-canvas")) drawing = true;
      return fillRect.apply(this, args);
    };
    const stroke = CanvasRenderingContext2D.prototype.stroke;
    CanvasRenderingContext2D.prototype.stroke = function (
      ...args: [] | [Path2D]
    ) {
      if (
        this.canvas.classList.contains("map-canvas") &&
        this.lineWidth === 1.25 &&
        !["#4a4a4a", "#bdbdbd"].includes(String(this.strokeStyle))
      )
        active++;
      return args.length ? stroke.call(this, args[0]) : stroke.call(this);
    };
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback) =>
      raf.call(window, (time) => {
        drawing = false;
        active = 0;
        const start = performance.now();
        callback(time);
        if (drawing) {
          const ctx = document
            .querySelector<HTMLCanvasElement>(".map-canvas")!
            .getContext("2d")!;
          const t = ctx.getTransform();
          frames.push({
            ms: performance.now() - start,
            active,
            transform: [t.a, t.d, t.e, t.f],
          });
        }
      });
  });
  await page.goto("/");
  const input = page.getByRole("textbox");
  await expect(input).toBeVisible();
  await page
    .getByRole("button", { name: "Show entire map", exact: true })
    .click();
  await page.waitForTimeout(900);
  const latest = () =>
    page.evaluate(() =>
      (
        window as unknown as {
          mapFrames: { ms: number; active: number; transform: number[] }[];
        }
      ).mapFrames.at(-1)!,
    );
  const baseline = await latest();
  expect(baseline.active).toBeGreaterThan(0);
  await input.fill("zzzzzz-no-match");
  await expect(
    page.getByText("No creators found.", { exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await latest()).active).toBe(0);
  expect((await latest()).transform).toEqual(baseline.transform);
  await expect(
    page.getByRole("button", { name: "Show on Map", exact: true }),
  ).toHaveCount(0);
  await input.fill("");
  await expect.poll(async () => (await latest()).active).toBe(baseline.active);
  for (const query of [
    "a",
    "ar",
    "art",
    "Genshin",
    "Honkai",
    "",
    "a",
    "ar",
    "art",
    "",
  ]) {
    await input.fill(query);
    await page.waitForTimeout(200);
  }
  const durations = await page.evaluate(() =>
    (window as unknown as { mapFrames: { ms: number }[] }).mapFrames
      .slice(-10)
      .map((f) => f.ms)
      .sort((a, b) => a - b),
  );
  console.log(
    `${info.project.name} full-map JS draw: median ${durations[5].toFixed(1)} ms, max ${durations.at(-1)!.toFixed(1)} ms`,
  );
});
