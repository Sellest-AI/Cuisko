import { Platform, StyleSheet, Text as NativeText } from "react-native";

import type { RichSpan } from "@ui/utils";

type Props = {
  spans: RichSpan[];
  /** How heavy a bold span is drawn. The parent's weight is the regular one. */
  boldWeight?: 600 | 700;
};

/**
 * Styled runs of text, drawn *inside* a `Text.*` the caller owns.
 *
 * Fragments rather than a text of its own, so size, colour and line height stay the parent's and a
 * span only states what makes it different. A nested text inherits the rest, which is also what
 * keeps a bold word on the same baseline as the words around it.
 */
export const RichText = ({ spans, boldWeight = 700 }: Props) =>
  spans.map((span, index) => {
    if (!span.bold && !span.italic && !span.strike && !span.code) return span.text;

    return (
      <NativeText
        /** Spans are re-derived from the text on every render and have no identity beyond order. */
        key={index}
        style={[
          span.bold && { fontWeight: boldWeight },
          span.italic && styles.italic,
          span.strike && styles.strike,
          span.code && styles.code,
        ]}
      >
        {span.text}
      </NativeText>
    );
  });

const styles = StyleSheet.create({
  italic: { fontStyle: "italic" },
  strike: { textDecorationLine: "line-through" },
  code: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },
});
