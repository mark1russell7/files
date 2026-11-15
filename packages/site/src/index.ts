/**
 * The demos of the home page. Each demo reads its controls, runs the model on the sample project, and
 * shows the result.
 *
 * @packageDocumentation
 */
import { byId, copyText, h, setupTheme } from "@mark1russell7/site-pages/chrome";
import { examples, setField, verdict } from "@mark1russell7/site-pages/demo";
import { FOLDERS, SAMPLE_FILES, globResult, homeResult, insideResult, runFind, runWalk, upResult, type FindSettings } from "./model.ts";
import { HOME } from "./memory/tree.ts";

setupTheme(byId<HTMLButtonElement>("theme"), "theme");

const copy = byId<HTMLButtonElement>("copy");
copy.addEventListener("click", () => {
  void copyText(copy, byId("install").textContent ?? "");
});

/** This function gives the lines of a text box that are not empty, with no space at their ends. */
const lines = (field: HTMLTextAreaElement): string[] =>
  field.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");

/** This function gives a number and a noun, with the plural form of the noun for a number other than 1. */
const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** This function gives a code element with the text. */
const code = (text: string): HTMLElement => h("code", {}, text);

/** This function starts `update` one time, and again at each `input` event of the controls. */
function watch(controls: readonly HTMLElement[], update: () => void): void {
  for (const control of controls) control.addEventListener("input", update);
  update();
}

// 1. Globs

const glob = byId<HTMLInputElement>("glob");
const globDot = byId<HTMLInputElement>("glob-dot");

function updateGlob(): void {
  const result = globResult(glob.value, SAMPLE_FILES, globDot.checked);
  const matched = result.rows.filter((row) => row.files).length;
  const wrong = result.rows.filter((row) => row.files !== row.quick);
  byId("glob-result").replaceChildren(
    wrong.length === 0
      ? verdict(true, "The same result:", `both versions match ${count(matched, "file")} of ${SAMPLE_FILES.length}.`)
      : verdict(
          false,
          "The quick version is wrong:",
          `matchesGlob matches ${count(matched, "file")}. The quick version does not agree on ${count(wrong.length, "file")}: `,
          ...wrong.flatMap((row, index) => [index > 0 ? ", " : "", code(row.path)]),
          ".",
        ),
  );
  byId("glob-rows").replaceChildren(
    ...result.rows.map((row) => {
      const cell = (yes: boolean): HTMLTableCellElement => h("td", { class: yes ? "yes" : "no" }, h("span", { role: "img", "aria-label": yes ? "Match" : "No match" }, yes ? "✓" : "·"));
      return h("tr", { class: row.files === row.quick ? undefined : "differs" }, h("th", { scope: "row" }, code(row.path)), cell(row.files), cell(row.quick));
    }),
  );
  byId("glob-facts").replaceChildren(
    h("dt", {}, code("globToRegExp")),
    h("dd", {}, code(result.regexp)),
    h("dt", {}, "Quick version"),
    h("dd", {}, code(result.quick)),
    h("dt", {}, code("globBase")),
    h("dd", {}, result.base === "" ? "(the root: a walk reads each folder)" : code(result.base)),
  );
}

examples(
  byId("glob-chips"),
  [
    ["src/**/*.ts", "src/**/*.ts"],
    ["*.md", "*.md"],
    ["{src,test}/**", "{src,test}/**"],
    ["src/[!c]*.ts", "src/[!c]*.ts"],
    ["src/view/list.???", "src/view/list.???"],
  ],
  (value) => setField(glob, value),
);
watch([glob, globDot], updateGlob);

// 2. Find

const findInclude = byId<HTMLTextAreaElement>("find-include");
const findIgnore = byId<HTMLTextAreaElement>("find-ignore");
const findDot = byId<HTMLInputElement>("find-dot");
const findSkip = byId<HTMLInputElement>("find-skip");
const findEntries = byId<HTMLInputElement>("find-entries");

/** The examples of the find demo, by label. */
const FIND_EXAMPLES: Readonly<Record<string, FindSettings>> = {
  "Sources, no tests": { include: ["src/**/*.{ts,tsx}"], ignore: ["**/*.test.ts"], dot: true, skip: true, entries: false },
  "Each package.json": { include: ["**/package.json"], ignore: [], dot: true, skip: true, entries: false },
  "Scripts, no dist": { include: ["**/*.js"], ignore: ["dist/**"], dot: true, skip: true, entries: false },
  "No dot entries": { include: ["**/*"], ignore: [], dot: false, skip: true, entries: false },
  "The top folder": { include: ["*"], ignore: [], dot: true, skip: true, entries: true },
};

