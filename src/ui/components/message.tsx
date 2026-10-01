import { View, StyleSheet, ViewStyle } from "react-native";
import { theme } from "theme";
import { Markdown } from "./markdown";
import { Text } from "./text";
import { ReactNode } from "react";
import { TiltedPhoto } from "./tilted-photo";

type Props = {
  from: "user" | "assistant",
  style?: ViewStyle,
  content: string;
  children?: ReactNode,
  /**
   * Draw `content` as markdown rather than as the literal characters. For text a model wrote; a
   * person's own message is shown as they typed it, asterisks and all.
   */
  markdown?: boolean,
  /** A photo sent with the message, laid at an angle above the bubble. */
  image?: string,
}

export const Message = ({ from = "user", style, content, children, markdown, image }: Props) => {
  const isUser = from === "user";

  const maxUserWidth = content.length > 80 ? 300 : content.length > 50 ? 260 : 220;
  const maxAssistantWidth = content.length > 50 ? 310 : 200;
  const maxWidth = isUser ? maxUserWidth : maxAssistantWidth;

  const alignSelf = isUser ? "flex-end" : "flex-start";

  return (
    <View style={[
      styles.container,
      { maxWidth, alignSelf },
      style,
    ]}>
      <View style={{
        gap: theme.spacing[12],
        width: "100%"
      }}>
        {image && <TiltedPhoto
          tilt={from === "user" ? -4 : 4}
          style={[styles.image, {
            marginTop: from === "user" ? 0 : theme.spacing[8],
            marginRight: from === "user" ? theme.spacing[4] : 0,
            marginLeft: from === "user" ? 0 : theme.spacing[4],
            alignSelf
          }]}
          uri={image}
          width={160}
        />}
        <View style={[
          styles.message,
          isUser ? styles.userMessage : styles.assistantMessage,
        ]}>
          {markdown ? (
            <Markdown content={content} color={theme.colors.foreground} />
          ) : (
            <Text.Body color={theme.colors.foreground}>{content}</Text.Body>
          )}
        </View>
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: theme.spacing[12],
  },
  message: {
    maxWidth: "100%",
    width: "auto",
  },
  userMessage: {
    padding: theme.spacing[16],
    alignSelf: "flex-end",
    borderRadius: theme.radius.md,
    borderBottomRightRadius: theme.radius.xs,
    backgroundColor: theme.colors.neutral.subtle,
    borderWidth: 2,
    borderColor: theme.colors.border.medium,
  },
  assistantMessage: {
    alignSelf: "flex-start",
    borderRadius: theme.radius.md,
    borderBottomLeftRadius: theme.radius.xs,
    backgroundColor: "transparent",
    flexShrink: 1,
  },
  image: {
    marginBottom: theme.spacing[8],
  }
})
