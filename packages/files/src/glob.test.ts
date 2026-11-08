import { posix } from "node:path";
import { describe, expect, it } from "vitest";
import { globBase, globToRegExp, isGlob, matchesGlob } from "./glob.ts";

const matches = (glob: string, path: string): boolean => globToRegExp(glob).test(path);

// The cases of the copy in ste-lint (src/files.test.ts)
describe("globToRegExp: the cases of ste-lint", () => {
  it("matches *, ** and ?", () => {
    expect(matches("*.md", "README.md")).toBe(true);
    expect(matches("*.md", "docs/a.md")).toBe(false);
    expect(matches("docs/**/*.md", "docs/a.md")).toBe(true);
    expect(matches("docs/**/*.md", "docs/x/y/a.md")).toBe(true);
    expect(matches("**/node_modules/**", "node_modules/a/b.js")).toBe(true);
    expect(matches("**/node_modules/**", "packages/x/node_modules/a.js")).toBe(true);
    expect(matches("**/dist/**", "packages/x/dist/")).toBe(true);
    expect(matches("a?.ts", "ab.ts")).toBe(true);
    expect(matches("a?.ts", "a/.ts")).toBe(false);
    expect(matches("src/**", "src/a/b.ts")).toBe(true);
    expect(matches("a**b", "axxb")).toBe(true);
  });

  it("matches alternatives and character sets", () => {
    expect(matches("packages/*/src/**/*.{ts,tsx}", "packages/lag/src/a/b.tsx")).toBe(true);
    expect(matches("packages/*/src/**/*.{ts,tsx}", "packages/lag/src/a.js")).toBe(false);
    expect(matches("*.{md,{mdx,markdown}}", "a.markdown")).toBe(true);
    expect(matches("file[0-9].md", "file3.md")).toBe(true);
    expect(matches("file[!0-9].md", "file3.md")).toBe(false);
    expect(matches("a{b", "a{b")).toBe(true);
    expect(matches("a[b", "a[b")).toBe(true);
  });

  it("escapes regular expression characters and accepts ./ and backslashes", () => {
    expect(matches("a+b.(c)", "a+b.(c)")).toBe(true);
    expect(matches("./docs\\*.md", "docs/a.md")).toBe(true);
  });

  it("finds the static base folder of a pattern", () => {
    expect(globBase("packages/*/src/**/*.ts")).toBe("packages");
    expect(globBase("docs/**/*.md")).toBe("docs");
    expect(globBase("*.md")).toBe("");
    expect(globBase("./a\\b/*.md")).toBe("a/b");
    expect(isGlob("README.md")).toBe(false);
    expect(isGlob("*.md")).toBe(true);
  });
});

// The three forms where the copy in conventions is wider than the copies in ste-lint and release-train
describe("globToRegExp: the wider forms of conventions", () => {
  it("matches the folder of a/** itself", () => {
    expect(matches("packages/**", "packages")).toBe(true);
    expect(matches("packages/**", "packages/a/b")).toBe(true);
    expect(matches("packages/**", "packagesx")).toBe(false);
  });

  it("matches {a,b} braces", () => {
    expect(matches("{a,b}", "a")).toBe(true);
    expect(matches("{a,b}", "b")).toBe(true);
    expect(matches("{a,b}", "c")).toBe(false);
    expect(matches("{a,b}", "{a,b}")).toBe(false);
  });

  it("matches **/test/** with zero leading segments", () => {
    expect(matches("**/test/**", "test")).toBe(true);
    expect(matches("**/test/**", "test/a")).toBe(true);
    expect(matches("**/test/**", "x/y/test/a")).toBe(true);
    expect(matches("**/test/**", "x/latest/a")).toBe(false);
  });
});

describe("globToRegExp: sets", () => {
  it("does not let a negated set match /", () => {
    expect(matches("a[!b]c", "a/c")).toBe(false);
    expect(matches("a[^b]c", "axc")).toBe(true);
    expect(matches("a[^b]c", "abc")).toBe(false);
  });
});

