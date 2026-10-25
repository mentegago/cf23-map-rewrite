import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import type { Fandom } from "../domain/types";

export function FandomSuggestions({
  fandoms,
  onSelect,
  leading,
  scrollPosition,
  active = true,
}: {
  fandoms: Fandom[];
  onSelect: (fandomId: number) => void;
  leading?: ReactNode;
  scrollPosition?: RefObject<{ key: string; left: number }>;
  active?: boolean;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const contentKey = fandoms.map((f) => f.id).join(",");
  useLayoutEffect(() => {
    if (!active) return;
    if (scrollPosition && scrollPosition.current.key !== contentKey)
      scrollPosition.current = { key: contentKey, left: 0 };
    strip.current?.scrollTo({
      left: scrollPosition?.current.left ?? 0,
      behavior: "instant",
    });
  }, [contentKey, !!leading, active, scrollPosition]);
  if (!fandoms.length && !leading) return null;
  return (
    <div
      ref={strip}
      className="suggestions"
      role="group"
      aria-label="Creator filters"
      tabIndex={0}
      onScroll={(event) => {
        if (active && scrollPosition)
          scrollPosition.current = {
            key: contentKey,
            left: event.currentTarget.scrollLeft,
          };
      }}
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
