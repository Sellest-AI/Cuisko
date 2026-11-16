/**
 * The replies the dream agents give (spec §10.4). A reply that passes its schema is still checked
 * against what the script knows: a plan citing a candidate nobody extracted would make a writer
 * invent a source, and the reviewer would then check the invention against itself.
 */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";

import * as lib from "../_lib/responses.mjs";

type Entry = { topic: string; action: string; candidates: string[] };
type Plan = {
  topics: Entry[];
  delete: { fact: string; reason: string; because: string }[];
  deleteTopics: { topic: string; reason: string; because: string }[];
  dropped?: { candidate: string; reason: string }[];
};
type Reply = { topic: string; facts: { text: string; candidates: string[] }[] };
type Known = { candidateIds: Set<string>; topics: Set<string>; facts: Set<string> };
const { checkPlan, checkWriterReply, correctionReply, droppedCandidates, extractorReply, jsonSchemaOf, plannerReply, reviewerReply, screenDeletions, UNUSED_AFTER_SESSIONS, writerReply } =
  lib as unknown as {
    screenDeletions: (plan: Plan, totals: Map<string, { sessionsSinceRead?: number }>) => { plan: Plan; alerts: { kind: string; message: string }[] };
    UNUSED_AFTER_SESSIONS: number;
    checkPlan: (plan: Plan, known: Known) => string[];
    checkWriterReply: (reply: Reply, entry: Entry) => string[];
    droppedCandidates: (plan: Pick<Plan, "topics" | "dropped">, candidates: { id: string; fact: string }[]) => { id: string; fact: string; reason: string }[];
    correctionReply: ZodType;
    extractorReply: ZodType;
    jsonSchemaOf: (schema: ZodType) => string;
    plannerReply: ZodType;
    reviewerReply: ZodType;
    writerReply: ZodType;
  };

const API_FACT = "memories/convex-api/iso-dates-refused-k3x9.md";

const candidate = {
  id: "abc-01",
  fact: "Convex refuses ISO dates.",
  kind: "pitfall",
  source: { sessionId: "abc", line: "uuid-1", timestamp: "2026-11-02T18:12:00Z", branch: "feature/a" },
  signaled: true,
};

const emptyPlan = (overrides: Partial<Plan> = {}): Plan => ({ topics: [], delete: [], deleteTopics: [], dropped: [], ...overrides });

describe("the schemas", () => {
  it("accept the shapes of spec 10.4", () => {
    expect(extractorReply.safeParse({ status: "ok", candidates: [candidate] }).success).toBe(true);
    expect(
      plannerReply.safeParse({
        status: "ok",
        topics: [{ topic: "convex-api", action: "update", candidates: ["abc-01"] }],
        delete: [{ fact: API_FACT, reason: "The helper is gone.", because: "gone" }],
        deleteTopics: [{ topic: "old-tool", reason: "Unused.", because: "unused" }],
        docsIssues: [{ doc: "docs/ARCHITECTURE.md", issue: "Stale." }],
      }).success,
    ).toBe(true);
    expect(writerReply.safeParse({ status: "ok", topic: "convex-api", facts: [{ text: "x", candidates: ["abc-01"] }], alerts: [{ kind: "flip-flop", message: "m" }] }).success).toBe(true);
    expect(correctionReply.safeParse({ status: "ok", changed: [API_FACT], alerts: [] }).success).toBe(true);
    expect(reviewerReply.safeParse({ status: "ok", flags: [{ path: API_FACT, fact: "f", problem: "p", evidence: "e", severity: "high" }] }).success).toBe(true);
  });

  it("take a reviewer flag with what it fixed, and refuse an empty fix", () => {
    const flag = (fix: string) => ({ path: API_FACT, fact: "f", problem: "p", evidence: "e", severity: "high", fix });
    expect(reviewerReply.safeParse({ status: "ok", flags: [flag("removed the name")] }).success).toBe(true);
    expect(reviewerReply.safeParse({ status: "ok", flags: [flag("")] }).success).toBe(false);
  });

  it("tell the planner dropped is required, and read a plan without it, or without deletions, as empty lists", () => {
    const schema = JSON.parse(jsonSchemaOf(plannerReply)) as { required: string[] };

    expect(schema.required).toContain("dropped");
    expect(plannerReply.parse({ status: "ok", topics: [], docsIssues: [] })).toMatchObject({ dropped: [], delete: [], deleteTopics: [] });
    expect(plannerReply.safeParse({ status: "ok", topics: [], dropped: [{ candidate: "a", reason: "" }], docsIssues: [] }).success).toBe(false);
  });

  it("read a reviewer reply without drop as nothing to drop, and refuse a drop that is not a fact", () => {
    expect(reviewerReply.parse({ status: "ok", flags: [] })).toMatchObject({ drop: [] });
    expect(reviewerReply.safeParse({ status: "ok", flags: [], drop: ["index.md"] }).success).toBe(false);
    expect(reviewerReply.safeParse({ status: "ok", flags: [], drop: ["memories/flat.md"] }).success).toBe(false);
  });

  it("refuse a topic that is not lowercase words, or is index, and a fact path outside a topic", () => {
    const topic = (name: string) => plannerReply.safeParse({ status: "ok", topics: [{ topic: name, action: "create", candidates: ["a"] }], docsIssues: [] }).success;
    const fact = (path: string) => plannerReply.safeParse({ status: "ok", topics: [], delete: [{ fact: path, reason: "r", because: "gone" }], docsIssues: [] }).success;

    expect(topic("convex-api")).toBe(true);
    expect(topic("Convex")).toBe(false);
    expect(topic("index")).toBe(false);
    expect(topic("a/b")).toBe(false);
    expect(fact(API_FACT)).toBe(true);
    expect(fact("memories/convex-api.md")).toBe(false);
    expect(fact("memories/convex-api/sub/deep.md")).toBe(false);
    expect(fact("../memories/convex-api/x.md")).toBe(false);
  });

  it("refuse a deletion reason the schema does not know", () => {
    expect(plannerReply.safeParse({ status: "ok", topics: [], delete: [{ fact: API_FACT, reason: "r", because: "unused" }], docsIssues: [] }).success).toBe(false);
    expect(plannerReply.safeParse({ status: "ok", topics: [], deleteTopics: [{ topic: "old", reason: "r", because: "wrong" }], docsIssues: [] }).success).toBe(false);
  });

  it("refuse a candidate kind that does not exist, and a date that is not a date", () => {
    const bad = { ...candidate, source: { ...candidate.source, timestamp: "yesterday" } };

    expect(extractorReply.safeParse({ status: "ok", candidates: [{ ...candidate, kind: "opinion" }] }).success).toBe(false);
    expect(extractorReply.safeParse({ status: "ok", candidates: [bad] }).success).toBe(false);
  });

  it("turn into JSON Schema text for --json-schema, without the draft marker", () => {
    const parsed = JSON.parse(jsonSchemaOf(plannerReply)) as Record<string, unknown>;

    expect(parsed.type).toBe("object");
    expect(parsed).not.toHaveProperty("$schema");
    expect(Object.keys(parsed.properties as object)).toEqual(expect.arrayContaining(["status", "topics", "delete", "deleteTopics", "docsIssues"]));
  });
});

