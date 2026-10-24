import type { Catalog } from "../domain/search";
import type { Analytics, Fields } from "./analyticsDelivery";
import { captureOccurrence } from "./analyticsEvents";

// Capture occurrence metadata at the action; initialization, storage and network
// delivery remain deferred and never run inside a UI event handler.
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
    if (pending.length >= 2000) pending.shift();
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
  flushBeforeReload(): Promise<void> {
    if (!enabled || unavailable) return Promise.resolve();
    return new Promise((resolve) => {
      const deadline = setTimeout(resolve, 300);
      enqueue(async (client) => {
        try {
          await client.flushBeforeReload();
        } finally {
          clearTimeout(deadline);
          resolve();
        }
      });
    });
  },
  start(): void {
    enqueue(() => {});
  },
  activity(): void {
    try {
      const occurrence = captureOccurrence();
      enqueue((client) => client.activity(occurrence));
    } catch {
      /* Telemetry must not interrupt user actions. */
    }
  },
  configure(catalog: Catalog, version: number): void {
    enqueue((client) => client.configure(catalog, version));
  },
  emit<K extends keyof Fields>(name: K, fields: Fields[K]): void {
    try {
      const occurrence = captureOccurrence();
      const captured = { ...fields };
      enqueue((client) => client.emit(name, captured, occurrence));
    } catch {
      /* Telemetry must not interrupt user actions. */
    }
  },
};
