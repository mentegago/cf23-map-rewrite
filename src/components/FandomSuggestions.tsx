import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";
import { useHorizontalWheel } from "../state/useHorizontalWheel";
import type { Fandom } from "../domain/types";

export function FandomSuggestions({
  fandoms,
  onSelect,
  leading,
}: {
  fandoms: Fandom[];
  onSelect: (fandomId: number) => void;
  leading?: ReactNode;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const horizontalWheel = useHorizontalWheel();
  const setStrip = useCallback(
    (element: HTMLDivElement | null) => {
      strip.current = element;
      const cleanup = horizontalWheel(element);
      return () => {
        cleanup?.();
        strip.current = null;
      };
    },
    [horizontalWheel],
  );
  const contentKey = fandoms.map((f) => f.id).join(",");
  useLayoutEffect(() => {
    strip.current?.scrollTo({
      left: 0,
      behavior: "instant",
    });
  }, [contentKey, !!leading]);
  if (!fandoms.length && !leading) return null;
  return (
    <div
      ref={setStrip}
      className="suggestions"
      role="group"
      aria-label="Creator filters"
      tabIndex={0}
    >
      {leading}
      {fandoms.map((f) => (
        <button
          type="button"
          className="tag cyan-tint"
          key={f.id}
          onClick={() => onSelect(f.id)}
        >
          {f.name}
        </button>
      ))}
    </div>
  );
}
