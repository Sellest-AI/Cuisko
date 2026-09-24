/**
 * The markdown a chat model actually writes, read into blocks a React Native tree can draw.
 *
 * A subset on purpose, and hand-rolled rather than a dependency: the text arrives token by token,
 * so the reader has to be one that is never wrong about a half-written message. Here an unclosed
 * `**` stays two asterisks until its partner lands, instead of turning the rest of the answer bold
 * and back. What is covered is what a conversational answer uses (emphasis, lists, headings, a
 * rule, the odd fenced block); tables, images and HTML are shown as the text they were written as.
 */

/** A run of text sharing one set of inline styles. Joined, the spans are the visible text. */
export type RichSpan = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
};

export type MarkdownBlock =
  | { kind: "paragraph"; spans: RichSpan[] }
  | { kind: "heading"; level: number; spans: RichSpan[] }
  /** `marker` is what the list writes before the item: "•", or its own number ("3."). */
  | { kind: "item"; marker: string; depth: number; spans: RichSpan[] }
  | { kind: "code"; text: string }
  | { kind: "rule" };

type Style = Omit<RichSpan, "text">;

/**
 * One inline construct, tried in this order at each position. The longest delimiter first:
 * `***a***` before `**a**` before `*a*`, or a shorter one opens early and strands the asterisks
 * the longer one would have used.
 *
 * Code opens with any run of backticks and closes on a run of the same length, so ```` ```a``` ````
 * written inline is code rather than a single-tick span with stray ticks around it.
 *
 * Every delimiter must hug its content (`**a**`, not `** a **`), which is what keeps arithmetic
 * ("2 * 3 * 4") and a bullet's own asterisk from opening an emphasis. An underscore also has to
 * stand outside a word, so an identifier like `snake_case_name` is left alone.
 *
 * Groups are numbered, not named: Hermes hands back `match.groups` as undefined, so a named group
 * passes every test under Node and throws on the device. `_inline` reads them by position.
 */
const INLINE = new RegExp(
  [
    /** A plain string, not `String.raw`: a raw template cannot hold the backticks this matches. */
    "(`+)([^`\\n](?:[^\\n]*?[^`\\n])?)\\1(?!`)",
    String.raw`\*\*\*(?=\S)([\s\S]*?\S)\*\*\*`,
    String.raw`\*\*(?=\S)([\s\S]*?\S)\*\*`,
    String.raw`__(?=\S)([\s\S]*?\S)__`,
    String.raw`~~(?=\S)([\s\S]*?\S)~~`,
    String.raw`\*(?=[^\s*])([\s\S]*?[^\s*])\*`,
    String.raw`(?<![\p{L}\p{N}])_(?=[^\s_])([\s\S]*?[^\s_])_(?![\p{L}\p{N}])`,
    String.raw`\[([^\]\n]+)\]\([^)\s]+\)`,
  ].join("|"),
  "gu",
);

const _sameStyle = (a: Style, b: Style) =>
  !a.bold === !b.bold && !a.italic === !b.italic && !a.strike === !b.strike && !a.code === !b.code;

const _push = (spans: RichSpan[], text: string, style: Style) => {
  if (text === "") return;

  const last = spans.at(-1);
  if (last && _sameStyle(last, style)) last.text += text;
  else spans.push({ text, ...style });
};

const _inline = (source: string, style: Style, spans: RichSpan[]) => {
  let cursor = 0;

  for (const match of source.matchAll(INLINE)) {
    _push(spans, source.slice(cursor, match.index), style);

    /** In `INLINE`'s order; the first slot is the whole match, the second the code span's ticks. */
    const [, , code, boldItalic, bold, boldUnderscore, strike, italic, italicUnderscore, link] = match;
    if (code !== undefined) _push(spans, code, { ...style, code: true });
    else if (boldItalic !== undefined) _inline(boldItalic, { ...style, bold: true, italic: true }, spans);
    else if (bold !== undefined || boldUnderscore !== undefined)
      _inline(bold ?? boldUnderscore!, { ...style, bold: true }, spans);
    else if (strike !== undefined) _inline(strike, { ...style, strike: true }, spans);
    else if (italic !== undefined || italicUnderscore !== undefined)
      _inline(italic ?? italicUnderscore!, { ...style, italic: true }, spans);
    /** A link keeps its words and drops its address: a chat bubble is not the place to open one. */
    else _inline(link!, style, spans);

    cursor = match.index + match[0].length;
  }

  _push(spans, source.slice(cursor), style);
};

