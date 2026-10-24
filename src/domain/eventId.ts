/** Flutter's schema-1 analytics IDs are 16 random bytes encoded as lowercase hex. */
export function eventId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/** Correlation must never prevent a user action if browser crypto is unavailable. */
export function telemetryId(): string | undefined {
  try {
    return eventId();
  } catch {
    return undefined;
  }
}
