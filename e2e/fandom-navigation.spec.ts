import { test, expect } from "@playwright/test";

test("desktop fandom arrows browse both directions and reset with new results", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop");
  await page.route("https://**/*", (r) => r.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const strip = page.locator(".suggestions");
  const previous = page.getByRole("button", {
    name: "Previous fandoms",
    exact: true,
  });
  const next = page.getByRole("button", { name: "More fandoms", exact: true });
  await expect(next).toBeVisible();
  await expect(previous).not.toBeVisible();
  await next.click();
  await expect
    .poll(() => strip.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(100);
  await expect(previous).toBeVisible();
  await previous.click();
  await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBe(0);
  for (let i = 0; i < 30 && (await next.isVisible()); i++) await next.click();
  await expect(next).not.toBeVisible();
  await expect(previous).toBeVisible();
  expect(
    await strip.evaluate((el) =>
      Math.abs(el.scrollWidth - el.clientWidth - el.scrollLeft),
    ),
  ).toBeLessThan(2);
  await page.getByRole("textbox").fill("Genshin");
  await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBe(0);
  await expect(previous).not.toBeVisible();
  await expect(next).not.toBeVisible();
  await strip
    .getByRole("button", { name: "Genshin Impact", exact: true })
    .click();
  await expect(page.getByRole("textbox")).toHaveValue("Genshin Impact");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(previous).not.toBeVisible();
  await expect(next).not.toBeVisible();
});
