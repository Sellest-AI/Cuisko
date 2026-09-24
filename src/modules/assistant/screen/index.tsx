import { useCallback, useEffect, useRef } from "react";
import { Platform, type ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import { useTranslations } from "translations";

import { LoaderCircle, MorphIcon, SparklesIcon } from "@ui/icons";
import { Message } from "@ui/message";
import { ModalScrollView } from "@ui/modal-scroll-view";
import { Text } from "@ui/text";
import { theme } from "theme";

import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { useAssistantChat } from "../_hooks/useAssistantChat";
import { Display } from "./display";
import { AssistantEmpty } from "./empty";
import { OfferedButton } from "./offered-button";
import { ToolStep } from "./tool-step";
import { useSpin } from "~/ui/hooks/useSpin";
import Animated from "react-native-reanimated";

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
  const spin = useSpin(isThinking);

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
                * Status lines first: in the turn they came first, and the prompt ends every turn
                * on `display`, so steps, then text, then cards is the order things happened in.
                */}
              {message.steps.map((step) => (
                <ToolStep key={step.key} step={step} />
              ))}
              {/*
                * A turn that failed has nothing to say, so it says that plainly instead of
                * drawing an empty bubble. Plainly is the point: PRODUCT.md puts the mascot aside
                * when something has gone wrong, so this is an apology and not a joke.
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
                * Last, whenever it was called: it points somewhere else, which is the end of what
                * this answer has to say, and a pill between the text and its cards would split them.
                */}
              {message.button && (
                <View style={styles.assistantTool}>
                  <OfferedButton button={message.button} />
                </View>
              )}
            </View>
          ),
        )}
        {/*
          * Drawn only in the gap the stream has not reached yet. Once the first status line or
          * token lands, the answer itself is the feedback and a second indicator beside it would
          * read as a second turn.
          */}
        {isThinking && (
          <View style={styles.thinking}>
            <Animated.View style={spin}>
              <MorphIcon
                icon={LoaderCircle}
                size={20}
                color={theme.colors.foreground}
              />
            </Animated.View>
            <Text.Base color={theme.colors.neutral.muted}>
              {t("thinking")}
            </Text.Base>
          </View>
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
    paddingBottom: NAVIGATION_BAR_OFFSET + Platform.select({ ios: theme.spacing[32], default: 0 }),
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
    marginLeft: theme.spacing[20],
  },
  assistantTool: {
    marginLeft: theme.spacing[20],
    marginTop: theme.spacing[12],
    paddingRight: theme.spacing[32],
  },
  thinking: {
    paddingLeft: theme.spacing[20],
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
  },
});
