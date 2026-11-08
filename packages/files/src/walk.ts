/**
 * Walks of folders: the files of include and ignore globs, and each entry under a set of paths.
 * The functions use only `node:` modules.
 */

import { existsSync, readdirSync, statSync, type Stats } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
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

/**
 * This function finds the files that match an include pattern and no ignore pattern. A pattern with
 * no glob character is a file name, and the ignore patterns do not apply to it. The result has
 * absolute paths, in sorted order, with no duplicates.
 */
export function findFiles(options: FindOptions): string[] {
  const root = resolve(options.root);
  const ignoreRoot = resolve(options.ignoreRoot ?? root);
  const skip = new Set(options.skip ?? SKIPPED_FOLDERS);
  const glob = { dot: options.dot ?? true };
  const ignore = (options.ignore ?? []).map((pattern) => globToRegExp(relativePattern(ignoreRoot, pattern), glob));
  const isIgnored = (path: string, suffix = ""): boolean => {
    const relativePath = toPosix(relative(ignoreRoot, path)) + suffix;
    return ignore.some((pattern) => pattern.test(relativePath));
  };
  const found = new Set<string>();

  for (const pattern of options.include) {
    const normalized = relativePattern(root, pattern);
    if (!isGlob(normalized)) {
      const path = resolve(root, normalized);
      if (existsSync(path) && statSync(path).isFile()) found.add(path);
      continue;
    }
    const matcher = globToRegExp(normalized, glob);
    const base = resolve(root, globBase(normalized));
    if (!existsSync(base)) continue;
    const visit = (folder: string): void => {
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        const path = join(folder, entry.name);
        if (entry.isDirectory()) {
          // A pattern "**/dist/**" matches the files of a folder, so the test also adds a "/" to the folder
          if (skip.has(entry.name) || isIgnored(path) || isIgnored(path, "/")) continue;
          visit(path);
        } else if (entry.isFile() && matcher.test(toPosix(relative(root, path))) && !isIgnored(path)) {
          found.add(path);
        }
      }
    };
    visit(base);
  }
  return [...found].sort();
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

/** This function compares two names by their code units, as the default sort does. */
const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

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
