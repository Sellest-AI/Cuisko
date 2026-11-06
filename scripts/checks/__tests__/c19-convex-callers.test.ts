/**
 * C19's own tests.
 *
 * What is pinned is what counts as a caller, because that is the whole check: every form that really
 * reaches a function passes, and every reference that only looks like one (the function's own test,
 * its own declaration, a type, a comment, a chain that stops short) leaves the function reported.
 * The list is pinned too: an entry that went stale is reported rather than left to excuse whatever
 * takes its name, and a passing run prints it, so the question of deleting stays in front of a reader.
 */
import { afterEach, describe, expect, it } from "vitest";

import { NO_CALLER } from "../c19-convex-callers.no-caller.mjs";
import { cleanupTrees, passed, runCheck, type Tree } from "./_harness";

const _router = (file: string) => `convex/router/${file}.ts`;

/**
 * Every listed function, declared where its name says. Without them the real list is all stale
 * entries in a synthetic tree, and every case would fail on those instead of on what it arranged.
 */
const LISTED: Tree = Object.keys(NO_CALLER).reduce<Tree>((tree, name) => {
  const [module, exported] = name.split(":") as [string, string];
  const file = `convex/${module}.ts`;
  tree[file] = `${tree[file] ?? ""}export const ${exported} = query({});\n`;
  return tree;
}, {});

const GET_ONE = { [_router("plates/getOne")]: "export const authed = query({});\n" };

const runC19 = (extra: Tree) =>
  runCheck("c19-convex-callers.mjs", { ...LISTED, ...GET_ONE, ...extra });

afterEach(cleanupTrees);

describe("a router export needs a caller", () => {
  it("rejects a function nothing refers to, naming it", () => {
    const result = runC19({});

    expect(result.code).toBe(1);
    expect(result.output).toContain("router/plates/getOne:authed has no caller");
    expect(result.output).toContain("convex/router/plates/getOne.ts:1");
  });

  it("reads a chain out of a screen, past its JSX", () => {
    const result = runC19({
      "src/modules/plates/_hooks/usePlate.tsx":
        "export const Plate = () => <View>{use(api.router.plates.getOne.authed)}</View>;\n",
    });

    expect(passed(result)).toBe(true);
  });

  it("reads a chain written over several lines", () => {
    const result = runC19({
      "src/usePlate.ts": "export const plate = api\n  .router\n  .plates\n  .getOne\n  .authed;\n",
    });

    expect(passed(result)).toBe(true);
  });

  it("counts an `internal` chain from another Convex file and from a script", () => {
    const internal = { [_router("plates/getOne")]: "export const _internal = query({});\n" };

    expect(
      passed(runC19({ ...internal, "convex/crons/daily.ts": "run(internal.router.plates.getOne._internal);\n" })),
    ).toBe(true);
    expect(
      passed(runC19({ ...internal, "scripts/seed.mjs": "run(internal.router.plates.getOne._internal);\n" })),
    ).toBe(true);
  });

  it("counts a sibling export of the same file", () => {
    const result = runC19({
      [_router("plates/getOne")]: [
        "export const authed = action({ handler: (ctx) => ctx.runQuery(internal.router.plates.getOne._internal) });",
        "export const _internal = query({});",
        "",
      ].join("\n"),
      "src/usePlate.ts": "use(api.router.plates.getOne.authed);\n",
    });

    expect(passed(result)).toBe(true);
  });

  it("counts a test of something else", () => {
    const result = runC19({
      "convex/router/meals/__tests__/planOne.test.ts": "call(api.router.plates.getOne.authed);\n",
    });

    expect(passed(result)).toBe(true);
  });

  it("does not count a function's own test, which C5 requires of every gated export", () => {
    const result = runC19({
      "convex/router/plates/__tests__/getOne.test.ts": "call(api.router.plates.getOne.authed);\n",
    });

    expect(result.code).toBe(1);
    expect(result.output).toContain("router/plates/getOne:authed has no caller");
  });

  it("does not count a function reaching itself, which is how a job reschedules", () => {
    const result = runC19({
      [_router("plates/getOne")]:
        "export const _internal = mutation({ handler: (ctx) => ctx.scheduler.runAfter(0, internal.router.plates.getOne._internal) });\n",
    });

    expect(result.code).toBe(1);
    expect(result.output).toContain("router/plates/getOne:_internal has no caller");
  });

  it("does not count a type, which runs nothing", () => {
    const result = runC19({
      "src/usePlate.ts": "export type Plate = FunctionReturnType<typeof api.router.plates.getOne.authed>;\n",
    });

    expect(result.code).toBe(1);
  });

  it("does not count a comment", () => {
    const result = runC19({ "src/usePlate.ts": "// use(api.router.plates.getOne.authed);\nexport {};\n" });

    expect(result.code).toBe(1);
  });

  it("does not count a chain that stops short of the export", () => {
    const result = runC19({
      "src/usePlate.ts": 'const plates = api.router.plates;\nuse(plates.getOne["authed"]);\n',
    });

    expect(result.code).toBe(1);
  });

  it("does not read an `api` that is another object", () => {
    const result = runC19({ "src/usePlate.ts": "use(api.plates.getOne.authed);\n" });

    expect(result.code).toBe(1);
  });
});

