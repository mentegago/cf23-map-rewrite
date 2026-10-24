/** Text search and explicit fandom selection are mutually exclusive modes. */
export type SearchSelection =
  { kind: "text"; text: string } | { kind: "fandom"; id: number };

export const emptySearch: SearchSelection = { kind: "text", text: "" };
