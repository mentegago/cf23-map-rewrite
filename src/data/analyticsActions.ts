import { analytics } from "./analytics";
import { safeURL } from "../domain/links";
import type { Fields } from "./analyticsEvents";

/** Success means handoff to the browser, not that the external site loaded. */
export function launchForAnalytics(
  url: string,
  action: Fields["creator_action"]["action"],
  creatorId?: number,
  origin?: Fields["creator_action"]["origin"],
) {
  let success = false;
  try {
    const target = safeURL(url);
    if (target) {
      window.open(target, "_blank", "noopener,noreferrer");
      success = true;
    }
  } catch {
    /* A rejected browser handoff must not escape the click handler. */
  }
  analytics.emit("creator_action", {
    action,
    success,
    ...(origin ? { origin } : {}),
    ...(creatorId === undefined ? {} : { creator_id: creatorId }),
  });
  if (!success)
    analytics.emit("operation_failed", {
      operation: "link_launch",
      code: "launch_rejected",
    });
}
