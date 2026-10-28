import { test, expect } from "@playwright/test";

test("compact booth queries prioritize their table and rows combine split halves", async ({
  page,
}) => {
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/");
  const input = page.getByRole("textbox", {
    name: "Search name, booth, or fandom",
  });
  const rows = page.getByTestId("directory").locator(".creator-row");
  await input.fill("AC03");
  await expect(rows.first().locator(".metadata")).toContainText("AC-03");
  await input.fill("F47ab");
  await expect(rows.first().locator(".metadata")).toContainText("F-47");
  await input.fill("K28ab");
  await expect(rows.first().locator(".metadata")).toContainText(
    "K-28ab, K-29ab",
  );
  await expect(rows.first().locator(".metadata")).not.toContainText(
    "K-28a, K-28b",
  );
});
