import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const catalog = JSON.parse(
  readFileSync("public/data/catalog-initial.json", "utf8"),
);
const longest = [...catalog.exhibitors].sort(
  (a, b) => b.name.length - a.name.length,
)[0];

test("brand fonts load locally, long names wrap, and typography survives offline reload", async ({
  page,
  context,
}, info) => {
  await page.route("https://**/*", (route) => route.abort());
  if (info.project.name === "mobile")
    await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(`/?creator_id=${longest.id}`);
  const heading = page.getByRole("heading", {
    name: longest.name,
    exact: true,
  });
  await expect(heading).toBeVisible();
  const loadFonts = () =>
    page.evaluate(async () => {
      const faces = await Promise.all([
        document.fonts.load('400 16px "Plus Jakarta Sans"'),
        document.fonts.load('800 26px "Plus Jakarta Sans"'),
        document.fonts.load('italic 400 16px "Plus Jakarta Sans"'),
      ]);
      return faces.every(
        (group) =>
          group.length > 0 && group.every((face) => face.status === "loaded"),
      );
    });
  expect(await loadFonts()).toBe(true);
  await expect(heading).toHaveCSS("font-weight", "800");
  await expect(heading).toHaveCSS("font-family", /Plus Jakarta Sans/);
  expect(
    await heading.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  const input = page.getByRole("textbox", {
    name: "Search name, booth, or fandom",
    includeHidden: true,
  });
  if (info.project.name === "mobile")
    await expect(input).toHaveCSS("font-size", "16px");
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  expect(
    await page.evaluate(async () => {
      const cache = await caches.match(
        new URL("fonts/PlusJakartaSans-Variable.woff2", location.href),
        { ignoreSearch: true },
      );
      return !!cache && cache.ok;
    }),
  ).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(heading).toBeVisible();
  expect(await loadFonts()).toBe(true);
});
