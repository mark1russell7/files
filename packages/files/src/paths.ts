/**
 * Paths: the home folder, a path inside a folder, `/` separators and the nearest file of a name.
 * The functions use only `node:` modules.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/**
 * This function replaces a leading `~` with the home folder: `~` becomes `home`, and `~/a` or `~\a`
 * becomes `home/a`. The function does not change other paths, for example `~user/a`.
 */
export function expandHome(path: string, home: string = homedir()): string {
  if (path === "~") return home;
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(home, path.slice(2));
  return path;
}

/** This function gives the absolute path of `path` against `base`, after `expandHome`. */
export function resolvePath(path: string, base: string, home: string = homedir()): string {
  return resolve(base, expandHome(path, home));
}

/**
 * This function tells if `path` is `folder` or a path in `folder`. The two paths are absolute.
 * On Windows, the case of the letters is not significant.
 */
export function isInside(folder: string, path: string): boolean {
  const rel = relative(folder, path);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

/**
 * This function replaces each `separator` with `/`. The default is the separator of the system. On
 * Windows, `a\b` becomes `a/b`. On the other systems, a `\` is a part of a name, and the path does not change.
 */
export function toPosix(path: string, separator: string = sep): string {
  return separator === "/" ? path : path.split(separator).join("/");
}

/**
 * This function gives the path of the nearest file or folder that has the name `name`. The search
 * starts in `from` and goes up to the root. The result is `null` when no folder has the name.
 */
export function findUp(name: string, from: string): string | null {
  let folder = resolve(from);
  for (;;) {
    const candidate = join(folder, name);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(folder);
    if (parent === folder) return null;
    folder = parent;
  }
}
