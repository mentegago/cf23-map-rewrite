import {
  MapPin,
  Flag,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  ArrowUpRight,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { ContextMenu } from "./ContextMenu";
import { VisitDayDialog } from "./VisitDayDialog";
import { VisitEndpointPicker } from "./VisitEndpointPicker";
import { VisitEndpointDialog } from "./VisitEndpointDialog";
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
  const itinerary = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    itinerary.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [app.visitRoute.start, app.visitRoute.end, app.visitRoute.day]);
  const route = app.visitRoute.route;
  const leg = app.visitRoute.legIndex;
  const destination = app.visitRoute.loading ? undefined : route?.stops[leg];
  const [choosingEndpoint, setChoosingEndpoint] = useState<
    "start" | "end" | null
  >(null);
  const [pendingStart, setPendingStart] = useState<{
    kind?: "start" | "end";
    stop: VisitStop | null;
  } | null>(null);
  const [pendingDay, setPendingDay] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const stopName = (stop: VisitStop) =>
    stop.creatorIds
      .map((id) => app.catalog?.byId.get(id)?.name)
      .filter(Boolean)
      .join(" · ") || stop.booth;
  const requestEndpoint = (kind: "start" | "end", stop: VisitStop | null) => {
    app.visitRoute.track(kind === "start" ? "start_prompt" : "end_prompt", {
      target: stop ? "booth" : kind === "start" ? "entrance" : "anywhere",
      ...(stop?.creatorIds.length === 1
        ? { creator_id: stop.creatorIds[0] }
        : {}),
    });
    setChoosingEndpoint(null);
    setPendingStart({ kind, stop });
  };
  const creatorNames = destination?.creatorIds
    .map((id) => app.catalog?.byId.get(id)?.name)
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      {choosingEndpoint && (
        <VisitEndpointPicker
          kind={choosingEndpoint}
          stops={app.visitRoute.entries.map((e) => e.stop)}
          name={stopName}
          onClose={() => setChoosingEndpoint(null)}
          onChoose={(stop) => requestEndpoint(choosingEndpoint, stop)}
        />
      )}
      {pendingStart && (
        <VisitEndpointDialog
          kind={pendingStart.kind}
          conflict={
            !!pendingStart.stop &&
            (pendingStart.kind === "end"
              ? app.visitRoute.start
              : app.visitRoute.end
            )?.creatorIds.some((id) =>
              pendingStart.stop!.creatorIds.includes(id),
            )
          }
          booth={
            pendingStart.stop
              ? pendingStart.stop.creatorIds
                  .map((id) => app.catalog?.byId.get(id)?.name)
                  .filter(Boolean)
                  .join(" · ") || pendingStart.stop.booth
              : pendingStart.kind === "end"
                ? "Anywhere"
                : "Entrance"
          }
          onClose={() => {
            app.visitRoute.track(
              pendingStart.kind === "end" ? "end_cancel" : "start_cancel",
              {
                target: pendingStart.stop
                  ? "booth"
                  : pendingStart.kind === "end"
                    ? "anywhere"
                    : "entrance",
              },
            );
            setPendingStart(null);
          }}
          onConfirm={() => {
            if (pendingStart.kind === "end")
              app.visitRoute.endAt(pendingStart.stop);
            else app.visitRoute.startFrom(pendingStart.stop);
            setPendingStart(null);
            onShowPath();
          }}
        />
      )}
      {pendingDay && (
        <VisitDayDialog
          confirmSwitch
          days={[pendingDay]}
          onClose={() => {
            app.visitRoute.track("day_cancel", {
              source: "confirmation",
              day_id: pendingDay.id,
            });
            setPendingDay(null);
          }}
          onChoose={(day) => {
            app.visitRoute.setDay(day, "confirmation");
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
                    if (app.visitRoute.hasProgress) {
                      app.visitRoute.track("day_prompt", {
                        source: "confirmation",
                        day_id: day.id,
                      });
                      setPendingDay(day);
                    } else app.visitRoute.setDay(day.id);
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
              onClick={() => app.visitRoute.focusLeg(leg - 1, "previous")}
            >
              <ChevronLeft size={22} />
            </button>
            <div aria-live="polite">
              {app.visitRoute.loading ? (
                <div className="visit-route-loading">
                  <svg viewBox="0 0 100 32" aria-hidden="true">
                    <path
                      className="route-loading-track"
                      d="M8 24H34Q42 24 42 16T50 8H92"
                    />
                    <path
                      className="route-loading-trail"
                      d="M8 24H34Q42 24 42 16T50 8H92"
                    />
                    <circle cx="8" cy="24" r="4" />
                    <circle
                      className="route-loading-end"
                      cx="92"
                      cy="8"
                      r="5"
                    />
                  </svg>
                  <strong>Finding your way…</strong>
                </div>
              ) : (
                <>
                  <strong
                    className={
                      destination && destination.booths.length > 1
                        ? "multi-booth-destination"
                        : undefined
                    }
                  >
                    {destination
                      ? destination.booth
                      : app.visitRoute.overview
                        ? "Whole visit path"
                        : "No stops"}
                  </strong>
                  {creatorNames && (
                    <span
                      className="visit-destination-name"
                      title={creatorNames}
                    >
                      {destination!.creatorIds.map((id) => {
                        const creator = app.catalog?.byId.get(id);
                        return (
                          creator && (
                            <button
                              key={id}
                              className="visit-destination-link"
                              aria-label={`Open details for ${creator.name}`}
                              onClick={() =>
                                app.select(creator, true, "visit_path")
                              }
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
                </>
              )}
            </div>
            <button
              className="icon-button"
              aria-label="Next route stop"
              disabled={
                !route?.stops.length ||
                leg >= route.stops.length - 1 ||
                app.visitRoute.loading
              }
              onClick={() => app.visitRoute.focusLeg(leg + 1, "next")}
            >
              <ChevronRight size={22} />
            </button>
          </div>
        </nav>
      </header>
      <div
        ref={itinerary}
        className={`sheet-scroll visit-path-content ${collapsed ? "visit-path-collapsed" : ""}`}
        inert={collapsed}
        aria-hidden={collapsed}
      >
        <section className="visit-route-controls" aria-label="Booth visit path">
          <div
            className="visit-endpoints"
            role="group"
            aria-label="Route endpoints"
          >
            {(["start", "end"] as const).map((kind) => {
              const stop =
                kind === "start" ? app.visitRoute.start : app.visitRoute.end;
              return (
                <div className="visit-endpoint" key={kind}>
                  <button
                    disabled={app.visitRoute.loading}
                    aria-label={
                      kind === "start" ? "Change start" : "Change end"
                    }
                    onClick={() => setChoosingEndpoint(kind)}
                  >
                    <small>{kind === "start" ? "Start" : "End"}</small>
                    <strong>
                      {stop
                        ? stop.booth
                        : kind === "start"
                          ? "Entrance"
                          : "Anywhere"}
                    </strong>
                    <span>
                      {stop
                        ? stopName(stop)
                        : kind === "start"
                          ? "Default starting point"
                          : "No fixed end"}
                    </span>
                  </button>
                  {stop && (
                    <button
                      className="endpoint-reset"
                      disabled={app.visitRoute.loading}
                      aria-label={
                        kind === "start"
                          ? "Reset start to Entrance"
                          : "Clear fixed end"
                      }
                      onClick={() => requestEndpoint(kind, null)}
                    >
                      Reset
                    </button>
                  )}
                </div>
              );
            })}
          </div>
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
        {!app.visitRoute.loading && app.visitRoute.route && (
          <ol className="visit-route-stops" aria-label="Visit order">
            {!app.visitRoute.start && (
              <li className="visit-route-entrance">
                <span>0</span>
                <div>
                  <strong>Entrance</strong>
                  <small className="visit-route-start-label">
                    Starting here
                  </small>
                </div>
              </li>
            )}
            {app.visitRoute.entries.map(
              ({ stop, number, skipped, starting, ending }, i) => (
                <li
                  key={stop.booth}
                  data-current={
                    !app.visitRoute.overview &&
                    destination?.booth === stop.booth
                  }
                  className={skipped ? "visit-stop-skipped" : undefined}
                >
                  {skipped && !app.visitRoute.entries[i - 1]?.skipped && (
                    <h3 className="visit-skipped-heading">Skipped</h3>
                  )}
                  <span>{number}</span>
                  <div>
                    <strong>{stop.booth}</strong>
                    {starting && (
                      <small className="visit-route-start-label">
                        Starting here
                      </small>
                    )}
                    {ending && (
                      <small className="visit-route-start-label visit-route-end-label">
                        Ending here
                      </small>
                    )}
                    {stop.creatorIds.map((id) => (
                      <button
                        className="visit-stop-creator"
                        key={id}
                        onClick={() => {
                          const creator = app.catalog?.byId.get(id);
                          if (creator) app.select(creator, true, "visit_path");
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
                      {!starting && (
                        <button
                          aria-pressed={skipped}
                          disabled={app.visitRoute.loading || ending}
                          onClick={() => app.visitRoute.toggleSkip(stop)}
                        >
                          {skipped ? "Unskip" : "Skip"}
                        </button>
                      )}
                      <ContextMenu
                        label="Route options"
                        className="visit-route-options"
                        items={[
                          {
                            id: "start",
                            label: "Start from here",
                            icon: <MapPin size={18} />,
                            disabled: app.visitRoute.loading || starting,
                            onSelect: () => requestEndpoint("start", stop),
                          },
                          {
                            id: "end",
                            label: "End here",
                            icon: <Flag size={18} />,
                            disabled: app.visitRoute.loading || ending,
                            onSelect: () => requestEndpoint("end", stop),
                          },
                        ]}
                      />
                    </div>
                  </div>
                </li>
              ),
            )}
          </ol>
        )}

        {!app.visitRoute.loading && app.visitRoute.route && (
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
