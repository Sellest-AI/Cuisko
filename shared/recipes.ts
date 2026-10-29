/**
 * The difficulty scale, and how a stored level maps back to the word for it.
 *
 * Stored as a position rather than the word, because an index range has to be able to answer "no
 * harder than medium" — and a string union only ever compares lexicographically, where the scale
 * comes out as advanced < easy < hard < medium < simple and a `gte` returns the two ends of it.
 *
 * Shared rather than convex-only for the same reason `UNITS` is: the schema validates a level and
 * the recipe screen draws one, and a second copy of the order is how a "medium" recipe starts
 * rendering four bars in one place and three in another.
 */

/**
 * What a recipe is written for unless its author says otherwise — two people, not one.
 *
 * Shared because two places have to agree on it and neither can see the other: the editor opens a
 * blank form on it, and `toRecipeDraft` falls back to it for an imported page whose yield says no
 * number. A second copy is how an import silently seeds a different count from the one a cook gets
 * when they write the same recipe by hand.
 */
export const DEFAULT_SERVINGS = 2;

/** The three numbers a recipe may declare about its own length, each of them optional. */
export type Timings = { preparation?: number; cooking?: number; resting?: number };

/**
 * The longest a single timing may be, in minutes: seven days.
 *
 * A 24-hour marinade is a real recipe; a week of resting is a typo. Shared because both ends of an
 * edit enforce it — the editor's duration field refuses to parse past it, and `updateOne` refuses to
 * store past it, since a client is a request the server cannot see the code of.
 */
export const MAX_TIMING_MINUTES = 7 * 24 * 60;

/** A positive duration as whole minutes — never below 1, since a stated timing does not round to "not stated". */
const _wholeMinutes = (minutes: number) => Math.max(1, Math.round(minutes));

/**
 * The timings as whole minutes, the only unit the app reads or writes.
 *
 * The agent's schema asks for a positive number, not an integer, so a model can answer `7.5`. Left
 * as it is, that value would reach the editor, be sent back unchanged on the next save, and fail the
 * whole-minutes check on an edit that never touched it. Rounded at both ends instead: where the
 * agent's answer is read, and where an edit arrives — the second covers rows stored before the first.
 *
 * Absent stays absent: a key is only written when it holds a value.
 */
export const wholeTimingsOf = (timings: Timings): Timings => {
  const whole: Timings = {};
  if (timings.preparation !== undefined) whole.preparation = _wholeMinutes(timings.preparation);
  if (timings.cooking !== undefined) whole.cooking = _wholeMinutes(timings.cooking);
  if (timings.resting !== undefined) whole.resting = _wholeMinutes(timings.resting);
  return whole;
};

/**
 * The three timings as one number — what a recipe card prints, and what a week's time ceiling is
 * measured against.
 *
 * **All three are counted, including `resting`.** That question comes back every time somebody
 * reads this, so it is answered here rather than at each call site: a twelve-hour dough proof
 * therefore fails a 60-minute week, which is correct — that recipe cannot be made on a Tuesday
 * evening, whatever its hands-on time. It also keeps the number filtered on identical to the number
 * the cook reads on the card, which is the only way a filtered week can be explained to them.
 *
 * Absent rather than zero when nothing is declared: a card shows "—" for the first and "0 min" for
 * the second, and a recipe the model never timed has not been declared instant. A partial recipe
 * still totals what it has — half an answer beats no answer on a card this small.
 *
 * Shared rather than private to `recipeCard`, where it began, because the planner's ceiling needs
 * the same number: a second sum is how the card and the filter start disagreeing about what a
 * 60-minute recipe is.
 */
export const totalMinutesOf = (timings: Timings): number | undefined => {
  const declared = [timings.preparation, timings.cooking, timings.resting].filter(
    (minutes) => minutes !== undefined,
  );

  return declared.length > 0 ? declared.reduce((total, minutes) => total + minutes, 0) : undefined;
};

/** Ordered easiest to hardest. A level is this array's 1-based position — index 0 is level 1. */
export const DIFFICULTIES = ["simple", "easy", "medium", "hard", "advanced"] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];

/**
 * The same scale as its stored values. Written out rather than derived from `DIFFICULTIES`: Convex
 * builds the field's validator from these literals, and a mapped array widens to `number[]` — which
 * would let any number into the column. `_check` below is what keeps the two lists the same length.
 */
