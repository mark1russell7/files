/**
 * The stand-in of `node:fs/promises` for the browser: `lstat` and `readdir` on the tree of the sample project.
 *
 * @packageDocumentation
 */
import { lstatSync, readdirSync, type Stats } from "./fs.ts";

/** This function gives the stats of the entry at the path. A link gives the stats of the link. */
export async function lstat(path: string): Promise<Stats> {
  return lstatSync(path)!;
}

/** This function gives the names in a folder. */
export async function readdir(path: string): Promise<string[]> {
  return readdirSync(path) as string[];
}
