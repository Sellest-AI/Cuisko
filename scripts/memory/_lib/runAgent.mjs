/**
 * One `claude -p` call (spec §10.2): a dream agent, run from the dream folder, allowed to read the
 * repo and run `git log`, and to write only where the caller says. The script owns the parallelism,
 * the errors and the cost, so the agent never starts sub-agents; its reply is JSON that the script
 * checks with Zod before anything uses it.
 *
 * The flag set was written from `claude --help` of Claude Code 2.1.x and the permission docs. What
 * only a real call can confirm is listed in docs/plans/agent-memory.md § Slice 7 checks, and the
 * owner's first dry run is that confirmation: a call that fails leaves its prompt, its reply and its
 * stderr in the dream's `logs/`, and the error names that file.
 *
 *   - `--agent <name>` runs `.claude/agents/<name>.md` as the main thread, with its model and tools
 *   - `--permission-mode dontAsk` denies whatever would prompt; `--allowedTools` is the whole grant
 *   - the prompt goes through stdin: it can be far longer than a Windows command line allows
 *   - `--no-session-persistence`: the dream leaves no transcript for the next selection to meet
 */
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { jsonSchemaOf } from "./responses.mjs";

/** A model call that takes longer than this is dead. */
const TIMEOUT_MS = 20 * 60_000;

/** Why a call failed, with the log that holds the details. */
class AgentError extends Error {
  constructor(message, logPath) {
    super(logPath === undefined ? message : `${message} (see ${logPath})`);
    this.name = "AgentError";
    this.logPath = logPath;
  }
}

/** A path as a permission rule writes an absolute one: `//` then the path, slashes forward. */
const _rulePath = (file) => `//${path.resolve(file).replace(/\\/g, "/").replace(/^\/+/, "")}`;

/**
 * The arguments of the call. The agent reads anywhere in the repo, except the files that hold
 * secrets, and writes only in `writable` (absolute files or globs). `git log --output=<file>` would
 * write anywhere, so it is denied by pattern.
 */
const agentArguments = ({ agent, repoRoot, writable, schema }) => {
  const everything = `${_rulePath(repoRoot)}/**`;
  const inRepo = (tool, suffix) => `${tool}(${_rulePath(repoRoot)}/${suffix})`;
  return [
    "-p",
    "--agent",
    agent,
    "--permission-mode",
    "dontAsk",
    "--no-session-persistence",
    "--output-format",
    "json",
    "--json-schema",
    jsonSchemaOf(schema),
    "--allowedTools",
    `Read(${everything})`,
    `Grep(${everything})`,
    `Glob(${everything})`,
    "Bash(git log *)",
    ...writable.map((target) => `Edit(${_rulePath(target)})`),
    "--disallowedTools",
    inRepo("Read", "**/.env*"),
    inRepo("Read", ".git/**"),
    inRepo("Grep", "**/.env*"),
    inRepo("Grep", ".git/**"),
    "Bash(git log *--output*)",
  ];
};

const _fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

/** The reply as an object: the structured output when the CLI gives one, else the result text read as JSON. */
const _payload = (stdout) => {
  let outer = JSON.parse(stdout);
  if (Array.isArray(outer)) outer = outer.findLast((event) => event?.type === "result") ?? {};
  if (outer.is_error === true) throw new Error(`the CLI reported an error: ${String(outer.result ?? "").slice(0, 300)}`);
  const body = outer.structured_output ?? outer.result;
  if (typeof body === "string") return JSON.parse(_fenced.exec(body.trim())?.[1] ?? body);
  if (body !== null && typeof body === "object") return body;
  throw new Error("the CLI returned neither a structured output nor a result");
};

const _validated = (stdout, schema) => {
  const reply = _payload(stdout);
  if (reply?.status === "error") throw new Error(`the agent reported an error: ${reply.error ?? "no reason given"}`);
  const parsed = schema.safeParse(reply);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    throw new Error(`the reply does not match its schema: ${problems.join("; ")}`);
  }
  return parsed.data;
};

/**
 * Runs the agent and resolves with its validated reply. `name` names the log files in `logDir`
 * (`<name>.prompt.md`, `.stdout.json`, `.stderr.txt`). `command` is the program and its leading
 * arguments, `["claude"]` unless a test replaces it.
 */
export const runAgent = ({ agent, name, prompt, schema, cwd, repoRoot, writable, logDir, command = ["claude"], timeoutMs = TIMEOUT_MS }) =>
  new Promise((resolve, reject) => {
    mkdirSync(logDir, { recursive: true });
    const log = (suffix) => path.join(logDir, `${name}.${suffix}`);
    writeFileSync(log("prompt.md"), prompt);
    const fail = (message) => reject(new AgentError(`${agent}: ${message}`, log("stdout.json")));

    const [program, ...leading] = command;
    const child = spawn(program, [...leading, ...agentArguments({ agent, repoRoot, writable, schema })], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const out = [];
    const err = [];
    const timer = setTimeout(() => {
      child.kill();
      fail(`no answer after ${Math.round(timeoutMs / 60_000)} minutes`);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.stdin.on("error", () => {}); // The child may exit before reading its prompt; its exit code says why.
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new AgentError(`${agent}: could not start ${program} (${error.message})`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(out).toString();
      writeFileSync(log("stdout.json"), stdout);
      writeFileSync(log("stderr.txt"), Buffer.concat(err).toString());
      if (code !== 0) return fail(`exited with code ${code}; see ${log("stderr.txt")}`);
      try {
        resolve(_validated(stdout, schema));
      } catch (error) {
        fail(error.message);
      }
    });
    child.stdin.end(prompt);
  });

/**
 * `fn` over `items`, at most `limit` at a time, results in the order of `items`. The first failure
 * rejects at once and starts nothing more; calls already running finish on their own.
 */
export const mapLimit = (items, limit, fn) =>
  new Promise((resolve, reject) => {
    const results = new Array(items.length);
    let next = 0;
    let running = 0;
    let done = 0;
    let failed = false;
    if (items.length === 0) return resolve(results);
    const launch = () => {
      while (!failed && running < limit && next < items.length) {
        const at = next++;
        running++;
        Promise.resolve()
          .then(() => fn(items[at], at))
          .then((value) => {
            results[at] = value;
            running--;
            done++;
            if (done === items.length) resolve(results);
            else launch();
          })
          .catch((error) => {
            failed = true;
            reject(error);
          });
      }
    };
    launch();
  });
