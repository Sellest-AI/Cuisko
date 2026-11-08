/**
 * One model call, with the model replaced by a script that records how it was called and answers
 * as the test says. Nothing here reaches an API. What these tests pin is what the script controls:
 * the grant (what the agent may read and write), the way a reply is read, and that every failure
 * becomes an error naming a log file, never a silent empty result.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import * as lib from "../_lib/runAgent.mjs";

type Call = {
  agent: string;
  name: string;
  prompt: string;
  schema: z.ZodType;
  cwd: string;
  repoRoot: string;
  writable: string[];
  logDir: string;
  command?: string[];
  timeoutMs?: number;
};
const { mapLimit, runAgent } = lib as unknown as {
  mapLimit: <T, R>(items: T[], limit: number, fn: (item: T, at: number) => Promise<R>) => Promise<R[]>;
  runAgent: (call: Call) => Promise<unknown>;
};

const FAKE = `
import { readFileSync, writeFileSync } from "node:fs";
const stdin = readFileSync(0, "utf8");
writeFileSync(process.env.FAKE_OUT + "/call.json", JSON.stringify({ args: process.argv.slice(2), stdin, cwd: process.cwd() }));
const ok = { status: "ok", names: ["a"] };
const modes = {
  structured: () => console.log(JSON.stringify({ type: "result", is_error: false, result: "", structured_output: ok })),
  fenced: () => console.log(JSON.stringify({ type: "result", is_error: false, result: "\`\`\`json\\n" + JSON.stringify(ok) + "\\n\`\`\`" })),
  events: () => console.log(JSON.stringify([{ type: "system" }, { type: "result", is_error: false, structured_output: ok }])),
  agentError: () => console.log(JSON.stringify({ type: "result", structured_output: { status: "error", error: "no data to read" } })),
  cliError: () => console.log(JSON.stringify({ type: "result", is_error: true, result: "credit balance too low" })),
  garbage: () => console.log("this is not json"),
  wrongShape: () => console.log(JSON.stringify({ type: "result", structured_output: { status: "ok", names: "a" } })),
  exit: () => { console.error("boom on stderr"); process.exit(3); },
  hang: () => setTimeout(() => {}, 60000),
};
modes[process.env.FAKE_MODE]();
`;

const dirs: string[] = [];
let work: string;
let script: string;
const schema = z.object({ status: z.enum(["ok", "error"]), error: z.string().optional(), names: z.array(z.string()) });

beforeAll(() => {
  work = mkdtempSync(path.join(os.tmpdir(), "memory-runagent-"));
  dirs.push(work);
  script = path.join(work, "fake-claude.mjs");
  writeFileSync(script, FAKE);
});
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

let counter = 0;
const call = async (mode: string, over: Partial<Call> = {}) => {
  counter += 1;
  const out = path.join(work, `out-${counter}`);
  mkdirSync(out, { recursive: true });
  process.env.FAKE_OUT = out;
  process.env.FAKE_MODE = mode;
  const input: Call = {
    agent: "dream-extractor",
    name: `run-${counter}`,
    prompt: "Read this conversation.",
    schema,
    cwd: work,
    repoRoot: path.join(work, "repo"),
    writable: [path.join(work, "dream", "memory", "memories", "api.md")],
    logDir: path.join(out, "logs"),
    command: [process.execPath, script],
    ...over,
  };
  const result = await runAgent(input).then(
    (value) => ({ value, error: undefined as (Error & { logPath?: string }) | undefined }),
    (error: Error & { logPath?: string }) => ({ value: undefined, error }),
  );
  return { ...result, out, input };
};
const recorded = (out: string) => JSON.parse(readFileSync(path.join(out, "call.json"), "utf8")) as { args: string[]; stdin: string; cwd: string };
const slashes = (file: string) => path.resolve(file).replace(/\\/g, "/");

describe("the reply", () => {
  it.each([["structured"], ["fenced"], ["events"]])("is read from a %s answer and validated", async (mode) => {
    const { value, error } = await call(mode);

    expect(error).toBeUndefined();
    expect(value).toEqual({ status: "ok", names: ["a"] });
  });

  it("fails on an agent that says status error, with its reason and the log", async () => {
    const { error, out } = await call("agentError");

    expect(error?.message).toContain("dream-extractor: the agent reported an error: no data to read");
    expect(error?.logPath).toBe(path.join(out, "logs", `run-${counter}.stdout.json`));
    expect(existsSync(error?.logPath ?? "")).toBe(true);
  });

  it("fails on an error the CLI itself reports", async () => {
    expect((await call("cliError")).error?.message).toContain("credit balance too low");
  });

  it("fails on text that is not JSON, and on a reply of the wrong shape, naming the field", async () => {
    expect((await call("garbage")).error?.name).toBe("AgentError");
    expect((await call("wrongShape")).error?.message).toContain("does not match its schema: names:");
  });

  it("fails on a non-zero exit, and keeps the stderr", async () => {
    const { error, out } = await call("exit");

    expect(error?.message).toContain("exited with code 3");
    expect(readFileSync(path.join(out, "logs", `run-${counter}.stderr.txt`), "utf8")).toContain("boom on stderr");
  });

  it("fails when the program cannot start", async () => {
    const { error } = await call("structured", { command: [path.join(work, "no-such-claude")] });

    expect(error?.message).toContain("could not start");
  });

  it("fails on a call that never answers, instead of waiting for ever", async () => {
    const { error } = await call("hang", { timeoutMs: 400 });

    expect(error?.message).toContain("no answer after");
  });
});

describe("the call", () => {
  it("runs from the dream folder, gives the prompt on stdin, and keeps the prompt in the logs", async () => {
    const { out, input } = await call("structured");
    const seen = recorded(out);

    expect(slashes(seen.cwd).toLowerCase()).toBe(slashes(input.cwd).toLowerCase());
    expect(seen.stdin).toBe("Read this conversation.");
    expect(readFileSync(path.join(out, "logs", `run-${counter}.prompt.md`), "utf8")).toBe("Read this conversation.");
  });

  it("names the agent and denies what would prompt", async () => {
    const { args } = recorded((await call("structured")).out);

    expect(args.slice(0, 8)).toEqual(["-p", "--agent", "dream-extractor", "--permission-mode", "dontAsk", "--no-session-persistence", "--output-format", "json"]);
  });

  it("allows reading the repo and git log, and writing only where it is told", async () => {
    const { out, input } = await call("structured");
    const { args } = recorded(out);
    const root = slashes(input.repoRoot);
    const allowed = args.slice(args.indexOf("--allowedTools") + 1, args.indexOf("--disallowedTools"));

    expect(allowed).toEqual([
      `Read(//${root}/**)`,
      `Grep(//${root}/**)`,
      `Glob(//${root}/**)`,
      "Bash(git log *)",
      `Edit(//${slashes(input.writable[0] as string)})`,
    ]);
  });

  it("denies the secret files, the git folder, and a git log that writes a file", async () => {
    const { out, input } = await call("structured");
    const { args } = recorded(out);
    const root = slashes(input.repoRoot);
    const denied = args.slice(args.indexOf("--disallowedTools") + 1);

    expect(denied).toEqual([`Read(//${root}/**/.env*)`, `Read(//${root}/.git/**)`, `Grep(//${root}/**/.env*)`, `Grep(//${root}/.git/**)`, "Bash(git log *--output*)"]);
  });

  it("passes the reply schema as JSON, so the model is told the shape", async () => {
    const { args } = recorded((await call("structured")).out);
    const given = JSON.parse(args[args.indexOf("--json-schema") + 1] as string) as { type: string; properties: object };

    expect(given.type).toBe("object");
    expect(Object.keys(given.properties)).toEqual(["status", "error", "names"]);
  });

  it("grants no write at all when nothing is writable", async () => {
    const { args } = recorded((await call("structured", { writable: [] })).out);

    expect(args.some((arg) => arg.startsWith("Edit("))).toBe(false);
  });
});