function updateFind(): void {
  const result = runFind({ include: lines(findInclude), ignore: lines(findIgnore), dot: findDot.checked, skip: findSkip.checked, entries: findEntries.checked });
  const folders = result.tree.filter((row) => row.kind === "directory").length;
  byId("find-summary").replaceChildren(
    h("b", {}, findEntries.checked ? `findEntries found ${count(result.found.length, "entry", "entries")}.` : `findFiles found ${count(result.found.length, "file")}.`),
    ` It read ${result.reads.length} of the ${folders} folders.`,
  );
  byId("find-tree").replaceChildren(
    ...result.tree.map((row) => {
      const label = row.kind === "directory" ? `${row.name}/` : row.kind === "symlink" ? `${row.name} → ${row.target}` : row.name;
      const classes = ["row", row.kind, row.seen ? "" : "unseen"].filter(Boolean).join(" ");
      return h(
        "li",
        { class: classes, style: `--depth: ${row.depth}` },
        row.found ? h("mark", {}, label) : h("span", {}, label),
        row.read ? h("span", { class: "tag" }, "read") : null,
      );
    }),
  );
}

examples(
  byId("find-chips"),
  Object.keys(FIND_EXAMPLES).map((label) => [label, label] as const),
  (label) => {
    const settings = FIND_EXAMPLES[label];
    if (settings === undefined) return;
    findDot.checked = settings.dot;
    findSkip.checked = settings.skip;
    findEntries.checked = settings.entries;
    findIgnore.value = settings.ignore.join("\n");
    setField(findInclude, settings.include.join("\n"));
  },
);
const firstFind = FIND_EXAMPLES["Sources, no tests"]!;
findInclude.value = firstFind.include.join("\n");
findIgnore.value = firstFind.ignore.join("\n");
watch([findInclude, findIgnore, findDot, findSkip, findEntries], updateFind);

// 3. Walk

const walkNames = byId<HTMLTextAreaElement>("walk-names");
const walkExclude = byId<HTMLTextAreaElement>("walk-exclude");

/** The examples of the walk demo, by label: the names and the excluded paths. */
const WALK_EXAMPLES: Readonly<Record<string, readonly [names: string, exclude: string]>> = {
  "A folder": ["src", ""],
  "A link and its target": ["latest\ndist", ""],
  "A name two times": ["src\nsrc/view", ""],
  "A missing name": ["README.md\nnothing\ndocs", ""],
  "Exclude a folder": ["src", "src/view"],
};

/** The number of the last walk, so the result of an earlier walk does not replace a newer one. */
let walkRun = 0;

async function updateWalk(): Promise<void> {
  const run = ++walkRun;
  const result = await runWalk(lines(walkNames), lines(walkExclude));
  if (run !== walkRun) return;
  const notes: HTMLElement[] = [];
  if (result.error !== null) notes.push(verdict(false, "The walk stopped:", `after ${count(result.rows.length, "entry", "entries")}, lstat threw `, code(result.error.message), "."));
  if (result.repeated.length > 0) {
    notes.push(verdict(true, "Each name one time:", "an earlier name already gave ", ...result.repeated.flatMap((name, index) => [index > 0 ? ", " : "", code(name)]), ", so the walk did not give it again."));
  }
  const links = result.rows.filter((row) => row.kind === "symlink");
  if (links.length > 0) notes.push(verdict(true, "No link followed:", "the walk gives ", ...links.flatMap((row, index) => [index > 0 ? ", " : "", code(row.name)]), " as a link, and it does not go into its target."));
  if (notes.length === 0) notes.push(verdict(true, "Depth first:", `the walk gave ${count(result.rows.length, "entry", "entries")}, each folder before its contents.`));
  byId("walk-result").replaceChildren(...notes);
  byId("walk-rows").replaceChildren(
    ...result.rows.map((row) => h("li", { class: row.kind }, code(row.kind === "directory" ? `${row.name}/` : row.name), h("span", { class: "tag" }, row.kind === "symlink" ? "link" : row.kind === "directory" ? "folder" : row.kind))),
  );
}

examples(
  byId("walk-chips"),
  Object.keys(WALK_EXAMPLES).map((label) => [label, label] as const),
  (label) => {
    const [names, exclude] = WALK_EXAMPLES[label] ?? ["", ""];
    walkExclude.value = exclude;
    setField(walkNames, names);
  },
);
walkNames.value = "src";
watch([walkNames, walkExclude], () => void updateWalk());

// 4. Inside

const insideFolder = byId<HTMLInputElement>("inside-folder");
const insidePath = byId<HTMLInputElement>("inside-path");

