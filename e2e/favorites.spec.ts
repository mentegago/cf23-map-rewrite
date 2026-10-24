import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const catalog = JSON.parse(
  readFileSync("public/data/catalog-initial.json", "utf8"),
);
const creator = catalog.exhibitors.find(
  (c: any) =>
    c.assets.gallery.length > 1 &&
    c.spaces.some((s: any) => /^[A-Z]-/.test(s.code)),
);
test.beforeEach(async ({ page }) => {
  await page.route("https://**/*", (r) => r.abort());
});

test("saving a recommendation keeps the current row in place until leaving the list", async ({
  page,
}, info) => {
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
  // Allow the old worker debounce to elapse: the displayed row must not vanish.
  await page.waitForTimeout(800);
  await expect(first.locator("strong")).toHaveText(name);
  await expect(
    first.getByRole("button", {
      name: `Remove ${name} from favorites`,
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(first.locator(".row-actions button").last()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Favorites", exact: true }).click();
  await page.waitForTimeout(800);
  await page
    .getByRole("button", { name: "Close favorites", exact: true })
    .click();
  await expect(first.locator("strong")).not.toHaveText(name);
});

test("row hearts save and remove favorites without opening creator details", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("textbox").fill(creator.name);
  const row = page
    .locator(".creator-row")
    .filter({ has: page.locator("strong", { hasText: creator.name }) })
    .first();
  const add = row.getByRole("button", {
    name: `Add ${creator.name} to favorites`,
    exact: true,
  });
  await add.click();
  await expect(
    row.getByRole("button", {
      name: `Remove ${creator.name} from favorites`,
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page).not.toHaveURL(/creator_id=/);
  await page.reload();
  await page.getByRole("button", { name: "Favorites", exact: true }).click();
  const sheet = page.getByRole("region", { name: "Favorites", exact: true });
  await sheet
    .getByRole("button", {
      name: `Remove ${creator.name} from favorites`,
      exact: true,
    })
    .click();
  await expect(sheet.getByText("No favorites yet")).toBeVisible();
  await expect(page).not.toHaveURL(/creator_id=/);
});

test("favorites fandom pills sort by count, combine selections, and preserve them through details", async ({
  page,
}, info) => {
  const saved = catalog.exhibitors
    .filter((c: any) => c.fandomIds.length)
    .slice(0, 8);
  const counts = new Map<number, number>();
  for (const c of saved)
    for (const id of new Set<number>(c.fandomIds))
      counts.set(id, (counts.get(id) || 0) + 1);
  const ids = [...counts].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const firstId = ids.find((id) => counts.get(id)! < saved.length)!;
  const secondId = ids.find((id) =>
    saved.some(
      (c: any) => c.fandomIds.includes(id) && !c.fandomIds.includes(firstId),
    ),
  )!;
  await page.addInitScript(
    (values) =>
      localStorage.setItem(
        "flutter.favorite_creator_ids",
        JSON.stringify(values.map(String)),
      ),
    saved.map((c: any) => c.id),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Favorites", exact: true }).click();
  const sheet = page.getByRole("region", { name: "Favorites", exact: true });
  const filters = sheet.getByRole("group", {
    name: "Filter favorites by fandom",
  });
  const all = filters.getByRole("button", { name: "All", exact: true });
  await expect(all).toHaveAttribute("aria-pressed", "true");
  const displayedCounts = await filters
    .locator(".favorites-filter-count")
    .allTextContents();
  expect(displayedCounts.map(Number)).toEqual(
    [...counts.values()].sort((a, b) => b - a),
  );
  const registry = JSON.parse(
    readFileSync("public/data/fandoms-initial.json", "utf8"),
  );
  const pill = (id: number) =>
    filters.getByRole("button", {
      name: `${registry.fandoms.find((f: any) => f.id === id).name} ${counts.get(id)}`,
      exact: true,
    });
  const first = pill(firstId),
    second = pill(secondId);
  await first.click();
  await expect(all).toHaveAttribute("aria-pressed", "false");
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.locator(".creator-row")).toHaveCount(counts.get(firstId)!);
  await second.click();
  const union = saved.filter(
    (c: any) => c.fandomIds.includes(firstId) || c.fandomIds.includes(secondId),
  );
  await expect(sheet.locator(".creator-row")).toHaveCount(union.length);
  await sheet.locator(".creator-select").first().click();
  await page
    .getByRole("button", {
      name:
        info.project.name === "mobile"
          ? "Close creator details"
          : "Back to favorites",
      exact: true,
    })
    .click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await first.click();
  await expect(sheet.locator(".creator-row")).toHaveCount(
    counts.get(secondId)!,
  );
  await all.click();
  await expect(all).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.locator(".creator-row")).toHaveCount(saved.length);
});

test("favorites button is hidden until a creator is saved", async ({
  page,
}) => {
  await page.goto("/");
  const button = page.getByRole("button", { name: "Favorites", exact: true });
  await expect(page.getByRole("textbox")).toBeVisible();
  await expect(button).toHaveCount(0);
  await page.evaluate((id) => {
    const key = "flutter.favorite_creator_ids";
    const newValue = JSON.stringify([String(id)]);
    localStorage.setItem(key, newValue);
    window.dispatchEvent(new StorageEvent("storage", { key, newValue }));
  }, creator.id);
  await expect(button).toHaveText("Favorites 1");
  await expect(
    page
      .getByRole("group", { name: "Creator filters" })
      .getByRole("button")
      .first(),
  ).toHaveAccessibleName("Favorites");
  await page.getByRole("textbox").fill("Genshin");
  await expect(button).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(button).toBeVisible();
  await page.evaluate(() => {
    const key = "flutter.favorite_creator_ids";
    localStorage.setItem(key, "[]");
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: "[]" }));
  });
  await expect(button).toHaveCount(0);
});
test("saved creators move out of the directory and hand off cleanly to gallery, details and map", async ({
  page,
}, info) => {
  await page.addInitScript(
    (id) =>
      localStorage.setItem(
        "flutter.favorite_creator_ids",
        JSON.stringify([String(id)]),
      ),
    creator.id,
  );
  await page.addInitScript(() => {
    const frames: { ms: number; active: number; transform: number[] }[] = [];
    Object.assign(window, { mapFrames: frames });
    let drawing = false,
      active = 0;
    const fillRect = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      if (this.canvas.classList.contains("map-canvas")) drawing = true;
      return fillRect.apply(this, args);
    };
    const stroke = CanvasRenderingContext2D.prototype.stroke;
    CanvasRenderingContext2D.prototype.stroke = function (
      ...args: [] | [Path2D]
    ) {
      if (
        this.canvas.classList.contains("map-canvas") &&
        this.lineWidth === 1.25 &&
        !["#4a4a4a", "#bdbdbd"].includes(String(this.strokeStyle))
      )
        active++;
      return args.length ? stroke.call(this, args[0]) : stroke.call(this);
    };
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback) =>
      raf.call(window, (time) => {
        drawing = false;
        active = 0;
        const start = performance.now();
        callback(time);
        if (drawing) {
          const ctx = document
            .querySelector<HTMLCanvasElement>(".map-canvas")!
            .getContext("2d")!;
          const t = ctx.getTransform();
          frames.push({
            ms: performance.now() - start,
            active,
            transform: [t.a, t.d, t.e, t.f],
          });
        }
      });
  });
  await page.goto("/");
  const button = page.getByRole("button", { name: "Favorites", exact: true });
  const sheet = page.getByRole("region", { name: "Favorites", exact: true });
  await expect(
    page
      .locator(".directory .section-heading")
      .filter({ hasText: /^Favorites$/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Share Favorites", exact: true }),
  ).toHaveCount(0);
  const active = () =>
    page.evaluate(() => (window as any).mapFrames.at(-1)?.active ?? 0);
  await page
    .getByRole("button", { name: "Show entire map", exact: true })
    .click();
  await page.waitForTimeout(900);
  await expect.poll(active).toBeGreaterThan(50);
  const baseline = await active();
  await expect(button).toHaveText("Favorites 1");
  await button.click();
  await expect.poll(active).toBeLessThan(10);
  await expect.poll(active).toBeGreaterThan(0);
  await expect(
    page.getByRole("button", { name: "Show on Map", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Copy booth codes", exact: true }),
  ).toHaveCount(0);
  if (info.project.name === "mobile")
    await expect
      .poll(() =>
        sheet.evaluate(
          (el) =>
            el.getBoundingClientRect().height /
            document.getElementById("app")!.clientHeight,
        ),
      )
      .toBeCloseTo(0.56, 1);
  await expect(
    sheet.getByText("1 saved creator", { exact: true }),
  ).toBeVisible();
  await expect(sheet.locator(".creator-select")).toHaveCount(1);
  await expect
    .poll(() =>
      sheet.evaluate(
        (el) =>
          el.getAnimations().filter((a) => a.playState === "running").length,
      ),
    )
    .toBe(0);
  await page.screenshot({ path: info.outputPath("favorites-saved.png") });
  await sheet
    .getByRole("button", { name: `View ${creator.name} catalog`, exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: `${creator.name} catalog`, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close gallery", exact: true })
    .click();
  await expect(sheet).toBeVisible();
  await sheet.locator(".creator-select").click();
  await expect(sheet).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: creator.name, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name:
        info.project.name === "mobile"
          ? "Close creator details"
          : "Back to favorites",
      exact: true,
    })
    .click();
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByText("1 saved creator", { exact: true }),
  ).toBeVisible();
  await sheet
    .getByRole("button", { name: "Close favorites", exact: true })
    .click();
  await expect(sheet).toHaveCount(0);
  await page
    .getByRole("button", { name: "Show entire map", exact: true })
    .click();
  await expect.poll(active).toBe(baseline);
});

test("large favorites lists remain virtualized and scroll natively", async ({
  page,
  context,
}, info) => {
  const ids = catalog.exhibitors.slice(0, 200).map((c: any) => String(c.id));
  await page.addInitScript(
    (ids) =>
      localStorage.setItem("flutter.favorite_creator_ids", JSON.stringify(ids)),
    ids,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Favorites", exact: true }).click();
  const sheet = page.getByRole("region", { name: "Favorites", exact: true });
  await expect(
    sheet.getByText("200 saved creators", { exact: true }),
  ).toBeVisible();
  expect(await sheet.locator(".creator-row").count()).toBeLessThan(30);
  const scroll = sheet.locator(".favorites-list");
  if (info.project.name === "mobile")
    await sheet
      .getByRole("button", { name: "Expand panel", exact: true })
      .click();
  await expect(scroll).toHaveCSS("overflow-y", "auto");
  await scroll.evaluate((el) =>
    el.scrollTo({ top: el.scrollHeight, behavior: "instant" }),
  );
  await expect
    .poll(() => scroll.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(10000);
  await expect(sheet.locator('[data-index="199"]')).toBeVisible();
  if (info.project.name === "mobile") {
    await scroll.evaluate((el) => el.scrollTo({ top: 0, behavior: "instant" }));
    await sheet
      .getByRole("button", { name: "Collapse panel", exact: true })
      .click();
    await expect(scroll).toHaveCSS("overflow-y", "hidden");
    await expect
      .poll(() =>
        sheet.evaluate(
          (el) =>
            el.getAnimations().filter((a) => a.playState === "running").length,
        ),
      )
      .toBe(0);
    const box = (await scroll.boundingBox())!;
    const client = await context.newCDPSession(page);
    const x = box.x + box.width / 2,
      y = box.y + box.height - 20;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 1, x, y }],
    });
    for (let i = 1; i <= 10; i++)
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ id: 1, x, y: y - i * 20 }],
      });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
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
  }
});
