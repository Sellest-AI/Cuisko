/**
 * Constant-time string comparison (A9).
 *
 * `a === b` on a secret leaks its prefix through timing. The Convex runtime is a web runtime,
 * so `node:crypto.timingSafeEqual` is unavailable — this is the portable equivalent.
 *
 * Length is folded into the accumulator rather than short-circuiting, so a wrong-length guess
 * costs the same as a wrong-value one.
 */
export const timingSafeEqual = (a: string, b: string): boolean => {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);

  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }

  return diff === 0;
};