/** This function makes the card of one version of a check: its call, its answer and its verdict. */
function card(call: string, answer: string, pass: boolean, title: string, ...reason: readonly (Node | string)[]): HTMLElement {
  return h("div", { class: "sp-card" }, h("p", { class: "call" }, code(call)), h("p", { class: "answer" }, code(answer)), verdict(pass, title, ...reason));
}

function updateInside(): void {
  const folder = insideFolder.value.trim();
  const path = insidePath.value.trim();
  const result = insideResult(folder, path);
  const where = result.inside ? "in the folder" : "out of the folder";
  const after = result.resolved === path ? `The path is ${where}.` : `After its . and .. segments, the path is ${result.resolved}. It is ${where}.`;
  byId("inside-result").replaceChildren(
    card("isInside(folder, path)", String(result.inside), true, "Correct:", after),
    card("path.startsWith(folder)", String(result.startsWith), result.startsWith === result.inside, result.startsWith === result.inside ? "Correct:" : "Wrong:", result.startsWith === result.inside ? "the two checks agree for this path." : after),
  );
}

examples(
  byId("inside-chips"),
  [
    ["A file of the project", "/home/you/shop/src/cart.ts"],
    ["A folder with a longer name", "/home/you/shop-old/key.pem"],
    ["A path with ..", "/home/you/shop/../.ssh/id_ed25519"],
    ["A path with . and ..", "/home/you/shop/./src/../package.json"],
  ],
  (value) => setField(insidePath, value),
);
watch([insideFolder, insidePath], updateInside);

// 5. Home

const homePath = byId<HTMLInputElement>("home-path");

/** This function tells why `replace` gives another path than `expandHome`. */
function whyReplaceFails(path: string): string {
  if (!path.startsWith("~")) return "The ~ is not at the start, so it is a part of a name, not the home folder.";
  if (path.startsWith("~\\")) return "A Windows path keeps its \\ after the home folder, so the path has two kinds of separator.";
  return "A name after ~ is the home folder of another user, not of this user.";
}

function updateHome(): void {
  const path = homePath.value;
  const result = homeResult(path);
  const same = result.expanded === result.replaced;
  byId("home-result").replaceChildren(
    card("expandHome(path)", result.expanded, true, "Correct:", result.expanded === path ? "the path does not start with ~ alone or ~ and a separator, so it does not change." : `the ~ at the start is ${HOME}.`),
    card(`path.replace("~", home)`, result.replaced, same, same ? "Correct:" : "Wrong:", same ? "the two versions agree for this path." : whyReplaceFails(path)),
  );
}

examples(
  byId("home-chips"),
  [
    ["~/notes.md", "~/notes.md"],
    ["~", "~"],
    ["~user/notes.md", "~user/notes.md"],
    ["logs/~/today.txt", "logs/~/today.txt"],
    ["~\\notes.md", "~\\notes.md"],
  ],
  (value) => setField(homePath, value),
);
watch([homePath], updateHome);

// 6. Find up

const upName = byId<HTMLInputElement>("up-name");
const upFrom = byId<HTMLSelectElement>("up-from");
upFrom.replaceChildren(...FOLDERS.map((folder) => h("option", { value: folder }, folder === "." ? "shop (the project)" : `shop/${folder}`)));
upFrom.value = "packages/ui/src";

function updateUp(): void {
  const result = upResult(upName.value.trim(), upFrom.value);
  byId("up-result").replaceChildren(
    result.found === null
      ? verdict(false, "Not found:", `findUp gives null after ${count(result.probes.length, "probe")}, at the root.`)
      : verdict(true, "Found:", code(result.found), ` after ${count(result.probes.length, "probe")}.`),
  );
  byId("up-probes").replaceChildren(
    ...result.probes.map((probe) => h("li", { class: probe.hit ? "hit" : undefined }, h("span", { class: "mark", role: "img", "aria-label": probe.hit ? "Exists" : "Missing" }, probe.hit ? "✓" : "·"), code(probe.path))),
  );
}

/** The examples of the find-up demo, by label: the name and the folder of the start. */
const UP_EXAMPLES: Readonly<Record<string, readonly [name: string, from: string]>> = {
  "package.json from packages/ui/src": ["package.json", "packages/ui/src"],
  ".git from src/view/.cache": [".git", "src/view/.cache"],
  "README.md from test/fixtures": ["README.md", "test/fixtures"],
  "tsconfig.json from src": ["tsconfig.json", "src"],
};

examples(
  byId("up-chips"),
  Object.keys(UP_EXAMPLES).map((label) => [label, label] as const),
  (label) => {
    const [name, from] = UP_EXAMPLES[label] ?? ["", "."];
    upFrom.value = from;
    setField(upName, name);
  },
);
watch([upName, upFrom], updateUp);
