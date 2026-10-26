export type ListScope = "full_catalog" | "shared_list" | "search_result_list";
export type SelectionSource =
  | "map"
  | "list"
  | "search_result"
  | "recommendation"
  | "random"
  | "deeplink"
  | "favorites"
  | "custom_list"
  | "collection"
  | "visit_path";
export type ListKind = "favorites" | "custom" | "collection";
export type VisitAction =
  | "navigate"
  | "day_prompt"
  | "day_cancel"
  | "day_selected"
  | "opened"
  | "closed"
  | "next"
  | "previous"
  | "show_stop"
  | "overview"
  | "follow"
  | "skip"
  | "unskip"
  | "start_prompt"
  | "start_cancel"
  | "start_confirm";
export interface VisitContext {
  route_id: string;
  list_kind: ListKind;
  day_mode: "any" | "selected";
  day_id: string;
}
export type SearchSource = "typed" | "suggestion" | "creator_fandom_chip";
export type SearchTrigger = "settled" | "submitted" | "selection" | "result";
export type Fields = {
  app_ready: { duration_ms: number; source: "bundled" | "cache" };
  search_opened: Record<string, never>;
  search_cleared: Record<string, never>;
  search_closed: { reason: "dismissed" | "back" | "creator_selected" };
  creator_opened: {
    creator_id: number;
    source: SelectionSource;
    search_id?: string;
    result_position?: number;
    route_id?: string;
  };
  creator_closed: {
    creator_id?: number;
    reason: "dismissed" | "replaced" | "search_opened";
    duration_ms?: number;
  };
  bookmark_changed: {
    creator_id: number;
    action: "add" | "remove";
    source: "individual" | "bulk";
    operation_id?: string;
    origin?: SelectionSource;
  };
  creator_action: {
    creator_id?: number;
    action:
      "external_link" | "catalog" | "circle_cut" | "share" | "source_code";
    success: boolean;
    expanded?: boolean;
    origin?: SelectionSource;
  };
  gallery_action: {
    creator_id: number;
    action: "open" | "close" | "image_changed";
    index?: number;
    count?: number;
    origin?: SelectionSource;
  };
  booth_selected: { count: number; outcome: "empty" | "opened" | "chooser" };
  list_scope_changed: {
    scope: ListScope;
    count: number;
    origin_scope?: ListScope;
  };
  search_performed: {
    search_id: string;
    source: SearchSource;
    trigger: SearchTrigger;
    resolution:
      | "canonical"
      | "alias"
      | "explicit_selection"
      | "unique_prefix"
      | "creator"
      | "booth"
      | "ambiguous"
      | "unresolved";
    fandom_id?: number;
    result_count: number;
    catalog_result_count: number;
    scope: ListScope;
    origin_scope?: ListScope;
  };
  map_interacted: { action: "pan" | "zoom" | "both" };
  sheet_state_changed: {
    state: "collapsed" | "partiallyExpanded" | "expanded";
    sheet:
      | "search"
      | "detail"
      | "favorites"
      | "booth_list"
      | "visit_path"
      | "collection"
      | "collections";
    source: "gesture" | "programmatic";
  };
  favorites_action: {
    action: "share" | "copy_booths" | "bulk_add";
    success: boolean;
    count?: number;
    operation_id?: string;
    requested?: number;
    added?: number;
    skipped?: number;
    failed?: number;
  };
  collection_action: {
    action:
      | "library_open"
      | "library_close"
      | "picker_open"
      | "picker_cancel"
      | "create_prompt"
      | "create_cancel"
      | "create"
      | "merge"
      | "manage_open"
      | "manage_cancel"
      | "rename"
      | "delete_prompt"
      | "delete_cancel"
      | "delete"
      | "add"
      | "remove";
    source: "creator_detail" | "booth_list" | "collections";
    count?: number;
    requested?: number;
    added?: number;
    skipped?: number;
    creator_id?: number;
    destination?: "favorites" | "collection";
    origin?: SelectionSource;
  };
  booth_list_action: {
    action:
      "opened" | "closed" | "filter_add" | "filter_remove" | "filter_clear";
    list_kind: ListKind;
    count: number;
    fandom_id?: number;
    selected_count?: number;
  };
  share_action: {
    target: "creator" | "favorites" | "custom_list" | "collection";
    method: "native" | "clipboard";
    outcome: "shared" | "copied" | "cancelled" | "failed";
    creator_id?: number;
    count?: number;
    origin?: SelectionSource;
  };
  visit_path_action: VisitContext & {
    action: VisitAction;
    stop_position?: number;
    stop_count?: number;
    creator_id?: number;
    target?: "entrance" | "booth";
    source?: "initial" | "toggle" | "confirmation";
    count?: number;
  };
  visit_path_calculated: VisitContext & {
    outcome: "ready" | "failed";
    duration_ms: number;
    count: number;
    stop_count: number;
    unreachable_count: number;
    code?: "unsupported_map" | "timeout" | "worker";
  };
  deeplink_processed: {
    type: "list" | "custom_list" | "creator_id" | "creator";
    success: boolean;
    count: number;
    source: "initial" | "pasted";
  };
  update_action: { action: "shown" | "dismissed" | "refresh" };
  operation_failed: {
    operation:
      | "clipboard"
      | "link_launch"
      | "favorites_persistence"
      | "collections_persistence"
      | "catalog_load"
      | "map_load"
      | "deeplink";
    code:
      | "unavailable"
      | "invalid_input"
      | "not_found"
      | "storage"
      | "network"
      | "launch_rejected";
  };
  active_minute: Record<string, never>;
};
export type Emit = <K extends keyof Fields>(name: K, fields: Fields[K]) => void;