describe("the dot option", () => {
  const cases: Array<[string, string]> = [
    ["*", ".env"],
    ["**", ".github/ci.yml"],
    ["**/*", "a/.env"],
    ["src/*.ts", "src/.hidden.ts"],
    ["?env", ".env"],
    ["[.]env", ".env"],
    ["{*,x}", ".env"],
    ["a/**", "a/.git/x"],
    ["**/x", ".a/x"],
  ];

  it("lets the wildcards match a leading dot by default", () => {
    for (const [glob, path] of cases) expect(matchesGlob(path, glob), `${glob} ${path}`).toBe(true);
  });

  it("keeps the dot entries out of the wildcards with dot: false", () => {
    for (const [glob, path] of cases) expect(matchesGlob(path, glob, { dot: false }), `${glob} ${path}`).toBe(false);
  });

  it("matches a dot entry with dot: false when the pattern segment starts with a dot", () => {
    expect(matchesGlob(".env", ".*", { dot: false })).toBe(true);
    expect(matchesGlob(".github/ci.yml", ".github/**", { dot: false })).toBe(true);
    expect(matchesGlob("a/.env", "**/.env", { dot: false })).toBe(true);
    expect(matchesGlob("a.env", "*.env", { dot: false })).toBe(true);
  });
});

// The globs and paths of the comparison with the copies. Each difference is in DIFFERENCES.
const GLOBS = [
  "*", "*.ts", "**", "**/*", "**/*.ts", "src/**", "src/**/*.ts", "packages/*", "packages/**", "**/test/**",
  "**/dist/**", "a/*/c", "a/**/c", "a?c", "{a,b}", "{a,b}/*.ts", "src/{lib,bin}/**/*.{ts,tsx}", "x/{a,{b,c}}",
  "[abc]", "[!abc]", "file[0-9].txt", ".*", "**/.*", ".github/**", "./src/*.ts", "src\\*.ts", "a.b", "a+b",
  "(x)", "**.ts", "a/**b", "{a", "a}", "**/node_modules/**", "*/", "src/*/",
];
const PATHS = [
  "", "a", "b", "c", "x", "a.ts", "src", "src/a.ts", "src/lib/a.ts", "src/lib/a.tsx", "src/bin/x/a.ts", "src/x/a.ts",
  "packages", "packages/a", "packages/a/b", "test", "test/a", "x/test/a", "x/test", "dist/a", "x/dist/a", "a/b/c",
  "a/c", "a/b/d/c", "abc", "a.c", "ac", "a/b", "b/x.ts", "a/x.ts", "d", "/", "file1.txt", "filea.txt", ".env",
  "x/.env", ".github", ".github/workflows/ci.yml", "src/.hidden.ts", "a.b", "a+b", "(x)", "x.ts", "a/xb", "{a",
  "a}", "node_modules/x", "x/node_modules/y", "x/b", "a/", "src/x/", "x/{a", "x/a", "x/c",
];

/**
 * Each difference from a copy, on the globs and paths above. "ste" is ste-lint, "conv" is conventions,
 * "cdot" and "cnod" are the node:path match of the client glob procedure with dot true and false.
 */
