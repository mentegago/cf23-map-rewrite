import { expect, it, vi } from "vitest";
import { eventId } from "../src/domain/eventId";

it("generates distinct UUIDs when HTTP makes randomUUID unavailable", () => {
  const getRandomValues = crypto.getRandomValues.bind(crypto);
  vi.stubGlobal("crypto", { getRandomValues });
  try {
    const ids = Array.from({ length: 100 }, eventId);
    expect(new Set(ids).size).toBe(100);
    for (const id of ids)
      expect(id).toMatch(
        /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/,
      );
  } finally {
    vi.unstubAllGlobals();
  }
});
