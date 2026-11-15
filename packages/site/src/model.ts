/**
 * The model of the demos. Each function uses the real functions of `@mark1russell7/files` on the sample
 * project in memory. It gives the data that the page shows. The model does not touch the page.
 *
 * @packageDocumentation
 */
import { expandHome, findEntries, findFiles, findUp, globBase, globToRegExp, isInside, matchesGlob, walk, type FoundEntry } from "@mark1russell7/files";
import { dirname, join, normalize, relative } from "pathe";
import { HOME, ROOT, SAMPLE, TREE, clearLog, treeLog, type TreeNode } from "./memory/tree.ts";

/** This function gives the path relative to the sample project, or `.` for the project folder itself. */
export const inProject = (path: string): string => relative(ROOT, path) || ".";

/** The files of the sample project, relative to its folder, in sorted order. */
export const SAMPLE_FILES: readonly string[] = SAMPLE.filter((entry): entry is string => typeof entry === "string").sort();

// 1. Globs

/**
 * This function gives the quick regular expression that a script often writes for a glob. It escapes the
 * special characters. It changes `*` to `.*` and `?` to `.`. It knows no segment, no dot and no group.
 */
export function quickRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[\\^$.|+()[\]{}]/g, "\\$&").replaceAll("*", ".*").replaceAll("?", ".");
  return new RegExp(`^${escaped}$`);
}

/** A row of the glob demo: a path, the result of `matchesGlob` and the result of the quick regular expression. */
export interface GlobRow {
  readonly path: string;
  readonly files: boolean;
  readonly quick: boolean;
}

/** The result of the glob demo: a row for each path, the two regular expressions and the base folder of the pattern. */
export interface GlobResult {
  readonly rows: readonly GlobRow[];
  readonly regexp: string;
  readonly quick: string;
  readonly base: string;
}

/** This function matches each path with the glob, with the package and with the quick regular expression. */
export function globResult(glob: string, paths: readonly string[], dot: boolean): GlobResult {
  const quick = quickRegExp(glob);
  return {
    rows: paths.map((path) => ({ path, files: matchesGlob(path, glob, { dot }), quick: quick.test(path) })),
    regexp: String(globToRegExp(glob, { dot })),
    quick: String(quick),
    base: globBase(glob),
  };
}

// 2. Find

/** The settings of the find demo. */
export interface FindSettings {
  readonly include: readonly string[];
  readonly ignore: readonly string[];
  readonly dot: boolean;
  /** The value `false` gives an empty `skip`, so the walk enters `node_modules` and `.git`. */
  readonly skip: boolean;
  /** The value `true` uses `findEntries`, which also gives folders and links. */
  readonly entries: boolean;
}

/** A row of the tree of the sample project, after a find. */
export interface TreeRow {
  /** The path relative to the project. */
  readonly path: string;
  readonly name: string;
  readonly depth: number;
  readonly kind: TreeNode["kind"];
  /** The target of a link. */
  readonly target?: string;
  /** The find gave this entry. */
  readonly found: boolean;
  /** For a folder: the find listed its entries. */
  readonly read: boolean;
  /** The find listed the folder of this entry, so it saw the entry. The project folder is always seen. */
  readonly seen: boolean;
}

/** The result of a find: the entries it gave, the folders it read and the tree of the project with marks. */
export interface FindResult {
  readonly found: readonly FoundEntry[];
  readonly reads: readonly string[];
  readonly tree: readonly TreeRow[];
}

/** The entries of the sample project in the order of a tree: the project folder, then each folder before its contents by name. */
const PROJECT = [...TREE.keys()].filter((path) => path === ROOT || path.startsWith(`${ROOT}/`)).sort((a, b) => {
  const left = a.split("/");
  const right = b.split("/");
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    if (left[index] !== right[index]) return left[index]! < right[index]! ? -1 : 1;
  }
  return left.length - right.length;
});

