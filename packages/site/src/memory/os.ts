/**
 * The stand-in of `node:os` for the browser: the home folder of the sample user.
 *
 * @packageDocumentation
 */
import { HOME } from "./tree.ts";

/** This function gives the home folder of the sample user. */
export function homedir(): string {
  return HOME;
}
