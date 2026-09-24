import { useCallback, useEffect, useRef } from "react";
import { type ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import { useTranslations } from "translations";

import { SparklesIcon } from "@ui/icons";
import { Message } from "@ui/message";
import { ModalScrollView } from "@ui/modal-scroll-view";
import { Text } from "@ui/text";
import { theme } from "theme";

import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { AssistantEmpty } from "./screen.empty";
import { RecipeRow } from "./screen.recipe-row";
import { useAssistantChat } from "./_hooks/useAssistantChat";

type Props = {
  style?: ViewStyle;
  /**
   * A question typed into the navigation bar, which routed here instead of answering itself.
   *
   * Sent once on mount rather than pre-filled into a box, because the shopper already pressed
   * Enter — asking them to press it again would be the screen forgetting what it was opened with.
   */
  question?: string;
};

export const AssistantScreen = ({ style, question }: Props) => {
  const t = useTranslations("Assistant");
  const { messages, ask, isThinking, hasConversation } = useAssistantChat();

  /**
   * The question the bar arrived with, sent exactly once.
   *
   * A ref rather than a dependency on `question`, because the effect must not re-fire: `ask` is
   * recreated whenever the thread id changes, and the thread id changes as a direct result of
   * sending — so a dependency array holding it would send the same question a second time the
   * moment the first one landed.
   */
  const asked = useRef(false);

  useEffect(() => {
    if (!question || asked.current) return;

    asked.current = true;
    void ask(question);
  }, [question, ask]);

  /**
   * Nothing has been asked, and nothing is on its way.
   *
   * Reachable since Quick Access started linking straight here: the navigation bar used to be the
   * only door in, and it always arrived carrying a question.
   */
  const isEmpty = !question && !hasConversation && !isThinking;

  const scroller = useRef<ScrollView>(null);

  /**
   * Follows the conversation down as it grows.
   *
   * On content size rather than on a message arriving, because an answer streaming in changes the
   * height many times per message — watching the list length would pin the view at the top of a
   * long answer and leave the reader to chase it.
   */
  const followToBottom = useCallback(() => {
    scroller.current?.scrollToEnd({ animated: true });
  }, []);

  return (
    <ModalScrollView
      ref={scroller}
      style={[styles.sheet, style]}
      contentContainerStyle={styles.page}
      onContentSizeChange={followToBottom}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View style={styles.title}>
          <SparklesIcon size={20} strokeWidth={theme.icon.titleStrokeWidth} />
          <Text.H4 color="currentColor">{t("title")}</Text.H4>
        </View>
      </View>

      {/*
        * The greeting, drawn only when the screen is certainly empty and will stay that way.
        *
        * All three conditions are the same question asked of the three things that can put a
        * message here: a `question` is about to be sent on mount, a held conversation is a
        * transcript still loading, and a pending one is a turn already in flight. Testing
        * `messages.length` alone would greet a reader for the frame before any of them lands.
        */}
      {isEmpty && <AssistantEmpty />}
      <View style={styles.conversation}>
        {messages.map((message) =>
          message.from === "user" ? (
            <Message
              key={message.key}
              from="user"
              content={message.text}
              style={styles.fromUser}
            />
          ) : (
            <View key={message.key}>
              {/*
                * A turn that failed has nothing to say, so it says that plainly instead of
                * drawing an empty bubble. Plainly is the point: PRODUCT.md puts the mascot aside
                * when something has gone wrong, so this is an apology and not a joke.
                */}
              <Message
                from="assistant"
                content={message.hasFailed && !message.text ? t("failed") : message.text}
                style={styles.fromAssistant}
              />
              {message.recipeIds.length > 0 && <View
                style={styles.assistantTool}
              >
                <RecipeRow recipeIds={message.recipeIds} />
              </View>}
            </View>
          ),
        )}
        {/*
          * Drawn only in the gap the stream has not reached yet. Once the first token lands, the
          * answer itself is the feedback and a second indicator beside it would read as a
          * second turn.
          */}
        {isThinking && (
          <Text.Base color={theme.colors.neutral.muted} style={styles.thinking}>
            {t("thinking")}
          </Text.Base>
        )}
      </View>
    </ModalScrollView>
  );
};

const styles = StyleSheet.create({
  sheet: {
    marginTop: 4,
  },
  page: {
    paddingBottom: NAVIGATION_BAR_OFFSET,
  },
  header: {
    padding: theme.spacing[24],
    paddingTop: theme.spacing[20],
    marginBottom: theme.spacing[8],
    gap: theme.spacing[12],
    alignItems: "center",
  },
  title: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
    color: theme.colors.primary.base,
  },
  conversation: {
    gap: theme.spacing[28],
  },
  fromUser: {
    paddingRight: theme.spacing[16],
  },
  fromAssistant: {
    marginLeft: theme.spacing[12],
  },
  assistantTool: {
    marginLeft: theme.spacing[32],
    marginTop: theme.spacing[12],
    paddingRight: theme.spacing[32],
  },
  thinking: {
    paddingLeft: theme.spacing[28],
  },
});
