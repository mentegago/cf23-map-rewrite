import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test("creator rows order recommendation reasons, interests, and search matches", async ({
  page,
}, info) => {
  await page.route("https://**/*", (route) => route.abort());
  const source = JSON.parse(
    readFileSync("public/data/catalog-initial.json", "utf8"),
  );
  const fandoms = ["Original", "Alpha", "Zelda", "Persona", "Beta"].map(
    (name, i) => ({
      id: i + 1,
      name,
      kind: "franchise",
      parentId: null,
      alternateNames: [],
    }),
  );
  source.exhibitors = [
    {
      ...source.exhibitors[0],
      name: "Ordering example",
      fandomIds: [1, 2, 3, 4, 5],
    },
  ];
  await page.route("**/data/catalog-initial.json", (route) =>
    route.fulfill({ json: source }),
  );
  await page.route("**/data/fandoms-initial.json", (route) =>
    route.fulfill({ json: { schemaVersion: "1.0", fandoms } }),
  );
  await page.addInitScript(() => {
    localStorage.setItem(
      "flutter.recommendation_profile_v2",
      JSON.stringify(
        JSON.stringify({
          schema_version: 2,
          creator_interactions: {},
          explicit_fandom_signals: {
            4: { strength: 10, last_updated: Date.now() },
            3: { strength: 5, last_updated: Date.now() },
          },
        }),
      ),
    );
  });
  await page.goto("/");
  if (info.project.name === "mobile")
    await page
      .getByRole("button", { name: "Expand panel", exact: true })
      .click();
  const rows = page.locator(".directory .creator-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator(".fandom-summary")).toHaveText(
    "Persona • Zelda • Alpha • Beta • +1 more",
  );
  await expect(rows.nth(1).locator(".fandom-summary")).toHaveText(
    "Original • Persona • Zelda • Alpha • +1 more",
  );
  const before = await rows.nth(0).locator(".fandom-summary").textContent();
  await rows.nth(0).locator(".creator-select").click();
  await page
    .getByRole("button", { name: "Close creator details", exact: true })
    .click();
  await expect(rows.nth(0).locator(".fandom-summary")).toHaveText(before!);
  await page.getByRole("textbox").fill("alpha");
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator(".fandom-summary")).toHaveText(
    "Alpha • Persona • Zelda • Beta • +1 more",
  );
});
