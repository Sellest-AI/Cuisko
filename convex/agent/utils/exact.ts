/**
 * `true` when `A` and `B` are the same type, `false` otherwise: assignable in BOTH directions.
 *
 * What a tool's return annotation cannot check on its own. `(): Hand => parse(schema)` compiles
 * whenever the schema's type fits the hand-written one, so a vocabulary added to the hand-written
 * type and forgotten in the schema passes, and the model is never offered the new value. This
 * fails either way round (ADR 0010).
 *
 * The generic-function comparison rather than two `extends`: it tells `any` from everything, and
 * it does not distribute over a union.
 */
export type Exact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

/** Compiles only when handed `true`: `type _Pinned = AssertTrue<Exact<A, B>>`. */
export type AssertTrue<T extends true> = T;
