import { describe, expect, it } from "vitest";

import { parseInline, parseMarkdown } from "../markdown";

describe("parseInline", () => {
  it("reads bold, italic, strikethrough and code", () => {
    expect(parseInline("a **b** *c* ~~d~~ `e`")).toEqual([
      { text: "a " },
      { text: "b", bold: true },
      { text: " " },
      { text: "c", italic: true },
      { text: " " },
      { text: "d", strike: true },
      { text: " " },
      { text: "e", code: true },
    ]);
  });

  it("reads the underscore spellings of bold and italic", () => {
    expect(parseInline("__b__ _i_")).toEqual([
      { text: "b", bold: true },
      { text: " " },
      { text: "i", italic: true },
    ]);
  });

  it("nests emphasis inside emphasis", () => {
    expect(parseInline("**un *petit* mot**")).toEqual([
      { text: "un ", bold: true },
      { text: "petit", bold: true, italic: true },
      { text: " mot", bold: true },
    ]);
  });

  /** Mid-stream, the closing pair has not arrived yet: the reader must not guess. */
  it("leaves an unclosed delimiter as the text it is", () => {
    expect(parseInline("Voici **la recette")).toEqual([{ text: "Voici **la recette" }]);
  });

  it("does not read arithmetic or an identifier as emphasis", () => {
    expect(parseInline("2 * 3 * 4")).toEqual([{ text: "2 * 3 * 4" }]);
    expect(parseInline("snake_case_name")).toEqual([{ text: "snake_case_name" }]);
  });

  it("keeps a link's words and drops its address", () => {
    expect(parseInline("voir [la recette](https://cuisko.app/r/1) ici")).toEqual([
      { text: "voir la recette ici" },
    ]);
  });

  it("reads triple asterisks as bold and italic at once", () => {
    expect(parseInline("***Astuce*** : salez")).toEqual([
      { text: "Astuce", bold: true, italic: true },
      { text: " : salez" },
    ]);
  });

  /** A run of ticks closes only on a run of the same length, so no stray ticks are left behind. */
  it("reads code opened by several backticks", () => {
    expect(parseInline("tape ```npm i``` puis ``a`b``")).toEqual([
      { text: "tape " },
      { text: "npm i", code: true },
      { text: " puis " },
      { text: "a`b", code: true },
    ]);
  });

  it("does not read markdown inside code", () => {
    expect(parseInline("`**a**`")).toEqual([{ text: "**a**", code: true }]);
  });
});

describe("parseMarkdown", () => {
  it("splits paragraphs on blank lines and keeps single line breaks", () => {
    expect(parseMarkdown("Salut !\nÇa va ?\n\nDeuxième")).toEqual([
      { kind: "paragraph", spans: [{ text: "Salut !\nÇa va ?" }] },
      { kind: "paragraph", spans: [{ text: "Deuxième" }] },
    ]);
  });

  it("reads headings with their level", () => {
    expect(parseMarkdown("## **Idées** ##")).toEqual([
      { kind: "heading", level: 2, spans: [{ text: "Idées", bold: true }] },
    ]);
  });

  it("reads bulleted and numbered items, with their nesting", () => {
    expect(parseMarkdown("- Pâtes\n  * Sel\n1. Cuire\n2) Égoutter")).toEqual([
      { kind: "item", marker: "•", depth: 0, spans: [{ text: "Pâtes" }] },
      { kind: "item", marker: "•", depth: 1, spans: [{ text: "Sel" }] },
      { kind: "item", marker: "1.", depth: 0, spans: [{ text: "Cuire" }] },
      { kind: "item", marker: "2.", depth: 0, spans: [{ text: "Égoutter" }] },
    ]);
  });

  /** "**Astuce**" opens with an asterisk, but not with a bullet's asterisk-and-space. */
  it("does not read a bold opening as a bullet", () => {
    expect(parseMarkdown("**Astuce** : salez l'eau")).toEqual([
      { kind: "paragraph", spans: [{ text: "Astuce", bold: true }, { text: " : salez l'eau" }] },
    ]);
  });

  it("continues an item on an indented line and a paragraph on any line", () => {
    expect(parseMarkdown("- Pâtes\n  al dente\nFin")).toEqual([
      { kind: "item", marker: "•", depth: 0, spans: [{ text: "Pâtes\nal dente" }] },
      { kind: "paragraph", spans: [{ text: "Fin" }] },
    ]);
  });

  it("reads a horizontal rule and a quote", () => {
    expect(parseMarkdown("---\n> Bon appétit")).toEqual([
      { kind: "rule" },
      { kind: "paragraph", spans: [{ text: "Bon appétit" }] },
    ]);
  });

  it("keeps a fenced block verbatim, and shows one still being written", () => {
    expect(parseMarkdown("```\n**a**\n```")).toEqual([{ kind: "code", text: "**a**" }]);
    expect(parseMarkdown("```\nen cours")).toEqual([{ kind: "code", text: "en cours" }]);
  });

  /** Opened and closed on one line, it is inline code; as a fence it would swallow the rest. */
  it("does not open a fence on a line that also closes it", () => {
    expect(parseMarkdown("Tape ça :\n```npm i```\nEt voilà.\n\n- fin")).toEqual([
      {
        kind: "paragraph",
        spans: [{ text: "Tape ça :\n" }, { text: "npm i", code: true }, { text: "\nEt voilà." }],
      },
      { kind: "item", marker: "•", depth: 0, spans: [{ text: "fin" }] },
    ]);
  });

  it("still opens a fence that names its language", () => {
    expect(parseMarkdown("```sh\nnpm i\n```")).toEqual([{ kind: "code", text: "npm i" }]);
  });

  it("returns nothing for an empty message", () => {
    expect(parseMarkdown("")).toEqual([]);
  });
});
