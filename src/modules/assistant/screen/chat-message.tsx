import { StyleSheet, View } from "react-native";
import { useTranslations } from "translations";

import { Message } from "@ui/message";
import { theme } from "theme";

import type { ChatMessage as ChatMessageModel } from "../_model/chatMessage";
import { Display } from "./display";
import { OfferedButton } from "./offered-button";
import { ToolStep } from "./tool-step";

type Props = {
  message: ChatMessageModel;
};

/** One row of the conversation: a question, or everything one answer drew. */
export const ChatMessage = ({ message }: Props) => {
  const t = useTranslations("Assistant");

  if (message.from === "user")
    return <Message from="user" content={message.text} style={styles.fromUser} />;

  return (
    <View>
      {/*
        * Status lines first: in the turn they came first, and the prompt ends every turn on
        * `display`, so steps, then text, then cards is the order things happened in.
        */}
      {message.steps.map((step) => (
        <ToolStep key={step.key} step={step} />
      ))}
      {/*
        * A turn that failed has nothing to say, so it says that plainly instead of drawing an
        * empty bubble. Plainly is the point: PRODUCT.md puts the mascot aside when something has
        * gone wrong, so this is an apology and not a joke.
        */}
      {(message.text || message.hasFailed) && (
        <Message
          from="assistant"
          markdown
          content={message.hasFailed && !message.text ? t("failed") : message.text}
          style={styles.fromAssistant}
        />
      )}
      {message.cards.map((card, index) => (
        <View key={index} style={styles.assistantTool}>
          <Display card={card} />
        </View>
      ))}
      {/*
        * Last, whenever it was called: it points somewhere else, which is the end of what this
        * answer has to say, and a pill between the text and its cards would split them.
        */}
      {message.button && (
        <View style={styles.assistantTool}>
          <OfferedButton button={message.button} />
        </View>
      )}
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
  assistantTool: {
    marginLeft: theme.spacing[20],
    marginTop: theme.spacing[12],
    paddingRight: theme.spacing[32],
  },
});
