import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("the entry ./glob", () => {
  it("imports no module, so a browser can load it", () => {
    const source = readFileSync(new URL("./glob.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/^\s*(import|export)\b[^;]*\bfrom\s/m);
    expect(source).not.toMatch(/\bimport\s*\(/);
  });
});