export const DIFFICULTY_LEVELS = [1, 2, 3, 4, 5] as const;

export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

type Check = (typeof DIFFICULTIES)["length"] extends (typeof DIFFICULTY_LEVELS)["length"]
  ? (typeof DIFFICULTY_LEVELS)["length"] extends (typeof DIFFICULTIES)["length"] ? true : never
  : never;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _check: Check = true; // compile error if the two lists stop being the same length

/**
 * The word behind a level — the translation key the recipe screen looks the label up under, not a
 * label itself. Levels are 1-based, so this is what keeps the off-by-one in one place.
 */
export const difficultyKey = (level: DifficultyLevel): Difficulty => DIFFICULTIES[level - 1]!;

/**
 * How grouped instructions are spelled as text — the format, and the only place that knows it.
 *
 * `recipeContents.instructions` is `vLocalized`, a flat string per locale, but a recipe is written in
 * groups ("Sauce", then "Pasta"), and the model that sanitizes one emits those groups as JSON
 * because a schema-constrained output cannot drift its formatting the way a free-text blob does.
 * So the grouping has to survive a round trip through a single string: serialized on the way into
 * the document, parsed back on the way into an edit.
 *
 * That round trip is the contract, and a second pass changing nothing is what its test asserts —
 * not `parse(serialize(x)) === x`, since `serialize` normalizes. A recipe edited twice goes through
 * this twice; a format that loses one space per pass degrades every time the cook touches it.
 *
 * Here rather than in a file of its own for the reason `toGrams` sits beside `UNITS`: this is the
 * recipe domain's vocabulary and the logic that reads it, and `serializeInstructions` imported from
 * `@shared/recipes` says whose instructions it means at the call site.
 */

/**
 * A run of steps under an optional heading.
 *
 * `title` is absent rather than empty for an ungrouped run — a recipe that is just five steps has
 * one group with no title, not a group titled "". The two would serialize identically, so allowing
 * both would put a second representation of one recipe into the database.
 */
export type InstructionGroup = { title?: string; steps: InstructionStep[] };

/**
 * One step, and the tips a cook keeps beside it — "you can use a spoon to go faster".
 *
 * `hints` is always present, possibly empty, rather than optional: an absent list and an empty one
 * would serialize identically, the same reason `title` refuses to be both absent and "". The cooking
 * session draws each hint as a banner under its step; the instructions tab does not draw them.
 */
export type InstructionStep = { instruction: string; hints: string[] };

/**
 * Groups as a model answers them: a title may be `null`, and a hint list — or a hint in it — may be
 * absent, because "no hints" is the answer a model gives most and it spells it every way it can.
 * Structural rather than `z.infer` of the agent's schema, so this file needs nothing from `convex/`.
 */
export type LooseInstructionGroup = {
  title?: string | null;
  steps: { instruction: string; hints?: readonly (string | null | undefined)[] | null }[];
};

/**
 * Loose groups as the `InstructionGroup`s the app reads: no `null` title, and every step's `hints` a
 * list, possibly empty.
 *
 * Here beside `InstructionGroup` because it is the one statement of what that type's "absent" looks
 * like; every path a model's groups reach the app through — sanitizing, translating, an edit compared
 * against the row it revises — calls this rather than restating it.
 */
export const toInstructionGroups = (groups: readonly LooseInstructionGroup[]): InstructionGroup[] =>
  groups.map((group) => ({
    ...(group.title != null && { title: group.title }),
    steps: group.steps.map((step) => ({
      instruction: step.instruction,
      hints: (step.hints ?? []).filter((hint): hint is string => typeof hint === "string"),
    })),
  }));

/** What marks a line as a step rather than a heading. Written once; both directions read it. */
const STEP_PREFIX = "- ";

/**
 * What marks a line as a hint on the step above it.
 *
 * The space after it is optional on the way in — a cook types `>tip` as readily as `> tip` — and
 * always written on the way out, so our own text reads the way the placeholder shows it.
 */
const HINT_MARKER = ">";

/**
 * What marks a line as a heading, on the way OUT only.
 *
 * `serializeInstructions` writes it so that its own output survives a re-parse: a heading of 30
 * characters or more is indistinguishable from a step by length alone, and the translation path
 * re-parses stored text on every pass. Without a marker, "Pour la garniture et le montage" comes
 * back as a step the first time a recipe is translated, and the heading is gone for good.
 *
 * Cooks never type it, and they are not expected to — a bare line is still read as a heading when
 * it is short enough to be one. This exists to disambiguate OUR text, not theirs.
 */
