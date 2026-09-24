import { StyleSheet, View, type TextStyle } from "react-native";

import { RichText } from "@ui/rich-text";
import { Text } from "@ui/text";
import { parseMarkdown } from "@ui/utils";
import { theme } from "theme";

type Props = {
  content: string;
  color?: string;
  /** Applied to every line of text, so a caller can match the typography around it. */
  textStyle?: TextStyle;
};

/** How far a nested list item steps in per level. */
const INDENT = theme.spacing[16];

/**
 * Markdown as native text: paragraphs, headings, lists and emphasis.
 *
 * Re-parsed on every render, deliberately. A streaming answer changes on every token, so a memo
 * would miss on each of them, and a few hundred characters of chat parse in well under a frame.
 */
export const Markdown = ({ content, color, textStyle }: Props) => (
  <View style={styles.blocks}>
    {parseMarkdown(content).map((block, index) => {
      /** Blocks are re-derived from the text on every render; their position is their identity. */
      switch (block.kind) {
        case "heading":
          return (
            <Text.Body key={index} color={color} style={{ ...textStyle, fontWeight: 700 }}>
              <RichText spans={block.spans} />
            </Text.Body>
          );
        case "item":
          return (
            <View key={index} style={[styles.item, { paddingLeft: block.depth * INDENT }]}>
              <Text.Body color={color} style={{ ...textStyle, ...styles.marker }}>{block.marker}</Text.Body>
              <Text.Body color={color} style={{ ...textStyle, ...styles.itemText }}>
                <RichText spans={block.spans} />
              </Text.Body>
            </View>
          );
        case "code":
          return (
            <Text.Body key={index} color={color} style={textStyle}>
              <RichText spans={[{ text: block.text, code: true }]} />
            </Text.Body>
          );
        case "rule":
          return <View key={index} style={styles.rule} />;
        case "paragraph":
          return (
            <Text.Body key={index} color={color} style={textStyle}>
              <RichText spans={block.spans} />
            </Text.Body>
          );
      }
    })}
  </View>
);

const styles = StyleSheet.create({
  blocks: { gap: theme.spacing[8] },
  item: {
    flexDirection: "row",
    gap: theme.spacing[8],
  },
  /** Wide enough for "10." so the items of a long numbered list start on one line. */
  marker: { minWidth: theme.spacing[16] },
  itemText: { flexShrink: 1 },
  rule: {
    height: 1,
    backgroundColor: theme.colors.neutral.elevated,
    marginVertical: theme.spacing[4],
  },
});
