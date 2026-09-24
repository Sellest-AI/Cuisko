import { Fragment } from "react";
import type { TextStyle } from "react-native";

import { InlineImage } from "@ui/inline-image";
import { RichText } from "@ui/rich-text";
import { Text } from "@ui/text";
import { theme } from "theme";

import type { RecipeLine } from "../_model/detail";
import { emphasizeInstruction } from "../_model/emphasis";

type Props = {
  instruction: string;
  /** The recipe's own lines: an amount is emphasised when it counts one of them. */
  lines: RecipeLine[];
  style?: TextStyle;
};

/**
 * One step of the method, with its amounts and durations in bold and each ingredient's picture
 * just before its amount.
 *
 * Shared by the instructions tab and the cooking session so a step reads the same in both: what
 * stands out is decided once, in `emphasizeInstruction`, and drawn once, here.
 */
export const InstructionText = ({ instruction, lines, style }: Props) => (
  <Text.Body color={theme.colors.foreground} style={style}>
    {emphasizeInstruction(instruction, lines).map((segment, index) =>
      segment.kind === "ingredient" ? (
        /** Segments are re-derived from the text on every render; their position is their identity. */
        <Fragment key={index}>
          <InlineImage uri={segment.line.imageUrl} emoji={segment.line.emoji} />
          {/* The text already has the space before the picture; this is the one between it and the number. */}
          {" "}
        </Fragment>
      ) : (
        <RichText key={index} spans={[{ text: segment.text, bold: segment.strong }]} />
      ),
    )}
  </Text.Body>
);
