import { findEntries, findFiles, findUp, expandHome, walk } from "@mark1russell7/files";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HOME, ROOT, clearLog, treeLog } from "./tree.ts";

// The stand-ins of the page, as the Vite plugin of the site gives them to the package.
vi.mock("node:fs", () => import("./fs.ts"));
vi.mock("node:fs/promises", () => import("./fs-promises.ts"));
vi.mock("node:os", () => import("./os.ts"));
vi.mock("node:path", () => import("pathe"));

beforeEach(clearLog);

describe("the sample project in memory", () => {
  it("runs the functions of the package, and logs each folder that a walk reads", async () => {
    expect(expandHome("~/shop")).toBe(`${HOME}/shop`);
    expect(findFiles({ root: ROOT, include: ["src/**/*.ts"] })).toEqual([`${ROOT}/src/cart.test.ts`, `${ROOT}/src/cart.ts`, `${ROOT}/src/index.ts`]);
    expect(treeLog.reads).toEqual([`${ROOT}/src`, `${ROOT}/src/view`, `${ROOT}/src/view/.cache`]);
    expect(treeLog.probes).toEqual([`${ROOT}/src`]);
    clearLog();
    expect(findUp("package.json", `${ROOT}/src/view`)).toBe(`${ROOT}/package.json`);
    expect(treeLog.probes).toEqual([`${ROOT}/src/view/package.json`, `${ROOT}/src/package.json`, `${ROOT}/package.json`]);
  });

  it("walks a link as a link, a folder before its contents, and the contents in order", async () => {
    const walked = [];
    for await (const entry of walk(ROOT, ["latest", "src/view"])) walked.push(`${entry.name} ${entry.kind}`);
    expect(walked).toEqual(["latest symlink", "src/view directory", "src/view/.cache directory", "src/view/.cache/list.js file", "src/view/list.css file", "src/view/list.tsx file"]);
    expect(findEntries({ root: ROOT, include: ["l*"] })).toEqual([{ path: `${ROOT}/latest`, kind: "symlink" }]);
  });

  it("reads a path through a link, and throws the error of Node.js for a missing name", async () => {
    expect(findFiles({ root: ROOT, include: ["latest/view/*.js"] })).toEqual([`${ROOT}/latest/view/list.js`]);
    await expect(walk(ROOT, ["nothing"]).next()).rejects.toMatchObject({ code: "ENOENT", message: `ENOENT: no such file or directory, lstat '${ROOT}/nothing'` });
  });
});
