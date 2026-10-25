import { test, expect } from "@playwright/test";
test("swiping an unfocused search field opens and collapses the sheet without focusing it", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "mobile");
  await page.route("https://**/*", (r) => r.abort());
  await page.goto("/");
  const input = page.getByRole("textbox");
  await expect(input).toBeVisible();
  await expect(input).not.toBeFocused();
  const box = (await input.boundingBox())!;
  const client = await context.newCDPSession(page);
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id: 1, x, y }],
  });
  for (let i = 1; i <= 12; i++) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ id: 1, x, y: y - i * 35 }],
    });
  }
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(() =>
      page
        .getByRole("region", { name: "Creator directory" })
        .evaluate((el) => el.getBoundingClientRect().height / innerHeight),
    )
    .toBeCloseTo(0.94, 2);
  await expect(input).not.toBeFocused();
  await expect(input).toHaveValue("");
  const expandedBox = (await input.boundingBox())!;
  const downX = expandedBox.x + expandedBox.width / 2;
  const downY = expandedBox.y + expandedBox.height / 2;
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id: 1, x: downX, y: downY }],
  });
  for (let i = 1; i <= 12; i++) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ id: 1, x: downX, y: downY + i * 35 }],
    });
  }
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(() =>
      page
        .getByRole("region", { name: "Creator directory" })
        .evaluate((el) => el.getBoundingClientRect().height / innerHeight),
    )
    .toBeLessThan(0.3);
  await expect(input).not.toBeFocused();
  await expect(input).toHaveValue("");
});

test("vertical tag drags resize the sheet without scrolling horizontally or selecting a fandom", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "mobile");
  await page.route("https://**/*", (r) => r.abort());
  await page.goto("/");
  const sheet = page.getByRole("region", { name: "Creator directory" });
  const strip = sheet.locator(".header-suggestions .suggestions");
  await expect(strip).toBeVisible();
  const client = await context.newCDPSession(page);
  const touch = (
    type: string,
    points: { id: number; x: number; y: number }[],
  ) => client.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  const drag = async (x: number, y: number, dx: number, dy: number) => {
    await touch("touchStart", [{ id: 1, x, y }]);
    for (let i = 1; i <= 12; i++)
      await touch("touchMove", [
        { id: 1, x: x + (dx * i) / 12, y: y + (dy * i) / 12 },
      ]);
    await touch("touchEnd", []);
  };
  let box = (await strip.boundingBox())!;
  await drag(box.x + 130, box.y + box.height / 2, 0, -420);
  await expect
    .poll(() =>
      sheet.evaluate((el) => el.getBoundingClientRect().height / innerHeight),
    )
    .toBeCloseTo(0.94, 2);
  await expect(page.getByRole("textbox")).toHaveValue("");
  box = (await strip.boundingBox())!;
  await drag(box.x + 280, box.y + box.height / 2, -220, 0);
  await expect
    .poll(() => strip.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(30);
  expect(
    await sheet.evaluate(
      (el) => el.getBoundingClientRect().height / innerHeight,
    ),
  ).toBeCloseTo(0.94, 2);
  box = (await strip.boundingBox())!;
  await drag(box.x + 140, box.y + box.height / 2, 0, 420);
  await expect
    .poll(() =>
      sheet.evaluate((el) => el.getBoundingClientRect().height / innerHeight),
    )
    .toBeLessThan(0.3);
  await expect(page.getByRole("textbox")).toHaveValue("");
});

test("native search input focus and selection are not handled by sheet gestures", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "mobile");
  await page.route("https://**/*", (r) => r.abort());
  await page.goto("/");
  const input = page.getByRole("textbox");
  await input.tap();
  await expect(input).toBeFocused();
  await input.fill("Honkai");
  const sheet = page.getByRole("region", { name: "Creator directory" });
  await expect
    .poll(() =>
      sheet.evaluate((el) => el.getBoundingClientRect().height / innerHeight),
    )
    .toBeCloseTo(0.94, 2);
  const box = (await input.boundingBox())!;
  const client = await context.newCDPSession(page);
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id: 1, x, y }],
  });
  for (let i = 1; i <= 10; i++) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ id: 1, x, y: y + i * 35 }],
    });
    await expect(sheet).not.toHaveClass(/dragging/);
  }
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("Honkai");
  await input.press("ControlOrMeta+A");
  expect(
    await input.evaluate((el) => ({
      start: (el as HTMLInputElement).selectionStart,
      end: (el as HTMLInputElement).selectionEnd,
    })),
  ).toEqual({ start: 0, end: 6 });
  await input.press("Backspace");
  await expect(input).toHaveValue("");
});
