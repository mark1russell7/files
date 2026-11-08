import { byId, copyText, setupTheme } from "@mark1russell7/site-pages/chrome";
import { globToRegExp } from "@mark1russell7/files/glob";
import { matchRows } from "./match.ts";

setupTheme(byId<HTMLButtonElement>("theme"), "theme");

const copy = byId<HTMLButtonElement>("copy");
copy.addEventListener("click", () => {
  void copyText(copy, byId("install").textContent ?? "");
});

const glob = byId<HTMLInputElement>("glob");
const paths = byId<HTMLTextAreaElement>("paths");
const dot = byId<HTMLInputElement>("dot");
const results = byId<HTMLUListElement>("results");

function update(): void {
  const lines = paths.value.split(/\r?\n/).filter((line) => line.trim() !== "");
  const options = { dot: dot.checked };
  const rows = matchRows(glob.value, lines, options);
  results.replaceChildren(
    ...rows.map((row) => {
      const item = document.createElement("li");
      item.className = row.match ? "yes" : "no";
      const mark = document.createElement("span");
      mark.className = "mark";
      mark.textContent = row.match ? "match" : "no match";
      const code = document.createElement("code");
      code.textContent = row.path;
      item.append(mark, code);
      return item;
    }),
  );
  const count = rows.filter((row) => row.match).length;
  byId("summary").textContent = `${count} of ${rows.length} paths match.`;
  byId("regexp").textContent = String(globToRegExp(glob.value, options));
}

for (const input of [glob, paths, dot]) input.addEventListener("input", update);
byId<HTMLFormElement>("tester").addEventListener("submit", (event) => event.preventDefault());
update();
