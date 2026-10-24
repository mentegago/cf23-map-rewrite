import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      filename: "flutter_service_worker.js",
      registerType: "prompt",
      injectRegister: false,
      manifest: false,
      workbox: {
        importScripts: ["flutter-compat.js"],
        globPatterns: ["**/*.{js,css,html,json,png,svg,jpg,ttf}"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "cf23-web-images-v1",
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 86400 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: { target: "es2022" },
  server: { port: 5173, allowedHosts: [".trycloudflare.com"] },
  preview: { allowedHosts: [".trycloudflare.com"] },
});
