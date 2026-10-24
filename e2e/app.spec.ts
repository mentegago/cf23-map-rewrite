import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const catalog = JSON.parse(
  readFileSync("public/data/catalog-initial.json", "utf8"),
);
const creator = catalog.exhibitors.find(
  (c: { assets: { gallery: string[] }; name: string }) =>
    c.assets.gallery.length > 1,
);
test.beforeEach(async ({ page }) => {
  await page.route("https://cf23-config.nnt.gg/**", (route) => route.abort());
});
test("creator link, legacy favorites, gallery and search survive offline reload", async ({
  page,
  context,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((id) => {
    if (!localStorage.getItem("test-seeded")) {
      localStorage.setItem(
        "flutter.favorite_creator_ids",
        JSON.stringify([String(id)]),
      );
      localStorage.setItem("test-seeded", "yes");
    }
  }, Number(creator.id));
  await page.goto(`/?creator_id=${creator.id}`);
  await expect(
    page.getByRole("heading", { name: creator.name, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Close creator details", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove from favorites", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Remove from favorites", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("flutter.favorite_creator_ids")!),
      ),
    )
    .toEqual([]);
  await page
    .getByRole("button", { name: "Add to favorites", exact: true })
    .click();
  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Next image" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByText(`2 / ${creator.assets.gallery.length}`, { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close gallery" }).click();
  await page
    .getByRole("button", {
      name: "Close creator details",
    })
    .click();
  const search = page.getByRole("textbox", {
    name: "Search name, booth, or fandom",
  });
  await search.fill("Sky");
  await expect(page.getByRole("button", { name: /Sky.*1108/ })).toBeVisible();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(search).toBeVisible();
  await search.fill("Sky");
  await expect(page.getByRole("button", { name: /Sky.*1108/ })).toBeVisible();
  expect(errors).toEqual([]);
});
test("mobile sheet can expand, scroll, restore, and collapse without selecting on drag", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile");
  await page.goto("/");
  const sheet = page.getByRole("region", { name: "Creator directory" });
  await expect(sheet).toBeVisible();
  await page.getByRole("button", { name: "Expand panel", exact: true }).click();
  await expect
    .poll(() =>
      sheet.evaluate((el) => el.getBoundingClientRect().height / innerHeight),
    )
    .toBeCloseTo(0.94, 1);
  const search = page.getByRole("textbox", {
    name: "Search name, booth, or fandom",
  });
  await search.fill("Sky");
  await page.getByRole("button", { name: /Sky.*1108/ }).click();
  await expect(
    page.getByRole("heading", { name: "Sky", exact: true }),
  ).toBeVisible();
  const details = page.getByRole("region", { name: "Creator details" });
  await expect
    .poll(() =>
      details.evaluate((el) => el.getBoundingClientRect().height / innerHeight),
    )
    .toBeCloseTo(0.56, 1);
  await page.getByRole("button", { name: "Expand panel", exact: true }).click();
  await expect
    .poll(() =>
      details.evaluate((el) => el.getBoundingClientRect().height / innerHeight),
    )
    .toBeCloseTo(0.94, 1);
  await page.getByRole("button", { name: "Close creator details" }).click();
  await expect(search).toHaveValue("Sky");
  await expect
    .poll(() =>
      sheet.evaluate((el) => el.getBoundingClientRect().height / innerHeight),
    )
    .toBeCloseTo(0.94, 1);
  await page
    .getByRole("button", { name: "Collapse panel", exact: true })
    .click();
  await expect
    .poll(() =>
      sheet.evaluate((el) => el.getBoundingClientRect().height / innerHeight),
    )
    .toBeLessThan(0.25);
});
test("shared list opens its own sheet, keeps rows after saving, and returns to global search", async ({
  page,
}) => {
  const ids = catalog.exhibitors.slice(0, 2).map((c: { id: string }) => c.id);
  await page.goto(`/?custom_list=${ids.join(",")}`);
  const sheet = page.getByRole("region", { name: "Booth list", exact: true });
  await expect(sheet).toBeVisible();
  await expect(page.getByRole("textbox")).toBeHidden();
  const expand = sheet.getByRole("button", {
    name: "Expand panel",
    exact: true,
  });
  if (await expand.isVisible()) await expand.click();
  await expect(sheet.locator(".creator-select")).toHaveCount(2);
  await sheet
    .getByRole("button", { name: "Add all to favorites", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("flutter.favorite_creator_ids")!)
            .length,
      ),
    )
    .toBe(2);
  await expect(
    sheet.getByRole("button", { name: "All added to favorites" }),
  ).toBeDisabled();
  await sheet
    .getByRole("button", { name: /Remove .* from favorites/ })
    .first()
    .click();
  await expect(sheet.locator(".creator-select")).toHaveCount(2);
  await sheet.locator(".creator-select").first().click();
  await expect(
    page.getByRole("region", { name: "Creator details", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close creator details", exact: true })
    .click();
  await expect(sheet).toBeVisible();
  await sheet.locator(".creator-select").first().click();
  await page.goBack();
  await expect(sheet).toBeVisible();
  await sheet
    .getByRole("button", { name: "Close booth list", exact: true })
    .click();
  await expect(sheet).toHaveCount(0);
  await expect(page).not.toHaveURL(/custom_list/);
  await expect(page.getByRole("textbox")).toBeVisible();
});
