import { test, expect } from "@playwright/test";

// Playwright hides native scrollbars by default in headless runs.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test("desktop fandoms use native scrolling and reset with new results", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop");
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/");
  const strip = page.getByRole("group", { name: "Creator filters" });
  await expect(strip).toBeVisible();
  await expect(strip).toHaveCSS("scrollbar-width", "auto");
  await expect(
    page.getByRole("button", { name: "More fandoms", exact: true }),
  ).toHaveCount(0);
  const searchLeft = await page
    .locator(".search-box")
    .evaluate((el) => el.getBoundingClientRect().left);
  const firstLeft = await strip
    .getByRole("button")
    .first()
    .evaluate((el) => el.getBoundingClientRect().left);
  expect(Math.abs(firstLeft - searchLeft)).toBeLessThan(1);
  const edges = await strip.evaluate((el) => {
    const strip = el.getBoundingClientRect();
    const header = el.closest(".search-header")!.getBoundingClientRect();
    return {
      left: strip.left - header.left,
      right: header.right - strip.right,
    };
  });
  expect(Math.abs(edges.left)).toBeLessThan(1);
  expect(Math.abs(edges.right)).toBeLessThan(1);
  const thumbColor = () =>
    strip.evaluate(
      (el) => getComputedStyle(el, "::-webkit-scrollbar-thumb").backgroundColor,
    );
  await expect.poll(thumbColor).toBe("rgba(0, 0, 0, 0)");
  await strip.hover();
  await expect.poll(thumbColor).not.toBe("rgba(0, 0, 0, 0)");
  const box = (await strip.boundingBox())!;
  const thumbWidth = await strip.evaluate(
    (el) => (el.clientWidth * el.clientWidth) / el.scrollWidth,
  );
  await page.mouse.move(box.x + thumbWidth / 2, box.y + box.height - 3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 3, {
    steps: 8,
  });
  await page.mouse.up();
  await expect
    .poll(() => strip.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(100);
  await page.mouse.move(0, 0);
  await page.getByRole("textbox").focus();
  await expect.poll(thumbColor).toBe("rgba(0, 0, 0, 0)");
  await strip.focus();
  await strip.evaluate((el) => {
    el.dataset.scrolling = "true";
    el.addEventListener("scrollend", () => delete el.dataset.scrolling, {
      once: true,
    });
  });
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => strip.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
  await expect(strip).not.toHaveAttribute("data-scrolling");
  await page.getByRole("textbox").fill("Genshin");
  await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBe(0);
  await strip
    .getByRole("button", { name: "Genshin Impact", exact: true })
    .click();
  await expect(page.getByRole("textbox")).toHaveValue("Genshin Impact");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(strip).toHaveCSS("scrollbar-width", "none");
});

test("vertical wheel scrolls fandoms while horizontal gestures stay native", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop");
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/");
  const strip = page.getByRole("group", { name: "Creator filters" });
  await strip.hover();
  await page.mouse.wheel(0, 120);
  await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBe(120);
  await page.mouse.wheel(80, 0);
  await expect
    .poll(() => strip.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(120);
  // Synthetic wheel dispatch tests cancellation without invoking browser defaults.
  const result = await strip.evaluate((el) => {
    const dispatch = (options: WheelEventInit) => {
      const event = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        ...options,
      });
      const before = el.scrollLeft;
      el.dispatchEvent(event);
      return {
        cancelled: event.defaultPrevented,
        change: el.scrollLeft - before,
      };
    };
    el.scrollLeft = 100;
    const horizontal = dispatch({ deltaX: 50, deltaY: 0 });
    const diagonal = dispatch({ deltaX: 2, deltaY: 100 });
    const zoom = dispatch({ deltaY: 100, ctrlKey: true });
    const shift = dispatch({ deltaY: 100, shiftKey: true });
    const lines = dispatch({ deltaY: 3, deltaMode: WheelEvent.DOM_DELTA_LINE });
    el.scrollLeft = el.scrollWidth;
    const end = dispatch({ deltaY: 100 });
    el.scrollLeft = 0;
    const start = dispatch({ deltaY: -100 });
    return { horizontal, diagonal, zoom, shift, lines, end, start };
  });
  for (const key of [
    "horizontal",
    "diagonal",
    "zoom",
    "shift",
    "end",
    "start",
  ] as const)
    expect(result[key]).toEqual({ cancelled: false, change: 0 });
  expect(result.lines).toEqual({ cancelled: true, change: 48 });
});
