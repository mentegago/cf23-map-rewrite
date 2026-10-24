import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { Catalog, boothKey } from "../src/domain/search";
import { focusTransform, referenceSize } from "../src/map/geometry";
import type { MapDocument } from "../src/domain/types";

const read = (name: string) =>
  JSON.parse(readFileSync(`public/data/${name}.json`, "utf8"));
const catalog = new Catalog(read("catalog-initial"), read("fandoms-initial"));
const map: MapDocument = read("map");
const [key, creators] = [...catalog.byBooth].find(
  ([key, creators]) =>
    creators.length === 2 &&
    creators[0].day !== creators[1].day &&
    creators.some((c) => c.assets.gallery.length > 0) &&
    creators[0].booths.join() === creators[1].booths.join() &&
    map.features.some(
      (f) => f.kind === "booth" && boothKey(f.id || "") === key,
    ),
)!;
const feature = map.features.find(
  (f) => f.kind === "booth" && boothKey(f.id || "") === key,
)!;

async function prepare(page: Page, mobile: boolean) {
  await page.route("https://**/*", (r) => r.abort());
  await page.goto(`/?creator_id=${creators[0].id}`);
  await expect(
    page.getByRole("heading", { name: creators[0].name, exact: true }),
  ).toBeVisible();
  // Wait for the map's deliberate focus flight, then use its public geometry.
  await page.waitForTimeout(800);
  const canvas = page.locator("canvas");
  const box = (await canvas.boundingBox())!;
  const ids = new Set(creators[0].booths.map(boothKey));
  const features = map.features.filter(
    (f) =>
      f.kind === "booth" &&
      f.status !== "suggestion" &&
      ids.has(boothKey(f.id || "")),
  );
  const t = focusTransform(
    features,
    box.width,
    box.height,
    referenceSize(map),
    mobile,
  )!;
  const position = {
    x: t.x + (feature.geometry.x + feature.geometry.width / 2) * t.scale,
    y: t.y + (feature.geometry.y + feature.geometry.height / 2) * t.scale,
  };
  const open = () =>
    mobile ? canvas.tap({ position }) : canvas.click({ position });
  return { open };
}

test("live search restricts a shared booth to the matching creator", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop");
  const { open } = await prepare(page, false);
  await page
    .getByRole("button", { name: "Back to directory", exact: true })
    .click();
  await page.getByRole("textbox").fill(creators[0].name);
  await page.waitForTimeout(250);
  await open();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: creators[0].name, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to directory", exact: true })
    .click();
  await page.getByRole("textbox").fill("zzzzzz-no-match");
  await page.waitForTimeout(250);
  await open();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: creators[0].name, exact: true }),
  ).toHaveCount(0);
});

test("shared booth opens repeatedly and each day's creator can be selected", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { open } = await prepare(page, info.project.name === "mobile");
  const popup = page.getByRole("dialog", {
    name: `Creators at booth ${feature.id}`,
  });
  for (const creator of [...creators, creators[0]]) {
    await open();
    await expect(popup).toBeVisible();
    await popup
      .getByRole("button", {
        name: new RegExp(creator.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      })
      .first()
      .click();
    await expect(popup).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: creator.name, exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`creator_id=${creator.id}`));
    await page.waitForTimeout(800);
  }
  expect(errors).toEqual([]);
});

test("popup is centered, animates, traps focus and dismisses only on a fresh backdrop tap", async ({
  page,
}, info) => {
  const mobile = info.project.name === "mobile";
  const { open } = await prepare(page, mobile);
  const popup = page.getByRole("dialog");
  await open();
  await expect(popup).toBeVisible();
  await expect(popup).toHaveCSS("animation-name", "popup-in");
  if (!mobile)
    await expect(
      popup.getByRole("button", { name: "Close booth selector" }),
    ).toBeFocused();
  await expect
    .poll(() =>
      popup.evaluate(
        (el) =>
          el.getAnimations().filter((a) => a.playState === "running").length,
      ),
    )
    .toBe(0);
  const box = (await popup.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(
    2,
  );
  expect(await popup.evaluate((el) => el.matches(":modal"))).toBe(true);
  await page.keyboard.press("Tab");
  expect(
    await popup.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  // Padding inside the dialog is not the backdrop.
  await popup.click({ position: { x: 8, y: 8 } });
  await expect(popup).toBeVisible();
  if (mobile) await page.touchscreen.tap(4, 4);
  else await page.mouse.click(4, 4);
  await expect(popup).toHaveClass(/closing/);
  await expect(popup).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: creators[0].name, exact: true }),
  ).toBeVisible();
  await open();
  await expect(popup).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: creators[0].name, exact: true }),
  ).toBeVisible();
});

test("reduced-motion popup opens and closes without animation", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { open } = await prepare(page, info.project.name === "mobile");
  await open();
  const popup = page.getByRole("dialog");
  await expect(popup).toBeVisible();
  await expect(popup).toHaveCSS("animation-name", "none");
  await popup.getByRole("button", { name: "Close booth selector" }).click();
  await expect(popup).toHaveCount(0);
});

test("catalog shortcut hands off between native modals without leaving the page inert", async ({
  page,
}, info) => {
  const { open } = await prepare(page, info.project.name === "mobile");
  await open();
  const creator = creators.find((c) => c.assets.gallery.length > 0)!;
  const popup = page.getByRole("dialog", {
    name: `Creators at booth ${feature.id}`,
  });
  await popup
    .getByRole("button", { name: `View ${creator.name} catalog`, exact: true })
    .click();
  await expect(popup).toHaveCount(0);
  const gallery = page.getByRole("dialog", {
    name: `${creator.name} catalog`,
    exact: true,
  });
  await expect(gallery).toBeVisible();
  await gallery.getByRole("button", { name: "Close gallery" }).click();
  await expect(gallery).toHaveCount(0);
  await open();
  await expect(popup).toBeVisible();
  await popup.getByRole("button", { name: "Close booth selector" }).click();
  await expect(popup).toHaveCount(0);
});
