import { useEffect, useMemo, useState } from "react";
import type { Creator, Snapshot } from "../domain/types";
import type { VisitRoute, VisitStop } from "../map/visitRoute";
import { analytics } from "../data/analytics";
import { telemetryId } from "../domain/eventId";
import type {
  Fields,
  ListKind,
  VisitAction,
  VisitContext,
} from "../data/analyticsEvents";

interface DayPlan {
  skipped: { stop: VisitStop; index: number }[];
  start: VisitStop | null;
}
const emptyPlan: DayPlan = { skipped: [], start: null };

export function useVisitRoute(
  snapshot: Snapshot | null,
  creators: Creator[],
  scope: { kind: ListKind } | null,
) {
  const routeId = useMemo(() => telemetryId(), [scope]);
  const [enabled, setEnabled] = useState(false);
  const [day, setDay] = useState("");
  const [focused, setFocused] = useState<{ day: string; booth: string } | null>(
    null,
  );
  const [overview, setOverview] = useState(false);
  const [plans, setPlans] = useState<Record<string, DayPlan>>({});
  const [result, setResult] = useState<{
    route?: VisitRoute;
    error?: string;
    key: object;
    day: string;
    scope: object;
  }>();
  const days = snapshot?.catalog.event.days || [];
  const needsDaySelection =
    days.length > 0 &&
    creators.some((creator) =>
      days.some((day) => !creator.attendanceDates.includes(day.id)),
    );
  const selectedDay = days.some((d) => d.id === day) ? day : days[0]?.id || "";
  const context: VisitContext = {
    route_id: routeId ?? "",
    list_kind: scope?.kind ?? "custom",
    day_mode: needsDaySelection ? "selected" : "any",
    day_id: selectedDay,
  };
  const track = (
    action: VisitAction,
    fields: Partial<Fields["visit_path_action"]> = {},
  ) => {
    if (routeId)
      analytics.emit("visit_path_action", { ...context, action, ...fields });
  };
  const session = useMemo(() => ({ context }), [routeId]);
  session.context = context;
  useEffect(() => {
    if (!enabled || !scope) return;
    track("opened", { count: creators.length });
    return () => {
      if (routeId)
        analytics.emit("visit_path_action", {
          ...session.context,
          route_id: routeId,
          list_kind: scope.kind,
          action: "closed",
        });
    };
  }, [enabled, scope]);
  const plan = plans[selectedDay] || emptyPlan;
  const key = useMemo(
    () => ({}),
    [snapshot, creators, scope, selectedDay, enabled, plan],
  );
  useEffect(() => {
    setEnabled(false);
    setFocused(null);
    setOverview(false);
    setPlans({});
    setResult(undefined);
  }, [scope]);
  useEffect(() => {
    if (!enabled || !scope || !snapshot) return;
    const started = performance.now();
    const attendees = creators.filter((c) =>
      c.attendanceDates.includes(selectedDay),
    );
    let completed = false;
    const reportResult = (
      route?: VisitRoute,
      code?: Fields["visit_path_calculated"]["code"],
    ) => {
      if (completed) return;
      completed = true;
      if (!routeId) return;
      analytics.emit("visit_path_calculated", {
        ...context,
        outcome: code ? "failed" : "ready",
        duration_ms: Math.round(performance.now() - started),
        count: attendees.length,
        stop_count: route?.stops.length ?? 0,
        unreachable_count: route?.unreachable.length ?? 0,
        ...(code ? { code } : {}),
      });
    };
    if (snapshot.mapVersion !== 4) {
      reportResult(undefined, "unsupported_map");
      setResult({
        key,
        day: selectedDay,
        scope,
        error: "Routes aren't available for this map version yet.",
      });
      return;
    }
    let worker: Worker;
    try {
      worker = new Worker(
        new URL("../map/visitRoute.worker.ts", import.meta.url),
        { type: "module" },
      );
    } catch {
      reportResult(undefined, "worker");
      setResult({
        key,
        day: selectedDay,
        scope,
        error: "Couldn't calculate this route. Try again.",
      });
      return;
    }
    const timer = setTimeout(() => {
      reportResult(undefined, "timeout");
      worker.terminate();
      setResult({
        key,
        day: selectedDay,
        scope,
        error:
          "This route took too long. Try fewer creators using the fandom filters.",
      });
    }, 30000);
    worker.onmessage = (e) => {
      if (completed) return;
      reportResult(e.data.route, e.data.error ? "worker" : undefined);
      clearTimeout(timer);
      setResult({ ...e.data, key, day: selectedDay, scope });
    };
    worker.onerror = () => {
      if (completed) return;
      reportResult(undefined, "worker");
      clearTimeout(timer);
      setResult({
        key,
        day: selectedDay,
        scope,
        error: "Couldn't calculate this route. Try again.",
      });
    };
    worker.postMessage({
      map: snapshot.map,
      creators: attendees,
      skippedIds: plan.skipped.flatMap(({ stop }) => stop.creatorIds),
      start: plan.start,
    });
    return () => {
      completed = true;
      clearTimeout(timer);
      worker.terminate();
    };
  }, [enabled, scope, snapshot, creators, selectedDay, key, plan]);
  const active = enabled && !!scope;
  const current = result?.key === key ? result : undefined;
  // Keep the itinerary mounted while recalculating so focus and scroll survive.
  const displayRoute =
    active && result?.day === selectedDay && result.scope === scope
      ? result.route
      : undefined;
  const entries = useMemo(() => {
    if (!displayRoute) return [];
    const skippedIds = new Set(plan.skipped.flatMap((s) => s.stop.creatorIds));
    const startIds = new Set(plan.start?.creatorIds || []);
    const stops = displayRoute.stops.filter(
      (s) => !s.creatorIds.some((id) => skippedIds.has(id) || startIds.has(id)),
    );
    const entries = stops.map((stop, i) => ({
      stop,
      number: String(i + 1),
      skipped: false,
      starting: false,
    }));
    if (plan.start)
      entries.unshift({
        stop: plan.start,
        number: "S",
        skipped: plan.start.creatorIds.some((id) => skippedIds.has(id)),
        starting: true,
      });
    for (const skipped of plan.skipped) {
      if (
        skipped.stop.creatorIds.some((id) => startIds.has(id)) ||
        !skipped.stop.creatorIds.some((id) => creators.some((c) => c.id === id))
      )
        continue;
      entries.splice(Math.min(skipped.index, entries.length), 0, {
        stop: skipped.stop,
        number: "–",
        skipped: true,
        starting: false,
      });
    }
    return entries;
  }, [displayRoute, plan, creators]);
  const updatePlan = (update: (previous: DayPlan) => DayPlan) =>
    setPlans((all) => ({
      ...all,
      [selectedDay]: update(all[selectedDay] || emptyPlan),
    }));
  const focusedIndex =
    focused?.day === selectedDay
      ? (displayRoute?.stops.findIndex((s) => s.booth === focused.booth) ?? -1)
      : -1;
  const legIndex = overview ? -1 : Math.max(0, focusedIndex);
  const focusLeg = (
    index: number,
    action: "next" | "previous" | "show_stop" = "show_stop",
  ) => {
    const stop = displayRoute?.stops[index];
    if (!stop) return;
    track(action, {
      stop_position: index + 1,
      stop_count: displayRoute!.stops.length,
    });
    setFocused({ day: selectedDay, booth: stop.booth });
    setOverview(false);
  };
  return {
    routeId,
    track,
    legIndex,
    focusLeg,
    overview,
    setOverview: (value: boolean) => {
      track(value ? "overview" : "follow");
      setOverview(value);
    },
    enabled: active,
    setEnabled,
    day: selectedDay,
    needsDaySelection,
    hasProgress: focusedIndex > 0,
    setDay: (
      value: string,
      source: "initial" | "toggle" | "confirmation" = "toggle",
    ) => {
      track("day_selected", { day_id: value, source });
      setDay(value);
      if (value !== selectedDay) {
        setFocused(null);
        setOverview(false);
      }
    },
    route: displayRoute,
    entries,
    start: plan.start,
    startFrom: (stop: VisitStop | null) => {
      track("start_confirm", {
        target: stop ? "booth" : "entrance",
        ...(stop?.creatorIds.length === 1
          ? { creator_id: stop.creatorIds[0] }
          : {}),
      });
      setFocused(null);
      setOverview(false);
      updatePlan((previous) => ({ ...previous, start: stop }));
    },
    toggleSkip: (stop: VisitStop, index: number) => {
      track(
        plan.skipped.some((s) => s.stop.booth === stop.booth)
          ? "unskip"
          : "skip",
        {
          ...(stop.creatorIds.length === 1
            ? { creator_id: stop.creatorIds[0] }
            : {}),
        },
      );
      updatePlan((previous) => ({
        ...previous,
        skipped: previous.skipped.some((s) => s.stop.booth === stop.booth)
          ? previous.skipped.filter((s) => s.stop.booth !== stop.booth)
          : [...previous.skipped, { stop, index }],
      }));
    },
    error: active ? current?.error : undefined,
    loading: active && !current,
  };
}
