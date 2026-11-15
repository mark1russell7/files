import { describe, expect, it, vi } from "vitest";
import { HOME } from "./memory/tree.ts";
import { FOLDERS, SAMPLE_FILES, globResult, homeResult, insideResult, quickRegExp, runFind, runWalk, upResult } from "./model.ts";

// The stand-ins of the page, as the Vite plugin of the site gives them to the package.
vi.mock("node:fs", () => import("./memory/fs.ts"));
vi.mock("node:fs/promises", () => import("./memory/fs-promises.ts"));
vi.mock("node:os", () => import("./memory/os.ts"));
vi.mock("node:path", () => import("pathe"));

/** This function gives the paths of the rows where the two versions do not agree. */
const differences = (glob: string, dot = true): string[] =>
  globResult(glob, SAMPLE_FILES, dot)
    .rows.filter((row) => row.files !== row.quick)
    .map((row) => `${row.path} ${row.files ? "files" : "quick"}`);

describe("the glob demo", () => {
  it("shows where the quick regular expression goes wrong", () => {
    expect(quickRegExp("src/*.{ts,md}").test("src/a.{ts,md}")).toBe(true);
    expect(quickRegExp("src/*.{ts,md}").test("src/a.ts")).toBe(false);
    expect(differences("*.md")).toEqual(["docs/guide.md quick"]);
    expect(differences("src/**/*.ts")).toEqual(["src/cart.test.ts files", "src/cart.ts files", "src/index.ts files"]);
    expect(differences("**/*.js", false)).toEqual(["src/view/.cache/list.js quick"]);
    expect(differences("src/view/list.???")).toEqual([]);
  });

  it("gives the regular expression and the base folder of the pattern", () => {
    const result = globResult("src/**/*.ts", [], true);
    expect(result.base).toBe("src");
    expect(result.regexp).toMatch(/^\/\^src/);
    expect(result.quick).toMatch(/^\/\^src/);
    expect(globResult("**/*.js", [], true).base).toBe("");
  });
});

describe("the find demo", () => {
  it("reads only the folders under the base of the pattern", () => {
    const result = runFind({ include: ["src/**/*.{ts,tsx}"], ignore: ["**/*.test.ts"], dot: true, skip: true, entries: false });
    expect(result.found.map((entry) => entry.path)).toEqual(["/home/you/shop/src/cart.ts", "/home/you/shop/src/index.ts", "/home/you/shop/src/view/list.tsx"]);
    expect(result.reads).toEqual(["src", "src/view", "src/view/.cache"]);
    expect(result.tree.filter((row) => row.kind === "directory")).toHaveLength(FOLDERS.length);
    expect(result.tree[0]).toMatchObject({ path: ".", name: "shop", depth: 0, read: false });
  });

  it("skips node_modules and .git, and enters them with an empty skip", () => {
    const skipped = runFind({ include: ["**/package.json"], ignore: [], dot: true, skip: true, entries: false });
    expect(skipped.found.map((entry) => entry.path)).toEqual(["/home/you/shop/package.json", "/home/you/shop/packages/ui/package.json"]);
    expect(skipped.reads).not.toContain("node_modules");
    const all = runFind({ include: ["**/package.json"], ignore: [], dot: true, skip: false, entries: false });
    expect(all.found).toHaveLength(3);
    expect(all.reads).toEqual(expect.arrayContaining([".git", "node_modules", "node_modules/left-pad"]));
  });

  it("does not enter an ignored folder or follow a link", () => {
    const result = runFind({ include: ["**/*.js"], ignore: ["dist/**"], dot: true, skip: true, entries: false });
    expect(result.found.map((entry) => entry.path)).toEqual(["/home/you/shop/src/view/.cache/list.js"]);
    expect(result.reads).not.toContain("dist");
    expect(result.reads).not.toContain("latest");
  });

  it("gives folders and links with findEntries", () => {
    const result = runFind({ include: ["*"], ignore: [], dot: false, skip: true, entries: true });
    expect(result.found.map((entry) => `${entry.path.slice("/home/you/shop/".length)} ${entry.kind}`)).toEqual([
      "README.md file",
      "dist directory",
      "docs directory",
      "latest symlink",
      "package.json file",
      "packages directory",
      "src directory",
      "test directory",
    ]);
    expect(result.tree.find((row) => row.name === "latest")).toMatchObject({ kind: "symlink", target: "dist", found: true });
  });
});

