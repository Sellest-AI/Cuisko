/**
 * Every check at once: the body of `pnpm check`, which ran them one `pnpm check:*` at a time.
 *
 * Each stays its own process, because a check ends in `process.exit` and a test runs the real
 * script. Run in turn behind `pnpm` they took 14.5 s for 10 s of work, and none takes a second.
 * Output waits until a check has finished, so two checks' findings never interleave.
 *
 * A check is found by its name, next to this file, so a new one needs no entry here.
 */
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIRECTORY = dirname(fileURLToPath(import.meta.url));

const CHECK_NAME = /^c(\d+)-[a-z0-9-]+\.mjs$/;

const numberOf = (file) => Number(CHECK_NAME.exec(file)[1]);

/** One check's verdict and everything it printed, stdout and stderr in the order they came. */
const run = (file) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [join(DIRECTORY, file)], { stdio: ["ignore", "pipe", "pipe"] });
    const output = [];
    child.stdout.on("data", (chunk) => output.push(chunk));
    child.stderr.on("data", (chunk) => output.push(chunk));
    child.on("error", (error) => resolve({ failed: true, output: `${file} did not start: ${error.message}\n` }));
    child.on("close", (code) => resolve({ failed: code !== 0, output: Buffer.concat(output).toString() }));
  });

const checks = readdirSync(DIRECTORY)
  .filter((file) => CHECK_NAME.test(file))
  .sort((first, second) => numberOf(first) - numberOf(second));

const results = await Promise.all(checks.map(run));

for (const { output } of results) process.stdout.write(output);

process.exitCode = results.some(({ failed }) => failed) ? 1 : 0;