describe("mapLimit", () => {
  it("returns the results in the order of the items, whichever finishes first", async () => {
    const results = await mapLimit([30, 5, 15], 3, async (ms, at) => {
      await new Promise((done) => setTimeout(done, ms));
      return `${at}:${ms}`;
    });

    expect(results).toEqual(["0:30", "1:5", "2:15"]);
  });

  it("never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    await mapLimit(Array.from({ length: 9 }, (_, i) => i), 4, async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((done) => setTimeout(done, 10));
      running--;
    });

    expect(peak).toBe(4);
  });

  it("rejects on the first failure and starts nothing after it", async () => {
    const started: number[] = [];
    const run = mapLimit([0, 1, 2, 3, 4, 5], 2, async (item) => {
      started.push(item);
      // Item 0 outlives item 1's failure, then finishes: it must not launch item 2.
      await new Promise((done) => setTimeout(done, item === 0 ? 40 : 5));
      if (item === 1) throw new Error("item 1 failed");
    });

    await expect(run).rejects.toThrow("item 1 failed");
    await new Promise((done) => setTimeout(done, 80));
    expect(started).toEqual([0, 1]);
  });

  it("resolves an empty list at once", async () => {
    expect(await mapLimit([], 4, async () => 1)).toEqual([]);
  });
});
