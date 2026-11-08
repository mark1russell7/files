# @mark1russell7/files

Plain functions for paths, glob patterns and file walks on Node.js. The package uses only `node:` modules and has no dependencies.

```sh
npm install @mark1russell7/files
```

## Paths

```ts
import { expandHome, findUp, isInside, resolvePath, toPosix } from "@mark1russell7/files";

expandHome("~/notes");                  // the home folder joined with "notes"
resolvePath("~/a", "/work");            // resolve() after expandHome
isInside("/work", "/work/..x/a");       // true: "..x" is a name, not the parent
isInside("/work", "/work2");            // false
toPosix("a\\b", "\\");                  // "a/b"
findUp("package.json", process.cwd());  // the nearest file of the name, or null
```

## Glob patterns

`globToRegExp` and `matchesGlob` read a pattern against a path with `/` separators.

| Form | Matches |
| --- | --- |
| `*`, `?` | Characters of one segment |
| `**` | Zero or more segments |
| `a/**` | `a` and each path below `a` |
| `**/b` | `b` at each depth, also at the top |
| `{a,b}`, `{a,{b,c}}` | One of the alternatives |
| `[abc]`, `[a-z]`, `[!abc]` | One character of the set, or not of the set. A negated set does not match `/`. |

The functions remove a leading `./` and read `\` as `/`. An unclosed `{` or `[` is a literal character.

By default the wildcards match a name that starts with a dot. With `{ dot: false }`, a wildcard does not match a leading dot, as in `matchesGlob` of `node:path`.

The entry `@mark1russell7/files/glob` has only the glob functions and imports no module. A browser can load it.

```ts
import { globBase, isGlob, matchesGlob } from "@mark1russell7/files";

matchesGlob("src/a/b.ts", "src/**/*.{ts,tsx}");          // true
matchesGlob(".env", "*", { dot: false });                // false
globBase("packages/*/src/**/*.ts");                      // "packages"
isGlob("README.md");                                     // false
```

## File walks

`findFiles` gives the sorted absolute paths of the files that match the include patterns and no ignore pattern. It does not enter `node_modules` or `.git`. A named file that exists is always in the result.

```ts
import { findFiles } from "@mark1russell7/files";

const files = findFiles({
  root: process.cwd(),
  include: ["docs/**/*.md", "packages/*/src/**/*.ts"],
  ignore: ["**/*.test.ts"],
});
```

`findEntries` takes the same options. It also gives the folders, the links and the other entries that match. It does not enter a folder that an ignore pattern matches. A pattern `x/**` also gives the folder `x`.

```ts
import { findEntries } from "@mark1russell7/files";

const entries = findEntries({ root: process.cwd(), include: ["src/**"], ignore: ["src/gen/**"], skip: [] });
entries[0]; // { path: "/work/src", kind: "directory" }
```

`walk` gives an entry for each name and for each file and folder below it. It gives a folder before its contents and the contents in the order of their names. It does not follow a link.

```ts
import { walk } from "@mark1russell7/files";

for await (const entry of walk("/work", ["src", "README.md"], { exclude: new Set(["/work/src/gen"]) })) {
  entry.kind;  // "file", "directory", "symlink" or "other"
  entry.name;  // the path relative to the base, with "/" separators
  entry.stats; // the result of lstat
}
```

## License

MIT
