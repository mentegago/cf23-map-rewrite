import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { encodeList } from "../src/domain/links";

const catalog = JSON.parse(
  readFileSync("public/data/catalog-initial.json", "utf8"),
);
const ids = catalog.exhibitors
  .slice(0, 2)
  .map((c: { id: number }) => Number(c.id));

for (const mode of ["native", "cancel", "fallback"] as const) {
  test(`creator and list sharing: ${mode}`, async ({ page }) => {
    await page.route("https://cf23-config.nnt.gg/**", (route) => route.abort());
    await page.addInitScript(
      ({ mode, ids }) => {
        localStorage.setItem(
          "flutter.favorite_creator_ids",
          JSON.stringify(ids.map(String)),
        );
        const state = window as unknown as {
          shared: ShareData[];
          copied: string[];
        };
        state.shared = [];
        state.copied = [];
        Object.defineProperty(navigator, "share", {
          value:
            mode === "fallback"
              ? undefined
              : async (data: ShareData) => {
                  state.shared.push(data);
                  if (mode === "cancel")
                    throw new DOMException("Cancelled", "AbortError");
                },
        });
        Object.defineProperty(navigator, "clipboard", {
          value: {
            writeText: async (text: string) => {
              state.copied.push(text);
            },
          },
        });
      },
      { mode, ids },
    );
    for (const kind of ["list", "favorites", "creator"] as const) {
      await page.goto(
        kind === "list"
          ? `/?list=${encodeList(ids)}`
          : kind === "creator"
            ? `/?creator_id=${ids[0]}`
            : "/",
      );
      if (kind === "favorites") await page.locator(".favorites-tag").click();
      await page
        .getByRole("button", {
          name:
            kind === "list"
              ? "Share booth list"
              : kind === "favorites"
                ? "Share Favorites"
                : "Share creator",
          exact: true,
        })
        .click();
      const expected =
        kind === "creator" ? `creator_id=${ids[0]}` : `list=${encodeList(ids)}`;
      await expect
        .poll(() =>
          page.evaluate(() => {
            const state = window as unknown as {
              shared: ShareData[];
              copied: string[];
            };
            return { shared: state.shared, copied: state.copied };
          }),
        )
        .toEqual(
          mode === "fallback"
            ? { shared: [], copied: [expect.stringContaining(expected)] }
            : {
                shared: [
                  {
                    title: expect.any(String),
                    url: expect.stringContaining(expected),
                  },
                ],
                copied: [],
              },
        );
    }
  });
}
