import { test, expect, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
import { encodeList } from "../src/domain/links";
import { captureAnalytics, validateAnalytics } from "./analyticsCapture";
const catalog = JSON.parse(
  readFileSync("public/data/catalog-initial.json", "utf8"),
);
const people = [
  ...catalog.exhibitors
    .filter((c: any) => c.attendanceDates.length === 2)
    .slice(0, 8),
  catalog.exhibitors.find((c: any) => c.attendanceDates.length === 1),
];
const url = `/?list=${encodeList(people.map((c: any) => Number(c.id)))}`;
test.use({ serviceWorkers: "block", colorScheme: "dark" });
test("navigation hides destinations while the route is being calculated", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    const postMessage = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, options: any) {
      if (message?.map && message?.creators) {
        setTimeout(() => postMessage.call(this, message, options), 1400);
      } else postMessage.call(this, message, options);
    };
  });
  await page.route("https://**/*", (r) => r.abort());
  await page.goto(url);
  await page.getByRole("button", { name: "Navigate", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Saturday", exact: true })
    .click();
  const nav = page.getByRole("navigation", { name: "Visit path navigation" });
  const loading = nav.getByText("Finding your way…", { exact: true });
  await expect(loading).toBeVisible();
  await expect(nav.locator(".visit-destination-link")).toHaveCount(0);
  await expect(nav).not.toContainText(/Stop \d+ of/);
  await expect(page.locator(".visit-route-stops")).toHaveCount(0);
  await expect(
    nav.getByRole("button", { name: "Next route stop" }),
  ).toBeDisabled();
  await expect(loading).toHaveCount(0);
  await expect(nav.locator(".visit-destination-link").first()).toBeVisible();
  await expect(page.locator(".visit-route-stops")).toHaveCount(1);
  await page
    .getByRole("group", { name: "Visit day" })
    .getByRole("button", { name: "Sunday" })
    .click();
  await expect(loading).toBeVisible();
  await expect(nav.locator(".visit-destination-link")).toHaveCount(0);
  await expect(nav).not.toContainText(/Stop \d+ of/);
  await expect(page.locator(".visit-route-stops")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("route-loading.png") });
  await expect(loading).toHaveCount(0);
  await expect(nav.locator(".visit-destination-link").first()).toBeVisible();
  await expect(page.locator(".visit-route-stops")).toHaveCount(1);
  const routePixels = () =>
    page.locator(".map-canvas").evaluate((el) => {
      const canvas = el as HTMLCanvasElement;
      const pixels = canvas
        .getContext("2d")!
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] === 0 && pixels[i + 1] === 184 && pixels[i + 2] === 202)
          count++;
      }
      return count;
    });
  const sheet = page.getByRole("region", { name: "Visit path", exact: true });
  await expand(sheet);
  await expect.poll(routePixels).toBeGreaterThan(0);
  await sheet
    .getByRole("button", { name: "Skip", exact: true })
    .first()
    .click();
  await expect(loading).toBeVisible();
  await expect.poll(routePixels).toBe(0);
  await expect(loading).toHaveCount(0);
  await expect.poll(routePixels).toBeGreaterThan(0);
});
async function expand(sheet: Locator) {
  await sheet.evaluate(async (el) => {
    const animations: Animation[] = [];
    for (let parent: Element | null = el; parent; parent = parent.parentElement)
      animations.push(...parent.getAnimations());
    await Promise.all(
      animations
        .filter(
          (animation) => animation.effect?.getTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  const b = sheet.getByRole("button", { name: "Expand panel", exact: true });
  if (await b.isVisible()) {
    await b.click();
    await expect
      .poll(() =>
        sheet.evaluate(
          (el) =>
            el.getBoundingClientRect().height /
            document.getElementById("app")!.clientHeight,
        ),
      )
      .toBeCloseTo(0.94, 2);
  }
  await expect(sheet.locator(".visit-path-content")).toHaveCSS("opacity", "1");
  await expect(sheet.getByRole("status")).toContainText("stops");
}

test("fixed endpoints recalculate, can be reset, and stay separate per day", async ({
  page,
}, info) => {
  await page.route("https://**/*", (r) => r.abort());
  const events = process.env.ANALYTICS_E2E ? await captureAnalytics(page) : [];
  await page.goto(url);
  await page.getByRole("button", { name: "Navigate", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Saturday", exact: true })
    .click();
  const sheet = page.getByRole("region", { name: "Visit path", exact: true });
  await expand(sheet);
  const list = sheet.getByRole("list", { name: "Visit order" });
  const first = list.locator("li").nth(1);
  const booth = await first.locator("strong").innerText();
  const row = list.locator("li").filter({
    has: page.locator("strong", { hasText: new RegExp(`^${booth}$`) }),
  });
  const total = await list.locator("li").count();
  await first
    .getByRole("button", { name: "Route options", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "End here", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Keep current route" })
    .click();
  await expect(sheet.getByRole("button", { name: "Change end" })).toContainText(
    "Anywhere",
  );
  await first
    .getByRole("button", { name: "Route options", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "End here", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "End here", exact: true })
    .click();
  await expand(sheet);
  await expect(list.locator("li").last()).toContainText(booth);
  await expect(row).toContainText("Ending here");
  await expect(
    row.getByRole("button", { name: "Skip", exact: true }),
  ).toBeDisabled();
  await expect(list.locator("li")).toHaveCount(total);
  await sheet
    .locator(".visit-path-content")
    .evaluate((el) => el.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("route-endpoints.png") });
  await sheet.getByRole("button", { name: "Sunday", exact: true }).click();
  await expect(sheet.getByRole("button", { name: "Change end" })).toContainText(
    "Anywhere",
  );
  await expect(sheet.getByRole("status")).toContainText("stops");
  await sheet.getByRole("button", { name: "Saturday", exact: true }).click();
  await expect(sheet.getByRole("status")).toContainText("stops");
  await expect(sheet.getByRole("button", { name: "Change end" })).toContainText(
    booth,
  );
  await sheet
    .getByRole("button", { name: "Clear fixed end", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "No fixed end", exact: true })
    .click();
  await expand(sheet);
  await expect(sheet.getByRole("button", { name: "Change end" })).toContainText(
    "Anywhere",
  );
  await expect(row).not.toContainText("Ending here");
  await expect(list.locator("li")).toHaveCount(total);
  // Both selectors use the same reversible endpoint flow.
  await sheet.getByRole("button", { name: "Change start" }).click();
  await page
    .getByRole("dialog", { name: "Choose start", exact: true })
    .getByRole("button")
    .filter({
      has: page.locator("strong", { hasText: new RegExp(`^${booth}$`) }),
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start from here", exact: true })
    .click();
  await expand(sheet);
  await expect(
    sheet.getByRole("button", { name: "Change start" }),
  ).toContainText(booth);
  await expect(list.locator("li").first()).toContainText("Starting here");
  await expect(
    list
      .locator("li")
      .first()
      .getByRole("button", { name: /^(Unskip|Skip)$/ }),
  ).toHaveCount(0);
  await sheet.getByRole("button", { name: "Change end" }).click();
  await page
    .getByRole("dialog", { name: "Choose end", exact: true })
    .getByRole("button")
    .filter({
      has: page.locator("strong", { hasText: new RegExp(`^${booth}$`) }),
    })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "resets your start to Entrance",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "End here", exact: true })
    .click();
  await expand(sheet);
  await expect(
    sheet.getByRole("button", { name: "Change start" }),
  ).toContainText("Entrance");
  await expect(list.locator("li").last()).toContainText(booth);
  if (process.env.ANALYTICS_E2E) {
    await expect
      .poll(() =>
        events.some(
          (e) =>
            e.name === "visit_path_calculated" && e.data.fixed_end === true,
        ),
      )
      .toBe(true);
    for (const action of ["end_prompt", "end_cancel", "end_confirm"])
      expect(
        events.some(
          (e) => e.name === "visit_path_action" && e.data.action === action,
        ),
      ).toBe(true);
    expect(
      events.some(
        (e) =>
          e.name === "visit_path_action" &&
          e.data.action === "end_confirm" &&
          e.data.target === "anywhere",
      ),
    ).toBe(true);
    validateAnalytics(events);
  }
});

test("route menus float without shifting rows, support keyboard, and dismiss on scroll", async ({
  page,
}, info) => {
  await page.route("https://**/*", (r) => r.abort());
  await page.goto(url);
  await page.getByRole("button", { name: "Navigate", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Saturday", exact: true })
    .click();
  const sheet = page.getByRole("region", { name: "Visit path", exact: true });
  await expand(sheet);
  const row = sheet
    .getByRole("list", { name: "Visit order" })
    .locator("li")
    .nth(1);
  const trigger = row.getByRole("button", {
    name: "Route options",
    exact: true,
  });
  await trigger.scrollIntoViewIfNeeded();
  const height = await row.evaluate((el) => el.getBoundingClientRect().height);
  await trigger.click();
  const menu = page.getByRole("menu", { name: "Route options", exact: true });
  await expect(menu).toBeVisible();
  expect(await row.evaluate((el) => el.getBoundingClientRect().height)).toBe(
    height,
  );
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem").last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await expect(menu).toHaveCSS("opacity", "1");
  await page.screenshot({ path: info.outputPath("floating-route-menu.png") });
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.press("ArrowUp");
  await expect(menu.getByRole("menuitem").last()).toBeFocused();
  await sheet
    .locator(".visit-path-content")
    .evaluate((el) => (el.scrollTop += 25));
  await expect(menu).toHaveCount(0);
  const last = sheet
    .getByRole("list", { name: "Visit order" })
    .locator("li")
    .last()
    .getByRole("button", { name: "Route options", exact: true });
  await last.click();
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(10);
  expect(box.x + box.width).toBeLessThanOrEqual(
    page.viewportSize()!.width - 10,
  );
  expect(box.y).toBeGreaterThanOrEqual(10);
  expect(box.y + box.height).toBeLessThanOrEqual(
    page.viewportSize()!.height - 10,
  );
  await sheet.getByRole("navigation").locator("strong").click();
  await expect(menu).toHaveCount(0);
  await sheet.getByRole("button", { name: "Change end" }).click();
  const picker = page.getByRole("dialog", { name: "Choose end", exact: true });
  await expect(picker).toBeVisible();
  await picker.evaluate(async (el) => {
    await Promise.all(
      el.getAnimations().map((animation) => animation.finished),
    );
  });
  const inset = await picker.evaluate((el) => {
    const row = el
        .querySelector(".endpoint-choices button")!
        .getBoundingClientRect(),
      dialog = el.getBoundingClientRect();
    return { left: row.left - dialog.left, right: dialog.right - row.right };
  });
  expect(inset.left).toBeGreaterThanOrEqual(8);
  expect(inset.right).toBeGreaterThanOrEqual(8);
  await page.screenshot({ path: info.outputPath("endpoint-picker.png") });
});
