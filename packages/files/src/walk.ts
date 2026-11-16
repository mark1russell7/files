/**
 * Walks of folders: the files of include and ignore globs, and each entry under a set of paths.
 * The functions use only `node:` modules.
 */

import { existsSync, lstatSync, readdirSync, statSync, type Dirent, type Stats } from "node:fs";
import { lstat, readdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { globBase, globToRegExp, isGlob } from "./glob.ts";
import { toPosix } from "./paths.ts";

/** The names of the folders that `findFiles` does not enter by default. */
export const SKIPPED_FOLDERS: readonly string[] = ["node_modules", ".git"];

/** The options of `findFiles`. */
export interface FindOptions {
  /** The folder of the include patterns. */
  readonly root: string;
  readonly include: readonly string[];
  readonly ignore?: readonly string[] | undefined;
  /** The folder of the ignore patterns. The default is `root`. */
  readonly ignoreRoot?: string | undefined;
  /** The names of the folders that the walk does not enter. The default is `SKIPPED_FOLDERS`. */
  readonly skip?: readonly string[] | undefined;
  /** The value `false` keeps the dot entries out of the wildcards. The default is `true`. */
  readonly dot?: boolean | undefined;
}

/** This function gives the pattern with `/`, relative to `root`. An absolute pattern becomes relative. */
function relativePattern(root: string, pattern: string): string {
  const normalized = pattern.replaceAll("\\", "/").replace(/^(?:\.\/)+/, "");
  return isAbsolute(normalized) ? toPosix(relative(root, normalized)) : normalized;
}

/** One request of a walk to the file system. A driver answers it with `node:fs` or with `node:fs/promises`. */
type Request =
  | { readonly op: "readdir"; readonly path: string }
  | { readonly op: "lstat"; readonly path: string }
  | { readonly op: "stat"; readonly path: string };

/** The steps of a walk. The generator yields each request and gets its answer. At the end, it gives the result. */
type Steps<T> = Generator<Request, T, unknown>;

/** This step gives the entries of a folder. */
function* readFolder(path: string): Steps<Dirent[]> {
  return (yield { op: "readdir", path }) as Dirent[];
}

/** This step gives the `lstat` result of a path, or `undefined` when no entry is at the path. */
function* lstatOf(path: string): Steps<Stats | undefined> {
  return (yield { op: "lstat", path }) as Stats | undefined;
}

/** This step gives the `stat` result of a path, or `undefined` when the path does not exist. A link gives its target. */
function* statOf(path: string): Steps<Stats | undefined> {
  return (yield { op: "stat", path }) as Stats | undefined;
}

/** This function answers a request with the sync functions of `node:fs`. */
function answerSync(request: Request): unknown {
  switch (request.op) {
    case "readdir":
      return readdirSync(request.path, { withFileTypes: true });
    case "lstat":
      return lstatSync(request.path, { throwIfNoEntry: false });
    case "stat":
      return existsSync(request.path) ? statSync(request.path) : undefined;
  }
}

/** This function answers a request with `node:fs/promises`, with the same answers as `answerSync`. */
async function answerAsync(request: Request): Promise<unknown> {
  switch (request.op) {
    case "readdir":
      return readdir(request.path, { withFileTypes: true });
    case "lstat":
      // lstatSync with throwIfNoEntry: false gives undefined for ENOENT and ENOTDIR
      return lstat(request.path).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT" || error.code === "ENOTDIR") return undefined;
        throw error;
      });
    case "stat":
      // existsSync gives false for each error
      return stat(request.path).catch(() => undefined);
  }
}

/** This function does the steps of a walk with the sync functions of `node:fs`. */
function runSync<T>(steps: Steps<T>): T {
  let step = steps.next();
  while (!step.done) step = steps.next(answerSync(step.value));
  return step.value;
}

