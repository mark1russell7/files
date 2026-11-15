import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

// The Pages workflow sets SITE_BASE to "/files". A local build uses the root.
const site = process.env["SITE_BASE"];

/** This function gives the path of a file of this package, with `/`. */
const here = (file: string): string => fileURLToPath(new URL(file, import.meta.url)).replaceAll("\\", "/");
/** This function gives a module id with `/` and in lower case, so two ids compare on Windows too. */
const key = (path: string): string => path.replaceAll("\\", "/").toLowerCase();

/** The stand-ins of the `node:` modules that `@mark1russell7/files` imports. They read the sample project of the demos. */
const STAND_INS: Readonly<Record<string, string>> = {
  "node:fs": here("./src/memory/fs.ts"),
  "node:fs/promises": here("./src/memory/fs-promises.ts"),
  "node:os": here("./src/memory/os.ts"),
};

/**
 * This plugin gives the stand-ins to the imports of the source of `@mark1russell7/files`, and `pathe` for
 * `node:path`. Thus the real functions of the package run in the browser on the sample project. Vitest
 * does not give a `node:` import to a plugin, so the tests give the same stand-ins with `vi.mock`.
 */
function memoryNode(): Plugin {
  const library = key(here("../files/src/"));
  return {
    name: "files-site:memory-node",
    enforce: "pre",
    async resolveId(source, importer) {
      if (importer === undefined || !key(importer).startsWith(library)) return null;
      if (source === "node:path") return this.resolve("pathe", here("./src/memory/tree.ts"), { skipSelf: true });
      return STAND_INS[source] ?? null;
    },
  };
}

export default defineConfig({
  base: site ? `${site.replace(/\/$/, "")}/` : "/",
  build: { target: "es2022" },
  plugins: [memoryNode()],
});
