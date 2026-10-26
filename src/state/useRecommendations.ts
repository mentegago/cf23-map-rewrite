import { useEffect, useRef, useState } from "react";
import type { Profile, Snapshot } from "../domain/types";
/** Ranking is CPU work. Keep it off the input/rendering thread and discard stale jobs. */
export function useRecommendations(
  snapshot: Snapshot | null,
  profile: Profile,
  favorites: Set<number>,
  allowRefresh: boolean,
) {
  const worker = useRef<Worker | null>(null),
    generation = useRef(0),
    sentSnapshot = useRef<Snapshot | null>(null),
    refreshPending = useRef(true);
  const [recommendations, setRecommendations] = useState<
    { id: number; matchingIds: number[] }[]
  >([]);
  useEffect(() => {
    const w = new Worker(
      new URL("../domain/recommendations.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = w;
    w.onmessage = (
      e: MessageEvent<{
        id: number;
        recommendations: { id: number; matchingIds: number[] }[];
      }>,
    ) => {
      if (e.data.id === generation.current) {
        refreshPending.current = false;
        setRecommendations(e.data.recommendations);
      }
    };
    return () => {
      worker.current = null;
      sentSnapshot.current = null;
      refreshPending.current = true;
      w.terminate();
    };
  }, []);
  useEffect(() => {
    if (!snapshot) return;
    // Details and galleries belong to the same browsing visit. Search, another
    // list, or lowering the search sheet unlocks ranking, even on a quick return.
    if (allowRefresh) refreshPending.current = true;
    if (!refreshPending.current) return;
    const id = ++generation.current;
    const timer = setTimeout(() => {
      worker.current?.postMessage({
        id,
        snapshot: sentSnapshot.current === snapshot ? undefined : snapshot,
        profile,
        favorites: [...favorites],
        previousIds: recommendations.map((r) => r.id),
      });
      sentSnapshot.current = snapshot;
    }, 120);
    return () => clearTimeout(timer);
  }, [snapshot, profile, favorites, allowRefresh]);
  return recommendations;
}