describe("checkPlan", () => {
  const known: Known = { candidateIds: new Set(["a", "b", "c"]), topics: new Set(["convex-api", "old-tool"]), facts: new Set([API_FACT]) };
  const plan = (...topics: Entry[]) => checkPlan(emptyPlan({ topics }), known);

  it("accepts a coherent plan", () => {
    expect(
      checkPlan(
        emptyPlan({
          topics: [
            { topic: "convex-api", action: "update", candidates: ["a"] },
            { topic: "git-hooks", action: "create", candidates: ["b", "c"] },
          ],
          delete: [{ fact: API_FACT, reason: "r", because: "gone" }],
          deleteTopics: [{ topic: "old-tool", reason: "r", because: "unused" }],
        }),
        known,
      ),
    ).toEqual([]);
  });

  it("refuses a candidate no extractor returned", () => {
    expect(plan({ topic: "convex-api", action: "update", candidates: ["zzz"] })).toEqual(["topic convex-api cites candidate zzz, which no extractor returned"]);
  });

  it("refuses a candidate assigned to two topics", () => {
    expect(plan({ topic: "convex-api", action: "update", candidates: ["a"] }, { topic: "git-hooks", action: "create", candidates: ["a"] })).toEqual(["candidate a is assigned to two topics"]);
  });

  it("refuses creating a topic that exists, and updating one that does not", () => {
    expect(plan({ topic: "convex-api", action: "create", candidates: ["a"] })).toEqual(["topic convex-api is planned as new but exists"]);
    expect(plan({ topic: "gone", action: "update", candidates: ["a"] })).toEqual(["topic gone is planned to update but does not exist"]);
  });

  it("refuses a topic twice, and a write from nothing", () => {
    expect(plan({ topic: "convex-api", action: "update", candidates: ["a"] }, { topic: "convex-api", action: "update", candidates: ["b"] })).toEqual(["topic convex-api appears twice in the plan"]);
    expect(plan({ topic: "convex-api", action: "update", candidates: [] })).toEqual(["topic convex-api has no candidate to write from"]);
  });

  it("refuses deleting a fact twice, or one that does not exist", () => {
    const missing = "memories/convex-api/never-written-zz11.md";
    const remove = (fact: string) => ({ fact, reason: "r", because: "gone" });

    expect(checkPlan(emptyPlan({ delete: [remove(API_FACT), remove(API_FACT)] }), known)).toEqual([`fact ${API_FACT} is deleted twice`]);
    expect(checkPlan(emptyPlan({ delete: [remove(missing)] }), known)).toEqual([`fact ${missing} is planned to delete but does not exist`]);
  });

  it("refuses deleting a topic twice, one that does not exist, or one the plan also writes", () => {
    const remove = (topic: string) => ({ topic, reason: "r", because: "gone" });

    expect(checkPlan(emptyPlan({ deleteTopics: [remove("old-tool"), remove("old-tool")] }), known)).toEqual(["topic old-tool is deleted twice"]);
    expect(checkPlan(emptyPlan({ deleteTopics: [remove("gone")] }), known)).toEqual(["topic gone is planned to delete but does not exist"]);
    expect(checkPlan(emptyPlan({ topics: [{ topic: "convex-api", action: "update", candidates: ["a"] }], deleteTopics: [remove("convex-api")] }), known)).toEqual([
      "topic convex-api is both deleted and written",
    ]);
  });

  it("refuses dropping a candidate no extractor returned, or one a topic uses", () => {
    const topics = [{ topic: "convex-api", action: "update", candidates: ["a"] }];

    expect(checkPlan(emptyPlan({ topics, dropped: [{ candidate: "zzz", reason: "r" }] }), known)).toEqual(["the plan drops candidate zzz, which no extractor returned"]);
    expect(checkPlan(emptyPlan({ topics, dropped: [{ candidate: "a", reason: "r" }] }), known)).toEqual(["candidate a is both assigned to a topic and dropped"]);
  });
});

