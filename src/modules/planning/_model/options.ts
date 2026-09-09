/**
 * One shared vocabulary, rendered as the rows a tunnel step is answered from.
 *
 * Framework-free — no React, no Jotai, no Convex (see `src/modules/AGENTS.md`) — and extracted
 * rather than written twice: the mood step draws `TASTES` and the focus step draws
 * `NUTRITION_PREFERENCES`, and both need the same three things per row. The second copy is where
 * one of them would start reading its word from somewhere other than `Vocabulary.*`.
 *
 * ⚠️ **The word and the glyph come from the vocabulary, never from the step.** That is what the
 * lists this replaced got wrong: `MOODS` carried its own English labels, so a tag had one name on
 * a recipe chip and another in the tunnel, and neither was translated.
 */

/** What `ChoiceRows` needs per row. Structural, so it never imports the component's own type. */
export type ChoiceOption<T extends string> = { id: T; label: string; emoji: string };

/**
 * `values` in their vocabulary's own order, each carrying its word and its glyph.
 *
 * Generic in the value so a caller holding a narrower type keeps it: the mood step's ids are
 * `Taste` and the focus step's are `NutritionPreference`, and a `string` here would put the toggle
 * back to accepting anything — which is exactly how the two hand-written lists drifted.
 *
 * `emoji` is a total `Record` over a WIDER key set on purpose: `TAG_EMOJI` is keyed by every `Tag`,
 * and a subset of them is what either step asks for. A missing glyph is a compile error at the
 * record's own declaration, so there is nothing to defend against here.
 */
export const optionsOf = <T extends string>(
  values: readonly T[],
  emoji: Record<T, string>,
  label: (value: T) => string,
): ChoiceOption<T>[] =>
  values.map((value) => ({ id: value, label: label(value), emoji: emoji[value] }));
