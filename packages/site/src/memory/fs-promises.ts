/**
 * The stand-in of `node:fs/promises` for the browser: `lstat`, `stat` and `readdir` on the tree of the sample project.
 *
 * @packageDocumentation
 */
import { lstatSync, readdirSync, statSync, type Dirent, type Stats } from "./fs.ts";

/** This function gives the stats of the entry at the path. A link gives the stats of the link. */
export async function lstat(path: string): Promise<Stats> {
  return lstatSync(path)!;
}

/** This function gives the stats of the entry at the path, after the links. */
export async function stat(path: string): Promise<Stats> {
  return statSync(path)!;
}

/** This function gives the names in a folder, or its entries with `withFileTypes`. */
export async function readdir(path: string, options?: { withFileTypes?: boolean }): Promise<string[] | Dirent[]> {
  return readdirSync(path, options);
}
