// The probe of the home page for `site-pages check`: it uses each demo as a visitor does, at each width of the check.
declare const check: (name: string, ok: boolean, detail?: unknown) => void;
declare const $: (selector: string) => HTMLElement | null;
declare const $$: (selector: string) => HTMLElement[];
declare const click: (element: Element | string | null) => void;
declare const type: (element: Element | string | null, text: string) => void;
declare const until: (fn: () => unknown, ms?: number) => Promise<boolean>;

/** This function gives the text of an element, or an empty text. */
const text = (selector: string): string => $(selector)?.textContent ?? "";
/** This function finds a button of a row by its text. */
const chip = (row: string, label: string): HTMLElement | null => $$(`#${row} button`).find((element) => element.textContent === label) ?? null;

check("the first glob finds three sources that the quick version misses", await until(() => $$("#glob-rows tr.differs").length === 3), text("#glob-result"));
click(chip("glob-chips", "*.md"));
check("the quick version of *.md goes into docs", await until(() => $$("#glob-rows tr.differs").length === 1 && text("#glob-rows tr.differs").includes("docs/guide.md")), text("#glob-result"));
click(chip("glob-chips", "src/view/list.???"));
check("the two versions agree on list.???", await until(() => $("#glob-result .sp-verdict.sp-pass") !== null), text("#glob-result"));

check("findFiles reads three folders for the sources", text("#find-summary").includes("It read 3 of the"), text("#find-summary"));
click(chip("find-chips", "Each package.json"));
check("the find skips node_modules", await until(() => text("#find-summary").includes("found 2 files") && $$("#find-tree mark").length === 2), text("#find-summary"));
click("#find-skip");
check("with no skip, the find enters node_modules", await until(() => text("#find-summary").includes("found 3 files")), text("#find-summary"));
click(chip("find-chips", "The top folder"));
check("findEntries gives the link as a link", await until(() => $$("#find-tree .symlink mark").length === 1), text("#find-summary"));

click(chip("walk-chips", "A link and its target"));
check("the walk gives the link and does not follow it", await until(() => text("#walk-result").includes("No link followed") && $$("#walk-rows li").length === 6), text("#walk-result"));
click(chip("walk-chips", "A missing name"));
check("a missing name stops the walk with ENOENT", await until(() => text("#walk-result").includes("ENOENT") && $$("#walk-rows li").length === 1), text("#walk-result"));

check("startsWith lets in a folder with a longer name", $$("#inside-result .sp-verdict.sp-fail").length === 1, text("#inside-result"));
click(chip("inside-chips", "A path with .."));
check("isInside reads the .. segment", await until(() => text("#inside-result").includes("/home/you/.ssh/id_ed25519")), text("#inside-result"));

// The home folder of the sample user, then the name of another user: the text that replace gives for ~user/notes.md.
check("replace changes the ~ of another user", text("#home-result").includes(`${"/home/you"}user/notes.md`), text("#home-result"));
type("#home-path", "~/a.txt");
check("the two versions agree on ~/a.txt", await until(() => $$("#home-result .sp-verdict.sp-fail").length === 0), text("#home-result"));

check("findUp finds the package.json of the package", text("#up-result").includes("/home/you/shop/packages/ui/package.json"), text("#up-result"));
click(chip("up-chips", "tsconfig.json from src"));
check("findUp gives null after five probes", await until(() => text("#up-result").includes("after 5 probes") && $$("#up-probes li").length === 5), text("#up-result"));

export {};
