import type { Catalog } from "../domain/search";
import type { Analytics, Fields } from "./analyticsDelivery";

// The UI only enqueues work. No browser APIs, IDs, storage, or delivery code run
// during module initialization or inside a UI event handler.
const enabled = !!(
  import.meta.env.PROD &&
  import.meta.env.VITE_UMAMI_ENDPOINT &&
  import.meta.env.VITE_UMAMI_WEBSITE_ID &&
  import.meta.env.VITE_UMAMI_HOSTNAME
);
type Job = (delivery: Analytics) => void | Promise<void>;
let pending: Job[] = [];
let scheduled = false;
let unavailable = false;
let delivery: Promise<Analytics> | undefined;

function enqueue(job: Job): void {
  try {
    if (!enabled || unavailable) return;
    if (pending.length >= 128) pending.shift();
    pending.push(job);
    schedule();
  } catch {
    scheduled = false;
    pending = [];
  }
}
function schedule(): void {
  try {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      const jobs = pending;
      pending = [];
      void (async () => {
        try {
          const client = await (delivery ??= import("./analyticsDelivery").then(
            (m) => new m.Analytics(),
          ));
          for (const run of jobs) {
            try {
              await run(client);
            } catch {
              /* Drop failed telemetry, never UI work. */
            }
          }
        } catch {
          unavailable = true;
          pending = [];
        } finally {
          scheduled = false;
          if (pending.length && !unavailable) schedule();
        }
      })();
    }, 0);
  } catch {
    scheduled = false;
    pending = [];
  }
}

export const analytics = {
  configure(catalog: Catalog, version: number): void {
    enqueue((client) => client.configure(catalog, version));
  },
  emit<K extends keyof Fields>(name: K, fields: Fields[K]): void {
    enqueue((client) => client.emit(name, fields));
  },
};
