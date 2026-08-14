import { View, StyleSheet, ViewStyle } from "react-native";
import { theme } from "theme";
import { Text } from "./text";
import { ReactNode } from "react";

type Parser = {
  condition: string,
  parse: (text: string) => React.ReactNode,
}

type Props = {
  from: "user" | "assistant",
  style?: ViewStyle,
  content: string;
  children?: ReactNode,
  parsers?: Parser[],
}

export const Message = ({ from = "user", style, content, children, parsers }: Props) => {
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
      {!isUser && <View style={{
        width: 12,
        height: 12,
        borderRadius: theme.radius.full,
        marginTop: theme.spacing[6]
      }}
      >
        <Text.Sm style={{ fontSize: 12, lineHeight: 6 }}>
          🦊
        </Text.Sm>
      </View>}
      <View style={{
        gap: theme.spacing[12],
        width: "100%"
      }}>
        <View style={[
          styles.message,
          isUser ? styles.userMessage : styles.assistantMessage,
          isUser && styles.elevated,
        ]}>
          <Text.Base
            style={{
              color: theme.colors.foreground,
              fontWeight: 400,
              lineHeight: theme.font.base.lineHeight * 1.1
            }}
          >
            {parsers && parsers.length > 0 ? (
              parsers.reduce((acc, parser) => {
                return parser.parse(acc as string);
              }, content as string | React.ReactNode)
            ) : (
              content
            )}
          </Text.Base>
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
    width: "auto"
  },
  userMessage: {
    padding: theme.spacing[16],
    alignSelf: "flex-end",
    borderRadius: theme.radius.md,
    borderBottomRightRadius: theme.radius.xs,
    backgroundColor: theme.colors.surface.elevated,
  },
  assistantMessage: {
    alignSelf: "flex-start",
    borderRadius: theme.radius.md,
    borderBottomLeftRadius: theme.radius.xs,
    backgroundColor: "transparent",
    flexShrink: 1,
  },
  elevated: {
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 1,
        blurRadius: 16,
        spreadDistance: 0,
        color: "rgba(0, 0, 0, 0.07)",
      },
    ],
  }
})