const TITLE_PREFIX = "## ";

/**
 * The length past which an unmarked line is read as a step rather than as a heading.
 *
 * A cook pasting a recipe writes prose, not markup: they do not prefix their steps with a dash,
 * and they do not think of "Faire revenir les oignons dans le beurre" as anything but an
 * instruction. Length is the only signal left, and it is a good one — a heading is a label
 * ("Sauce", "Pour la pâte") and an instruction is a sentence.
 *
 * 35 rather than 30, because a real heading is often a phrase and not one word: "Champignons et
 * oignons grelots" is 30 characters exactly, and at the old value it tipped over into being a step
 * — losing its own line and pulling the steps under it into the group above.
 *
 * Moving it is only safe because guessing wrong no longer costs the text. A step misread as a
 * heading used to vanish from the recipe; `parseInstructions` now hands a childless heading back as
 * a step, so the worst either direction can do is style a line wrong. That is what lets this number
 * be tuned for the common case rather than hedged against the destructive one.
 */
const LONG_STEP_THRESHOLD = 35;

/**
 * Collapses anything that would change meaning when the text is re-parsed.
 *
 * Applied on the way *in* rather than on the way out, so that serializing an already-serialized
 * recipe is a no-op — normalizing on output instead would make the first edit lossy and every
 * later one stable, which is the harder bug to notice.
 */
const _normalize = (value: string) => value.replace(/\s+/g, " ").trim();

/**
 * A heading that begins with the step marker would parse back as a step, silently merging into the
 * group above it. Stripped rather than escaped: an escape character would then need escaping, and
 * no real category name ("Sauce", "Pâtes") starts with a dash.
 */
const _normalizeTitle = (title: string) => {
  let normalized = _normalize(title);
  while (normalized.startsWith(STEP_PREFIX)) normalized = normalized.slice(STEP_PREFIX.length);
  // Likewise for the heading marker: a title already carrying one must not gain a second on the
  // way out, or each round trip would add another.
  while (normalized.startsWith(TITLE_PREFIX)) normalized = normalized.slice(TITLE_PREFIX.length);
  // And for the hint marker: `parseInstructions` reads `## > …` as a hint, so a title written that
  // way would come back as one and leave its steps without a heading.
  while (normalized.startsWith(HINT_MARKER)) normalized = _normalize(normalized.slice(HINT_MARKER.length));

  return normalized;
};

/**
 * Groups to the text stored in the document.
 *
 * Empty groups are dropped — a heading with no steps under it survives a round trip as nothing at
 * all, so keeping it here would break the contract on the very first pass. An untitled group that
 * is not the first joins the group above it, for the same reason: see `parseInstructions`.
 */
export const serializeInstructions = (groups: InstructionGroup[]): string =>
  groups
    .map((group) => {
      const steps = group.steps
        .map((step) => ({
          instruction: _normalize(step.instruction),
          hints: step.hints.map(_normalize).filter(Boolean),
        }))
        .filter((step) => step.instruction);
      if (steps.length === 0) return undefined;

      const title = group.title === undefined ? "" : _normalizeTitle(group.title);
      const lines = steps.flatMap((step) => [
        `${STEP_PREFIX}${step.instruction}`,
        ...step.hints.map((hint) => `${HINT_MARKER} ${hint}`),
      ]);

      return { titled: Boolean(title), text: title ? [`${TITLE_PREFIX}${title}`, ...lines].join("\n") : lines.join("\n") };
    })
    .filter((block) => block !== undefined)
    // An untitled group after another is written as more steps of that one, blank line and all
    // gone: only a heading opens a group, so `parseInstructions` reads it back that way, and the
    // blank line would make the text change on every pass.
    .reduce(
      (text, block, index) => (index === 0 ? block.text : `${text}${block.titled ? "\n\n" : "\n"}${block.text}`),
      "",
    );

