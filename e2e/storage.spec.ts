import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
test("opens a newer Flutter IndexedDB snapshot directly without changing its schema", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop");
  const read = (f: string) =>
    JSON.parse(readFileSync(`public/data/${f}.json`, "utf8"));
  const catalog = read("catalog-initial");
  catalog.exhibitors[0].name = "Legacy cached exhibitor";
  const records = {
    snapshot_v3: JSON.stringify({
      version: 999999,
      catalog,
      fandomRegistry: read("fandoms-initial"),
    }),
    map_v1: JSON.stringify({
      version: 999999,
      layout: read("map"),
      proximity: read("booth-proximity"),
    }),
  };
  // Seed precisely the native records produced by idb_shim, before loading React.
  await page.route("**/seed-storage", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>Test storage fixture</title>",
    }),
  );
  await page.goto("/seed-storage");
  await page.evaluate(async (records) => {
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.open("cf23-map", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("catalog");
      r.onerror = () => reject(r.error);
      r.onsuccess = () => {
        const tx = r.result.transaction("catalog", "readwrite");
        for (const [key, value] of Object.entries(records))
          tx.objectStore("catalog").put(value, key);
        tx.oncomplete = () => {
          r.result.close();
          resolve();
        };
      };
    });
  }, records);
  await page.route("https://cf23-config.nnt.gg/**", (route) => route.abort());
  await page.goto(`/?creator_id=${catalog.exhibitors[0].id}`);
  await expect(
    page.getByRole("heading", { name: "Legacy cached exhibitor" }),
  ).toBeVisible();
  const actual = await page.evaluate(async () => {
    const databases = await indexedDB.databases();
    return databases.filter((d) => d.name === "cf23-map");
  });
  expect(actual).toEqual([{ name: "cf23-map", version: 1 }]);
});
