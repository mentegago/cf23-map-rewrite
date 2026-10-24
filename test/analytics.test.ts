import { afterEach, beforeEach, expect, it, vi } from "vitest";
const constructor = vi.fn();
const configure = vi.fn();
const emit = vi.fn();
const flushBeforeReload = vi.fn();
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv("PROD", true);
  vi.stubEnv("VITE_UMAMI_ENDPOINT", "https://example.test/api/send");
  vi.stubEnv("VITE_UMAMI_WEBSITE_ID", "test");
  vi.stubEnv("VITE_UMAMI_HOSTNAME", "example.test");
  constructor.mockReset();
  configure.mockReset();
  emit.mockReset();
  flushBeforeReload.mockReset();
  vi.doMock("../src/data/analyticsDelivery", () => ({
    Analytics: class {
      constructor() {
        constructor();
      }
      configure = configure;
      emit = emit;
      flushBeforeReload = flushBeforeReload;
    },
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.doUnmock("../src/data/analyticsDelivery");
});
it("does no initialization or delivery in the UI call stack", async () => {
  const { analytics } = await import("../src/data/analytics");
  expect(constructor).not.toHaveBeenCalled();
  expect(analytics.emit("map_interacted", { action: "pan" })).toBeUndefined();
  expect(constructor).not.toHaveBeenCalled();
  expect(emit).not.toHaveBeenCalled();
  await vi.runAllTimersAsync();
  expect(constructor).toHaveBeenCalledTimes(1);
  expect(emit).toHaveBeenCalledWith(
    "map_interacted",
    { action: "pan" },
    expect.objectContaining({ at: expect.any(Number) }),
  );
});
it("contains initialization failures without rejecting or retrying on every interaction", async () => {
  constructor.mockImplementation(() => {
    throw Error("Crypto/storage unavailable");
  });
  const { analytics } = await import("../src/data/analytics");
  analytics.emit("map_interacted", { action: "pan" });
  await expect(vi.runAllTimersAsync()).resolves.toBeDefined();
  analytics.emit("map_interacted", { action: "zoom" });
  await vi.runAllTimersAsync();
  expect(constructor).toHaveBeenCalledTimes(1);
});
it("contains synchronous and asynchronous failures and still processes later events", async () => {
  emit
    .mockImplementationOnce(() => {
      throw Error("Invalid event");
    })
    .mockRejectedValueOnce(Error("Network/storage rejected"))
    .mockResolvedValue(undefined);
  const { analytics } = await import("../src/data/analytics");
  for (let i = 0; i < 3; i++)
    analytics.emit("map_interacted", { action: "pan" });
  await vi.runAllTimersAsync();
  expect(emit).toHaveBeenCalledTimes(3);
});
it("bounds the deferred queue during bursts", async () => {
  const { analytics } = await import("../src/data/analytics");
  for (let i = 0; i < 2500; i++)
    analytics.emit("map_interacted", { action: "pan" });
  await vi.runAllTimersAsync();
  expect(emit).toHaveBeenCalledTimes(2000);
});
it("never loads delivery when analytics is disabled", async () => {
  vi.stubEnv("VITE_UMAMI_ENDPOINT", "");
  const { analytics } = await import("../src/data/analytics");
  analytics.emit("map_interacted", { action: "pan" });
  await vi.runAllTimersAsync();
  expect(constructor).not.toHaveBeenCalled();
});

it("bounds reload flushing to 300ms even when delivery never resolves", async () => {
  flushBeforeReload.mockImplementation(() => new Promise(() => {}));
  const { analytics } = await import("../src/data/analytics");
  let done = false;
  const flushed = analytics.flushBeforeReload().then(() => {
    done = true;
  });
  await vi.advanceTimersByTimeAsync(299);
  expect(done).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await flushed;
  expect(done).toBe(true);
});

it("captures action time, visibility and flat fields before deferred processing", async () => {
  const doc = { visibilityState: "visible" };
  vi.stubGlobal("document", doc);
  try {
    vi.setSystemTime(120000);
    const { analytics } = await import("../src/data/analytics");
    const fields = { action: "pan" as "pan" | "zoom" };
    analytics.emit("map_interacted", fields);
    fields.action = "zoom";
    doc.visibilityState = "hidden";
    vi.setSystemTime(180000);
    await vi.runAllTimersAsync();
    expect(emit).toHaveBeenCalledWith(
      "map_interacted",
      { action: "pan" },
      { at: 120000, visible: true },
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
