import { expect, it, vi } from "vitest";
import { eventId } from "../src/domain/eventId";

it("generates distinct Flutter-compatible IDs on HTTP without randomUUID", () => {
  const getRandomValues = crypto.getRandomValues.bind(crypto);
  vi.stubGlobal("crypto", { getRandomValues });
  try {
    const ids = Array.from({ length: 100 }, eventId);
    expect(new Set(ids).size).toBe(100);
    for (const id of ids) expect(id).toMatch(/^[\da-f]{32}$/);
  } finally {
    vi.unstubAllGlobals();
  }
});
