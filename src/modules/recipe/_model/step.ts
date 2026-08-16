/**
 * How a recipe's method is counted and labelled. Framework-free: two screens read the same method
 * and have to agree on what "step 3" means, so the rule lives here rather than in either of them.
 */

/**
 * Zero-padded, so "09" and "10" occupy the same width and whatever sits beside them stays aligned.
 *
 * Takes the 1-based position, not the array index — the number is what someone reads aloud in a
 * kitchen, and nobody starts a method at zero.
 */
export const stepNumber = (position: number) => String(position).padStart(2, "0");