export interface Occurrence {
  at: number;
  visible: boolean;
}
export function captureOccurrence(): Occurrence {
  return {
    at: Date.now(),
    visible:
      typeof document !== "undefined" && document.visibilityState === "visible",
  };
}

/** The stateful event contract shared with Flutter's AnalyticsService. */
export class AnalyticsLifecycle {
  private searchVisible = false;
  private creator?: { id: number; since: number };
  private minute?: number;
  constructor(
    private send: Emit,
    private clock = Date.now,
    private visible = () => document.visibilityState === "visible",
  ) {}
  activity() {
    if (!this.visible()) return;
    const minute = Math.floor(this.clock() / 60000);
    if (this.minute === minute) return;
    this.minute = minute;
    this.send("active_minute", {});
  }
  emit: Emit = (name, fields) => {
    if (name === "search_opened") {
      if (this.searchVisible) return;
      this.searchVisible = true;
    } else if (name === "search_closed") {
      if (!this.searchVisible) return;
      this.searchVisible = false;
    } else if (name === "creator_opened") {
      const f = fields as Fields["creator_opened"];
      if (this.creator?.id === f.creator_id) return;
      this.emit("creator_closed", { reason: "replaced" });
      this.creator = { id: f.creator_id, since: this.clock() };
    } else if (name === "creator_closed") {
      if (!this.creator) return;
      this.send("creator_closed", {
        ...(fields as Fields["creator_closed"]),
        creator_id: this.creator.id,
        duration_ms: Math.max(0, this.clock() - this.creator.since),
      });
      this.creator = undefined;
      return;
    }
    this.send(name, fields);
    if (
      [
        "search_performed",
        "search_cleared",
        "creator_opened",
        "bookmark_changed",
        "list_scope_changed",
        "map_interacted",
        "booth_selected",
        "creator_action",
        "gallery_action",
        "favorites_action",
        "booth_list_action",
        "collection_action",
        "visit_path_action",
        "share_action",
      ].includes(name) ||
      (name === "sheet_state_changed" &&
        (fields as Fields["sheet_state_changed"]).source === "gesture")
    )
      this.activity();
  };
}
