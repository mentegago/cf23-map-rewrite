import { expect, it, vi } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import schema from "./fixtures/analytics_event_schema.json";
import { AnalyticsLifecycle } from "../src/data/analyticsEvents";

const validate = new Ajv2020({ strict: false }).compile(schema);
const base = {
  schema_version: 3,
  event_edition: "comic-frontier-23",
  app_version: 102,
  client_event_id: "a".repeat(32),
  app_run_id: "b".repeat(32),
  sequence: 1,
  occurred_at_ms: 123,
};
const context = {
  route_id: "c".repeat(32),
  list_kind: "custom",
  day_mode: "selected",
  day_id: "2026-10-31",
} as const;
it("validates navigation events and rejects private fields and old-version reinterpretations", () => {
  const event = {
    name: "visit_path_action",
    data: { ...base, ...context, action: "start_confirm", target: "entrance" },
  };
  expect(validate(event), JSON.stringify(validate.errors)).toBe(true);
  expect(
    validate({ ...event, data: { ...event.data, schema_version: 2 } }),
  ).toBe(false);
  expect(
    validate({ ...event, data: { ...event.data, creator_ids: [1, 2] } }),
  ).toBe(false);
  expect(
    validate({ ...event, data: { ...event.data, day_id: "raw-input" } }),
  ).toBe(false);
  const opened = {
    name: "creator_opened",
    data: {
      ...base,
      creator_id: 1,
      source: "visit_path",
      route_id: context.route_id,
    },
  };
  expect(validate(opened), JSON.stringify(validate.errors)).toBe(true);
  expect(
    validate({ ...opened, data: { ...opened.data, schema_version: 2 } }),
  ).toBe(false);
});
it("requires calculation failure codes and distinguishes copy from native sharing outcomes", () => {
  const failed = {
    name: "visit_path_calculated",
    data: {
      ...base,
      ...context,
      outcome: "failed",
      count: 4,
      stop_count: 0,
      unreachable_count: 0,
      duration_ms: 10,
    },
  };
  expect(validate(failed)).toBe(false);
  expect(
    validate({ ...failed, data: { ...failed.data, code: "worker" } }),
  ).toBe(true);
  const share = {
    name: "share_action",
    data: {
      ...base,
      target: "creator",
      creator_id: 1,
      method: "native",
      outcome: "cancelled",
    },
  };
  expect(validate(share)).toBe(true);
  expect(
    validate({ ...share, data: { ...share.data, method: "clipboard" } }),
  ).toBe(false);
  expect(
    validate({
      ...share,
      data: { ...share.data, url: "https://private.invalid/?list=private" },
    }),
  ).toBe(false);
});
it("counts navigation actions as activity but not background route calculation", () => {
  const emit = vi.fn();
  const lifecycle = new AnalyticsLifecycle(
    emit,
    () => 120000,
    () => true,
  );
  lifecycle.emit("visit_path_calculated", {
    ...context,
    outcome: "ready",
    count: 4,
    stop_count: 4,
    unreachable_count: 0,
    duration_ms: 10,
  });
  expect(emit.mock.calls.map(([name]) => name)).toEqual([
    "visit_path_calculated",
  ]);
  lifecycle.emit("visit_path_action", {
    ...context,
    action: "next",
    stop_position: 2,
    stop_count: 4,
  });
  lifecycle.emit("visit_path_action", {
    ...context,
    action: "previous",
    stop_position: 1,
    stop_count: 4,
  });
  expect(
    emit.mock.calls.filter(([name]) => name === "active_minute"),
  ).toHaveLength(1);
});
