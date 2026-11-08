import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findFiles, walk, type WalkEntry } from "./walk.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "files-walk-"));
  const files = [
    "README.md",
    "docs/guide.md",
    "docs/deep/page.mdx",
    "packages/a/src/index.ts",
    "packages/a/src/index.test.ts",
    "packages/a/dist/index.js",
    "packages/a/node_modules/x/index.ts",
    "packages/b/src/view.tsx",
    "packages/b/src/.hidden.ts",
    ".github/ci.yml",
  ];
  for (const file of files) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), "x");
  }
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const rel = (file: string, from = root): string => relative(from, file).split(sep).join("/");

// The cases of the copy in ste-lint (src/files.test.ts)
describe("findFiles: the cases of ste-lint", () => {
  const find = (include: string[], ignore: string[] = ["**/*.test.ts", "**/dist/**", "**/.*"]): string[] =>
    findFiles({ root, include, ignore }).map((file) => rel(file));

  it("finds the files that match, with no ignored files, node_modules or duplicates, in order", () => {
    expect(find(["README.md", "docs/**/*.{md,mdx}", "packages/*/src/**/*.{ts,tsx}", "docs/guide.md"])).toEqual([
      "README.md",
      "docs/deep/page.mdx",
      "docs/guide.md",
      "packages/a/src/index.ts",
      "packages/b/src/view.tsx",
    ]);
  });

  it("finds a named file that an ignore pattern matches, and skips a missing file or folder", () => {
    expect(find(["packages/a/src/index.test.ts", "missing.md", "docs", "nothing/**/*.md"])).toEqual(["packages/a/src/index.test.ts"]);
  });

  it("accepts absolute patterns, also for the ignore patterns", () => {
    const absolute = root.split(sep).join("/");
    expect(find([`${absolute}/docs/**/*.{md,mdx}`])).toEqual(["docs/deep/page.mdx", "docs/guide.md"]);
    expect(find([`${absolute}/packages/*/src/**/*.ts`], [`${absolute}/packages/**/*.test.ts`])).toEqual([
      "packages/a/src/index.ts",
      "packages/b/src/.hidden.ts",
    ]);
    const docs = join(root, "docs");
    expect(findFiles({ root: docs, include: [`${absolute}/packages/b/**/*.tsx`], ignore: [] }).map((file) => rel(file))).toEqual([
      "packages/b/src/view.tsx",
    ]);
  });

  it("applies the ignore patterns relative to ignoreRoot", () => {
    const packages = join(root, "packages");
    expect(findFiles({ root: packages, include: ["**/*.ts"], ignore: ["packages/a/**"], ignoreRoot: root })).toEqual([
      join(root, "packages", "b", "src", ".hidden.ts"),
    ]);
    const all = findFiles({ root: packages, include: ["**/*.{ts,tsx}"], ignore: ["**/node_modules/**", "packages/a/**", "**/.*"], ignoreRoot: root });
    expect(all.map((file) => rel(file))).toEqual(["packages/b/src/view.tsx"]);
  });
});

describe("findFiles: the options", () => {
  it("keeps the dot entries out with dot: false", () => {
    expect(findFiles({ root, include: ["**/*"], dot: false }).map((file) => rel(file))).not.toContain("packages/b/src/.hidden.ts");
    expect(findFiles({ root, include: ["**/*"], dot: false }).map((file) => rel(file))).not.toContain(".github/ci.yml");
    expect(findFiles({ root, include: ["**/*"] }).map((file) => rel(file))).toContain(".github/ci.yml");
  });

  it("enters node_modules when skip does not name it", () => {
    expect(findFiles({ root, include: ["packages/a/**/*.ts"], skip: [] }).map((file) => rel(file))).toEqual([
      "packages/a/node_modules/x/index.ts",
      "packages/a/src/index.test.ts",
      "packages/a/src/index.ts",
    ]);
  });
});

describe("walk", () => {
  const names = async (base: string, start: string[], exclude?: Set<string>): Promise<string[]> => {
    const out: string[] = [];
    for await (const entry of walk(base, start, { exclude })) out.push(`${entry.kind} ${entry.name}`);
    return out;
  };

  it("gives a folder before its contents, the contents in the order of their names, and each name one time", async () => {
    expect(await names(root, ["docs", "README.md", "docs"])).toEqual([
      "directory docs",
      "directory docs/deep",
      "file docs/deep/page.mdx",
      "file docs/guide.md",
      "file README.md",
    ]);
  });

  it("gives the absolute path and the lstat result of each entry", async () => {
    const entries: WalkEntry[] = [];
    for await (const entry of walk(root, ["docs/guide.md"])) entries.push(entry);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.path).toBe(join(root, "docs", "guide.md"));
    expect(entries[0]!.stats.size).toBe(1);
  });

  it("leaves out an excluded path with its contents", async () => {
    expect(await names(root, ["docs"], new Set([join(root, "docs", "deep")]))).toEqual(["directory docs", "file docs/guide.md"]);
  });

  it("gives a link as a link and does not follow it", async () => {
    // A junction on Windows needs no privilege. The other systems ignore the type.
    symlinkSync(join(root, "docs"), join(root, "link"), "junction");
    expect(await names(root, ["link"])).toEqual(["symlink link"]);
  });

  it("throws the error of lstat for a name that does not exist", async () => {
    await expect(names(root, ["missing"])).rejects.toMatchObject({ code: "ENOENT" });
  });
});
