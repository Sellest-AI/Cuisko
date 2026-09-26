import { StyleSheet, View } from "react-native";
import { useTranslations } from "translations";

import { Message } from "@ui/message";
import { theme } from "theme";

import type { AnswerBlock, ChatMessage as ChatMessageModel } from "../_model/chatMessage";
import { Display } from "./display";
import { OfferedButton } from "./offered-button";
import { Substitutions } from "./substitutions";
import { ToolStep } from "./tool-step";

type Props = {
  message: ChatMessageModel;
};

/** One piece of the answer. Text after a card is spaced from it the way a card is from text. */
const _Block = ({ block, isFirst }: { block: AnswerBlock; isFirst: boolean }) => {
  switch (block.type) {
    case "text":
      return (
        <Message
          from="assistant"
          markdown
          content={block.text}
          style={isFirst ? styles.fromAssistant : styles.fromAssistantAfterTool}
        />
      );
    case "display":
      return (
        <View style={styles.assistantTool}>
          <Display card={block.card} />
        </View>
      );
    case "substitutions":
      return (
        <View style={styles.assistantTool}>
          <Substitutions card={block.card} />
        </View>
      );
    case "button":
      return (
        <View style={styles.assistantTool}>
          <OfferedButton button={block.button} />
        </View>
      );
  }
};

/** One row of the conversation: a question, or everything one answer drew. */
export const ChatMessage = ({ message }: Props) => {
  const t = useTranslations("Assistant");

  if (message.from === "user")
    return <Message from="user" content={message.text} style={styles.fromUser} />;

  const hasText = message.blocks.some((block) => block.type === "text");

  return (
    <View>
      {/* Status lines first, then the answer in the order it was written: a card sits where it was shown. */}
      {message.steps.map((step) => (
        <ToolStep key={step.key} step={step} />
      ))}
      {/*
        * A turn that failed has nothing to say, so it says that plainly instead of drawing an
        * empty bubble. Plainly is the point: PRODUCT.md puts the mascot aside when something has
        * gone wrong, so this is an apology and not a joke.
        */}
      {message.hasFailed && !hasText && (
        <Message from="assistant" markdown content={t("failed")} style={styles.fromAssistant} />
      )}
      {message.blocks.map((block, index) => (
        <_Block key={block.key} block={block} isFirst={index === 0} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  fromUser: {
    paddingRight: theme.spacing[16],
  },
  fromAssistant: {
    marginLeft: theme.spacing[20],
  },
  fromAssistantAfterTool: {
    marginLeft: theme.spacing[20],
    marginTop: theme.spacing[12],
  },
  assistantTool: {
    marginLeft: theme.spacing[20],
    marginTop: theme.spacing[12],
    paddingRight: theme.spacing[32],
  },
});
