import { ReactNode, useRef } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";

import { useSpin } from "@ui/hooks/useSpin";
import { LoaderCircle, MorphIcon } from "@ui/icons";
import { Image } from "@ui/image";
import { Message } from "@ui/message";
import { m } from "@ui/motion";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

import { CUISKO_HEAD } from "~/lib/mascots";

import { useProgressClearance } from "../_hooks/useProgressClearance";
import { FAKE_BAR_CLEARANCE } from "./fake-navigation-bar";

const HEAD_SIZE = 28;

/** The real chat's mark for a recipe search that found something, as its `ToolStep` draws it. */
export const FOUND_EMOJI = "🥗";

type Props = {
  /** The step's own header, scrolled away with the conversation. */
  header: ReactNode;
  /** Cuisko's opening line, there before anything is sent. */
  greeting: string;
  /** Cuisko is answering: the real chat's "Cuisko is thinking" under the last message. */
  isThinking: boolean;
  /** The turns so far, as `ChatQuestion`s and `ChatAnswer`s. */
  children: ReactNode;
};

/**
 * Cuisko's chat as the onboarding shows it, above a `FakeNavigationBar` that sends the hints: the
 * real chat's bubbles and its thinking line, so the user meets the assistant before the app.
 *
 * Follows the conversation down as it grows, as the real chat does, so each answer lands in view.
 */
export const FakeChat = ({ header, greeting, isThinking, children }: Props) => {
  const tAssistant = useTranslations("Assistant");
  const clearance = useProgressClearance();
  const scroll = useRef<ScrollView>(null);
  const spin = useSpin(isThinking);

  return (
    <ScrollView
      ref={scroll}
      contentContainerStyle={[styles.page, { paddingTop: clearance }]}
      showsVerticalScrollIndicator={false}
      onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
    >
      {header}
      <View style={styles.body}>
        <View style={styles.greeting}>
          <Image source={CUISKO_HEAD} contentFit="contain" style={styles.head} />
          <Message from="assistant" content={greeting} style={styles.shrink} />
        </View>
        {children}
        {isThinking && (
          <View style={styles.thinking}>
            <Animated.View style={spin}>
              <MorphIcon icon={LoaderCircle} size={16} color={theme.colors.neutral.muted} />
            </Animated.View>
            <Text.Base color={theme.colors.neutral.muted}>{tAssistant("thinking")}</Text.Base>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

/** Rises a little as it lands, so a new turn is seen arriving rather than appearing. */
const _Turn = ({ children }: { children: ReactNode }) => (
  <m.View from={{ opacity: 0, translateY: 8 }} animate={{ opacity: 1, translateY: 0 }} style={styles.turn}>
    {children}
  </m.View>
);

/** What the user sent: the hint the bar typed out. */
export const ChatQuestion = ({ content }: { content: string }) => (
  <_Turn>
    <Message from="user" content={content} />
  </_Turn>
);

type AnswerProps = {
  /** The status line over the answer, as the real chat keeps it: "🥗 2 recipes found". */
  status: { emoji: string; label: string };
  /** The answer itself: Cuisko's text and the cards it shows, in the order it shows them. */
  children: ReactNode;
};

/**
 * One answer from Cuisko, opened by the line saying what it did, so the cards under it read as
 * found rather than from nowhere.
 *
 * The status line is the real chat's `ToolStep`, drawn again here rather than imported: it reads
 * the assistant's own message model, which a pretend answer does not have.
 */
export const ChatAnswer = ({ status, children }: AnswerProps) => (
  <_Turn>
    <View style={styles.status}>
      <Text.Base>{status.emoji}</Text.Base>
      <Text.Base color={theme.colors.neutral.muted} style={styles.statusLabel}>
        {status.label}
      </Text.Base>
    </View>
    {children}
  </_Turn>
);

const styles = StyleSheet.create({
  page: { paddingBottom: FAKE_BAR_CLEARANCE },
  body: { paddingHorizontal: theme.spacing[16] },
  greeting: { flexDirection: "row", alignItems: "flex-start", gap: theme.spacing[12] },
  head: { width: HEAD_SIZE, height: HEAD_SIZE },
  shrink: { flexShrink: 1, maxWidth: "70%" },
  turn: { marginTop: theme.spacing[24], gap: theme.spacing[12] },
  status: { flexDirection: "row", alignItems: "center", gap: theme.spacing[8] },
  /** Takes the rest of the row, so a long line wraps under itself rather than under the emoji. */
  statusLabel: { flexShrink: 1 },
  thinking: { flexDirection: "row", alignItems: "center", gap: theme.spacing[12], marginTop: theme.spacing[24] },
});
