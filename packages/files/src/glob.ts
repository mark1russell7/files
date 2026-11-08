/**
 * Globs: a glob pattern to a regular expression, with no file system access.
 *
 * The syntax:
 *
 * - `*` matches characters in one segment of a path.
 * - `**` as a whole segment matches zero or more segments. Thus `a/**` matches `a`, and `**\/b` matches `b`.
 * - `?` matches one character of a segment.
 * - `[abc]` or `[!abc]` matches one character of a set, or one character that is not in the set.
 * - `{a,b}` matches one of the alternatives. The alternatives can have globs and groups.
 *
 * A pattern uses `/`. The functions read a `\` as `/`, and they remove a leading `./`.
 */

/** The options of a match. */
export interface GlobOptions {
  /**
   * The value `true` (the default) lets `*`, `?`, `**` and a set match a `.` at the start of a segment.
   * With `false`, a dot entry matches only a pattern segment that starts with `.`, as in a shell.
   */
  readonly dot?: boolean | undefined;
}

/** The characters of a regular expression that a glob character escapes. */
const SPECIAL = new Set([..."\\^$.|+()[]{}"]);

/** The characters that make a pattern a glob. */
const GLOB_CHARS = /[*?[\]{}]/;

/** This function tells if `pattern` has a glob character. */
export function isGlob(pattern: string): boolean {
  return GLOB_CHARS.test(pattern);
}

/** This function gives the pattern with `/` and with no leading `./`. */
function normalize(glob: string): string {
  return glob.replaceAll("\\", "/").replace(/^(?:\.\/)+/, "");
}

/** This function gives the index of the `}` that closes the `{` at `open`, or -1. */
function closingBrace(glob: string, open: number): number {
  let depth = 0;
  for (let index = open; index < glob.length; index++) {
    if (glob[index] === "{") depth++;
    if (glob[index] === "}" && --depth === 0) return index;
  }
  return -1;
}

/** This function gives the alternatives of a group. A comma in a nested group does not divide them. */
function alternatives(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < body.length; index++) {
    if (body[index] === "{") depth++;
    if (body[index] === "}") depth--;
    if (body[index] === "," && depth === 0) {
      parts.push(body.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(body.slice(start));
  return parts;
}

/**
 * This function gives the regular expression source of `glob`. The value of `start` tells if the first
 * character of `glob` is at the start of a segment.
 */
function source(glob: string, dot: boolean, start: boolean): string {
  // A wildcard at the start of a segment does not match a leading "." when `dot` is false
  const guard = dot ? "" : "(?!\\.)";
  const segment = `${guard}[^/]+`;
  let out = "";
  let index = 0;
  while (index < glob.length) {
    const char = glob.charAt(index);
    const atStart = index === 0 ? start : glob.charAt(index - 1) === "/";
    if (char === "/" && index > 0 && glob.slice(index) === "/**") {
      // "a/**" matches "a" and each path under it
      out += dot ? "(?:/.*)?" : `(?:/(?:${segment})?)*`;
      break;
    }
    if (char === "*" && glob.charAt(index + 1) === "*" && atStart) {
      const after = glob.charAt(index + 2);
      if (after === "/") {
        // "**/" matches zero or more whole segments
        out += `(?:${segment}/)*`;
        index += 3;
        continue;
      }
      if (after === "") {
        out += dot ? ".*" : `(?:${segment}(?:/${segment})*)?`;
        index += 2;
        continue;
      }
    }
    if (char === "*") {
      out += `${atStart ? guard : ""}[^/]*`;
      while (glob.charAt(index) === "*") index++;
      continue;
    }
    if (char === "?") {
      out += `${atStart ? guard : ""}[^/]`;
      index++;
      continue;
    }
    if (char === "[") {
      const close = glob.indexOf("]", index + 1);
      if (close > index + 1) {
        let set = glob.slice(index + 1, close).replaceAll("\\", "\\\\");
        // A negated set does not match "/" either
        if (set.startsWith("!") || set.startsWith("^")) set = `^/${set.slice(1)}`;
        out += `${atStart ? guard : ""}[${set}]`;
        index = close + 1;
        continue;
      }
    }
    if (char === "{") {
      const close = closingBrace(glob, index);
      if (close !== -1) {
        const parts = alternatives(glob.slice(index + 1, close)).map((part) => source(part, dot, atStart));
        out += `(?:${parts.join("|")})`;
        index = close + 1;
        continue;
      }
    }
    out += SPECIAL.has(char) ? `\\${char}` : char;
    index++;
  }
  return out;
}

/** This function gives a regular expression that matches a whole relative path with `/` for `glob`. */
export function globToRegExp(glob: string, options: GlobOptions = {}): RegExp {
  return new RegExp(`^${source(normalize(glob), options.dot ?? true, true)}$`);
}

/** This function tells if the relative path `path` with `/` matches `glob`. */
export function matchesGlob(path: string, glob: string, options: GlobOptions = {}): boolean {
  return globToRegExp(glob, options).test(path);
}

/**
 * This function gives the part of a pattern before its first segment with a glob character. A walk for
 * the pattern starts in that folder. The last segment is not a part of the base, because it names files.
 */
export function globBase(glob: string): string {
  const segments = normalize(glob).split("/");
  const base: string[] = [];
  for (const segment of segments.slice(0, -1)) {
    if (isGlob(segment)) break;
    base.push(segment);
  }
  return base.join("/");
}
