/**
 * The replies the dream agents give (spec §10.4). A reply that passes its schema is still checked
 * against what the script knows: a plan citing a candidate nobody extracted would make a writer
 * invent a source, and the reviewer would then check the invention against itself.
 */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";

import * as lib from "../_lib/responses.mjs";

type Plan = { files: { path: string; action: string; candidates: string[]; reason?: string }[] };
type Reply = { path: string; facts: { text: string; candidates: string[] }[] };
const { checkPlan, checkWriterReply, correctionReply, extractorReply, jsonSchemaOf, plannerReply, reviewerReply, writerReply } =
  lib as unknown as {
    checkPlan: (plan: Plan, known: { candidateIds: Set<string>; existing: Set<string> }) => string[];
    checkWriterReply: (reply: Reply, entry: Plan["files"][number]) => string[];
    correctionReply: ZodType;
    extractorReply: ZodType;
    jsonSchemaOf: (schema: ZodType) => string;
    plannerReply: ZodType;
    reviewerReply: ZodType;
    writerReply: ZodType;
  };

const candidate = {
  id: "abc-01",
  fact: "Convex refuses ISO dates.",
  kind: "pitfall",
  source: { sessionId: "abc", line: "uuid-1", timestamp: "2026-11-02T18:12:00Z", branch: "feature/a" },
  signaled: true,
};

describe("the schemas", () => {
  it("accept the shapes of spec 10.4", () => {
    expect(extractorReply.safeParse({ status: "ok", candidates: [candidate] }).success).toBe(true);
    expect(
      plannerReply.safeParse({
        status: "ok",
        files: [{ path: "memories/api.md", action: "update", candidates: ["abc-01"] }, { path: "memories/old.md", action: "delete", candidates: [], reason: "Unused." }],
        docsIssues: [{ doc: "docs/ARCHITECTURE.md", issue: "Stale." }],
      }).success,
    ).toBe(true);
    expect(writerReply.safeParse({ status: "ok", path: "memories/api.md", facts: [{ text: "x", candidates: ["abc-01"] }], alerts: [{ kind: "flip-flop", message: "m" }] }).success).toBe(true);
    expect(correctionReply.safeParse({ status: "ok", changed: ["memories/api.md"], alerts: [] }).success).toBe(true);
    expect(reviewerReply.safeParse({ status: "ok", flags: [{ path: "memories/api.md", fact: "f", problem: "p", evidence: "e", severity: "high" }] }).success).toBe(true);
  });

  it("refuse a path outside memories/, a nested one, and a candidate kind that does not exist", () => {
    const plan = (path: string) => plannerReply.safeParse({ status: "ok", files: [{ path, action: "create", candidates: ["a"] }], docsIssues: [] }).success;

    expect(plan("memories/ok.md")).toBe(true);
    expect(plan("README.md")).toBe(false);
    expect(plan("memories/sub/deep.md")).toBe(false);
    expect(plan("../memories/x.md")).toBe(false);
    expect(extractorReply.safeParse({ status: "ok", candidates: [{ ...candidate, kind: "opinion" }] }).success).toBe(false);
  });

  it("refuse a candidate whose date is not a date", () => {
    const bad = { ...candidate, source: { ...candidate.source, timestamp: "yesterday" } };

    expect(extractorReply.safeParse({ status: "ok", candidates: [bad] }).success).toBe(false);
  });

  it("turn into JSON Schema text for --json-schema, without the draft marker", () => {
    const parsed = JSON.parse(jsonSchemaOf(plannerReply)) as Record<string, unknown>;

    expect(parsed.type).toBe("object");
    expect(parsed).not.toHaveProperty("$schema");
    expect(Object.keys(parsed.properties as object)).toEqual(expect.arrayContaining(["status", "files", "docsIssues"]));
  });
});

describe("checkPlan", () => {
  const known = { candidateIds: new Set(["a", "b", "c"]), existing: new Set(["memories/api.md"]) };
  const plan = (...files: Plan["files"]) => checkPlan({ files }, known);

  it("accepts a coherent plan", () => {
    expect(plan({ path: "memories/api.md", action: "update", candidates: ["a"] }, { path: "memories/new.md", action: "create", candidates: ["b", "c"] })).toEqual([]);
  });

  it("refuses a candidate no extractor returned", () => {
    expect(plan({ path: "memories/api.md", action: "update", candidates: ["zzz"] })).toEqual(["memories/api.md cites candidate zzz, which no extractor returned"]);
  });

  it("refuses a candidate assigned to two files", () => {
    expect(plan({ path: "memories/api.md", action: "update", candidates: ["a"] }, { path: "memories/new.md", action: "create", candidates: ["a"] })).toEqual(["candidate a is assigned to two files"]);
  });

  it("refuses creating what exists, and updating or deleting what does not", () => {
    expect(plan({ path: "memories/api.md", action: "create", candidates: ["a"] })).toContain("memories/api.md is planned as new but exists");
    expect(plan({ path: "memories/gone.md", action: "update", candidates: ["a"] })).toContain("memories/gone.md is planned to update but does not exist");
    expect(plan({ path: "memories/gone.md", action: "delete", candidates: [], reason: "r" })).toEqual(["memories/gone.md is planned to delete but does not exist"]);
  });

  it("refuses a file twice, a write from nothing, and a delete without a reason", () => {
    expect(plan({ path: "memories/api.md", action: "update", candidates: ["a"] }, { path: "memories/api.md", action: "update", candidates: ["b"] })).toContain("memories/api.md appears twice in the plan");
    expect(plan({ path: "memories/api.md", action: "update", candidates: [] })).toEqual(["memories/api.md has no candidate to write from"]);
    expect(plan({ path: "memories/api.md", action: "delete", candidates: [] })).toEqual(["memories/api.md is deleted without a reason"]);
  });
});

describe("checkWriterReply", () => {
  const entry = { path: "memories/api.md", action: "update", candidates: ["a", "b"] };

  it("accepts a reply for its own file, citing its own candidates", () => {
    expect(checkWriterReply({ path: "memories/api.md", facts: [{ text: "f", candidates: ["a"] }] }, entry)).toEqual([]);
  });

  it("refuses another file, no fact, and a candidate the file was not given", () => {
    expect(checkWriterReply({ path: "memories/other.md", facts: [{ text: "f", candidates: ["a"] }] }, entry)).toEqual(["the writer answered for memories/other.md, not memories/api.md"]);
    expect(checkWriterReply({ path: "memories/api.md", facts: [] }, entry)).toEqual(["the writer for memories/api.md reports no fact"]);
    expect(checkWriterReply({ path: "memories/api.md", facts: [{ text: "f", candidates: ["zzz"] }] }, entry)).toEqual(["a fact in memories/api.md cites zzz, which is not one of its candidates"]);
  });
});
