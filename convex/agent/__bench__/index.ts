"use node"
/**
 * Model bake-offs: which model should a tool run on, and at what reasoning effort?
 *
 * A caller supplies the four things that are its own — the field, the task (system prompt, input,
 * and the schema plus parser the answer must survive), and the criteria to rank on. Everything
 * else — blind labelling, the concurrency cap, cost accounting, the judge, the table, and the
 * markdown transcript every run leaves behind — belongs here and is the same for every bake-off.
 *
 * ⚠️ Every call costs real money and real minutes. Callers belong in a `*.manual.test.ts`.
 * `runBakeOff`'s own docblock has the running instructions.
 */
export { runBakeOff } from "./bakeOff";
export type {
  Answer,
  Attempt,
  BakeOff,
  BakeOffResult,
  Candidate,
  Effort,
  Entrant,
  ProviderRouting,
  Success,
} from "./types";
