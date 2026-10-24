# CF23 Map — web rewrite

A React + TypeScript rewrite of the Flutter CF23 booth map. Vite produces a static site; no application server or Flutter runtime is required. The original map geometry, catalog, fonts, palettes, creator flows, and mobile sheet positions are retained.

## Develop

Use Node 22.12 or newer.

```sh
npm ci
npm run dev
```

```sh
npm test          # domain, geometry, storage compatibility
npm run build    # strict TypeScript + production bundle + offline precache
npm run preview  # production preview; required for service-worker testing
```

Browser tests use Playwright with Microsoft Edge installed locally. Start the production preview on port 5180 with `node node_modules/vite/bin/vite.js preview --port 5180`, then run `npm run test:e2e`. To use bundled Chromium instead, change `channel` in `playwright.config.ts` and install the browser with Playwright. Tests create isolated browser profiles and do not modify your regular browser's favorites.

## Architecture

| Module            | Responsibility                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `src/domain/`     | Typed data, indexed fuzzy search, fandom hierarchy, shared-link codec, recommendation ranking   |
| `src/data/`       | Original storage formats, validated snapshots and background refresh, optional queued analytics |
| `src/map/`        | Canvas painter, spatial hit testing, coordinate transforms, pointer gestures and animation      |
| `src/state/`      | Application orchestration and asynchronous recommendation-worker lifecycle                      |
| `src/components/` | Directory virtualization, mobile sheets, profiles, image gallery, map controls and update UI    |
| `src/styles.css`  | Original theme tokens, light/dark appearance, responsive layout and safe areas                  |

The map controller owns its transform and requestAnimationFrame loop. Pointer motion does not update React state. Creator rows are virtualized with TanStack Virtual. Recommendations run in a module Web Worker; obsolete results are ignored. Search results are cached in the catalog index. All rendered source strings use React text rendering; external links are restricted to HTTP(S).

## GitHub Pages deployment

The `master` branch deploys through `.github/workflows/deploy.yml`. Pull requests run the same unit, browser, and build checks without publishing. CI installs Chromium and starts its own production preview; local browser tests continue to use Microsoft Edge.

In `mentegago/cf23-map-rewrite`, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. Push `master` or run the workflow manually. The default site is `https://mentegago.github.io/cf23-map-rewrite/`.

For optional analytics, configure repository secrets `UMAMI_ENDPOINT`, `UMAMI_WEBSITE_ID`, and `UMAMI_HOSTNAME`; the workflow maps these to the Vite build variables. Without them, analytics stays disabled.

For a custom domain serving the app at `/`, configure the domain in Pages settings and set the repository variable `PAGES_BASE_PATH` to `/` before deploying. The default is `/cf23-map-rewrite/`. App assets, bundled data, the manifest, and the service worker follow this base path. The Flutter worker compatibility handler only runs for root-scope deployments.

Browser storage is origin-scoped: the new GitHub Pages origin cannot read favorites from the old custom domain. Deploying later at the original origin preserves the existing storage compatibility. GitHub Pages does not apply `public/_headers`; those rules are for hosts that support that file.

## Offline and updates

Production builds precache the app, worker, fonts, icons, and all bundled map/catalog/fandom/proximity data (about 6.5 MB uncompressed). Once the offline-ready notice appears, map browsing, search, favorites, recommendations, and saved links work offline. Viewed external images are cached separately, up to 500 images for 60 days; images that have never been loaded still need a connection.

App versions come from build-content hashes in the service worker's precache manifest. There is no manually maintained refresh number. The browser checks on launch, every minute while visible/online, on foregrounding, and on reconnect. A complete new build waits behind **Update app**; failed installations retain the old app. Activation reloads clients to avoid mixing old code and new assets.

Catalog/map versions remain the configuration service's versions. They are checked independently on startup, reconnect, foregrounding, and hourly. A complete replacement is validated before the visible state changes. Bad updates and network failures preserve the current data and map position.

## Same-domain cutover

Deploy `dist/` at the **same origin and root path** as the Flutter app. Existing favorites, recommendation profiles, catalog snapshots and map snapshots are used directly. No database upgrade, key rename, export/import, or destructive migration runs. See [storage contracts](docs/STORAGE.md) for the exact formats.

