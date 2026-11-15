/**
 * The sample project of the demos: a folder tree in memory, and a log of each read of it. The stand-ins
 * of `node:fs`, `node:fs/promises` and `node:os` read this tree, so the functions of `@mark1russell7/files`
 * run on it in the browser.
 *
 * @packageDocumentation
 */
import { dirname, join, normalize } from "pathe";

/** The home folder of the sample user. */
export const HOME = "/home/you";

/** The folder of the sample project. */
export const ROOT = "/home/you/shop";

/** An entry of the tree. A link has a target relative to its folder. */
export type TreeNode = { readonly kind: "file" } | { readonly kind: "directory" } | { readonly kind: "symlink"; readonly target: string };

/**
 * The entries of the sample project, relative to `ROOT`. A text is a file, and the tree adds its
 * folders. A pair is a link and its target.
 */
export const SAMPLE: readonly (string | readonly [link: string, target: string])[] = [
  ".env",
  ".git/HEAD",
  ".git/config",
  ".github/workflows/ci.yml",
  "README.md",
  "dist/index.d.ts",
  "dist/index.js",
  "dist/view/list.js",
  "docs/guide.md",
  ["latest", "dist"],
  "node_modules/left-pad/index.js",
  "node_modules/left-pad/package.json",
  "package.json",
  "packages/ui/package.json",
  "packages/ui/src/button.tsx",
  "src/cart.test.ts",
  "src/cart.ts",
  "src/index.ts",
  "src/view/.cache/list.js",
  "src/view/list.css",
  "src/view/list.tsx",
  "test/fixtures/order.json",
];

/** This function gives the tree of the entries: each absolute path and its entry, with each folder up to `/`. */
export function buildTree(root: string, entries: typeof SAMPLE): Map<string, TreeNode> {
  const tree = new Map<string, TreeNode>([["/", { kind: "directory" }]]);
  const addFolders = (path: string): void => {
    for (let folder = dirname(path); !tree.has(folder); folder = dirname(folder)) tree.set(folder, { kind: "directory" });
  };
  for (const entry of entries) {
    const [name, node]: [string, TreeNode] = typeof entry === "string" ? [entry, { kind: "file" }] : [entry[0], { kind: "symlink", target: entry[1] }];
    const path = join(root, name);
    tree.set(path, node);
    addFolders(path);
  }
  return tree;
}

/** The tree of the sample project. */
export const TREE: ReadonlyMap<string, TreeNode> = buildTree(ROOT, SAMPLE);

/** The log of the reads of the tree since the last `clearLog`. */
export interface TreeLog {
  /** The folders that a `readdir` listed, in order. */
  readonly reads: string[];
  /** The paths that an `exists`, a `stat` or an `lstat` looked at, in order. */
  readonly probes: string[];
}

/** The log of the reads of the tree. */
export const treeLog: TreeLog = { reads: [], probes: [] };

/** This function empties the log. */
export function clearLog(): void {
  treeLog.reads.length = 0;
  treeLog.probes.length = 0;
}

/** This function gives the path with `/`, with no `.` or `..` segment and with no `/` at the end. */
export function clean(path: string): string {
  const normal = normalize(path);
  return normal.length > 1 && normal.endsWith("/") ? normal.slice(0, -1) : normal;
}

/** This function gives the path after each link in it, as the system reads it. It stops after 8 links in a row. */
export function follow(path: string): string {
  let at = "/";
  for (const segment of clean(path).split("/").filter(Boolean)) {
    at = at === "/" ? `/${segment}` : `${at}/${segment}`;
    for (let hops = 0; hops < 8; hops++) {
      const node = TREE.get(at);
      if (node?.kind !== "symlink") break;
      at = clean(join(dirname(at), node.target));
    }
  }
  return at;
}

/** This function gives the path after each link in its folders. A link at the end stays a link, as `lstat` reads it. */
export function followFolders(path: string): string {
  const at = clean(path);
  if (at === "/") return at;
  const folder = follow(dirname(at));
  const name = at.slice(at.lastIndexOf("/") + 1);
  return folder === "/" ? `/${name}` : `${folder}/${name}`;
}

/** This function gives the names in a folder, in the order of their code units. */
export function namesIn(folder: string): string[] {
  const prefix = folder === "/" ? "/" : `${folder}/`;
  return [...TREE.keys()]
    .filter((path) => path !== folder && path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
    .map((path) => path.slice(prefix.length))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