describe("the walk demo", () => {
  it("gives a folder before its contents, in the order of the names", async () => {
    const result = await runWalk(["src"], []);
    expect(result.rows.map((row) => row.name)).toEqual([
      "src",
      "src/cart.test.ts",
      "src/cart.ts",
      "src/index.ts",
      "src/view",
      "src/view/.cache",
      "src/view/.cache/list.js",
      "src/view/list.css",
      "src/view/list.tsx",
    ]);
    expect(result).toMatchObject({ repeated: [], error: null });
  });

  it("does not follow a link, gives each name one time, and leaves out an excluded folder", async () => {
    expect((await runWalk(["latest", "dist"], [])).rows.slice(0, 2)).toEqual([
      { name: "latest", kind: "symlink" },
      { name: "dist", kind: "directory" },
    ]);
    const twice = await runWalk(["src", "src/view", "src"], []);
    expect(twice.repeated).toEqual(["src/view", "src"]);
    expect(twice.rows.filter((row) => row.name === "src/view")).toHaveLength(1);
    expect((await runWalk(["src"], ["src/view"])).rows.map((row) => row.name)).toEqual(["src", "src/cart.test.ts", "src/cart.ts", "src/index.ts"]);
  });

  it("stops at a missing name with the error of lstat", async () => {
    const result = await runWalk(["README.md", "nothing", "docs"], []);
    expect(result.rows).toEqual([{ name: "README.md", kind: "file" }]);
    expect(result.error).toEqual({ code: "ENOENT", message: "ENOENT: no such file or directory, lstat '/home/you/shop/nothing'" });
  });
});

describe("the path demos", () => {
  it("finds a path out of the folder that startsWith lets in", () => {
    expect(insideResult("/home/you/shop", "/home/you/shop/src/cart.ts")).toEqual({ inside: true, startsWith: true, resolved: "/home/you/shop/src/cart.ts" });
    expect(insideResult("/home/you/shop", "/home/you/shop-old/key.pem")).toMatchObject({ inside: false, startsWith: true });
    expect(insideResult("/home/you/shop", "/home/you/shop/../.ssh/id_ed25519")).toEqual({ inside: false, startsWith: true, resolved: "/home/you/.ssh/id_ed25519" });
  });

  it("expands only a leading ~ of the user", () => {
    expect(homeResult("~/notes.md")).toEqual({ expanded: "/home/you/notes.md", replaced: "/home/you/notes.md" });
    expect(homeResult("~user/notes.md")).toEqual({ expanded: "~user/notes.md", replaced: `${HOME}user/notes.md` });
    expect(homeResult("logs/~/today.txt")).toEqual({ expanded: "logs/~/today.txt", replaced: "logs//home/you/today.txt" });
  });

  it("finds the nearest file up the folders, and logs each probe", () => {
    expect(upResult("package.json", "packages/ui/src")).toEqual({
      found: "/home/you/shop/packages/ui/package.json",
      probes: [
        { path: "/home/you/shop/packages/ui/src/package.json", hit: false },
        { path: "/home/you/shop/packages/ui/package.json", hit: true },
      ],
    });
    const none = upResult("tsconfig.json", "src");
    expect(none.found).toBeNull();
    const folders = ["/home/you/shop/src", "/home/you/shop", "/home/you", "/home", ""];
    expect(none.probes.map((probe) => probe.path)).toEqual(folders.map((folder) => `${folder}/tsconfig.json`));
  });
});
