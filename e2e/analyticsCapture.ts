import { expect, type Page } from "@playwright/test";
import Ajv2020 from "ajv/dist/2020.js";
import { readFileSync } from "node:fs";

const validate = new Ajv2020({ strict: false }).compile(
  JSON.parse(readFileSync("test/fixtures/analytics_event_schema.json", "utf8")),
);
export interface CapturedEvent {
  name: string;
  data: Record<string, any>;
  url: string;
}
export async function captureAnalytics(page: Page) {
  const events: CapturedEvent[] = [];
  await page.route("https://analytics.invalid/api/send", async (route) => {
    const event = route.request().postDataJSON().payload;
    if (event.name) events.push(event);
    await route.fulfill({ contentType: "application/json", body: "{}" });
  });
  return events;
}
export function validateAnalytics(events: CapturedEvent[]) {
  expect(events.length).toBeGreaterThan(0);
  for (const event of events) {
    expect(
      validate({ name: event.name, data: event.data }),
      JSON.stringify(validate.errors),
    ).toBe(true);
    expect(event.data.schema_version).toBe(3);
    expect(event.url).toBe("/");
    for (const key of [
      "url",
      "query",
      "booths",
      "creator_ids",
      "coordinates",
      "list_code",
    ])
      expect(event.data).not.toHaveProperty(key);
  }
  expect(new Set(events.map((event) => event.data.client_event_id)).size).toBe(
    events.length,
  );
}