/**
 * The text back into groups.
 *
 * Deliberately tolerant in one direction only: it accepts CRLF and stray blank lines, because the
 * text can reach it from a document written by an older version of `serializeInstructions` or, one
 * day, from a cook editing the raw field. It does not accept alternate step markers — `1.` and `•`
 * stay part of the step text, since guessing at them is how a step reading "1. Preheat" loses its
 * numbering.
 *
 * **Only a heading opens a group.** A blank line opens nothing and closes nothing: a group without
 * a title is invisible as a group — the tab draws it as more steps with the rule between them
 * missing — so a stray line return must not be able to create one. Steps appearing before any
 * heading form the one leading group with no `title`; every other step belongs to the heading above.
 *
 * A `>` line is a hint on the step above it. A hint with no step above it — the first line, or
 * right under a heading — is dropped: it only means something under a step. The one exception is a
 * heading this function merely guessed at by length: a heading never carries a hint, so one
 * following it proves the guess wrong, and the line becomes the step it was.
 *
 * `## > …` is read as a hint too. It is what a version of this function that did not know `>` wrote
 * for a cook's hint — a short line, so a heading — and `_normalizeTitle` guarantees our own output
 * never spells a real heading that way.
 */
export const parseInstructions = (text: string): InstructionGroup[] => {
  const groups: InstructionGroup[] = [];
  let current: InstructionGroup | undefined;
  /** The step a `>` line attaches to. A heading clears it. */
  let lastStep: InstructionStep | undefined;
  /** The heading read by length alone, while it still has no steps — the only kind a hint can overturn. */
  let guessedHeading: InstructionGroup | undefined;

  const pushStep = (instruction: string) => {
    if (!current) {
      current = { steps: [] };
      groups.push(current);
    }

    lastStep = { instruction, hints: [] };
    current.steps.push(lastStep);
    guessedHeading = undefined;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();

    const marked = line.startsWith(TITLE_PREFIX) ? line.slice(TITLE_PREFIX.length).trim() : undefined;
    if (marked?.startsWith(HINT_MARKER)) line = marked;

    if (!line) continue;

    // A marked heading is a heading whatever its length — this is the branch that makes our own
    // output round-trip, and it has to be tried before the length test below can misread it.
    if (line.startsWith(TITLE_PREFIX)) {
      current = { title: _normalizeTitle(line), steps: [] };
      groups.push(current);
      lastStep = undefined;
      guessedHeading = undefined;
      continue;
    }

    if (line.startsWith(HINT_MARKER)) {
      const hint = _normalize(line.slice(HINT_MARKER.length));
      if (!hint) continue;

      // The misread heading opened no group, so it goes, and its line joins the group above it as
      // the step it always was.
      if (guessedHeading) {
        const misread = guessedHeading;
        groups.pop();
        current = groups[groups.length - 1];
        pushStep(misread.title!);
      }

      lastStep?.hints.push(hint);
      continue;
    }

    if (line.startsWith(STEP_PREFIX)) {
      const step = _normalize(line.slice(STEP_PREFIX.length));
      if (step) pushStep(step);
      continue;
    }

    // Long unprefixed lines are treated as steps.
    if (line.length >= LONG_STEP_THRESHOLD) {
      pushStep(_normalize(line));
      continue;
    }

    // Short non-step lines open a group heading.
    current = {
      title: _normalizeTitle(line),
      steps: [],
    };
    groups.push(current);
    lastStep = undefined;
    guessedHeading = current;
  }

  /**
   * A heading with nothing under it is a line the length test misread, not a heading.
   *
   * A real heading is never childless — it is a label for the steps that follow, and a cook who
   * writes one always writes those. So a title that ends up with no steps is a short instruction
   * that fell under `LONG_STEP_THRESHOLD`, and it is kept as a step rather than dropped.
   *
   * This is what makes the length test safe to get wrong. Misjudging a step as a heading used to
   * delete the sentence; now it costs only the styling, which is the cheap error the threshold's
   * docblock argues for. Our own output never reaches here in that shape — `serializeInstructions`
   * has already dropped empty groups — so this only ever rescues text a cook typed.
   *
   * Kept in the group above it, like every other step, rather than as a group of its own: an
   * untitled group anywhere but first is the invisible section the rule above exists to prevent.
   * Only a misread line with nothing above it starts the leading untitled group.
   */
  return groups.reduce<InstructionGroup[]>((kept, group) => {
    if (group.steps.length > 0) return [...kept, group];

    const step = { instruction: group.title!, hints: [] };
    const previous = kept[kept.length - 1];
    if (!previous) return [{ steps: [step] }];

    previous.steps.push(step);
    return kept;
  }, []);
};