const DIFFERENCES = [
  "cdot \"*\" \"\" node=false files=true",
  "cnod \"*\" \"\" node=false files=true",
  "cdot \"*\" \"a/\" node=true files=false",
  "cnod \"*\" \"a/\" node=true files=false",
  "cnod \"**\" \"/\" node=true files=false",
  "cnod \"**\" \"a/\" node=true files=false",
  "cnod \"**\" \"src/x/\" node=true files=false",
  "cdot \"**/*\" \"\" node=false files=true",
  "cnod \"**/*\" \"\" node=false files=true",
  "ste \"**/*\" \"/\" ste=true files=false",
  "ste \"src/**\" \"src\" ste=false files=true",
  "cdot \"src/**\" \"src\" node=false files=true",
  "cnod \"src/**\" \"src\" node=false files=true",
  "ste \"packages/**\" \"packages\" ste=false files=true",
  "cdot \"packages/**\" \"packages\" node=false files=true",
  "cnod \"packages/**\" \"packages\" node=false files=true",
  "ste \"**/test/**\" \"test\" ste=false files=true",
  "cdot \"**/test/**\" \"test\" node=false files=true",
  "cnod \"**/test/**\" \"test\" node=false files=true",
  "ste \"**/test/**\" \"x/test\" ste=false files=true",
  "cdot \"**/test/**\" \"x/test\" node=false files=true",
  "cnod \"**/test/**\" \"x/test\" node=false files=true",
  "cdot \"{a,b}\" \"a/\" node=true files=false",
  "cnod \"{a,b}\" \"a/\" node=true files=false",
  "conv \"[abc]\" \"a\" conv=false files=true",
  "conv \"[abc]\" \"b\" conv=false files=true",
  "conv \"[abc]\" \"c\" conv=false files=true",
  "cdot \"[abc]\" \"a/\" node=true files=false",
  "cnod \"[abc]\" \"a/\" node=true files=false",
  "conv \"[!abc]\" \"x\" conv=false files=true",
  "conv \"[!abc]\" \"d\" conv=false files=true",
  "ste \"[!abc]\" \"/\" ste=true files=false",
  "conv \"file[0-9].txt\" \"file1.txt\" conv=false files=true",
  "ste \".github/**\" \".github\" ste=false files=true",
  "cdot \".github/**\" \".github\" node=false files=true",
  "cnod \".github/**\" \".github\" node=false files=true",
  "conv \"./src/*.ts\" \"src/a.ts\" conv=false files=true",
  "cdot \"./src/*.ts\" \"src/a.ts\" node=false files=true",
  "cnod \"./src/*.ts\" \"src/a.ts\" node=false files=true",
  "conv \"./src/*.ts\" \"src/.hidden.ts\" conv=false files=true",
  "cdot \"./src/*.ts\" \"src/.hidden.ts\" node=false files=true",
  "conv \"src\\\\*.ts\" \"src/a.ts\" conv=false files=true",
  "conv \"src\\\\*.ts\" \"src/.hidden.ts\" conv=false files=true",
  "conv \"{a\" throws",
  "cdot \"*/\" \"/\" node=false files=true",
  "cnod \"*/\" \"/\" node=false files=true",
];

describe("the comparison with the copies", () => {
  it("gives the same result as each copy, except the listed differences", () => {
    const rows: string[] = [];
    let total = 0;
    for (const glob of GLOBS) {
      let conventions: RegExp | undefined;
      try {
        conventions = conventionsGlobToRegExp(glob);
      } catch {
        rows.push(`conv ${JSON.stringify(glob)} throws`);
      }
      const ste = steLintGlobToRegExp(glob);
      for (const path of PATHS) {
        total++;
        const files = matchesGlob(path, glob);
        const filesNoDot = matchesGlob(path, glob, { dot: false });
        const at = `${JSON.stringify(glob)} ${JSON.stringify(path)}`;
        if (ste.test(path) !== files) rows.push(`ste ${at} ste=${ste.test(path)} files=${files}`);
        if (conventions && conventions.test(path) !== files) rows.push(`conv ${at} conv=${conventions.test(path)} files=${files}`);
        if (clientMatch(path, glob, true) !== files) rows.push(`cdot ${at} node=${clientMatch(path, glob, true)} files=${files}`);
        if (clientMatch(path, glob, false) !== filesNoDot) rows.push(`cnod ${at} node=${clientMatch(path, glob, false)} files=${filesNoDot}`);
      }
    }
    expect(total).toBe(GLOBS.length * PATHS.length);
    expect([...rows].sort()).toEqual([...DIFFERENCES].sort());
  });
});

