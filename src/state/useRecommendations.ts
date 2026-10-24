import { useEffect, useRef, useState } from "react";
import type { Profile, Snapshot } from "../domain/types";
/** Ranking is CPU work. Keep it off the input/rendering thread and discard stale jobs. */
export function useRecommendations(
  snapshot: Snapshot | null,
  profile: Profile,
  favorites: Set<number>,
  seed: number,
) {
  const worker = useRef<Worker | null>(null),
    generation = useRef(0),
    sentSnapshot = useRef<Snapshot | null>(null);
  const [ids, setIds] = useState<number[]>([]);
  useEffect(() => {
    const w = new Worker(
      new URL("../domain/recommendations.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = w;
    w.onmessage = (e: MessageEvent<{ id: number; ids: number[] }>) => {
      if (e.data.id === generation.current) setIds(e.data.ids);
    };
    return () => {
      worker.current = null;
      sentSnapshot.current = null;
      w.terminate();
    };
  }, []);
  useEffect(() => {
    if (!snapshot) return;
    const id = ++generation.current;
    const timer = setTimeout(() => {
      worker.current?.postMessage({
        id,
        snapshot: sentSnapshot.current === snapshot ? undefined : snapshot,
        profile,
        favorites: [...favorites],
        seed,
      });
      sentSnapshot.current = snapshot;
    }, 120);
    return () => clearTimeout(timer);
  }, [snapshot, profile, favorites, seed]);
  return ids;
}
