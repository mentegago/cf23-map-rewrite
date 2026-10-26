import { buildVisitRoute } from "./visitRoute";
self.onmessage = (event) => {
  try {
    self.postMessage({
      route: buildVisitRoute(
        event.data.map,
        event.data.creators.filter(
          (creator: { id: number }) =>
            !event.data.skippedIds?.includes(creator.id) &&
            !event.data.start?.creatorIds.includes(creator.id),
        ),
        event.data.start?.point,
        event.data.end?.creatorIds,
      ),
    });
  } catch {
    self.postMessage({ error: "Couldn't calculate this route. Try again." });
  }
};
