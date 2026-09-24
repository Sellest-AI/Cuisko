import type { ModelMessage } from "ai";

/**
 * The cook's question with `brief` (`turnBrief`) appended — the one message a turn's context
 * changes, and only in memory.
 *
 * **Why the end of the question, and why nothing is saved.** Providers cache a prompt by its
 * prefix. The system prompt stays byte-identical on every call, so it always hits; the history
 * before this question is unchanged, so it hits too; and within a turn every tool step re-sends
 * `history + question + brief` unchanged. The saved message stays the cook's own words, so the
 * thread on screen never shows a cellar and the history never carries ten stale ones that
 * contradict each other.
 *
 * The cost of that choice is the previous question being re-read without its brief next turn, so
 * the cache diverges there — one short message and its answer, not the conversation. Putting the
 * cellar in the system prompt instead would bust the whole history's cache every time it changed.
 *
 * Only `user` messages take it: the prompt message always is one, and a brief grafted onto
 * anything else would be a malformed turn rather than extra context.
 */
export const appendBrief = (message: ModelMessage, brief: string): ModelMessage => {
  if (message.role !== "user") return message;

  return typeof message.content === "string"
    ? { ...message, content: `${message.content}\n\n${brief}` }
    : { ...message, content: [...message.content, { type: "text", text: brief }] };
};
