import { expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import schema from "./fixtures/analytics_event_schema.json";
const validate = new Ajv2020({ strict: false }).compile(schema);
const base = {
  schema_version: 3,
  event_edition: "comic-frontier-23",
  app_version: 106,
  client_event_id: "a".repeat(32),
  app_run_id: "b".repeat(32),
  sequence: 1,
  occurred_at_ms: 123,
};
it("validates collection mutations without allowing private collection identity or inventory", () => {
  const data = {
    ...base,
    action: "merge",
    source: "booth_list",
    destination: "collection",
    count: 4,
    requested: 3,
    added: 2,
    skipped: 1,
  };
  const check = (d: object) => validate({ name: "collection_action", data: d });
  expect(check(data), JSON.stringify(validate.errors)).toBe(true);
  for (const privateField of [
    "collection_id",
    "collection_name",
    "creator_ids",
    "name",
    "url",
  ])
    expect(check({ ...data, [privateField]: "private" })).toBe(false);
  expect(check({ ...data, schema_version: 2 })).toBe(false);
  expect(check({ ...data, added: -1 })).toBe(false);
  const { requested, ...missing } = data;
  expect(check(missing)).toBe(false);
  expect(
    check({
      ...base,
      action: "remove",
      source: "creator_detail",
      origin: "collection",
      creator_id: 1,
      count: 0,
    }),
  ).toBe(true);
  expect(
    check({ ...base, action: "remove", source: "creator_detail", count: 0 }),
  ).toBe(false);
});
it("distinguishes collection sources and list types without changing older contracts", () => {
  const open = {
    name: "creator_opened",
    data: { ...base, creator_id: 1, source: "collection" },
  };
  expect(validate(open)).toBe(true);
  expect(validate({ ...open, data: { ...open.data, schema_version: 2 } })).toBe(
    false,
  );
  expect(
    validate({
      name: "booth_list_action",
      data: { ...base, action: "opened", list_kind: "collection", count: 2 },
    }),
  ).toBe(true);
  expect(
    validate({
      name: "share_action",
      data: {
        ...base,
        target: "collection",
        count: 2,
        method: "native",
        outcome: "shared",
      },
    }),
    JSON.stringify(validate.errors),
  ).toBe(true);
});
