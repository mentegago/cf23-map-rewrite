interface BoothCode {
  section: string;
  number: string;
  suffix: string;
}

export function parseBoothCode(code: string): BoothCode | undefined {
  const match = code.trim().match(/^([a-z]+)[\s-]*(\d+)(ab|a|b)?$/i);
  if (!match) return;
  return {
    section: match[1].toUpperCase(),
    number: match[2].replace(/^0+(?=\d)/, ""),
    suffix: (match[3] || "").toLowerCase(),
  };
}

export const boothKey = (code: string) =>
  code
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/([a-z])0+/g, "$1");

/** Parse once per query; exact table matches outrank partial booth codes. */
export function createBoothMatcher(query: string) {
  const wanted = parseBoothCode(query);
  const prefix = boothKey(query);
  return (code: string): "exact" | "prefix" | undefined => {
    const booth = parseBoothCode(code);
    if (wanted && booth) {
      if (wanted.section !== booth.section) return;
      if (wanted.number === booth.number) {
        if (
          !wanted.suffix ||
          [...wanted.suffix].some((s) => booth.suffix.includes(s))
        )
          return "exact";
        return;
      }
      if (!wanted.suffix && booth.number.startsWith(wanted.number))
        return "prefix";
      return;
    }
    if (prefix && boothKey(code).startsWith(prefix))
      return boothKey(code) === prefix ? "exact" : "prefix";
  };
}

/** Combine split tables for display only; stored booth identities stay unchanged. */
export function formatBooths(codes: readonly string[], separator = ", ") {
  const groups = new Map<string, { base: string; suffixes: Set<string> }>();
  for (const code of codes) {
    const booth = parseBoothCode(code);
    const base = booth
      ? `${booth.section}-${booth.number.padStart(2, "0")}`
      : code;
    const key = booth ? base : `raw:${code}`;
    if (!groups.has(key)) groups.set(key, { base, suffixes: new Set() });
    const suffixes = groups.get(key)!.suffixes;
    if (booth?.suffix) for (const suffix of booth.suffix) suffixes.add(suffix);
    else suffixes.add("");
  }
  return [...groups.values()]
    .flatMap(({ base, suffixes }) => {
      const split = ["a", "b"]
        .filter((suffix) => suffixes.has(suffix))
        .join("");
      return [
        ...(suffixes.has("") ? [base] : []),
        ...(split ? [base + split] : []),
      ];
    })
    .join(separator);
}