describe("a function can be named rather than chained", () => {
  it("counts a name in a string, which is how procedures.ts reaches a function", () => {
    const result = runC19({ "convex/procedures.ts": 'run("router/plates/getOne:authed");\n' });

    expect(passed(result)).toBe(true);
  });

  it("does not count that string in a test, where it is an assertion on a name", () => {
    const result = runC19({
      "src/modules/plates/__tests__/plate.test.ts": 'expect(name).toBe("router/plates/getOne:authed");\n',
    });

    expect(result.code).toBe(1);
  });

  it("does not count the list of exceptions, whose keys are names and call nothing", () => {
    const result = runC19({
      "scripts/checks/c19-convex-callers.no-caller.mjs": 'export const NO_CALLER = { "router/plates/getOne:authed": "" };\n',
    });

    expect(result.code).toBe(1);
    expect(result.output).toContain("router/plates/getOne:authed has no caller");
  });

  it("counts an npm script", () => {
    const result = runC19({
      "package.json": JSON.stringify({ scripts: { seed: "npx convex run router/plates/getOne:authed" } }),
    });

    expect(passed(result)).toBe(true);
  });

  it("counts a deploy step in a workflow", () => {
    const result = runC19({
      ".github/workflows/deploy.yml": "steps:\n  - run: npx convex run router/plates/getOne:authed\n",
    });

    expect(passed(result)).toBe(true);
  });
});

describe("the list of functions kept with no caller", () => {
  const [firstName] = Object.keys(NO_CALLER) as [keyof typeof NO_CALLER];
  const satisfied = { "src/usePlate.ts": "use(api.router.plates.getOne.authed);\n" };

  it("excuses a listed function, and prints it with its reason on a passing run", () => {
    const result = runC19(satisfied);

    expect(passed(result)).toBe(true);
    expect(result.output).toContain(`${firstName}: ${NO_CALLER[firstName]}`);
  });

  it("reports an entry whose function has found a caller", () => {
    const [module, exported] = firstName.split(":") as [string, string];
    const chain = `api.${module.replaceAll("/", ".")}.${exported}`;

    const result = runC19({ ...satisfied, "src/useListed.ts": `use(${chain});\n` });

    expect(result.code).toBe(1);
    expect(result.output).toContain(`NO_CALLER lists ${firstName}, which has a caller now.`);
  });

  it("reports an entry whose function has gone", () => {
    const [module] = firstName.split(":") as [string, string];

    const result = runC19({ ...satisfied, [`convex/${module}.ts`]: "export const helper = 1;\n" });

    expect(result.code).toBe(1);
    expect(result.output).toContain(`NO_CALLER lists ${firstName}, which is no longer exported.`);
  });
});
