import { test, expect } from "@playwright/test";
test.use({ serviceWorkers: "block" });
test("update popup is accessible, can be deferred, and respects reduced motion", async ({
  page,
}, info) => {
  if (info.project.name === "mobile")
    await page.emulateMedia({ colorScheme: "dark" });
  await page.route("https://**/*", (r) => r.abort());
  await page.addInitScript(() => {
    navigator.serviceWorker.register = async () =>
      ({
        waiting: {
          postMessage: () => {
            document.documentElement.dataset.updateRequested = "true";
          },
        },
        installing: null,
        addEventListener() {},
        update: async () => {},
      }) as unknown as ServiceWorkerRegistration;
  });
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "A new version is ready!" });
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Update app", exact: true }),
  ).toBeFocused();
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-update-requested",
    "true",
  );
  await expect
    .poll(() =>
      dialog.evaluate(
        (el) =>
          el
            .getAnimations({ subtree: true })
            .filter((a) => a.playState === "running").length,
      ),
    )
    .toBe(0);
  await page.screenshot({ path: info.outputPath("update-popup.png") });
  await page.getByRole("button", { name: "Maybe later" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("textbox")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(dialog).toBeVisible();
  expect(
    await page
      .locator(".update-map")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.getByRole("button", { name: "Update app", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-update-requested",
    "true",
  );
});

test("partial mobile detail locks native scrolling and artwork expansion expands the sheet", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile");
  await page.route("https://**/*", (r) => r.abort());
  await page.goto("/?creator_id=1000436");
  const sheet = page.getByRole("region", { name: "Creator details" });
  const scroll = sheet.locator(".sheet-scroll");
  await expect(sheet).toBeVisible();
  await expect(scroll).toHaveCSS("overflow-y", "hidden");
  const before = await scroll.evaluate((el) => el.scrollTop);
  await scroll.hover();
  await page.mouse.wheel(0, 400);
  expect(await scroll.evaluate((el) => el.scrollTop)).toBe(before);
  await page
    .getByRole("button", { name: "Expand Circle Cut", exact: true })
    .click();
  await expect(sheet).not.toHaveClass(/scroll-locked/);
  await expect(scroll).toHaveCSS("overflow-y", "auto");
  await expect
    .poll(() =>
      sheet.evaluate(
        (el) =>
          el.getBoundingClientRect().height /
          document.getElementById("app")!.clientHeight,
      ),
    )
    .toBeCloseTo(0.94, 1);
  await page
    .getByRole("button", { name: "Collapse panel", exact: true })
    .click();
  await expect(scroll).toHaveCSS("overflow-y", "hidden");
});
