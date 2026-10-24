import { Catalog } from "./search";
import { recommend } from "./recommendations";
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
    const ids =
      catalog && proximity
        ? recommend(
            catalog,
            profile,
            new Set(favorites),
            proximity,
            20,
            new Set(previousIds),
          ).map((c) => c.id)
        : [];
    self.postMessage({ id, ids });
  } catch {
    self.postMessage({ id, ids: [] });
  }
};