/** This function does the steps of a walk with `node:fs/promises`. Each request gives the event loop a turn. */
async function runAsync<T>(steps: Steps<T>): Promise<T> {
  let step = steps.next();
  while (!step.done) step = steps.next(await answerAsync(step.value));
  return step.value;
}

/** The parts of the options that the two walks use: the root, the skipped names, the glob options and the ignore test. */
function prepare(options: FindOptions) {
  const root = resolve(options.root);
  const ignoreRoot = resolve(options.ignoreRoot ?? root);
  const glob = { dot: options.dot ?? true };
  const ignore = (options.ignore ?? []).map((pattern) => globToRegExp(relativePattern(ignoreRoot, pattern), glob));
  const isIgnored = (path: string, suffix = ""): boolean => {
    const relativePath = toPosix(relative(ignoreRoot, path)) + suffix;
    return ignore.some((pattern) => pattern.test(relativePath));
  };
  return { root, skip: new Set(options.skip ?? SKIPPED_FOLDERS), glob, isIgnored };
}

/** The steps of `findFiles` and `findFilesAsync`. */
function* findFilesSteps(options: FindOptions): Steps<string[]> {
  const { root, skip, glob, isIgnored } = prepare(options);
  const found = new Set<string>();

  for (const pattern of options.include) {
    const normalized = relativePattern(root, pattern);
    if (!isGlob(normalized)) {
      const path = resolve(root, normalized);
      if ((yield* statOf(path))?.isFile()) found.add(path);
      continue;
    }
    const matcher = globToRegExp(normalized, glob);
    const base = resolve(root, globBase(normalized));
    if (!(yield* statOf(base))) continue;
    function* visit(folder: string): Steps<void> {
      for (const entry of yield* readFolder(folder)) {
        const path = join(folder, entry.name);
        if (entry.isDirectory()) {
          // A pattern "**/dist/**" matches the files of a folder, so the test also adds a "/" to the folder
          if (skip.has(entry.name) || isIgnored(path) || isIgnored(path, "/")) continue;
          yield* visit(path);
        } else if (entry.isFile() && matcher.test(toPosix(relative(root, path))) && !isIgnored(path)) {
          found.add(path);
        }
      }
    }
    yield* visit(base);
  }
  return [...found].sort();
}

/**
 * This function finds the files that match an include pattern and no ignore pattern. A pattern with
 * no glob character is a file name, and the ignore patterns do not apply to it. The result has
 * absolute paths, in sorted order, with no duplicates.
 */
export function findFiles(options: FindOptions): string[] {
  return runSync(findFilesSteps(options));
}

/**
 * This function gives the result of `findFiles` with the functions of `node:fs/promises`. The walk
 * does not block the event loop.
 */
export function findFilesAsync(options: FindOptions): Promise<string[]> {
  return runAsync(findFilesSteps(options));
}

/** This function compares two names by their code units, as the default sort does. */
const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** One entry that `findEntries` found. */
export interface FoundEntry {
  /** The absolute path. */
  readonly path: string;
  /** The kind from `lstat`: the value `other` is a socket, a device or a FIFO. */
  readonly kind: "file" | "directory" | "symlink" | "other";
}

/** This function gives the kind of an entry from the result of `lstat` or of `readdir`. */
function kindOf(entry: { isSymbolicLink(): boolean; isDirectory(): boolean; isFile(): boolean }): FoundEntry["kind"] {
  return entry.isSymbolicLink() ? "symlink" : entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other";
}

