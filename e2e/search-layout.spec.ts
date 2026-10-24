import { test, expect } from "@playwright/test";

test("empty fandom suggestions leave no gap and changing the search resets results", async ({
  page,
}) => {
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/");
  const input = page.getByRole("textbox", {
    name: "Search name, booth, or fandom",
  });
  const list = page.getByTestId("directory");
  const suggestions = page.getByRole("group", { name: "Creator filters" });
  await expect(suggestions).toBeVisible();
  const header = page.locator(".search-header");
  const fullHeight = await header.evaluate(
    (el) => el.getBoundingClientRect().height,
  );
  await input.fill("zzzzzz-no-fandom");
  await expect(suggestions).toHaveCount(0);
  expect(
    await header.evaluate((el) => el.getBoundingClientRect().height),
  ).toBeLessThan(fullHeight - 25);
  await expect(
    page.getByText("No creators found.", { exact: true }),
  ).toBeVisible();

  await input.fill("a");
  await expect
    .poll(() => list.evaluate((el) => el.scrollHeight - el.clientHeight))
    .toBeGreaterThan(700);
  await list.evaluate((el) => el.scrollTo({ top: 700, behavior: "instant" }));
  await expect
    .poll(() => list.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(600);
  await input.fill("ar");
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBe(0);
  await expect(list.locator(".section-heading")).toBeVisible();
  await list.evaluate((el) => el.scrollTo({ top: 500, behavior: "instant" }));
  // Change the field while a native scroll event may still be queued.
  await input.fill("");
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBe(0);
  await expect(suggestions).toBeVisible();
});
