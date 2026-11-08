import { matchesGlob, type GlobOptions } from "@mark1russell7/files/glob";

/** A row of the tester: a path and the result of the pattern on it. */
export interface MatchRow {
  readonly path: string;
  readonly match: boolean;
}

/** This function gives the result of the pattern on each path, in the order of the paths. */
export function matchRows(glob: string, paths: readonly string[], options: GlobOptions): MatchRow[] {
  return paths.map((path) => ({ path, match: matchesGlob(path, glob, options) }));
}