/** This function uses `findFiles` or `findEntries` on the sample project, and logs each folder that it reads. */
export function runFind(settings: FindSettings): FindResult {
  const options = { root: ROOT, include: settings.include, ignore: settings.ignore, dot: settings.dot, ...(settings.skip ? {} : { skip: [] }) };
  clearLog();
  const found = settings.entries ? findEntries(options) : findFiles(options).map((path): FoundEntry => ({ path, kind: "file" }));
  const reads = treeLog.reads.map(inProject);
  const foundPaths = new Set(found.map((entry) => entry.path));
  const readPaths = new Set(treeLog.reads);
  const tree = PROJECT.map((path): TreeRow => {
    const node = TREE.get(path)!;
    const rel = inProject(path);
    return {
      path: rel,
      name: rel === "." ? path.slice(path.lastIndexOf("/") + 1) : rel.slice(rel.lastIndexOf("/") + 1),
      depth: rel === "." ? 0 : rel.split("/").length,
      kind: node.kind,
      ...(node.kind === "symlink" ? { target: node.target } : {}),
      found: foundPaths.has(path),
      read: readPaths.has(path),
      seen: path === ROOT || readPaths.has(dirname(path)),
    };
  });
  return { found, reads, tree };
}

// 3. Walk

/** An entry of the walk demo. */
export interface WalkRow {
  readonly name: string;
  readonly kind: string;
}

/** The result of the walk demo: the entries in order, the names that an earlier name gave, and the error that stopped the walk. */
export interface WalkResult {
  readonly rows: readonly WalkRow[];
  readonly repeated: readonly string[];
  readonly error: { readonly code: string; readonly message: string } | null;
}

/** This function walks the names in the sample project, and leaves out the excluded paths, relative to the project. */
export async function runWalk(names: readonly string[], exclude: readonly string[]): Promise<WalkResult> {
  const rows: WalkRow[] = [];
  let error: WalkResult["error"] = null;
  try {
    for await (const entry of walk(ROOT, names, { exclude: new Set(exclude.map((path) => join(ROOT, path))) })) rows.push({ name: entry.name, kind: entry.kind });
  } catch (thrown) {
    const { code, message } = thrown as { code?: unknown; message?: unknown };
    error = { code: String(code ?? "?"), message: String(message ?? thrown) };
  }
  // A name repeats when an earlier name is the same, or is a folder above it that the walk entered.
  const entered = new Set(rows.filter((row) => row.kind === "directory").map((row) => row.name));
  const repeated = names.filter((name, index) => names.slice(0, index).some((earlier) => earlier === name || (entered.has(earlier) && name.startsWith(`${earlier}/`))));
  return { rows, repeated, error };
}

// 4. Inside

/** The result of the inside demo: `isInside`, the quick `startsWith` and the path after its `..` and `.` segments. */
export interface InsideResult {
  readonly inside: boolean;
  readonly startsWith: boolean;
  readonly resolved: string;
}

/** This function tells if the path is in the folder, with the package and with `path.startsWith(folder)`. */
export function insideResult(folder: string, path: string): InsideResult {
  return { inside: isInside(folder, path), startsWith: path.startsWith(folder), resolved: normalize(path) };
}

// 5. Home

/** The result of the home demo: `expandHome` and the quick `path.replace("~", home)`. */
export interface HomeResult {
  readonly expanded: string;
  readonly replaced: string;
}

/** This function expands a leading `~` with the package and with `replace`, for the sample user. */
export function homeResult(path: string): HomeResult {
  return { expanded: expandHome(path), replaced: path.replace("~", HOME) };
}

// 6. Find up

/** The result of the find-up demo: the path it found, and each path that it looked at, in order. */
export interface UpResult {
  readonly found: string | null;
  readonly probes: readonly { readonly path: string; readonly hit: boolean }[];
}

/** This function finds the nearest entry with the name, from a folder of the sample project up to `/`. */
export function upResult(name: string, from: string): UpResult {
  clearLog();
  const found = findUp(name, join(ROOT, from));
  return { found, probes: treeLog.probes.map((path) => ({ path, hit: path === found })) };
}

/** The folders of the sample project, relative to its folder, for the start of a find-up. */
export const FOLDERS: readonly string[] = PROJECT.filter((path) => TREE.get(path)?.kind === "directory").map(inProject);