/** One line or paragraph of inline markdown, as styled spans. Adjacent spans never share a style. */
export const parseInline = (source: string): RichSpan[] => {
  const spans: RichSpan[] = [];
  _inline(source, {}, spans);

  return spans;
};

/**
 * A backtick fence carries no backtick after it, so a line that opens and closes one on itself
 * ("```npm i```") is inline code, not a block that would swallow the rest of the message.
 */
const FENCE = /^\s{0,3}(```(?![^`]*`)|~~~)/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const BULLET = /^(\s*)[-*+•]\s+(.*)$/;
const ORDERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;

/** Two spaces of indent per level, the width every model nests its lists with. */
const _depthOf = (indent: string) => Math.floor(indent.replace(/\t/g, "  ").length / 2);

/**
 * A whole message, as the blocks it draws as.
 *
 * Lines inside a paragraph keep their break rather than being joined with a space, as CommonMark
 * would. A chat model breaks a line because it means one, and an answer reflowed into a single
 * paragraph reads as a different answer.
 */
export const parseMarkdown = (source: string): MarkdownBlock[] => {
  const blocks: MarkdownBlock[] = [];
  /** The text still being gathered for the last block, when that block is a paragraph or an item. */
  let open: { lines: string[]; block: MarkdownBlock & { spans: RichSpan[] } } | undefined;
  let fence: { marker: string; lines: string[] } | undefined;

  const close = () => {
    if (open) open.block.spans = parseInline(open.lines.join("\n"));
    open = undefined;
  };

  const start = (block: MarkdownBlock & { spans: RichSpan[] }, text: string) => {
    close();
    blocks.push(block);
    open = { lines: [text], block };
  };

  for (const raw of source.split(/\r?\n/)) {
    if (fence) {
      if (raw.trim().startsWith(fence.marker)) {
        blocks.push({ kind: "code", text: fence.lines.join("\n") });
        fence = undefined;
      } else fence.lines.push(raw);
      continue;
    }

    const line = raw.trimEnd();
    const fenced = FENCE.exec(line);
    const heading = HEADING.exec(line);
    const bullet = BULLET.exec(line);
    const ordered = ORDERED.exec(line);
    const quote = QUOTE.exec(line);

    if (line.trim() === "") close();
    else if (fenced) {
      close();
      fence = { marker: fenced[1]!, lines: [] };
    } else if (heading) {
      close();
      blocks.push({ kind: "heading", level: heading[1]!.length, spans: parseInline(heading[2]!) });
    } else if (RULE.test(line)) {
      close();
      blocks.push({ kind: "rule" });
    } else if (bullet) start({ kind: "item", marker: "•", depth: _depthOf(bullet[1]!), spans: [] }, bullet[2]!);
    else if (ordered)
      start({ kind: "item", marker: `${ordered[2]}.`, depth: _depthOf(ordered[1]!), spans: [] }, ordered[3]!);
    else if (quote && open?.block.kind !== "paragraph") start({ kind: "paragraph", spans: [] }, quote[1]!);
    /** A continuation: of the paragraph it follows, or of an item when it is indented under one. */
    else if (open && (open.block.kind === "paragraph" || /^\s/.test(line)))
      open.lines.push(quote ? quote[1]! : line.trim());
    else start({ kind: "paragraph", spans: [] }, line.trim());
  }

  close();
  /** Still streaming, most likely: show what the block holds so far rather than hiding it. */
  if (fence) blocks.push({ kind: "code", text: fence.lines.join("\n") });

  return blocks;
};
