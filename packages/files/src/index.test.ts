import { describe, expect, it } from "vitest";
import * as entry from "./index.ts";

describe("the entry", () => {
  it("exports the functions of paths, globs and walks", () => {
    expect(Object.keys(entry).sort()).toEqual([
      "SKIPPED_FOLDERS", "expandHome", "findEntries", "findFiles", "findUp", "globBase", "globToRegExp", "isGlob", "isInside",
      "matchesGlob", "resolvePath", "toPosix", "walk",
    ]);
  });
});
