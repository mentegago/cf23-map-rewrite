import { test, expect, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
import { encodeList } from "../src/domain/links";
import {
  captureAnalytics,
  validateAnalytics,
  type CapturedEvent,
} from "./analyticsCapture";
let captured: CapturedEvent[] = [];
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => {
  if (process.env.ANALYTICS_E2E) captured = await captureAnalytics(page);
});
test.afterEach(async ({}, info) => {
  if (process.env.ANALYTICS_E2E && info.status !== "skipped")
    validateAnalytics(captured);
});

test("route worker failures leave the UI usable and report a bounded failure", async ({
  page,
}) => {
  await page.route("https://cf23-config.nnt.gg/**", (route) => route.abort());
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (String(url).includes("visitRoute"))
          throw new Error("private worker exception");
        super(url, options);
      }
    };
  });
  await page.goto(
    `/?list=${encodeList(everyDayCreators.map((c: any) => Number(c.id)))}`,
  );
  await page.getByRole("button", { name: "Navigate", exact: true }).click();
  const sheet = page.getByRole("region", { name: "Visit path", exact: true });
  await expand(sheet);
  await expect(sheet).toContainText(
    "Couldn't calculate this route. Try again.",
  );
  if (process.env.ANALYTICS_E2E) {
    await expect
      .poll(
        () => captured.find((e) => e.name === "visit_path_calculated")?.data,
      )
      .toMatchObject({ outcome: "failed", code: "worker", stop_count: 0 });
    expect(JSON.stringify(captured)).not.toContain("private worker exception");
  }
  await sheet
    .getByRole("button", { name: "Back to list", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Navigate", exact: true }),
  ).toBeVisible();
});
const catalog = JSON.parse(
  readFileSync("public/data/catalog-initial.json", "utf8"),
);
const everyDayCreators = catalog.exhibitors
  .filter((c: any) =>
    catalog.event.days.every((day: any) => c.attendanceDates.includes(day.id)),
  )
  .slice(0, 12);
const creators = [
  ...everyDayCreators,
  catalog.exhibitors.find((c: any) => c.attendanceDates.length === 1),
];
const url = `/?list=${encodeList(creators.map((c: any) => Number(c.id)))}`;
async function expand(sheet: Locator) {
  const button = sheet.getByRole("button", {
    name: "Expand panel",
    exact: true,
  });
  if (await button.isVisible()) await button.click();
}

for (const openWith of ["button", "Enter"] as const) {
  test(`navigation stays collapsed after opening a searched list with ${openWith} and dismissing the keyboard`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "mobile");
    await page.route("https://cf23-config.nnt.gg/**", (r) => r.abort());
    await page.goto("/");
    const input = page.getByRole("textbox");
    await input.tap();
    await page.evaluate(() => {
      Object.defineProperty(visualViewport, "height", {
        configurable: true,
        value: 400,
      });
      visualViewport!.dispatchEvent(new Event("resize"));
    });
    await input.fill(
      `https://cf23.nnt.gg/?list=${encodeList(everyDayCreators.map((c: any) => Number(c.id)))}`,
    );
    if (openWith === "Enter") await input.press("Enter");
    else
      await page
        .getByRole("button", { name: "Open booth list", exact: true })
        .click();
    await page.getByRole("button", { name: "Navigate", exact: true }).click();
    const sheet = page.getByRole("region", { name: "Visit path", exact: true });
    await expect(sheet).toBeVisible();
    // A software keyboard can finish closing after navigation has already opened.
    await page.evaluate(() => {
      delete (visualViewport as unknown as Record<string, unknown>).height;
      visualViewport!.dispatchEvent(new Event("resize"));
    });
    await expect
      .poll(() => sheet.evaluate((el) => el.getBoundingClientRect().height))
      .toBeCloseTo(176, 0);
    await expand(sheet);
    await expect
      .poll(() =>
        sheet.evaluate(
          (el) =>
            el.getBoundingClientRect().height /
            document.getElementById("app")!.clientHeight,
        ),
      )
      .toBeCloseTo(0.94, 2);
    await sheet
      .getByRole("button", { name: "Collapse panel", exact: true })
      .click();
    await expect
      .poll(() => sheet.evaluate((el) => el.getBoundingClientRect().height))
      .toBeCloseTo(176, 0);
  });
}