The worker keeps the URL `/flutter_service_worker.js` and root scope. `flutter-compat.js` accepts the older Flutter activation message and handles a historical cache-first Flutter worker's first transition. Later web-to-web updates use the normal user-controlled update flow. Existing IndexedDB databases, localStorage, and Flutter caches are not cleared.

Serve the worker and HTML with revalidation/no-cache headers, and deploy the directory atomically. Hashed `/assets/` files can be immutable. `public/_headers` provides these rules for hosts that support that format; configure the equivalent rules on other hosts. HTTPS is required outside localhost for offline service workers. A browser that is already offline cannot receive a new deployment until it reconnects.

## Data and analytics

Bundled fallbacks come from the original Flutter checkout. Runtime updates use `https://cf23-config.nnt.gg/`. To refresh fallbacks from the companion repository:

```sh
node scripts/sync-data.mjs Y:/Projects/Programming/cf23-data/public
npm test
npm run build
```

Optional Umami delivery uses the existing `cf23-analytics` event queue and lease schema. Configure the three `VITE_UMAMI_*` build variables from `.env.example` with the existing deployment values. Without them, collection/delivery is disabled and the existing queue is left untouched. Search events contain resolved IDs/counts, never raw search text or shared-link contents.

## Fidelity and verification

- Original 400px desktop sidebar and 768px breakpoint; mobile search sheet at a safe-area-aware collapsed height or 94%, details at 28%/56%/94%.
- Pan, pinch, wheel zoom, inertia, hit testing, shared-booth selection, animated focus, grip/header sheet dragging, and restoration of directory scroll/query/extent.
- Favorites, bulk add, copy booth codes, compressed and legacy list links, fandom/alias/booth search, creator links, circle artwork, native gallery scroll-snap paging and image pinch zoom, curated maps and Surprise me.
- Light/dark themes, reduced motion, keyboard map controls, accessible buttons and native modal focus handling.
- Tested: real-data unit tests, unchanged Flutter storage fixtures, desktop/mobile browser flows, real touch gestures, offline reload, and service-worker update activation.

Intentional differences: extra map zoom/overview controls and explicit copy-booth action; browser-native text input/dialog behavior; the recommendation diversity sampler uses a deterministic JavaScript PRNG rather than Dart's PRNG, so the lower-ranked order can differ. The original derived recommendation-result cache is retained, while results are recalculated from the compatible profile. Analytics preserves the queue and principal event contracts, but does not reproduce every Flutter-specific UI instrumentation event. Mobile tests use Chromium device emulation; physical iOS Safari/Android testing remains a deployment acceptance step.

Only the current data system is supported: catalog/registry schema 1.x, map schema 2, proximity schema 1, and recommendation profile schema 2. Obsolete localStorage snapshot caches and Flutter's old data migrations are excluded. Current IndexedDB records and localStorage preferences retain their exact formats.

Analytics is best-effort and isolated behind a lazy-loaded delivery module. UI calls only enqueue deferred work (bounded to 128 pending jobs); they never wait for initialization, ID generation, storage, or network delivery. Initialization failures disable delivery for the session; individual event failures are contained. Disabled analytics never loads the delivery module. Regression tests inject synchronous/asynchronous failures and verify queue limits.

Native interaction policy: directory/detail content, horizontal fandom tags, gallery paging and zoomed-image panning use browser overflow scrolling. Momentum, touch cancellation and button clicks use browser behavior. Sheet resize gestures work on the grip/header, including an unfocused search field. Search and creator detail content also allow a fresh downward swipe starting at the top to collapse their sheet; a native scroll that reaches the top never transfers into a sheet drag. Focused fields and long presses stay browser-owned. Upward swipes on a partially expanded creator detail sheet expand it before scrolling. The content gesture never writes scrollTop or simulates momentum. Gallery arrows/dots use native smooth scroll with CSS snap points, while two-finger gallery pinch gestures zoom the image around the touch midpoint (1–5x), leaving single-finger panning native. Gallery images load serially in page order, advancing after success or failure; closing the gallery stops scheduling further pages. The canvas map retains its dedicated pan/zoom controller.
