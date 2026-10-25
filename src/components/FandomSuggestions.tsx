import { useLayoutEffect, useRef, type ReactNode } from "react";
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
      ref={strip}
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
