import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Input } from "@ui/input";
import { SendHorizontalIcon, Trash2 } from "@ui/icons";
import { Pressable } from "@ui/pressable";
import { VoiceWave } from "@ui/voice-wave";
import { theme } from "theme";
import { useLocale } from "~/hooks/useLocale";
import { useVoiceInput } from "~/lib/voice";
import { StagedPhoto } from "./staged-photo";

type Props = {
  /**
   * What was said, once the entry is over — empty when nothing was heard. `isSent` when the
   * shopper ended it, by send or by going quiet, rather than the recognizer giving up.
   */
  onDone: (text: string, isSent: boolean) => void,
  /** The trash: the entry is thrown away and nothing is typed in. */
  onDiscard: () => void,
}

/**
 * The navigation bar while it listens: trash where the camera was, the voice's wave where the text
 * was, send where the microphone was.
 *
 * Its own component because it is its own session — `useVoiceInput` listens for as long as this is
 * mounted. The navigation bar swaps it in for the text bar on the mic and back out on `onDone` or
 * `onDiscard`; the two never see each other, and unmounting this is what stops the recognizer,
 * however the swap came about.
 *
 * Built on `Input` with the text field replaced, and laid out as the text bar is when focused, so
 * the swap does not move a pixel of the shell.
 */
export const NavigationBarVoice = ({ onDone, onDiscard }: Props) => {
  const locale = useLocale();
  const { level, finish } = useVoiceInput(onDone, locale);
  const [barHeight, setBarHeight] = useState(0);

  return (
    <View style={styles.container}>
      {/*
        * The photo stays while the bar listens: it goes with the spoken question the way it goes with
        * a typed one. Measured on its own wrapper, inside the padding the photo is positioned from.
        */}
      <View onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}>
        <StagedPhoto barHeight={barHeight} />
        <Input
          elevated
          style={styles.fill}
          leftIcon={Trash2}
          onLeftPress={onDiscard}
          rightContent={<Pressable hitSlop={24} onPress={finish} haptic>
            <SendHorizontalIcon size={20} />
          </Pressable>}
          centerContent={
            <VoiceWave
              level={level}
              style={styles.content}
            />
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    maxWidth: "100%",
    width: "100%",
    paddingHorizontal: theme.spacing[16],
  },
  fill: {
    width: "100%",
  },
  content: {
    marginLeft: -theme.spacing[6],
  },
});
