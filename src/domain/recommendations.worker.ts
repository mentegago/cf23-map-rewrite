import { Catalog } from "./search";
import { rankRecommendations } from "./recommendations";
import type { Profile, Snapshot } from "./types";
let catalog: Catalog | null = null;
let proximity: Snapshot["proximity"] | null = null;
self.onmessage = (
  event: MessageEvent<{
    id: number;
    snapshot?: Snapshot;
    profile: Profile;
    favorites: number[];
    previousIds: number[];
  }>,
) => {
  const { id, snapshot, profile, favorites, previousIds } = event.data;
  try {
    if (snapshot) {
      catalog = new Catalog(snapshot.catalog, snapshot.registry);
      proximity = snapshot.proximity;
    }
    const recommendations =
      catalog && proximity
        ? rankRecommendations(
            catalog,
            profile,
            new Set(favorites),
            proximity,
            20,
            new Set(previousIds),
          ).map((r) => ({ id: r.creator.id, matchingIds: r.matchingIds }))
        : [];
    self.postMessage({ id, recommendations });
  } catch {
    self.postMessage({ id, recommendations: [] });
  }
};