/** The steps of `findEntries` and `findEntriesAsync`. */
function* findEntriesSteps(options: FindOptions): Steps<FoundEntry[]> {
  const { root, skip, glob, isIgnored } = prepare(options);
  const found = new Map<string, FoundEntry>();

  for (const pattern of options.include) {
    const normalized = relativePattern(root, pattern);
    if (!isGlob(normalized)) {
      const path = resolve(root, normalized);
      const stats = yield* lstatOf(path);
      if (stats) found.set(path, { path, kind: kindOf(stats) });
      continue;
    }
    const matcher = globToRegExp(normalized, glob);
    const matches = (path: string): boolean => matcher.test(toPosix(relative(root, path)));
    // A folder is not entered when it is skipped or ignored. "**/dist/**" matches "dist/", so the test also adds a "/".
    const pruned = (path: string, name: string): boolean => skip.has(name) || isIgnored(path) || isIgnored(path, "/");
    function* visit(folder: string): Steps<void> {
      for (const entry of yield* readFolder(folder)) {
        const path = join(folder, entry.name);
        const kind = kindOf(entry);
        if (kind === "directory") {
          if (pruned(path, entry.name)) continue;
          if (matches(path)) found.set(path, { path, kind });
          yield* visit(path);
        } else if (matches(path) && !isIgnored(path)) {
          found.set(path, { path, kind });
        }
      }
    }
    const base = resolve(root, globBase(normalized));
    const stats = yield* lstatOf(base);
    if (!stats?.isDirectory()) continue;
    if (base !== root) {
      // The base folder of "x/**" is "x": it is an entry of the walk, as each folder under it.
      if (pruned(base, relative(dirname(base), base))) continue;
      if (matches(base)) found.set(base, { path: base, kind: "directory" });
    }
    yield* visit(base);
  }
  return [...found.values()].sort((a, b) => byName(a.path, b.path));
}

/**
 * This function finds the entries of each kind that match an include pattern and no ignore pattern.
 * A folder that an ignore pattern matches, alone or with a `/` after it, is not entered. Thus `x/**`
 * gives the folder `x`, and an ignore `x/**` leaves out `x` and its contents. A pattern with no glob
 * character is a path, and the ignore patterns do not apply to it. The walk does not follow a
 * symbolic link. The result is sorted by path, with no duplicates.
 */
export function findEntries(options: FindOptions): FoundEntry[] {
  return runSync(findEntriesSteps(options));
}

/**
 * This function gives the result of `findEntries` with the functions of `node:fs/promises`. The walk
 * does not block the event loop.
 */
export function findEntriesAsync(options: FindOptions): Promise<FoundEntry[]> {
  return runAsync(findEntriesSteps(options));
}

/** One entry of a walk. */
export interface WalkEntry {
  /** The name relative to the base of the walk, with `/`. */
  readonly name: string;
  /** The absolute path. */
  readonly path: string;
  /** The value `other` is a socket, a device or a FIFO. */
  readonly kind: "file" | "directory" | "symlink" | "other";
  /** The result of `lstat`: a link has the stats of the link, not of its target. */
  readonly stats: Stats;
}

/** The options of `walk`. */
export interface WalkOptions {
  /** The absolute paths that the walk leaves out, with their contents. */
  readonly exclude?: ReadonlySet<string> | undefined;
}

/**
 * This function gives each entry at and under the names, relative to `base`, depth first. A folder
 * comes before its contents, and the contents come in the order of their names. The walk does not
 * follow a symbolic link, and it gives each name one time. A name that does not exist makes the
 * walk throw the error of `lstat` (`ENOENT`).
 */
export async function* walk(base: string, names: readonly string[], options: WalkOptions = {}): AsyncGenerator<WalkEntry> {
  const exclude = options.exclude ?? new Set<string>();
  const seen = new Set<string>();

  async function* visit(name: string): AsyncGenerator<WalkEntry> {
    const path = resolve(base, ...name.split("/"));
    if (exclude.has(path) || seen.has(name)) return;
    seen.add(name);
    const stats = await lstat(path);
    const kind = stats.isSymbolicLink() ? "symlink" : stats.isDirectory() ? "directory" : stats.isFile() ? "file" : "other";
    yield { name, path, kind, stats };
    if (kind !== "directory") return;
    for (const child of (await readdir(path)).sort(byName)) yield* visit(`${name}/${child}`);
  }

  for (const name of names) yield* visit(name);
}
