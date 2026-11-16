/**
 * The labels file is what issues are sorted by. A plan that misses a colour change leaves GitHub
 * drifting from the file; one that removes a label the file keeps strips it from every issue.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import * as lib from "../_lib/labels.mjs";

type Label = { name: string; color: string; description: string };
/** `labels.mjs` is plain JavaScript; the contract is restated here so a drift stops compiling. */
const { labelPlan } = lib as unknown as {
  labelPlan: (wanted: Label[], live: Label[]) => { create: Label[]; update: (Label & { from: string })[]; remove: Label[] };
};

const bug = { name: "bug", color: "d73a4a", description: "Something works wrong" };
const dependencies = { name: "dependencies", color: "0366d6", description: "Pull requests that update a dependency file" };

describe("labelPlan", () => {
  it("creates a label GitHub does not have", () => {
    expect(labelPlan([bug], [])).toEqual({ create: [bug], update: [], remove: [] });
  });

  it("updates a colour or a description, and nothing else", () => {
    const live = [{ ...bug, color: "D73A4A" }, { ...dependencies, color: "ffffff" }];
    const plan = labelPlan([bug, dependencies], live);
    expect(plan.update).toEqual([{ ...dependencies, from: "dependencies" }]);
    expect(plan.create).toEqual([]);
  });

  it("renames a label whose case differs, rather than creating a second one", () => {
    expect(labelPlan([bug], [{ ...bug, name: "Bug" }])).toEqual({ create: [], update: [{ ...bug, from: "Bug" }], remove: [] });
  });

  it("removes GitHub's defaults and keeps what the file names", () => {
    const enhancement = { name: "enhancement", color: "a2eeef", description: "New feature or request" };
    const plan = labelPlan([bug, dependencies], [bug, dependencies, enhancement]);
    expect(plan.remove).toEqual([enhancement]);
    expect(plan.update).toEqual([]);
  });

  it("never sends the file's group to GitHub", () => {
    expect(labelPlan([{ ...bug, group: "type" } as Label], []).create).toEqual([bug]);
  });
});

describe(".github/labels.json", () => {
  const labels = JSON.parse(readFileSync(path.resolve(".github/labels.json"), "utf8")) as (Label & { group: string })[];

  it("has one area per module under src/modules, plus infra", () => {
    const modules = readdirSync(path.resolve("src/modules"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const areas = labels.filter((label) => label.group === "area").map((label) => label.name);
    expect(areas.sort()).toEqual([...modules, "infra"].sort());
  });

  it("has the four types the issue forms and drafts use", () => {
    expect(labels.filter((label) => label.group === "type").map((label) => label.name)).toEqual(["bug", "feature", "chore", "docs"]);
  });

  it("offers exactly the area labels in every issue form's Area question", () => {
    const areas = labels.filter((label) => label.group === "area").map((label) => label.name);
    const formsDir = path.resolve(".github/ISSUE_TEMPLATE");
    const forms = readdirSync(formsDir).filter((file) => /^\d-.+\.yml$/.test(file));
    expect(forms.length).toBe(3);
    for (const form of forms) {
      // The options listed between the Area question's `options:` and its `validations:`.
      const block = /id: area\n[\s\S]*?options:\n([\s\S]*?)\n\s*validations:/.exec(readFileSync(path.join(formsDir, form), "utf8").replace(/\r\n/g, "\n"));
      const options = [...(block?.[1] ?? "").matchAll(/^\s*- (\S+)$/gm)].map((match) => match[1]);
      expect(options, form).toEqual(areas);
    }
  });

  it("names every label once, with a six-digit colour", () => {
    const names = labels.map((label) => label.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const label of labels) expect(label.color).toMatch(/^[0-9a-f]{6}$/);
  });
});
