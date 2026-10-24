import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { encodeList } from "../src/domain/links";

const catalog = JSON.parse(
  readFileSync("public/data/catalog-initial.json", "utf8"),
);
const registry = JSON.parse(
  readFileSync("public/data/fandoms-initial.json", "utf8"),
);

test("pasted encoded list filters independently, saves the entire list, and survives detail reload", async ({
  page,
}, info) => {
  await page.route("https://cf23-config.nnt.gg/**", (route) => route.abort());
  const creators = catalog.exhibitors
    .filter((c: any) => c.fandomIds.length)
    .slice(0, 8);
  const ids = creators.map((c: any) => c.id);
  const fandomId = creators[0].fandomIds.find((id: number) =>
    creators.some((c: any) => !c.fandomIds.includes(id)),
  );
  const fandom = registry.fandoms.find((f: any) => f.id === fandomId);
  const matches = creators.filter((c: any) => c.fandomIds.includes(fandomId));
  await page.goto("/");
  const search = page.getByRole("textbox", {
    name: "Search name, booth, or fandom",
  });
  await search.fill(`https://cf23.nnt.gg/?list=${encodeList(ids.map(Number))}`);
  await search.press("Enter");
  const sheet = page.getByRole("region", { name: "Booth list", exact: true });
  await expect(sheet).toBeVisible();
  const expand = sheet.getByRole("button", {
    name: "Expand panel",
    exact: true,
  });
  if (await expand.isVisible()) await expand.click();
  const pill = sheet.getByRole("button", {
    name: `${fandom.name} ${matches.length}`,
    exact: true,
  });
  await pill.click();
  await expect(sheet.locator(".creator-select")).toHaveCount(matches.length);
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
    .toBe(ids.length);
  await page.screenshot({ path: info.outputPath("booth-list.png") });
  await sheet.locator(".creator-select").first().click();
  await page.goBack();
  await expect(pill).toHaveAttribute("aria-pressed", "true");
  await sheet.locator(".creator-select").first().click();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Creator details", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close creator details", exact: true })
    .click();
  await expect(sheet).toBeVisible();
  await sheet
    .getByRole("button", { name: "Close booth list", exact: true })
    .click();
  const outside = catalog.exhibitors.find((c: any) => !ids.includes(c.id));
  await search.fill(outside.name);
  await expect(
    page
      .locator(".directory .creator-select")
      .filter({ hasText: outside.name })
      .first(),
  ).toBeVisible();
});
