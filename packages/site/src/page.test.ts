import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

describe("the home page", () => {
  it("names the package and gives the install command", () => {
    expect(page).toContain("<title>files</title>");
    expect(page).toContain("pnpm add @mark1russell7/files");
  });

  it("links to the pages of site-pages and to the repository", () => {
    expect(page).toContain('href="./releases/"');
    expect(page).toContain('href="./status/"');
    expect(page).toContain('href="https://github.com/mark1russell7/files"');
  });

  it("has each element that the script of the demos reads", () => {
    const ids = [...script.matchAll(/byId(?:<\w+>)?\("([\w-]+)"\)/g)].map((match) => match[1]);
    expect(ids.length).toBeGreaterThan(20);
    expect(ids.filter((id) => !page.includes(`id="${id}"`))).toEqual([]);
  });

  it("links each door to a demo of the page", () => {
    const doors = [...page.matchAll(/<li><a href="#([\w-]+)">/g)].map((match) => match[1]);
    expect(doors).toHaveLength(4);
    expect(doors.filter((id) => !page.includes(`id="${id}"`))).toEqual([]);
  });
});
