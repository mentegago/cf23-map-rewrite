import { ArrowRight, Hash, Link2, List, UserRound } from "lucide-react";
import type { LinkTarget } from "../domain/links";

export function SearchLinkCard({
  target,
  onOpen,
}: {
  target: NonNullable<LinkTarget>;
  onOpen: () => void;
}) {
  if (target.kind === "invalid")
    return (
      <div className="search-link-unavailable" role="status">
        <Link2 size={22} aria-hidden="true" />
        <div>
          <strong>This link isn't available</strong>
          <p>
            Check that the link is complete and belongs to the current catalog.
          </p>
        </div>
      </div>
    );
  const title =
    target.kind === "creator"
      ? "Open creator"
      : target.kind === "list"
        ? "Open booth list"
        : "Open fandom";
  const description =
    target.kind === "creator"
      ? target.creator.name
      : target.kind === "list"
        ? `${target.ids.length} creator${target.ids.length === 1 ? "" : "s"}`
        : target.fandom.name;
  const Icon =
    target.kind === "creator"
      ? UserRound
      : target.kind === "list"
        ? List
        : Hash;
  return (
    <button
      type="button"
      className="search-link-card"
      aria-label={title}
      onClick={onOpen}
    >
      <span className="search-link-icon">
        <Icon size={24} aria-hidden="true" />
      </span>
      <span className="search-link-copy">
        <strong>{title}</strong>
        <span>{description}</span>
        <small>Tap or press Enter</small>
      </span>
      <ArrowRight size={20} aria-hidden="true" />
    </button>
  );
}
