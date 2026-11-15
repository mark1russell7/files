/**
 * The stand-in of `node:fs` for the browser: the functions that `@mark1russell7/files` uses, on the tree of
 * the sample project. Each call writes to the log of the tree. The Vite plugin of the site gives this
 * module to the imports of the package, and to no other module.
 *
 * @packageDocumentation
 */
import { TREE, clean, follow, followFolders, namesIn, treeLog, type TreeNode } from "./tree.ts";

/** The stats of an entry: its kind. */
export class Stats {
  readonly #kind: TreeNode["kind"];
  constructor(kind: TreeNode["kind"]) {
    this.#kind = kind;
  }
  isFile(): boolean {
    return this.#kind === "file";
  }
  isDirectory(): boolean {
    return this.#kind === "directory";
  }
  isSymbolicLink(): boolean {
    return this.#kind === "symlink";
  }
}

/** An entry of a folder, as `readdir` with `withFileTypes` gives it. */
export class Dirent extends Stats {
  readonly name: string;
  readonly parentPath: string;
  constructor(name: string, parentPath: string, kind: TreeNode["kind"]) {
    super(kind);
    this.name = name;
    this.parentPath = parentPath;
  }
}

/** This function throws the error of Node.js for a path: its code, its system call and its path. */
function fail(code: "ENOENT" | "ENOTDIR", syscall: string, path: string): never {
  const text = code === "ENOENT" ? "no such file or directory" : "not a directory";
  throw Object.assign(new Error(`${code}: ${text}, ${syscall} '${path}'`), { code, syscall, path, errno: code === "ENOENT" ? -2 : -20 });
}

/** This function tells if an entry exists at the path, after the links. */
export function existsSync(path: string): boolean {
  treeLog.probes.push(clean(path));
  return TREE.has(follow(path));
}

/** This function gives the stats of the entry at the path, after the links. */
export function statSync(path: string, options?: { throwIfNoEntry?: boolean }): Stats | undefined {
  treeLog.probes.push(clean(path));
  const node = TREE.get(follow(path));
  if (node === undefined) return options?.throwIfNoEntry === false ? undefined : fail("ENOENT", "stat", path);
  return new Stats(node.kind);
}

/** This function gives the stats of the entry at the path. A link gives the stats of the link. */
export function lstatSync(path: string, options?: { throwIfNoEntry?: boolean }): Stats | undefined {
  treeLog.probes.push(clean(path));
  const node = TREE.get(followFolders(path));
  if (node === undefined) return options?.throwIfNoEntry === false ? undefined : fail("ENOENT", "lstat", path);
  return new Stats(node.kind);
}

/** This function gives the names in a folder, or its entries with `withFileTypes`. It follows a link to a folder. */
export function readdirSync(path: string, options?: { withFileTypes?: boolean }): string[] | Dirent[] {
  const folder = follow(path);
  const node = TREE.get(folder);
  if (node === undefined) fail("ENOENT", "scandir", path);
  if (node.kind !== "directory") fail("ENOTDIR", "scandir", path);
  treeLog.reads.push(clean(path));
  const names = namesIn(folder);
  if (options?.withFileTypes !== true) return names;
  return names.map((name) => new Dirent(name, clean(path), TREE.get(folder === "/" ? `/${name}` : `${folder}/${name}`)!.kind));
}