test("all-day lists navigate immediately and show Any day without day toggles", async ({
  page,
}) => {
  await page.route("https://cf23-config.nnt.gg/**", (r) => r.abort());
  await page.goto(
    `/?list=${encodeList(everyDayCreators.map((c: any) => Number(c.id)))}`,
  );
  const list = page.getByRole("region", { name: "Booth list", exact: true });
  const sheet = page.getByRole("region", { name: "Visit path", exact: true });
  for (let i = 0; i < 2; i++) {
    await list.getByRole("button", { name: "Navigate", exact: true }).click();
    await expect(sheet).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(sheet.locator(".visit-path-title")).toContainText("Any day");
    await expect(sheet.getByRole("group", { name: "Visit day" })).toHaveCount(
      0,
    );
    await expect(sheet.getByRole("navigation")).toContainText("Stop 1 of");
    if (process.env.ANALYTICS_E2E) {
      await expect
        .poll(
          () =>
            captured.filter(
              (e) =>
                e.name === "visit_path_calculated" &&
                e.data.outcome === "ready",
            ).length,
        )
        .toBe(i + 1);
      expect(
        captured
          .filter((e) => e.name === "visit_path_action")
          .map((e) => e.data.action),
      ).not.toContain("day_prompt");
      expect(
        captured.find((e) => e.name === "visit_path_calculated")!.data.day_mode,
      ).toBe("any");
    }
    await sheet
      .getByRole("button", { name: "Back to list", exact: true })
      .click();
  }
});

test("Navigate opens a separate compact page with working stop controls and expandable itinerary", async ({
  page,
  context,
}, info) => {
  await page.route("https://cf23-config.nnt.gg/**", (r) => r.abort());
  await page.goto(url);
  const list = page.getByRole("region", { name: "Booth list", exact: true });
  await expect(list).toBeVisible();
  const bulk = list.locator(".booth-list-bulk");
  await expect(bulk.getByRole("button", { name: "Add all…" })).toBeVisible();
  await bulk.getByRole("button", { name: "Navigate", exact: true }).click();
  const dayDialog = page.getByRole("dialog", {
    name: "When are you visiting?",
  });
  await expect(dayDialog).toBeVisible();
  await expect(dayDialog).toContainText(
    "Some creators in this list only attend on certain days.",
  );
  await dayDialog.getByRole("button", { name: "Sunday", exact: true }).click();
  const sheet = page.getByRole("region", { name: "Visit path", exact: true });
  await expect(sheet).toBeVisible();
  await expect(list).not.toBeVisible();
  const nav = sheet.getByRole("navigation", { name: "Visit path navigation" });
  await expect(nav).toContainText("Stop 1 of");
  await expect(sheet.locator(".visit-destination-name")).not.toBeEmpty();
  await nav.getByRole("button", { name: "Next route stop" }).click();
  await expect(nav).toContainText("Stop 2 of");
  await sheet.getByRole("button", { name: "Saturday", exact: true }).click();
  const warning = page.getByRole("dialog", { name: "Switch to Saturday?" });
  await expect(warning).toContainText("stop 1");
  await warning.getByRole("button", { name: "Keep current day" }).click();
  await expect(nav).toContainText("Stop 2 of");
  await expect(
    sheet.getByRole("button", { name: "Sunday", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: "Saturday", exact: true }).click();
  await warning
    .getByRole("button", { name: "Switch to Saturday", exact: true })
    .click();
  await expect(nav).toContainText("Stop 1 of");
  await sheet.getByRole("button", { name: "Sunday", exact: true }).click();
  await expect(nav).toContainText("Stop 1 of");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const mapTransform = () =>
    page.locator(".map-canvas").evaluate((el) => {
      const matrix = (el as HTMLCanvasElement).getContext("2d")!.getTransform();
      return { scale: matrix.a, x: matrix.e, y: matrix.f };
    });
  // Wait for route framing before comparing the return animation's destination.
  await page.waitForTimeout(500);
  const routeTransform = await mapTransform();
  await nav
    .getByRole("button", { name: /^Open details for / })
    .first()
    .click();
  await expect(
    page.getByRole("region", { name: "Creator details", exact: true }),
  ).toBeVisible();
  if (process.env.ANALYTICS_E2E) {
    await expect
      .poll(
        () =>
          captured.filter((e) => e.name === "creator_opened").at(-1)?.data
            .source,
      )
      .toBe("visit_path");
    await page
      .getByRole("button", { name: "Add to favorites", exact: true })
      .click();
    await expect
      .poll(
        () =>
          captured.filter((e) => e.name === "bookmark_changed").at(-1)?.data
            .origin,
      )
      .toBe("visit_path");
  }
  await expect
    .poll(async () =>
      Math.abs((await mapTransform()).scale - routeTransform.scale),
    )
    .toBeGreaterThan(0.01);
  await page
    .getByRole("button", { name: "Close creator details", exact: true })
    .click();
  await expect(sheet).toBeVisible();
  await expect
    .poll(async () => {
      const current = await mapTransform();
      return Math.max(
        Math.abs(current.scale - routeTransform.scale),
        Math.abs(current.x - routeTransform.x),
        Math.abs(current.y - routeTransform.y),
      );
    })
    .toBeLessThan(0.5);
  if (info.project.name === "mobile") {
    await expect
      .poll(async () => (await sheet.boundingBox())!.height)
      .toBeCloseTo(176, 0);
    await expect(sheet.getByRole("list", { name: "Visit order" })).toHaveCount(
      0,
    );
    await page.screenshot({ path: info.outputPath("route-collapsed.png") });
    const grip = (await sheet.locator(".grip").boundingBox())!;
    const client = await context.newCDPSession(page);
    const x = grip.x + grip.width / 2,
      y = grip.y + grip.height / 2;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 1, x, y }],
    });
    for (let i = 1; i <= 12; i++)
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ id: 1, x, y: y - (580 * i) / 12 }],
      });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(
      sheet.getByRole("button", { name: "Collapse panel", exact: true }),
    ).toBeVisible();
  }
  const order = sheet.getByRole("list", { name: "Visit order" });
  await expect(order).toBeVisible();
  await page.screenshot({ path: info.outputPath("route-expanded.png") });
  await sheet.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(nav).toContainText("Whole visit path");
  if (info.project.name === "mobile") {
    await expect
      .poll(async () => (await sheet.boundingBox())!.height)
      .toBeCloseTo(176, 0);
    await expect(sheet.locator(".visit-path-header")).toHaveCSS(
      "border-bottom-color",
      "rgba(0, 0, 0, 0)",
    );
  }
  await expand(sheet);
  await sheet
    .getByRole("button", { name: "Follow route", exact: true })
    .click();
  await expand(sheet);
  await order
    .getByRole("button", { name: "Show path", exact: true })
    .nth(1)
    .click();
  await expect(nav).toContainText("Stop 2 of");
  if (info.project.name === "mobile")
    await expect
      .poll(async () => (await sheet.boundingBox())!.height)
      .toBeCloseTo(176, 0);
  await expand(sheet);
  await order.locator(".visit-stop-creator").first().click();
  await page
    .getByRole("button", { name: "Close creator details", exact: true })
    .click();
  await expect(sheet).toBeVisible();
  await sheet
    .getByRole("button", { name: "Back to list", exact: true })
    .click();
  await expect(list).toBeVisible();
});

