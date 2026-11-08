import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchRows } from "./match.ts";

const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");

describe("the glob tester", () => {
  it("gives the result of the pattern on each path of the first list of the page", () => {
    const list = /<textarea id="paths"[^>]*>([^<]*)<\/textarea>/.exec(page)?.[1] ?? "";
    const glob = /id="glob"[^>]*value="([^"]*)"/.exec(page)?.[1] ?? "";
    const rows = matchRows(glob, list.split("\n"), { dot: true });
    expect(rows.filter((row) => row.match).map((row) => row.path)).toEqual(["src/index.ts", "src/view/list.tsx", "src/.hidden.ts"]);
    expect(matchRows(glob, ["src/.hidden.ts"], { dot: false })[0]?.match).toBe(false);
  });
});
