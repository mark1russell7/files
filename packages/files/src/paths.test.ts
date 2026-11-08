import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { expandHome, findUp, isInside, resolvePath, toPosix } from "./paths.ts";

const HOME = resolve("/home/user");

describe("expandHome", () => {
  it("replaces ~, ~/ and ~\\ with the home folder", () => {
    expect(expandHome("~", HOME)).toBe(HOME);
    expect(expandHome("~/a/b", HOME)).toBe(join(HOME, "a/b"));
    expect(expandHome("~\\a", HOME)).toBe(join(HOME, "a"));
  });

  it("does not change other paths", () => {
    for (const path of ["~user/a", "a/~/b", "/abs", "rel", "", "~~"]) expect(expandHome(path, HOME)).toBe(path);
  });
});

describe("resolvePath", () => {
  it("resolves against the base after expandHome", () => {
    const base = resolve("/work");
    expect(resolvePath("a", base, HOME)).toBe(join(base, "a"));
    expect(resolvePath("~/a", base, HOME)).toBe(join(HOME, "a"));
    expect(resolvePath(resolve("/x"), base, HOME)).toBe(resolve("/x"));
  });
});

// The cases of the copy in @procedures/fs (src/root.test.ts)
describe("isInside", () => {
  const root = resolve("/work/root");

  it("treats a name that starts with .. as a name, not as a parent", () => {
    expect(isInside(root, join(root, "..x"))).toBe(true);
    expect(isInside(root, join(root, "..", "x"))).toBe(false);
    expect(isInside(root, root)).toBe(true);
    expect(isInside(root, `${root}2`)).toBe(false);
    expect(isInside(root, join(root, "a", "b"))).toBe(true);
  });
});

// The cases of portableLinkTarget in @procedures/archive (src/archive.test.ts)
describe("toPosix", () => {
  it("replaces the separator of Windows, and keeps a \\ of a name on the other systems", () => {
    expect(toPosix("..\\sub\\a.txt", "\\")).toBe("../sub/a.txt");
    expect(toPosix("../a\\b.txt", "/")).toBe("../a\\b.txt");
    expect(toPosix(["a", "b"].join(sep))).toBe("a/b");
  });
});

describe("findUp", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "files-up-"));
    mkdirSync(join(root, "a", "b", "c"), { recursive: true });
    writeFileSync(join(root, "a", "marker.json"), "{}");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("gives the nearest file of the name, at or above the start", () => {
    expect(findUp("marker.json", join(root, "a", "b", "c"))).toBe(join(root, "a", "marker.json"));
    expect(findUp("marker.json", join(root, "a"))).toBe(join(root, "a", "marker.json"));
  });

  it("gives null when no folder up to the root has the name", () => {
    expect(findUp(`missing-${Date.now()}-${process.pid}.json`, join(root, "a", "b"))).toBeNull();
  });
});
