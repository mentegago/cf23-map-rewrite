import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight, FolderHeart, Heart, Plus, X } from "lucide-react";
import type { AppModel } from "../state/useApp";

const collectionNames = [
  "Original Comics",
  "Titipan Temen",
  "For my love",
  "SFW Stuff",
  "Cute Keychains",
  "Dompet Menangis",
  "Wishlist",
  "Artist Alley Haul",
];
const randomCollectionName = () =>
  collectionNames[Math.floor(Math.random() * collectionNames.length)];

export function CollectionDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    (dialog.querySelector<HTMLInputElement>("input") ||
      dialog.querySelector<HTMLElement>("h2"))?.focus({ preventScroll: true });
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="visit-day-dialog collection-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="collection-dialog-header">
        <span className="favorites-heart" aria-hidden="true">
          <FolderHeart size={22} />
        </span>
        <h2 tabIndex={-1}>{title}</h2>
        <button className="icon-button" aria-label="Cancel" onClick={onClose}>
          <X size={22} />
        </button>
      </header>
      <div className="collection-dialog-body">{children}</div>
    </dialog>
  );
}

export function CollectionPicker({
  app,
  onClose,
  creatorIds = app.listCreators.map((c) => c.id),
}: {
  app: AppModel;
  onClose: () => void;
  creatorIds?: number[];
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [placeholder, setPlaceholder] = useState(randomCollectionName);
  const favoritesComplete = creatorIds.every((id) => app.favorites.has(id));
  return (
    <CollectionDialog
      key={creating ? "create" : "picker"}
      title={creating ? "New collection" : "Add to collection"}
      onClose={creating ? () => setCreating(false) : onClose}
    >
      {creating ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (app.saveToCollection(null, name, creatorIds)) onClose();
          }}
        >
          <label>
            Collection name
            <input
              autoFocus
              autoComplete="off"
              enterKeyHint="done"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={placeholder}
            />
          </label>
          <button className="action pink" disabled={!name.trim()}>
            Create collection
          </button>
        </form>
      ) : (
        <div className="collection-options collection-library">
          <button
            disabled={favoritesComplete}
            onClick={() => {
              if (app.addAll(creatorIds)) onClose();
            }}
          >
            <span className="collection-avatar">
              <Heart size={20} fill="currentColor" />
            </span>
            <span className="collection-copy">
              <strong>Favorites</strong>
              <small>
                {favoritesComplete
                  ? "Already added"
                  : `${app.favoriteCreators.length} creators`}
              </small>
            </span>
            <ChevronRight size={18} className="collection-chevron" />
          </button>
          {app.collections.map((c) => (
            <button
              key={c.id}
              disabled={creatorIds.every((id) => c.ids.includes(id))}
              onClick={() => {
                if (app.saveToCollection(c.id, "", creatorIds)) onClose();
              }}
            >
              <span className="collection-avatar">
                <FolderHeart size={20} />
              </span>
              <span className="collection-copy">
                <strong>{c.name}</strong>
                <small>
                  {creatorIds.every((id) => c.ids.includes(id))
                    ? "Already added"
                    : `${c.ids.length} creators`}
                </small>
              </span>
              <ChevronRight size={18} className="collection-chevron" />
            </button>
          ))}
          <button
            className="collection-create action pink"
            onClick={() => {
              setPlaceholder(randomCollectionName());
              setCreating(true);
            }}
          >
            <Plus size={20} />
            <span>New collection</span>
          </button>
        </div>
      )}
    </CollectionDialog>
  );
}

export function CollectionsSheet({
  app,
  onClose,
  onOpen,
}: {
  app: AppModel;
  onClose: () => void;
  onOpen: () => void;
}) {
  return (
    <>
      <header className="favorites-header" data-drag>
        <span className="favorites-heart">
          <FolderHeart size={24} />
        </span>
        <div>
          <h2>Collections</h2>
          <p>Your saved booth lists</p>
        </div>
        <div className="favorites-actions">
          <button
            className="icon-button favorites-close"
            aria-label="Close collections"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </div>
      </header>
      <div className="sheet-scroll favorites-list collection-options collection-library">
        <button
          onClick={() => {
            app.openFavorites();
            onOpen();
          }}
        >
          <span className="collection-avatar">
            <Heart size={20} fill="currentColor" />
          </span>
          <span className="collection-copy">
            <strong>Favorites</strong>
            <small>{app.favoriteCreators.length} creators</small>
          </span>
          <ChevronRight size={18} className="collection-chevron" />
        </button>
        {app.collections.map((c) => (
          <button
            key={c.id}
            onClick={() => {
              app.openCollection(c);
              onOpen();
            }}
          >
            <span className="collection-avatar">
              <FolderHeart size={20} />
            </span>
            <span className="collection-copy">
              <strong>{c.name}</strong>
              <small>{c.ids.length} creators</small>
            </span>
            <ChevronRight size={18} className="collection-chevron" />
          </button>
        ))}
      </div>
    </>
  );
}