// ---- The copies, as fixtures. ste-lint src/files.ts:

function steEscape(char: string): string {
  return /[.+^$()|\\[\]{}]/.test(char) ? `\\${char}` : char;
}
function steClosingBrace(glob: string, open: number): number {
  let depth = 0;
  for (let i = open; i < glob.length; i++) {
    if (glob[i] === "{") depth++;
    if (glob[i] === "}" && --depth === 0) return i;
  }
  return -1;
}
function steSplit(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "{") depth++;
    if (body[i] === "}") depth--;
    if (body[i] === "," && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));
  return parts;
}
function steSource(glob: string): string {
  let source = "";
  let i = 0;
  while (i < glob.length) {
    const char = glob[i]!;
    if (char === "*") {
      if (glob[i + 1] === "*") {
        const atStart = i === 0 || glob[i - 1] === "/";
        const atEnd = i + 2 === glob.length || glob[i + 2] === "/";
        if (atStart && atEnd) {
          if (glob[i + 2] === "/") {
            source += "(?:.*/)?";
            i += 3;
          } else {
            source += ".*";
            i += 2;
          }
          continue;
        }
      }
      source += "[^/]*";
      i++;
      while (glob[i] === "*") i++;
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      i++;
      continue;
    }
    if (char === "[") {
      const close = glob.indexOf("]", i + 1);
      if (close !== -1) {
        let set = glob.slice(i + 1, close);
        if (set.startsWith("!")) set = "^" + set.slice(1);
        source += `[${set.replace(/\\/g, "\\\\")}]`;
        i = close + 1;
        continue;
      }
    }
    if (char === "{") {
      const close = steClosingBrace(glob, i);
      if (close !== -1) {
        source += `(?:${steSplit(glob.slice(i + 1, close)).map(steSource).join("|")})`;
        i = close + 1;
        continue;
      }
    }
    source += steEscape(char);
    i++;
  }
  return source;
}
function steLintGlobToRegExp(glob: string): RegExp {
  const normalized = glob.replace(/\\/g, "/").replace(/^\.\//, "");
  return new RegExp(`^${steSource(normalized)}$`);
}

// ---- conventions 0.38.x src/workspace.ts
const SPECIAL = new Set([..."\\^$.|+()[]{}*?/"]);
function conventionsGlobToRegExp(glob: string): RegExp {
  let source = "";
  let braces = 0;
  for (let index = 0; index < glob.length; index++) {
    const char = glob.charAt(index);
    if (char === "/" && glob.slice(index + 1) === "**") {
      source += "(?:/.*)?";
      break;
    }
    if (char === "*" && glob.charAt(index + 1) === "*") {
      const atStart = index === 0 || glob.charAt(index - 1) === "/";
      const after = glob.charAt(index + 2);
      if (atStart && after === "/") {
        source += "(?:[^/]+/)*";
        index += 2;
      } else if (atStart && after === "") {
        source += ".*";
        index += 1;
      } else {
        source += "[^/]*";
        index += 1;
      }
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else if (char === "{") {
      braces++;
      source += "(?:";
    } else if (char === "}" && braces > 0) {
      braces--;
      source += ")";
    } else if (char === "," && braces > 0) source += "|";
    else if (SPECIAL.has(char)) source += `\\${char}`;
    else source += char;
  }
  if (braces > 0) throw new Error(`A glob with a "{" that has no "}": ${glob}`);
  return new RegExp(`^${source}$`);
}

// ---- the client glob procedure: node:path matchesGlob, with the dot trick when dot is true
const DOT = "\u0001";
function hideDots(path: string): string {
  return path
    .split("/")
    .map((name) => (name.startsWith(".") && name !== "." && name !== ".." ? DOT + name.slice(1) : name))
    .join("/");
}
function clientMatch(path: string, pattern: string, dot: boolean): boolean {
  return dot ? posix.matchesGlob(hideDots(path), hideDots(pattern)) : posix.matchesGlob(path, pattern);
}
