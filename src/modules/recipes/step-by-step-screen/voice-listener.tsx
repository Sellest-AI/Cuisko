import { type RefObject, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, type ViewProps } from "react-native";
import { Easing } from "react-native-reanimated";

import { BlurView } from "@ui/blur-view";
import { Image } from "@ui/image";
import { m } from "@ui/motion";
import { Pressable } from "@ui/pressable";
import { VoiceWave } from "@ui/voice-wave";
import { theme } from "theme";
import { useTranslations } from "translations";

import { useLocale } from "~/hooks/useLocale";
import { isSpokenSentence, useVoiceInput } from "~/lib/voice";
import { CUISKO_HEAD } from "~/lib/mascots";

const HEAD_SIZE = 28;
const LISTENING_HEAD_SIZE = HEAD_SIZE + 6;

/** How wide the wave opens beside Cuisko while the cook talks. */
const WAVE_WIDTH = 64;

/** Cuisko's arrival: a pop that settles, rather than a fade — Cuisko is answering a call. */
const HEAD_SPRING = { type: "spring", damping: 12, stiffness: 180, mass: 0.8 } as const;

/**
 * The pill opening and closing. Timed rather than sprung: a width that overshoots would push the
 * exit button across the row and back.
 */
const OPEN_TIMING = { type: "timing", duration: 280, easing: Easing.out(Easing.cubic) } as const;

type Props = {
  /** What the cook said, once they sent it — by tapping again or by going quiet. Never empty. */
  onListened: (text: string) => void,
  style?: ViewProps["style"],
}

type WaveProps = {
  onDone: (text: string, isSent: boolean) => void,
  /** Filled with the session's `finish`, so the pill around it can send. */
  finishRef: RefObject<(() => void) | null>,
}

/**
 * One spoken entry. Its own component because `useVoiceInput` listens for as long as it is mounted:
 * the pill swaps it in to listen and out to stop, and unmounting is what releases the microphone.
 */
const ListeningWave = ({ onDone, finishRef }: WaveProps) => {
  const locale = useLocale();
  const { level, finish } = useVoiceInput(onDone, locale);

  useEffect(() => {
    finishRef.current = finish;
    return () => { finishRef.current = null; };
  }, [finishRef, finish]);

  return <VoiceWave level={level} style={styles.wave} />;
}

/**
 * Cuisko's head on the cooking screen: a tap opens the microphone, and what the cook asks goes to
 * the assistant. A cook with floury hands can ask "how much is a pinch?" without leaving the step.
 *
 * At rest a round button. Listening, it widens to the right of the head into the voice's wave and a
 * send arrow; the second tap anywhere on it sends, as going quiet does.
 *
 * The wave is unmounted the moment the entry ends, before the pill has finished closing: holding the
 * session open for the exit animation would let a quick third tap mount a second recognizer while
 * the first one's cleanup is about to abort the platform's only one.
 */
export const VoiceListener = ({ onListened, style }: Props) => {
  const t = useTranslations("Recipe");
  const [isListening, setIsListening] = useState(false);
  const finishRef = useRef<(() => void) | null>(null);

  /** Any end closes the pill — a refused permission or a recognizer that gave up included. */
  const onDone = (text: string, isSent: boolean) => {
    setIsListening(false);
    if (isSent && isSpokenSentence(text)) onListened(text.trim());
  };

  return (
    <Pressable
      haptic
      accessibilityRole="button"
      accessibilityLabel={isListening ? t("Cooking.send_to_cuisko") : t("Cooking.ask_cuisko")}
      style={[styles.container, style]}
      onPress={() => {
        if (isListening) finishRef.current?.();
        else setIsListening(true);
      }}
    >
      <BlurView style={styles.content}>
        <m.View
          style={styles.subContent}
          animate={{
            padding: isListening ? theme.spacing[6] : theme.spacing[12],
            paddingHorizontal: theme.spacing[12],
          }}
        >
          <m.View
            from={{ opacity: 0, scale: 0.3, rotate: "-30deg" }}
            // A tilt while listening: the head leans in toward the cook.
            animate={{
              opacity: 1, scale: 1,
              rotate: isListening ? "-10deg" : "0deg",
              width: isListening ? LISTENING_HEAD_SIZE : HEAD_SIZE,
              height: isListening ? LISTENING_HEAD_SIZE : HEAD_SIZE
            }}
            transition={HEAD_SPRING}
            style={styles.headSlot}
          >
            {/*
              * The slot's size moves the pill; the picture only scales. Android's `expo-image` reloads
              * on every resize and fades each load in, so a sprung size made the head flicker.
              */}
            <m.View
              style={styles.headFrame}
              animate={{ scale: isListening ? 1 : HEAD_SIZE / LISTENING_HEAD_SIZE }}
              transition={HEAD_SPRING}
            >
              <Image
                style={styles.head}
                source={CUISKO_HEAD}
                contentFit="contain"
                transition={false}
              />
            </m.View>
          </m.View>
          <m.View
            style={styles.slot}
            from={{ width: 0, opacity: 0, marginLeft: 0 }}
            animate={{
              width: isListening ? WAVE_WIDTH : 0,
              minHeight: isListening ? 40 : 0,
              opacity: isListening ? 1 : 0,
              marginLeft: isListening ? theme.spacing[8] : 0,
            }}
            transition={OPEN_TIMING}
          >
            <m.View
              animate={{
                opacity: isListening ? 1 : 0,
                width: "100%",
                height: "100%",
              }}
              transition={{ delay: isListening ? 170 : 0 }}
            >
              {isListening && <ListeningWave onDone={onDone} finishRef={finishRef} />}
            </m.View>
          </m.View>
        </m.View>
      </BlurView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface.elevated,
    borderRadius: theme.radius.full,
  },
  content: {
    borderWidth: 2,
    borderColor: theme.colors.border.default,
    backgroundColor: Platform.select({ default: undefined, android: theme.colors.surface.elevatedSubtle }),
    borderRadius: theme.radius.full,
    overflow: "hidden",
  },
  subContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  headSlot: {
    justifyContent: "center",
    alignItems: "center",
  },
  /** Always the listening size, so the image never resizes; at rest it is scaled down instead. */
  headFrame: {
    width: LISTENING_HEAD_SIZE,
    height: LISTENING_HEAD_SIZE,
  },
  head: {
    width: "100%",
    height: "100%",
  },
  /** Clips what it holds while it opens, so neither the wave nor the arrow spills out of the pill. */
  slot: {
    overflow: "hidden",
    justifyContent: "center",
  },
  wave: {
    width: WAVE_WIDTH,
  },
})
