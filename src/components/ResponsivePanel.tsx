import type { ReactNode } from "react";
import { Presence } from "./Presence";
import { Sheet } from "./Sheet";

/** Navigation and content are shared; only the panel's presentation changes. */
export function ResponsivePanel({
  mobile,
  kind,
  visible,
  extent,
  onExtent,
  children,
}: {
  mobile: boolean;
  kind: "search" | "detail" | "favorites";
  visible: boolean;
  extent: number;
  onExtent: (extent: number) => void;
  children: ReactNode;
}) {
  const search = kind === "search";
  if (!mobile) {
    return (
      <Presence
        visible={visible}
        className={`sidebar-page sidebar-${kind}`}
        keepMounted={search}
      >
        <section
          className={search ? "desktop-directory" : "desktop-detail"}
          aria-label={
            search
              ? "Creator directory"
              : kind === "favorites"
                ? "Favorites"
                : "Creator details"
          }
        >
          {children}
        </section>
      </Presence>
    );
  }
  const sheet = (
    <Sheet kind={kind} extent={extent} onExtent={onExtent} hidden={!visible}>
      {children}
    </Sheet>
  );
  // Keep search mounted to preserve its native scroll position when returning.
  return search ? (
    sheet
  ) : (
    <Presence visible={visible} className="detail-presence">
      {visible && sheet}
    </Presence>
  );
}
