import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { encodeList } from "../src/domain/links";
import { captureAnalytics, validateAnalytics } from "./analyticsCapture";
test.use({ serviceWorkers: "block" });

const catalog = JSON.parse(
  readFileSync("public/data/catalog-initial.json", "utf8"),
);
const registry = JSON.parse(
  readFileSync("public/data/fandoms-initial.json", "utf8"),
);

test("list actions and fandoms scroll away while the header stays fixed", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://cf23-config.nnt.gg/**", (r) => r.abort());
  const ids = catalog.exhibitors.slice(0, 60).map((c: any) => Number(c.id));
  await page.addInitScript(
    (ids) =>
      localStorage.setItem(
        "flutter.favorite_creator_ids",
        JSON.stringify(ids.map(String)),
      ),
    ids,
  );
  for (const favorites of [false, true]) {
    await page.goto(favorites ? "/" : `/?list=${encodeList(ids)}`);
    if (favorites)
      await page.getByRole("button", { name: "Favorites", exact: true }).click();
    const sheet = page.getByRole("region", {
      name: favorites ? "Favorites" : "Booth list",
      exact: true,
    });
    await expect(sheet).toBeVisible();
    const expand = sheet.getByRole("button", {
      name: "Expand panel",
      exact: true,
    });
    if (await expand.isVisible()) await expand.click();
    const scroll = sheet.locator(".favorites-list");
    const header = sheet.locator(".favorites-header");
    const controls = scroll.locator(".booth-list-bulk");
    await expect(controls).toBeVisible();
    await expect(scroll.locator(".favorites-filters")).toBeVisible();
    const headerY = (await header.boundingBox())!.y;
    const controlY = (await controls.boundingBox())!.y;
    await scroll.evaluate((el) =>
      el.scrollTo({ top: 600, behavior: "instant" }),
    );
    await expect
      .poll(async () => (await controls.boundingBox())!.y)
      .toBeLessThan(controlY - 500);
    expect((await header.boundingBox())!.y).toBeCloseTo(headerY, 0);
    await expect(scroll.locator(".creator-select").first()).toBeAttached();
    await scroll.evaluate((el) => el.scrollTo({ top: 0, behavior: "instant" }));
    await expect(
      sheet.getByRole("button", { name: "Navigate", exact: true }),
    ).toBeVisible();
    await expect
      .poll(
        async () => (await scroll.locator("[data-index='0']").boundingBox())!.y,
      )
      .toBeGreaterThan(
        (await scroll.locator(".favorites-filters").boundingBox())!.y,
      );
  }
});

test("pasted encoded list filters independently, saves the entire list, and survives detail reload", async ({
  page,
}, info) => {
  const events = process.env.ANALYTICS_E2E ? await captureAnalytics(page) : [];
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
  if (process.env.ANALYTICS_E2E) {
    await expect
      .poll(
        () =>
          events.find(
            (e) =>
              e.name === "booth_list_action" && e.data.action === "filter_add",
          )?.data,
      )
      .toMatchObject({
        list_kind: "custom",
        fandom_id: fandomId,
        selected_count: 1,
        count: matches.length,
      });
  }
  await sheet
    .getByRole("button", { name: "Favorite all", exact: true })
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
  if (process.env.ANALYTICS_E2E) {
    await expect
      .poll(
        () =>
          events.filter((e) => e.name === "creator_opened").at(-1)?.data.source,
      )
      .toBe("custom_list");
    validateAnalytics(events);
  }
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
