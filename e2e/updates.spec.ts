import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
test("a new app worker waits for approval, activates, and still reloads offline", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "desktop");
  let version = 0;
  const root = path.resolve("dist");
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url!, "http://localhost").pathname;
      if (version === 0 && pathname === "/") {
        res
          .writeHead(200, {
            "Content-Type": "text/html",
            "Cache-Control": "no-store",
          })
          .end(
            `<h1>Legacy Flutter shell</h1><script>navigator.serviceWorker.register('/flutter_service_worker.js')</script>`,
          );
        return;
      }
      if (version === 0 && pathname === "/flutter_service_worker.js") {
        res.writeHead(200, {
          "Content-Type": "text/javascript",
          "Cache-Control": "no-store",
        }).end(`
          self.addEventListener('install', e => e.waitUntil(caches.open('flutter-app-cache').then(c => c.add('/')).then(() => self.skipWaiting())));
          self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
          self.addEventListener('fetch', e => { if(e.request.mode === 'navigate') e.respondWith(caches.match('/').then(r => r || fetch(e.request))); });
        `);
        return;
      }
      const file = path.resolve(
        root,
        pathname === "/" ? "index.html" : pathname.slice(1),
      );
      if (!file.startsWith(root + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      let content = await readFile(file);
      if (version === 3 && pathname === "/flutter_service_worker.js") {
        content = Buffer.from("importScripts('/missing-build-file.js');");
      }
      if (pathname === "/flutter_service_worker.js")
        content = Buffer.concat([
          content,
          Buffer.from(`\n// integration-build-${version}`),
        ]);
      const types: Record<string, string> = {
        ".js": "text/javascript",
        ".html": "text/html",
        ".css": "text/css",
        ".json": "application/json",
        ".ttf": "font/ttf",
        ".png": "image/png",
      };
      res
        .writeHead(200, {
          "Content-Type":
            types[path.extname(file)] || "application/octet-stream",
          "Cache-Control": "no-store",
        })
        .end(content);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  try {
    await page.route("https://cf23-config.nnt.gg/**", (r) => r.abort());
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await expect(
      page.getByRole("heading", { name: "Legacy Flutter shell" }),
    ).toBeVisible();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.evaluate(() =>
      localStorage.setItem("flutter.favorite_creator_ids", '["1"]'),
    );
    version = 1;
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())!.update();
    });
    await expect(page.getByRole("textbox")).toBeVisible();
    expect(
      await page.evaluate(() =>
        localStorage.getItem("flutter.favorite_creator_ids"),
      ),
    ).toBe('["1"]');
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    version = 2;
    await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      await r!.update();
    });
    await expect(
      page.getByRole("button", { name: "Update app" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            !!(await navigator.serviceWorker.getRegistration())?.waiting,
        ),
      )
      .toBe(true);
    // The existing textbox remains visible until the approved worker reloads.
    // Wait for that navigation before exercising the next update attempt.
    await Promise.all([
      page.waitForEvent("load"),
      page.getByRole("button", { name: "Update app" }).click(),
    ]);
    await expect(page.getByRole("textbox")).toBeVisible();
    await expect(page.getByRole("button", { name: "Update app" })).toHaveCount(
      0,
    );
    version = 3;
    expect(
      await page.evaluate(async () => {
        try {
          await (await navigator.serviceWorker.getRegistration())!.update();
          return false;
        } catch {
          return true;
        }
      }),
    ).toBe(true);
    await expect(page.getByRole("textbox")).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("textbox")).toBeVisible();
  } finally {
    await context.setOffline(false);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
