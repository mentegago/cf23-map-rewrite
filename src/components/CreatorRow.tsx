import { Heart, Images, Bookmark } from "lucide-react";
import type { Creator } from "../domain/types";
import { formatBooths } from "../domain/booths";
import { orderCreatorFandoms } from "../domain/fandomOrdering";
import { safeURL } from "../domain/links";
import { useMemo, useState } from "react";
import { LoadingImage } from "./LoadingImage";
function BoothAvatar({ creator }: { creator: Creator }) {
  const src = safeURL(creator.assets.icon);
  const [failed, setFailed] = useState<string>();
  const [loaded, setLoaded] = useState<string>();
  const ready = !!src && loaded === src && failed !== src;
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
      className={`avatar booth-avatar ${ready ? "has-icon" : ""}`}
      style={{ background: colors[section.charCodeAt(0) % colors.length] }}
    >
      <span className="booth-letter">{section}</span>
      {src && failed !== src && (
        <img
          key={src}
          src={src}
          alt=""
          width={40}
          height={40}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(src)}
          onError={() => setFailed(src)}
        />
      )}
      {ready && (
        <span
          className="booth-section-badge"
          aria-hidden="true"
          style={{ background: colors[section.charCodeAt(0) % colors.length] }}
        >
          {section}
        </span>
      )}
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
  fandomPriority,
  fandomInterests,
  originalFirst = true,
  collection = false,
}: {
  creator: Creator;
  onSelect: (c: Creator) => void;
  onGallery: (c: Creator) => void;
  favorite: boolean;
  onFavorite: (id: number) => void;
  fandomPriority?: ReadonlyMap<number, number>;
  fandomInterests?: ReadonlyMap<number, number>;
  originalFirst?: boolean;
  collection?: boolean;
}) {
  const fandoms = useMemo(
    () =>
      orderCreatorFandoms(creator.fandoms, {
        priority: fandomPriority,
        interests: fandomInterests,
        originalFirst,
      }),
    [creator.fandoms, fandomPriority, fandomInterests, originalFirst],
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
            {formatBooths(creator.booths)}
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
          aria-label={`${favorite ? "Remove" : "Add"} ${creator.name} ${favorite ? "from" : "to"} ${collection ? "collection" : "favorites"}`}
          aria-pressed={favorite}
          onClick={() => onFavorite(creator.id)}
        >
          {collection ? (
            <Bookmark size={21} fill={favorite ? "currentColor" : "none"} />
          ) : (
            <Heart size={21} fill={favorite ? "currentColor" : "none"} />
          )}
        </button>
      </div>
    </article>
  );
}
