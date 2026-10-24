import { Heart, Images } from "lucide-react";
import type { Creator } from "../domain/types";
import { safeURL } from "../domain/links";
import { useState } from "react";
import { LoadingImage } from "./LoadingImage";
function BoothAvatar({ creator }: { creator: Creator }) {
  const b = creator.booths[0] || "?";
  const section = b.includes("-") ? b.split("-")[0] : b[0];
  const colors = [
    "#ff87b8",
    "#70e2ee",
    "#ffd84d",
    "#a996ff",
    "#ff9d7c",
    "#7de0a3",
    "#ff9bd0",
    "#8cb8f5",
  ];
  return (
    <span
      className="avatar booth-avatar"
      style={{ background: colors[section.charCodeAt(0) % colors.length] }}
    >
      {section}
    </span>
  );
}
export function Artwork({
  creator,
  className = "",
}: {
  creator: Creator;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = safeURL(creator.assets.thumbnail);
  return src && !failed ? (
    <LoadingImage
      className={className}
      src={src}
      alt={`${creator.name} circle artwork`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  ) : (
    <div
      className={`art-fallback ${className}`}
      aria-label={`${creator.name} artwork unavailable`}
    >
      {creator.name.slice(0, 1).toUpperCase()}
    </div>
  );
}
export function CreatorRow({
  creator,
  onSelect,
  onGallery,
  favorite,
  onFavorite,
}: {
  creator: Creator;
  onSelect: (c: Creator) => void;
  onGallery: (c: Creator) => void;
  favorite: boolean;
  onFavorite: (id: number) => void;
}) {
  const fandoms = [...creator.fandoms].sort(
    (a, b) => Number(b.name === "Original") - Number(a.name === "Original"),
  );
  return (
    <article
      className={`creator-row ${creator.assets.gallery.length ? "has-gallery" : ""}`}
    >
      <button className="creator-select" onClick={() => onSelect(creator)}>
        <BoothAvatar creator={creator} />
        <span className="row-copy">
          <strong>{creator.name}</strong>
          <span className="metadata">
            {creator.booths.join(", ")}
            {creator.day && `  /  ${creator.day}`}
          </span>
          <span className="fandom-summary">
            {fandoms
              .slice(0, 4)
              .map((f) => f.name)
              .join(" • ")}
            {fandoms.length > 4 && (
              <>
                {" • "}
                <span className="more">+{fandoms.length - 4} more</span>
              </>
            )}
          </span>
        </span>
      </button>
      <div className="row-actions">
        {creator.assets.gallery.length > 0 && (
          <button
            className="icon-button row-gallery"
            aria-label={`View ${creator.name} catalog`}
            onClick={() => onGallery(creator)}
          >
            <Images size={21} />
          </button>
        )}
        <button
          className={`icon-button ${favorite ? "is-favorite" : ""}`}
          aria-label={`${favorite ? "Remove" : "Add"} ${creator.name} ${favorite ? "from" : "to"} favorites`}
          aria-pressed={favorite}
          onClick={() => onFavorite(creator.id)}
        >
          <Heart size={21} fill={favorite ? "currentColor" : "none"} />
        </button>
      </div>
    </article>
  );
}
