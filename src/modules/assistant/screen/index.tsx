import { FlashList, type FlashListRef, type ListRenderItemInfo } from "@shopify/flash-list";
import { useCallback, useEffect, useRef } from "react";
import { Platform, StyleSheet, View, type ViewStyle } from "react-native";
import { useTranslations } from "translations";

import { LoaderCircle, MorphIcon, SparklesIcon } from "@ui/icons";
import { ModalScrollView } from "@ui/modal-scroll-view";
import { Text } from "@ui/text";
import { theme } from "theme";

import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { useAssistantChat } from "../_hooks/useAssistantChat";
import type { ChatMessage as ChatMessageModel } from "../_model/chatMessage";
import { ChatMessage } from "./chat-message";
import { AssistantEmpty } from "./empty";
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

  const scroller = useRef<FlashListRef<ChatMessageModel>>(null);
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
    <FlashList
      ref={scroller}
      data={messages}
      keyExtractor={keyOf}
      getItemType={typeOf}
      renderItem={renderMessage}
      ItemSeparatorComponent={Gap}
      /**
       * The sheet's own scroller, so the list keeps its Android drag hand-off — see ModalScrollView.
       * FlashList then only decides which rows exist, which is what a long transcript needed: every
       * answer is markdown, and a ScrollView re-rendered every one of them on each streamed token.
       */
      renderScrollComponent={ModalScrollView}
      style={{ ...styles.sheet, ...style }}
      contentContainerStyle={styles.page}
      onContentSizeChange={followToBottom}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <>
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
        </>
      }
      /*
       * Drawn only in the gap the stream has not reached yet. Once the first status line or token
       * lands, the answer itself is the feedback and a second indicator beside it would read as a
       * second turn.
       */
      ListFooterComponent={
        isThinking ? (
          <View style={[styles.thinking, messages.length > 0 && styles.gap]}>
            <Animated.View style={spin}>
              <MorphIcon icon={LoaderCircle} size={20} color={theme.colors.foreground} />
            </Animated.View>
            <Text.Base color={theme.colors.neutral.muted}>{t("thinking")}</Text.Base>
          </View>
        ) : null
      }
    />
  );
};

const keyOf = (message: ChatMessageModel) => message.key;

/** Questions and answers share no layout, so each recycles only into its own kind. */
const typeOf = (message: ChatMessageModel) => message.from;

const renderMessage = ({ item }: ListRenderItemInfo<ChatMessageModel>) => (
  <ChatMessage message={item} />
);

/** Between rows rather than a container `gap`, which FlashList's absolutely positioned cells ignore. */
const Gap = () => <View style={styles.gap} />;

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
  gap: {
    marginTop: theme.spacing[28],
  },
  thinking: {
    paddingLeft: theme.spacing[20],
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
  },
});
