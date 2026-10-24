import { test, expect } from "@playwright/test";

test("Pages deployment loads its assets, data, manifest and offline worker under its base path", async ({
  page,
  context,
}, info) => {
  test.skip(!process.env.PAGES_TEST_BASE || info.project.name !== "desktop");
  const base = process.env.PAGES_TEST_BASE!;
  await page.route("https://**/*", (route) => route.abort());
  await page.goto(base);
  await expect(page.getByRole("textbox")).toBeVisible();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const scope = await page.evaluate(
    async () => (await navigator.serviceWorker.ready).scope,
  );
  expect(new URL(scope).pathname).toBe(base);
  const manifestUrl = await page
    .locator('link[rel="manifest"]')
    .evaluate((el: HTMLLinkElement) => el.href);
  expect(new URL(manifestUrl).pathname).toBe(`${base}manifest.json`);
  const manifest = await (await page.request.get(manifestUrl)).json();
  expect(new URL(manifest.start_url, manifestUrl).pathname).toBe(base);
  for (const icon of manifest.icons) {
    const url = new URL(icon.src, manifestUrl);
    expect(url.pathname.startsWith(`${base}icons/`)).toBe(true);
    expect((await page.request.get(url.href)).ok()).toBe(true);
  }
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("textbox")).toBeVisible();
  await page.getByRole("textbox").fill("Sky");
  await expect(page.getByRole("button", { name: /Sky.*1108/ })).toBeVisible();
});
