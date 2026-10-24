import { test, expect } from "@playwright/test";

for (const destination of [
  "search",
  "fandom",
  "custom list",
  "collapsed sheet",
] as const) {
  test(`recommendations refresh after ${destination}, including a quick return`, async ({
    page,
  }, info) => {
    test.skip(
      destination === "collapsed sheet" && info.project.name !== "mobile",
      "Only mobile has a collapsible search sheet",
    );
    await page.route("https://**/*", (route) => route.abort());
    await page.addInitScript(() => {
      localStorage.setItem(
        "flutter.recommendation_profile_v2",
        JSON.stringify(
          JSON.stringify({
            schema_version: 2,
            creator_interactions: {},
            explicit_fandom_signals: {
              2: { strength: 6, last_updated: Date.now() },
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
    await expect(
      page.getByText("Creators you may like", { exact: true }),
    ).toBeVisible();
    const first = page.locator(".directory .creator-row").first();
    const name = await first.locator("strong").innerText();
    await first
      .getByRole("button", { name: `Add ${name} to favorites`, exact: true })
      .click();
    const saved = await page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem("flutter.favorite_creator_ids")!,
        ) as string[],
    );
    const input = page.getByRole("textbox");
    if (destination === "search") {
      // Clear immediately, before the worker debounce has elapsed.
      await input.fill("Genshin");
      await input.fill("");
    } else if (destination === "fandom") {
      await page
        .getByRole("group", { name: "Creator filters" })
        .getByRole("button", { name: "Genshin Impact", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Clear search", exact: true })
        .click();
    } else if (destination === "collapsed sheet") {
      await page
        .getByRole("button", { name: "Collapse panel", exact: true })
        .click();
      await expect(page.locator(".search-sheet")).toHaveClass(/collapsed/);
      await page
        .getByRole("button", { name: "Expand panel", exact: true })
        .click();
    } else {
      await input.fill(`https://cf23.nnt.gg/?custom_list=${saved.join(",")}`);
      await input.press("Enter");
      await expect(
        page.getByRole("region", { name: "Booth list", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Close booth list", exact: true })
        .click();
    }
    await expect(first.locator("strong")).not.toHaveText(name);
    const refreshed = await first.locator("strong").innerText();
    await first.locator(".creator-select").click();
    await page.waitForTimeout(800);
    await page
      .getByRole("button", { name: "Close creator details", exact: true })
      .click();
    await expect(first.locator("strong")).toHaveText(refreshed);
  });
}
