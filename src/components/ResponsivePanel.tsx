import type { ReactNode } from "react";
import { Presence } from "./Presence";
import { Sheet } from "./Sheet";
import type { Fields } from "../data/analyticsEvents";

/** Navigation and content are shared; only the panel's presentation changes. */
export function ResponsivePanel({
  mobile,
  kind,
  label,
  visible,
  extent,
  onExtent,
  children,
  minimumExtent,
  twoDetents,
  analyticsSheet,
}: {
  mobile: boolean;
  kind: "search" | "detail" | "list";
  label?: string;
  visible: boolean;
  extent: number;
  onExtent: (extent: number) => void;
  children: ReactNode;
  minimumExtent?: number;
  twoDetents?: boolean;
  analyticsSheet?: Fields["sheet_state_changed"]["sheet"];
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
              : kind === "list"
                ? label || "Booth list"
                : "Creator details"
          }
        >
          {children}
        </section>
      </Presence>
    );
  }
  const sheet = (
    <Sheet
      label={label}
      kind={kind}
      extent={extent}
      onExtent={onExtent}
      hidden={!visible}
      minimumExtent={minimumExtent}
      twoDetents={twoDetents}
      analyticsSheet={analyticsSheet}
    >
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
