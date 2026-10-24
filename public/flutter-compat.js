// Flutter's older bootstrap sends a string; Workbox uses {type:'SKIP_WAITING'}.
// Keep both protocols at the original worker URL during a same-origin cutover.
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});
// An old Flutter cache-first navigation may otherwise keep serving Flutter's
// index.html indefinitely. Only the first React install takes over automatically;
// later React builds use the explicit Update app button. Install success still
// depends on Workbox precaching every required file.
self.addEventListener("install", (event) => {
  if (new URL(self.registration.scope).pathname !== "/") return;
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      if (
        names.includes("flutter-app-cache") &&
        !names.includes("cf23-web-installed")
      ) {
        await self.skipWaiting();
      }
    })(),
  );
});
self.addEventListener("activate", (event) => {
  if (new URL(self.registration.scope).pathname !== "/") return;
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      const firstCutover =
        names.includes("flutter-app-cache") &&
        !names.includes("cf23-web-installed");
      const marker = await caches.open("cf23-web-installed");
      await marker.put(
        new Request(new URL("/.cf23-web-installed", self.location.origin)),
        new Response("1"),
      );
      if (firstCutover) {
        await self.clients.claim();
        const clients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        // Navigation fetches wait for activation to finish. Awaiting them here
        // would deadlock the activation that is supposed to serve the new shell.
        for (const client of clients)
          void client.navigate(client.url).catch(() => {});
      }
    })(),
  );
});
