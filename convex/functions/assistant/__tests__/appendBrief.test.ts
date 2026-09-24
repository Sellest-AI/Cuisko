import { describe, expect, test } from "vitest";

import { appendBrief } from "../appendBrief";

const BRIEF = "<cellar>\nempty\n</cellar>\n<now>Thursday 2026-09-24 19:05</now>";

describe("functions/assistant/appendBrief", () => {
  test("appends the brief after the cook's words, so the question reads first", () => {
    expect(appendBrief({ role: "user", content: "Je fais quoi ce soir ?" }, BRIEF)).toEqual({
      role: "user",
      content: `Je fais quoi ce soir ?\n\n${BRIEF}`,
    });
  });

  test("adds a text part to a message already made of parts", () => {
    const message = { role: "user" as const, content: [{ type: "text" as const, text: "Et sans crème ?" }] };

    expect(appendBrief(message, BRIEF)).toEqual({
      role: "user",
      content: [
        { type: "text", text: "Et sans crème ?" },
        { type: "text", text: BRIEF },
      ],
    });
  });

  /** The saved message is never touched — the thread keeps the cook's own words. */
  test("returns a new message rather than editing the one it was given", () => {
    const message = { role: "user" as const, content: "Je fais quoi ce soir ?" };

    appendBrief(message, BRIEF);

    expect(message.content).toBe("Je fais quoi ce soir ?");
  });

  test("leaves anything that is not the cook's message alone", () => {
    const message = { role: "assistant" as const, content: "Une bolognaise !" };

    expect(appendBrief(message, BRIEF)).toBe(message);
  });
});
