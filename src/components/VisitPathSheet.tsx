import {
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  ArrowUpRight,
} from "lucide-react";
import { useState } from "react";
import { VisitDayDialog } from "./VisitDayDialog";
import { VisitStartDialog } from "./VisitStartDialog";
import type { VisitStop } from "../map/visitRoute";
import type { AppModel } from "../state/useApp";

export function VisitPathSheet({
  app,
  onClose,
  onShowPath,
  collapsed,
}: {
  app: AppModel;
  onClose: () => void;
  onShowPath: () => void;
  collapsed: boolean;
}) {
  const route = app.visitRoute.route;
  const leg = app.visitRoute.legIndex;
  const destination = route?.stops[leg];
  const [pendingStart, setPendingStart] = useState<{
    stop: VisitStop | null;
  } | null>(null);
  const [pendingDay, setPendingDay] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const creatorNames = destination?.creatorIds
    .map((id) => app.catalog?.byId.get(id)?.name)
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      {pendingStart && (
        <VisitStartDialog
          booth={
            pendingStart.stop
              ? pendingStart.stop.creatorIds
                  .map((id) => app.catalog?.byId.get(id)?.name)
                  .filter(Boolean)
                  .join(" · ") || pendingStart.stop.booth
              : "Entrance"
          }
          onClose={() => setPendingStart(null)}
          onConfirm={() => {
            app.visitRoute.startFrom(pendingStart.stop);
            setPendingStart(null);
            onShowPath();
          }}
        />
      )}
      {pendingDay && (
        <VisitDayDialog
          confirmSwitch
          days={[pendingDay]}
          onClose={() => setPendingDay(null)}
          onChoose={(day) => {
            app.visitRoute.setDay(day);
            setPendingDay(null);
          }}
        />
      )}
      <header
        className={`visit-path-header ${collapsed ? "is-collapsed" : ""}`}
        data-drag
      >
        <div className="visit-path-title">
          <button className="visit-path-back" onClick={onClose}>
            <ArrowLeft size={14} /> Back to list
          </button>
          {app.visitRoute.needsDaySelection ? (
            <div
              className="visit-route-days"
              role="group"
              aria-label="Visit day"
            >
              {app.snapshot!.catalog.event.days.map((day) => (
                <button
                  key={day.id}
                  className="visit-day"
                  aria-pressed={app.visitRoute.day === day.id}
                  onClick={() => {
                    if (day.id === app.visitRoute.day) return;
                    if (app.visitRoute.hasProgress) setPendingDay(day);
                    else app.visitRoute.setDay(day.id);
                  }}
                >
                  {day.label}
                </button>
              ))}
            </div>
          ) : (
            <span className="visit-any-day">Any day</span>
          )}
        </div>
        <nav aria-label="Visit path navigation">
          <div className="route-navigation-main">
            <button
              className="icon-button"
              aria-label="Previous route stop"
              disabled={!route || leg <= 0 || app.visitRoute.loading}
              onClick={() => app.visitRoute.focusLeg(leg - 1)}
            >
              <ChevronLeft size={22} />
            </button>
            <div aria-live="polite">
              <strong
                className={
                  destination && destination.booths.length > 1
                    ? "multi-booth-destination"
                    : undefined
                }
              >
                {app.visitRoute.loading
                  ? "Finding a path…"
                  : destination
                    ? destination.booth
                    : app.visitRoute.overview
                      ? "Whole visit path"
                      : "No stops"}
              </strong>
              {creatorNames && (
                <span className="visit-destination-name" title={creatorNames}>
                  {destination!.creatorIds.map((id) => {
                    const creator = app.catalog?.byId.get(id);
                    return (
                      creator && (
                        <button
                          key={id}
                          className="visit-destination-link"
                          aria-label={`Open details for ${creator.name}`}
                          onClick={() => app.select(creator, true, "list")}
                        >
                          {creator.name}
                          <ArrowUpRight size={13} aria-hidden="true" />
                        </button>
                      )
                    );
                  })}
                </span>
              )}
              <small>
                {destination
                  ? `Stop ${leg + 1} of ${route!.stops.length} · From ${leg ? route!.stops[leg - 1].booth : app.visitRoute.start?.booth || "Entrance"}`
                  : "Expand for visit details"}
              </small>
            </div>
            <button
              className="icon-button"
              aria-label="Next route stop"
              disabled={
                !route?.stops.length ||
                leg >= route.stops.length - 1 ||
                app.visitRoute.loading
              }
              onClick={() => app.visitRoute.focusLeg(leg + 1)}
            >
              <ChevronRight size={22} />
            </button>
          </div>
        </nav>
      </header>
      <div
        className={`sheet-scroll visit-path-content ${collapsed ? "visit-path-collapsed" : ""}`}
        inert={collapsed}
        aria-hidden={collapsed}
      >
        <section className="visit-route-controls" aria-label="Booth visit path">
          <div className="visit-path-toolbar">
            <button
              className="visit-overview"
              onClick={() => {
                app.visitRoute.setOverview(!app.visitRoute.overview);
                onShowPath();
              }}
            >
              {app.visitRoute.overview ? "Follow route" : "Overview"}
            </button>
          </div>
          <p role="status">
            {app.visitRoute.loading
              ? "Finding a path…"
              : app.visitRoute.error ||
                (app.visitRoute.route
                  ? `${app.visitRoute.route.stops.length} stops${app.visitRoute.route.unreachable.length ? ` · ${app.visitRoute.route.unreachable.length} creators couldn't be reached` : ""}`
                  : "")}
          </p>
        </section>
        {app.visitRoute.route && (
          <ol className="visit-route-stops" aria-label="Visit order">
            <li className="visit-route-entrance">
              <span>0</span>
              <div>
                <strong>Entrance</strong>
                {!app.visitRoute.start && (
                  <small className="visit-route-start-label">
                    Starting here
                  </small>
                )}
                <div className="visit-stop-actions">
                  <button
                    disabled={app.visitRoute.loading || !app.visitRoute.start}
                    onClick={() => setPendingStart({ stop: null })}
                  >
                    Start from here
                  </button>
                </div>
              </div>
            </li>
            {app.visitRoute.entries.map(
              ({ stop, number, skipped, starting }, i) => (
                <li
                  key={stop.booth}
                  className={skipped ? "visit-stop-skipped" : undefined}
                >
                  <span>{number}</span>
                  <div>
                    <strong>{stop.booth}</strong>
                    {starting && (
                      <small className="visit-route-start-label">
                        Starting here
                      </small>
                    )}
                    {stop.creatorIds.map((id) => (
                      <button
                        className="visit-stop-creator"
                        key={id}
                        onClick={() => {
                          const creator = app.catalog?.byId.get(id);
                          if (creator) app.select(creator, true, "list");
                        }}
                      >
                        {app.catalog?.byId.get(id)?.name}
                      </button>
                    ))}
                    <div className="visit-stop-actions">
                      {!skipped && !starting && (
                        <button
                          aria-pressed={
                            !app.visitRoute.overview &&
                            app.visitRoute.route?.stops[app.visitRoute.legIndex]
                              ?.booth === stop.booth
                          }
                          disabled={app.visitRoute.loading}
                          onClick={() => {
                            app.visitRoute.focusLeg(
                              app.visitRoute.route!.stops.findIndex(
                                (s) => s.booth === stop.booth,
                              ),
                            );
                            onShowPath();
                          }}
                        >
                          Show path
                        </button>
                      )}
                      <button
                        aria-pressed={skipped}
                        disabled={app.visitRoute.loading}
                        onClick={() => app.visitRoute.toggleSkip(stop, i)}
                      >
                        {skipped ? "Unskip" : "Skip"}
                      </button>
                      <button
                        disabled={app.visitRoute.loading || starting}
                        onClick={() => setPendingStart({ stop })}
                      >
                        Start from here
                      </button>
                    </div>
                  </div>
                </li>
              ),
            )}
          </ol>
        )}

        {app.visitRoute.route && (
          <div className="visit-route-missing">
            {app.visitRoute.route.unreachable.map((id) => (
              <p key={id}>{app.catalog?.byId.get(id)?.name} · No path found</p>
            ))}
            {!app.visitRoute.entries.length &&
              !app.visitRoute.route.unreachable.length && (
                <p>No creators from this list are attending on this day.</p>
              )}
          </div>
        )}
      </div>
    </>
  );
}