test("day choices survive closing the route page but reset when the booth list closes", async ({
  page,
  isMobile,
}) => {
  await page.route("https://cf23-config.nnt.gg/**", (r) => r.abort());
  await page.goto(url);
  const list = page.getByRole("region", { name: "Booth list", exact: true });
  await list.getByRole("button", { name: "Navigate", exact: true }).click();
  await page
    .getByRole("dialog", { name: "When are you visiting?" })
    .getByRole("button", { name: "Saturday", exact: true })
    .click();
  const sheet = page.getByRole("region", { name: "Visit path", exact: true });
  await expect(sheet).toBeVisible();
  await expand(sheet);
  const ready = () => expect(sheet.getByRole("status")).toContainText("stops");
  await ready();
  const order = sheet.getByRole("list", { name: "Visit order" });
  const first = order.locator("li").nth(1);
  const booth = await first.locator("strong").innerText();
  const creatorName = (
    await first.locator(".visit-stop-creator").allTextContents()
  ).join(" · ");
  const row = order.locator("li").filter({
    has: page.locator("strong", { hasText: new RegExp(`^${booth}$`) }),
  });
  const count = await order.locator("li").count();
  await first.getByRole("button", { name: "Skip", exact: true }).click();
  await ready();
  await expect(row).toHaveClass("visit-stop-skipped");
  await expect(order.locator("li")).toHaveCount(count);
  await sheet.getByRole("button", { name: "Next route stop" }).click();
  await expect(sheet.getByRole("navigation")).toContainText("Stop 2 of");
  await row
    .getByRole("button", { name: "Start from here", exact: true })
    .click();
  const startDialog = page.getByRole("dialog", {
    name: `Start from ${creatorName}?`,
    exact: true,
  });
  await expect(startDialog).toBeVisible();
  await startDialog.getByRole("button", { name: "Keep current route" }).click();
  await expect(sheet.getByRole("navigation")).toContainText("Stop 2 of");
  await expect(sheet.locator(".visit-path-content")).toHaveAttribute(
    "aria-hidden",
    "false",
  );
  await row
    .getByRole("button", { name: "Start from here", exact: true })
    .click();
  await startDialog
    .getByRole("button", { name: "Start from here", exact: true })
    .click();
  await expect(sheet.getByRole("navigation")).toContainText("Stop 1 of");
  if (isMobile)
    await expect(sheet.locator(".visit-path-content")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  await expand(sheet);
  await ready();
  await sheet.getByRole("button", { name: "Sunday", exact: true }).click();
  await ready();
  await expect(order.locator(".visit-stop-skipped")).toHaveCount(0);
  await expect(order.locator(".visit-route-entrance")).toContainText(
    "Starting here",
  );
  await sheet.getByRole("button", { name: "Saturday", exact: true }).click();
  await ready();
  await expect(row).toContainText("Starting here");
  await sheet
    .getByRole("button", { name: "Back to list", exact: true })
    .click();
  await list.getByRole("button", { name: "Navigate", exact: true }).click();
  await page
    .getByRole("dialog", { name: "When are you visiting?" })
    .getByRole("button", { name: "Saturday", exact: true })
    .click();
  await expect(sheet).toBeVisible();
  await expand(sheet);
  await ready();
  await expect(row).toHaveClass("visit-stop-skipped");
  await expect(row).toContainText("Starting here");
  await sheet.getByRole("button", { name: "Next route stop" }).click();
  await expect(sheet.getByRole("navigation")).toContainText("Stop 2 of");
  await order
    .locator(".visit-route-entrance")
    .getByRole("button", { name: "Start from here" })
    .click();
  await page
    .getByRole("dialog", { name: "Start from Entrance?", exact: true })
    .getByRole("button", { name: "Start from here", exact: true })
    .click();
  await expect(sheet.getByRole("navigation")).toContainText("Stop 1 of");
  if (isMobile)
    await expect(sheet.locator(".visit-path-content")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  await expand(sheet);
  await ready();
  await row.getByRole("button", { name: "Unskip", exact: true }).click();
  await ready();
  await expect(order.locator(".visit-stop-skipped")).toHaveCount(0);
  await row.getByRole("button", { name: "Skip", exact: true }).click();
  await ready();
  await sheet
    .getByRole("button", { name: "Back to list", exact: true })
    .click();
  await list.getByRole("button", { name: "Add all…", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Add to collection" })
    .getByRole("button", { name: /Favorites/ })
    .click();
  await list
    .getByRole("button", { name: "Close booth list", exact: true })
    .click();
  await page.getByRole("button", { name: "Favorites", exact: true }).click();
  const favorites = page.getByRole("region", {
    name: "Favorites",
    exact: true,
  });
  await favorites
    .getByRole("button", { name: "Navigate", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "When are you visiting?" })
    .getByRole("button", { name: "Saturday", exact: true })
    .click();
  await expect(sheet).toBeVisible();
  await expand(sheet);
  await ready();
  await expect(order.locator(".visit-stop-skipped")).toHaveCount(0);
  await expect(order.locator(".visit-route-entrance")).toContainText(
    "Starting here",
  );
  if (process.env.ANALYTICS_E2E) {
    await expect
      .poll(
        () =>
          captured.filter(
            (e) => e.name === "visit_path_action" && e.data.action === "opened",
          ).length,
      )
      .toBe(3);
    const actions = captured.filter((e) => e.name === "visit_path_action");
    expect(actions.map((e) => e.data.action)).toEqual(
      expect.arrayContaining([
        "navigate",
        "day_prompt",
        "day_selected",
        "opened",
        "closed",
        "next",
        "skip",
        "unskip",
        "start_prompt",
        "start_cancel",
        "start_confirm",
      ]),
    );
    expect(
      actions.filter((e) => e.data.action === "start_confirm"),
    ).toHaveLength(2);
    expect(
      new Set(
        actions
          .filter((e) => e.data.list_kind === "custom")
          .map((e) => e.data.route_id),
      ).size,
    ).toBe(1);
    expect(
      actions.find((e) => e.data.list_kind === "favorites")!.data.route_id,
    ).not.toBe(actions[0].data.route_id);
    expect(
      captured.some(
        (e) =>
          e.name === "visit_path_calculated" &&
          e.data.stop_count > 0 &&
          e.data.outcome === "ready",
      ),
    ).toBe(true);
    if (isMobile)
      expect(
        captured.some(
          (e) =>
            e.name === "sheet_state_changed" &&
            e.data.sheet === "visit_path" &&
            e.data.state === "collapsed",
        ),
      ).toBe(true);
  }
});
