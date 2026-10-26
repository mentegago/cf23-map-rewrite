import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { encodeList } from "../src/domain/links";
const catalog = JSON.parse(
  readFileSync("public/data/catalog-initial.json", "utf8"),
);
const ids = catalog.exhibitors.slice(0, 3).map((c: any) => Number(c.id));
test.use({ serviceWorkers: "block" });

test("collection detail bookmark supports undo until the collection is closed without changing favorites", async ({
  page,
}) => {
  await page.route("https://**/*", (r) => r.abort());
  await page.addInitScript(
    (ids) => {
      localStorage.setItem(
        "cf23.collections.v1",
        JSON.stringify([{ id: "test", name: "Test", ids }]),
      );
      localStorage.setItem(
        "flutter.favorite_creator_ids",
        JSON.stringify(ids.map(String)),
      );
    },
    ids.slice(0, 1),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Collections", exact: true }).click();
  await page.getByRole("button", { name: /Test.*creators/ }).click();
  const sheet = page.getByRole("region", { name: "Test", exact: true });
  await sheet.locator(".creator-select").click();
  await page
    .getByRole("button", { name: "Remove from collection", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Restore to collection", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page
    .getByRole("button", { name: "Restore to collection", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove from collection", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Close creator details", exact: true })
    .click();
  await expect(sheet.locator(".creator-select")).toHaveCount(1);
  await expect(
    sheet.getByRole("button", { name: /Add .* to collection/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("flutter.favorite_creator_ids")!),
    ),
  ).toEqual(ids.slice(0, 1).map(String));
  await sheet
    .getByRole("button", { name: "Close booth list", exact: true })
    .click();
  await page.getByRole("button", { name: /Test.*creators/ }).click();
  await expect(sheet.locator(".creator-select")).toHaveCount(0);
});

test("Favorites opened from Collections returns to Collections on close", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "cf23.collections.v1",
      JSON.stringify([{ id: "test", name: "Test", ids: [] }]),
    ),
  );
  await page.route("https://**/*", (r) => r.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Collections", exact: true }).click();
  const collections = page.getByRole("region", {
    name: "Collections",
    exact: true,
  });
  await collections.getByRole("button", { name: /Favorites/ }).click();
  await page
    .getByRole("button", { name: "Close favorites", exact: true })
    .click();
  await expect(collections).toBeVisible();
  await collections
    .getByRole("button", { name: "Close collections", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Creator directory" }),
  ).toBeVisible();
});

test("creator picker adds only that creator and disables completed destinations", async ({
  page,
}) => {
  await page.route("https://**/*", (r) => r.abort());
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Collections", exact: true }),
  ).toHaveCount(0);
  await page.goto(`/?creator_id=${ids[0]}`);
  await page
    .getByRole("button", { name: "Add to collection", exact: true })
    .click();
  await page
    .getByRole("button", { name: "New collection", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Collection name" }).fill("Solo");
  await page
    .getByRole("button", { name: "Create collection", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("cf23.collections.v1")!)[0].ids,
    ),
  ).toEqual([ids[0]]);
  await page
    .getByRole("button", { name: "Add to collection", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Add to collection" });
  await expect(dialog.getByRole("button", { name: /Solo/ })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: /Solo/ })).toContainText(
    "Already added",
  );
  await dialog.getByRole("button", { name: /Favorites/ }).click();
  await page
    .getByRole("button", { name: "Add to collection", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: /Favorites/ }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Close creator details", exact: true })
    .click();
  await page.getByRole("button", { name: "Collections", exact: true }).click();
  const library = page.getByRole("region", {
    name: "Collections",
    exact: true,
  });
  await expect(
    library.getByRole("button", { name: "New collection", exact: true }),
  ).toHaveCount(0);
  await library.getByRole("button", { name: /Solo/ }).click();
  await expect(
    page.getByRole("button", { name: "Add all…", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Close booth list", exact: true })
    .click();
  await library.getByRole("button", { name: /Favorites/ }).click();
  await expect(
    page.getByRole("button", { name: "Add all…", exact: true }),
  ).toHaveCount(0);
});

test("collection dialogs stay within the visible viewport while the keyboard resizes and pans", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile");
  await page.route("https://**/*", (r) => r.abort());
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`/?list=${encodeList(ids)}`);
  await page.getByRole("button", { name: "Add all…", exact: true }).click();
  await page.screenshot({ path: info.outputPath("collection-picker.png") });
  await page
    .getByRole("button", { name: "New collection", exact: true })
    .click();
  const input = page.getByRole("textbox", { name: "Collection name" });
  await expect(input).toBeFocused();
  for (const [height, offsetTop] of [
    [350, 0],
    [300, 120],
    [260, 180],
  ]) {
    await page.evaluate(
      ({ height, offsetTop }) => {
        Object.defineProperty(visualViewport, "height", {
          configurable: true,
          value: height,
        });
        Object.defineProperty(visualViewport, "offsetTop", {
          configurable: true,
          value: offsetTop,
        });
        visualViewport!.dispatchEvent(new Event("resize"));
        visualViewport!.dispatchEvent(new Event("scroll"));
      },
      { height, offsetTop },
    );
    await expect
      .poll(async () => {
        const bounds = await page.getByRole("dialog").boundingBox();
        return (
          !!bounds &&
          bounds.y >= offsetTop + 15 &&
          bounds.y + bounds.height <= offsetTop + height - 15
        );
      })
      .toBe(true);
  }
  await input.fill("Keyboard test");
  const submit = page.getByRole("button", {
    name: "Create collection",
    exact: true,
  });
  await submit.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("collection-keyboard.png") });
  await submit.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("collections save, merge without duplicates, persist, and stay separate from favorites", async ({
  page,
}, info) => {
  await page.route("https://**/*", (r) => r.abort());
  await page.goto(`/?list=${encodeList(ids.slice(0, 2))}`);
  await page.getByRole("button", { name: "Add all…", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Add to collection" });
  await expect(
    dialog.locator(".collection-options").getByRole("button").first(),
  ).toContainText("Favorites");
  await dialog.getByRole("button", { name: "New collection" }).click();
  await page
    .getByRole("textbox", { name: "Collection name" })
    .fill("GL booths");
  await page.getByRole("button", { name: "Create collection" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto(`/?list=${encodeList(ids.slice(1))}`);
  await page.getByRole("button", { name: "Add all…", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /GL booths/ })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("cf23.collections.v1")!)[0].ids
            .length,
      ),
    )
    .toBe(3);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("flutter.favorite_creator_ids") || "[]"),
    ),
  ).toEqual([]);
  await page.goto("/");
  await page.getByRole("button", { name: "Collections", exact: true }).click();
  await page.getByRole("button", { name: /GL booths/ }).click();
  let sheet = page.getByRole("region", { name: "GL booths", exact: true });
  await expect(sheet).toBeVisible();
  const expand = sheet.getByRole("button", {
    name: "Expand panel",
    exact: true,
  });
  if (await expand.isVisible()) await expand.click();
  await expect(sheet.locator(".creator-select")).toHaveCount(3);
  await page.screenshot({ path: info.outputPath("collection.png") });
  await sheet.locator(".creator-select").first().click();
  await page
    .getByRole("button", { name: "Close creator details", exact: true })
    .click();
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Manage collection" }).click();
  await page
    .getByRole("textbox", { name: "Collection name" })
    .fill("GL shopping");
  await page.getByRole("button", { name: "Save name" }).click();
  sheet = page.getByRole("region", { name: "GL shopping", exact: true });
  await sheet
    .getByRole("button", { name: /Remove .* from collection/ })
    .first()
    .click();
  await expect(sheet.locator(".creator-select")).toHaveCount(3);
  await sheet.getByRole("button", { name: /Add .* to collection/ }).click();
  await expect(
    sheet.getByRole("button", { name: /Remove .* from collection/ }),
  ).toHaveCount(3);
  await sheet
    .getByRole("button", { name: /Remove .* from collection/ })
    .first()
    .click();
  await sheet
    .getByRole("button", { name: "Close booth list", exact: true })
    .click();
  await page.getByRole("button", { name: /GL shopping/ }).click();
  await expect(sheet.locator(".creator-select")).toHaveCount(2);
  await sheet.getByRole("button", { name: "Manage collection" }).click();
  await page
    .getByRole("button", { name: "Delete collection", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete collection", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("cf23.collections.v1")!).length,
      ),
    )
    .toBe(0);
});
