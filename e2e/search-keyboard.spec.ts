import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/");
});

test("clear search keeps or restores input focus", async ({ page }, info) => {
  const input = page.getByRole("textbox", {
    name: "Search name, booth, or fandom",
  });
  const clear = page.getByRole("button", { name: "Clear search", exact: true });
  await input.fill("genshin");
  if (info.project.name === "mobile") await clear.tap();
  else await clear.click();
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await input.fill("genshin");
  await input.press("Enter");
  await expect(input).not.toBeFocused();
  if (info.project.name === "mobile") await clear.tap();
  else await clear.click();
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
});

test("vertical result swipes blur the input and continue native scrolling", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "mobile");
  const input = page.getByRole("textbox", {
    name: "Search name, booth, or fandom",
  });
  await input.fill("genshin");
  const results = page.getByTestId("directory");
  await expect(page.locator(".search-sheet")).not.toHaveClass(/scroll-locked/);
  // Programmatic scroll, small movements, horizontal gestures, and pinching
  // must not be mistaken for a deliberate vertical results swipe.
  await results.evaluate((el) => {
    el.scrollTop = 50;
  });
  await expect(input).toBeFocused();
  for (const gesture of ["small", "horizontal", "pinch"] as const) {
    await results.evaluate((el, kind) => {
      const point = (id: number, x: number, y: number) =>
        new Touch({ identifier: id, target: el, clientX: x, clientY: y });
      const send = (type: string, touches: Touch[]) =>
        el.dispatchEvent(
          new TouchEvent(type, {
            touches,
            changedTouches: touches,
            bubbles: true,
            cancelable: true,
          }),
        );
      send("touchstart", [point(1, 150, 400)]);
      const allowed = send(
        "touchmove",
        kind === "pinch"
          ? [point(1, 150, 360), point(2, 200, 400)]
          : [point(1, kind === "horizontal" ? 190 : 152, 403)],
      );
      if (!allowed)
        throw new Error("Keyboard dismissal prevented native touch behavior");
      send("touchend", []);
    }, gesture);
    await expect(input).toBeFocused();
  }
  await results.evaluate((el) => {
    el.scrollTop = 0;
  });
  const client = await context.newCDPSession(page);
  const box = (await results.boundingBox())!;
  const x = box.x + box.width / 2,
    y = Math.min(box.y + box.height - 50, 650);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id: 1, x, y }],
  });
  for (let i = 1; i <= 8; i++)
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ id: 1, x, y: y - i * 22 }],
    });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(input).not.toBeFocused();
  await expect(input).toHaveValue("genshin");
  await expect
    .poll(() => results.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(30);
});

test("outer search close clears the query and lowers the sheet without refocusing", async ({
  page,
}, info) => {
  const input = page.getByRole("textbox", {
    name: "Search name, booth, or fandom",
  });
  const dismiss = page.getByRole("button", {
    name: "Clear and close search",
    exact: true,
  });
  if (info.project.name !== "mobile") {
    await expect(input).toBeVisible();
    await expect(dismiss).toHaveCount(0);
    return;
  }
  await expect(dismiss).toBeHidden();
  await input.fill("Hello");
  await expect(dismiss).toBeVisible();
  await expect(input).toBeFocused();
  await expect
    .poll(() =>
      dismiss.evaluate(
        (el) =>
          el.closest(".search-dismiss-slot")!.getBoundingClientRect().width,
      ),
    )
    .toBe(56);
  await page
    .locator(".search-header")
    .screenshot({ path: info.outputPath("search-close-light.png") });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(350); // Let the existing theme color transitions settle.
  await page
    .locator(".search-header")
    .screenshot({ path: info.outputPath("search-close-dark.png") });
  await dismiss.tap();
  await expect(input).toHaveValue("");
  await expect(input).not.toBeFocused();
  await expect(page.locator(".search-sheet")).toHaveClass(/collapsed/);
  await expect(dismiss).toBeHidden();
  await input.tap();
  await expect(dismiss).toBeVisible();
  await input.fill("Genshin Impact");
  await page
    .getByRole("group", { name: "Creator filters" })
    .getByRole("button", { name: "Genshin Impact", exact: true })
    .tap();
  await expect(page).toHaveURL(/fandom=/);
  await dismiss.tap();
  await expect(page).not.toHaveURL(/fandom=/);
  await expect(input).toHaveValue("");
  await expect(input).not.toBeFocused();
  await expect(page.locator(".search-sheet")).toHaveClass(/collapsed/);
  await page.getByRole("button", { name: "Expand panel", exact: true }).tap();
  await expect(dismiss).toBeVisible();
  await dismiss.tap();
  await expect(page.locator(".search-sheet")).toHaveClass(/collapsed/);
});