describe("screenDeletions", () => {
  const remove = (topic: string, because: string) => ({ topic, reason: "r", because });
  const totals = new Map([
    ["stale", { sessionsSinceRead: UNUSED_AFTER_SESSIONS }],
    ["fresh", { sessionsSinceRead: UNUSED_AFTER_SESSIONS - 1 }],
  ]);

  it("keeps a topic deletion as unused once enough sessions ran without reading the topic", () => {
    const plan = emptyPlan({ deleteTopics: [remove("stale", "unused")] });

    expect(screenDeletions(plan, totals)).toEqual({ plan, alerts: [] });
  });

  it("removes a deletion as unused when too few sessions ran, or the topic has no usage, and says so", () => {
    const update = { topic: "convex-api", action: "update", candidates: ["a"] };
    const { plan, alerts } = screenDeletions(emptyPlan({ topics: [update], deleteTopics: [remove("fresh", "unused"), remove("new-topic", "unused")] }), totals);

    expect(plan.topics).toEqual([update]);
    expect(plan.deleteTopics).toEqual([]);
    expect(alerts.map((alert) => alert.message)).toEqual([
      `kept topic fresh: the planner wants to delete it as unused, but only ${UNUSED_AFTER_SESSIONS - 1} session(s) started since it was last read (${UNUSED_AFTER_SESSIONS} needed)`,
      `kept topic new-topic: the planner wants to delete it as unused, but only 0 session(s) started since it was last read (${UNUSED_AFTER_SESSIONS} needed)`,
    ]);
  });

  it("lets a topic whose subject is gone go whatever its reads, and never screens fact deletions", () => {
    const plan = emptyPlan({ delete: [{ fact: API_FACT, reason: "r", because: "wrong" }], deleteTopics: [remove("new-topic", "gone")] });

    expect(screenDeletions(plan, totals).plan).toEqual(plan);
  });
});

describe("droppedCandidates", () => {
  const candidates = [
    { id: "a", fact: "Kept." },
    { id: "b", fact: "Already in AGENTS.md." },
    { id: "c", fact: "A one-off command." },
  ];

  it("lists every candidate no topic uses, with the planner's reason, or none when it forgot one", () => {
    const plan = { topics: [{ topic: "convex-api", action: "update", candidates: ["a"] }], dropped: [{ candidate: "b", reason: "AGENTS.md says it." }] };

    expect(droppedCandidates(plan, candidates)).toEqual([
      { id: "b", fact: "Already in AGENTS.md.", reason: "AGENTS.md says it." },
      { id: "c", fact: "A one-off command.", reason: "no reason given" },
    ]);
  });
});

describe("checkWriterReply", () => {
  const entry = { topic: "convex-api", action: "update", candidates: ["a", "b"] };

  it("accepts a reply for its own topic, citing its own candidates", () => {
    expect(checkWriterReply({ topic: "convex-api", facts: [{ text: "f", candidates: ["a"] }] }, entry)).toEqual([]);
  });

  it("refuses another topic, no fact, and a candidate the topic was not given", () => {
    expect(checkWriterReply({ topic: "git-hooks", facts: [{ text: "f", candidates: ["a"] }] }, entry)).toEqual(["the writer answered for topic git-hooks, not convex-api"]);
    expect(checkWriterReply({ topic: "convex-api", facts: [] }, entry)).toEqual(["the writer for topic convex-api reports no fact"]);
    expect(checkWriterReply({ topic: "convex-api", facts: [{ text: "f", candidates: ["zzz"] }] }, entry)).toEqual(["a fact in topic convex-api cites zzz, which is not one of its candidates"]);
  });
});
