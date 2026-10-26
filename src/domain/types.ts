export interface Fandom {
  id: number;
  name: string;
  kind: string;
  parentId: number | null;
  alternateNames: string[];
}
export interface Creator {
  id: number;
  name: string;
  catalogUrl: string | null;
  spaces: { code: string; type?: string }[];
  attendanceDates: string[];
  contentRating?: string;
  offerings: string[];
  assets: {
    thumbnail?: string | null;
    icon?: string | null;
    gallery: string[];
  };
  links: { type: string; url: string }[];
  fandomIds: number[];
  fandoms: Fandom[];
  booths: string[];
  day: string;
}
export interface CatalogDocument {
  schemaVersion: string;
  event: { id: string; name: string; days: { id: string; label: string }[] };
  exhibitors: Omit<Creator, "fandoms" | "booths" | "day">[];
}
export interface RegistryDocument {
  schemaVersion: string;
  fandoms: Fandom[];
}
export interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Feature {
  uid: string;
  id: string | null;
  kind: string;
  type?: string;
  status?: string;
  geometry: Geometry;
  label?: string;
  color?: string;
  rotation?: number;
  themeAware?: boolean;
  thickness?: number;
  fontSize?: number;
  lineStart?: { x: number; y: number };
  lineEnd?: { x: number; y: number };
}
export interface MapDocument {
  schemaVersion: 2;
  bounds: { width: number; height: number };
  features: Feature[];
}
export interface Proximity {
  schema_version: number;
  booths: string[];
  neighbors: [number, number][][];
}
export interface Snapshot {
  source?: "bundled" | "cache";
  version: number;
  catalog: CatalogDocument;
  registry: RegistryDocument;
  mapVersion: number;
  map: MapDocument;
  proximity: Proximity;
}
export interface Signal {
  strength: number;
  last_updated: number;
}
export interface Interaction {
  open_strength: number;
  deliberate_open_count: number;
  sample_work_views: number;
  external_link_clicks: number;
  shares: number;
  favorite: boolean;
  consideration: number;
  last_updated: number;
}
export interface Profile {
  schema_version: 2;
  creator_interactions: Record<number, Interaction>;
  explicit_fandom_signals: Record<number, Signal>;
}
