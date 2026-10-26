import { test, expect } from "@playwright/test";

test("collapsed search focus remains visible through keyboard resize and viewport pan", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile");
  await page.route("https://**/*", (r) => r.abort());
  await page.goto("/");
  const input = page.getByRole("textbox");
  const sheet = page.getByRole("region", { name: "Creator directory" });
  await expect(sheet).toHaveClass(/collapsed/);
  await input.tap();
  await expect(input).toBeFocused();
  // Chromium does not display a software keyboard. Model its separate visual
  // viewport resize/pan events explicitly, including pan without another resize.
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, "height", {
      configurable: true,
      value: 300,
    });
    Object.defineProperty(visualViewport, "offsetTop", {
      configurable: true,
      value: 150,
    });
    visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect
    .poll(() => page.locator("#app").evaluate((el) => el.clientHeight))
    .toBe(300);
  await expect
    .poll(() => sheet.evaluate((el) => el.getBoundingClientRect().height))
    .toBeCloseTo(282, 0);
  for (const offset of [150, 240, 0]) {
    await page.evaluate((offset) => {
      Object.defineProperty(visualViewport, "offsetTop", {
        configurable: true,
        value: offset,
      });
      visualViewport!.dispatchEvent(new Event("scroll"));
    }, offset);
    const box = (await input.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(offset);
    expect(box.y + box.height).toBeLessThanOrEqual(offset + 300);
    // Viewport compensation belongs only to the app, never html/body.
    expect(
      await page
        .locator("body")
        .evaluate((el) => el.getBoundingClientRect().top),
    ).toBe(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    // Even programmatic focus scrolling cannot displace the sheet header.
    expect(
      await sheet.evaluate((el) => {
        el.scrollTop = 100;
        return el.scrollTop;
      }),
    ).toBe(0);
    await expect(input).toBeFocused();
  }
  await input.fill("Honkai");
  await expect(input).toHaveValue("Honkai");
  // Model an outer document scroll independently from visual-viewport panning.
  // Temporarily create a scroll range since Chromium has no iOS keyboard gap.
  const displacedScroll = await page.evaluate(() => {
    document.documentElement.style.overflow = "auto";
    document.documentElement.style.height = "200vh";
    window.scrollTo(0, 120);
    return window.scrollY;
  });
  expect(displacedScroll).toBe(120);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(input).toBeFocused();
  await page.evaluate(() => {
    document.documentElement.style.removeProperty("overflow");
    document.documentElement.style.removeProperty("height");
  });
  await input.press("Tab");
  await page.evaluate(() => {
    delete (visualViewport as unknown as Record<string, unknown>).height;
    delete (visualViewport as unknown as Record<string, unknown>).offsetTop;
    visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect
    .poll(() =>
      page.locator("#app").evaluate((el) => el.getBoundingClientRect().top),
    )
    .toBe(0);
});

for (const safeBottom of [0, 34]) {
  test(`search close preserves collapsed height with a ${safeBottom}px safe area`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "mobile");
    await page.route("https://**/*", (route) => route.abort());
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "standalone", {
        value: true,
        configurable: true,
      });
    });
    await page.goto("/");
    // Supply the resolved iOS safe-area padding, which Chromium cannot emulate.
    await page.addStyleTag({
      content: `.search-sheet { padding-bottom: ${safeBottom}px !important; }`,
    });
    const sheet = page.getByRole("region", { name: "Creator directory" });
    const expectedHeight = await page
      .locator("#app")
      .evaluate(
        (el, safe) =>
          Math.max(0.16, Math.min(0.24, (132 + safe) / el.clientHeight)) *
          el.clientHeight,
        safeBottom,
      );
    for (const keyboard of [false, true]) {
      await page.getByRole("textbox").tap();
      await expect(sheet).not.toHaveClass(/collapsed/);
      if (keyboard) {
        await page.evaluate(() => {
          Object.defineProperty(visualViewport, "height", {
            configurable: true,
            value: 350,
          });
          visualViewport!.dispatchEvent(new Event("resize"));
        });
      }
      await page
        .getByRole("button", { name: "Clear and close search", exact: true })
        .tap();
      if (keyboard) {
        await page.evaluate(() => {
          delete (visualViewport as unknown as Record<string, unknown>).height;
          visualViewport!.dispatchEvent(new Event("resize"));
        });
      }
      await expect(sheet).toHaveClass(/collapsed/);
      await expect
        .poll(() => sheet.evaluate((el) => el.getBoundingClientRect().height))
        .toBeCloseTo(expectedHeight, 0);
      await page
        .getByRole("button", { name: "Expand panel", exact: true })
        .tap();
      await page
        .getByRole("button", { name: "Collapse panel", exact: true })
        .tap();
      await expect
        .poll(() => sheet.evaluate((el) => el.getBoundingClientRect().height))
        .toBeCloseTo(expectedHeight, 0);
    }
  });
}
