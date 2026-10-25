import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { LinearTransition } from "react-native-reanimated";

import { ButtonPill } from "@ui/button-pill";
import { Camera, Mic, MorphIcon, SendHorizontal } from "@ui/icons";
import { Input } from "@ui/input";
import { AnimatePresence, m } from "@ui/motion";
import { Text } from "@ui/text";
import { colors, theme } from "theme";
import { useTranslations } from "translations";

import { Hint } from "./hint";
import { LinearGradient } from "expo-linear-gradient";

/** One character this often: quick enough not to be a wait, slow enough to read as typing. */
const TYPE_MS = 10;
/** The typed line rests this long before it is sent, so the eye catches it whole. */
const SEND_DELAY_MS = 240;
/** The real bar's glyph size, so the two read as the same control. */
const ICON_SIZE = 20;
/** A sent chip slides to the end of the rail rather than jumping, and its neighbours close up. */
const CHIP_MOVE = LinearTransition.duration(260);
/** The hint rail and the input together. */
const FAKE_BAR_HEIGHT = 128;
/** How far the bar sinks as it leaves: its own height, so it goes off the foot, not beside it. */
const LEAVE_TRAVEL = FAKE_BAR_HEIGHT;
/** The gap the chrome's Continue pill leaves under itself (`StepBar`), so the bar rests where it will. */
const FOOT_GAP = theme.spacing[24];
const GUTTER = theme.spacing[16];

/**
 * What a page scrolls clear of while the bar is up. Once the step is done the bar has left and the
 * pill took its place, and the pill is shorter, so this covers both.
 */
export const FAKE_BAR_CLEARANCE = FAKE_BAR_HEIGHT + FOOT_GAP;

type Props = {
  /** Already translated: what each chip says, and what the bar types when it is tapped. */
  hints: readonly string[];
  /** Indexes already sent, drawn spent and no longer tappable. */
  used: readonly number[];
  /** Called once the hint has typed itself out, as Enter would be on the real bar. */
  onSend: (index: number) => void;
  /**
   * The screen is still answering the last send: Cuisko thinking, or a card being looked up. The
   * chips wait, so nothing is sent over an answer still coming, and the bar stays up until it lands.
   */
  isAnswering?: boolean;
};

/**
 * The navigation bar as the onboarding shows it: the same input shell, and a rail of hints above
 * it. Tapping a hint types it into the bar, letter by letter, then sends it, which is exactly the
 * gesture the real bar asks for, done once for the user so they have seen it work.
 *
 * It stays while a hint is left to send or its answer is still coming, then sinks and fades rather
 * than vanishing, so the next move is the only thing left to look at. Leaving matters: the bar
 * rests where the chrome's Continue pill rises once the step is done, and the two would overlap.
 *
 * @limitation A look-alike, not the real bar. **Accepted because** the real one classifies what it
 * is given through an action and writes to the household's stock, and a sandboxed mode of it would
 * thread "onboarding" through the navigation module. **Until fixed**, a change to the real bar's
 * look has to be copied here by hand. **The fix** is to lift the bar's visual shell into `@ui` and
 * have both draw it.
 */
export const FakeNavigationBar = ({ hints, used, onSend, isAnswering = false }: Props) => {
  const t = useTranslations("Navigation");
  const [typing, setTyping] = useState<{ index: number; length: number } | null>(null);
  /**
   * No paw while the bar rises into place. The paw's measure does not see the rise's UI-thread
   * transform until it ends, so a paw put on the first chip meanwhile sits where the bar started,
   * `LEAVE_TRAVEL` low, then jumps up when it lands.
   */
  const [hasLanded, setHasLanded] = useState(false);

  const text = typing ? hints[typing.index]!.slice(0, typing.length) : "";
  const isTyped = typing !== null && typing.length >= hints[typing.index]!.length;

  useEffect(() => {
    if (!typing) return;

    if (!isTyped) {
      const timer = setTimeout(() => setTyping({ ...typing, length: typing.length + 1 }), TYPE_MS);

      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      onSend(typing.index);
      setTyping(null);
    }, SEND_DELAY_MS);

    return () => clearTimeout(timer);
  }, [typing, isTyped, onSend]);

  /** The first hint not yet sent: the one that pulses. None left and nothing pending, and the bar leaves. */
  const nextHint = hints.findIndex((_, index) => !used.includes(index));
  const isComplete = nextHint === -1 && !isAnswering;

  /**
   * The rail's order: what is left to tap first, then what was sent, in the order it was. A chip
   * goes to the end once it is sent, not when it is tapped: its paw goes on the tap, and a chip
   * already sliding away would take the paw along for a frame or two before the paw heard it was
   * off. By the send the paw is long gone, and the next chip is under the thumb all the same.
   */
  const order = [...hints.keys()].filter((index) => !used.includes(index)).concat(used);

  return (
    <AnimatePresence>
      {!isComplete && (
        <m.View
          style={styles.container}
          from={{ opacity: 0, translateY: LEAVE_TRAVEL }}
          animate={{ opacity: 1, translateY: 0 }}
          exit={{ opacity: 0, translateY: LEAVE_TRAVEL }}
          transition={{ type: "timing", duration: 300 }}
          onDidAnimate={(key, finished, _, { attemptedValue }) => {
            if (key === "translateY" && finished && attemptedValue === 0) setHasLanded(true);
          }}
        >
          <View
            style={{
              position: "absolute",
              bottom: -270,
              height: 300,
              left: -100,
              right: -100,
              backgroundColor: colors.background
            }}
          />
          <LinearGradient
            pointerEvents="none"
            style={[{
              position: "absolute",
              bottom: 0,
              left: -GUTTER,
              right: -GUTTER,
              height: 240
            }]}
            colors={[colors.transparent.light, colors.background, colors.background]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail}
            style={styles.railScroll}
          >
            {order.map((index) => {
              const hint = hints[index]!;
              const isUsed = used.includes(index);

              return (
                <Hint key={hint} active={hasLanded && !typing && !isAnswering && index === nextHint} layout={CHIP_MOVE}>
                  <ButtonPill
                    size="lg"
                    variant="neutral"
                    disabled={isUsed || typing !== null || isAnswering}
                    onPress={() => setTyping({ index, length: 0 })}
                    style={isUsed ? styles.used : undefined}
                  >
                    {hint}
                  </ButtonPill>
                </Hint>
              );
            })}
          </ScrollView>
          <Input
            elevated
            leftIcon={Camera}
            centerContent={
              <Text.Base color={typing ? colors.foreground : colors.muted} numberOfLines={1} style={styles.text}>
                {typing ? text : t("ask_anything").slice(0, 15).trim().concat("…")}
              </Text.Base>
            }
            rightContent={
              <MorphIcon icon={typing ? SendHorizontal : Mic} size={ICON_SIZE} color={colors.foreground} />
            }
            style={styles.input}
          />
        </m.View>
      )}
    </AnimatePresence>
  );
};

const styles = StyleSheet.create({
  /**
   * In the foot, where the chrome's Continue pill rests: the pill stays hidden until the step is
   * done, so leaving the bar at the pill's own height left an empty band under it.
   */
  container: { position: "absolute", left: GUTTER, right: GUTTER, bottom: FOOT_GAP, gap: theme.spacing[8] },
  /** Bleeds to the screen edges, so a chip scrolled off reads as more to come, not as clipped. */
  railScroll: { marginHorizontal: -theme.spacing[16] },
  /** Room for the pulse ring, which would otherwise be cut by the scroll view's bounds. */
  rail: { gap: theme.spacing[8], paddingHorizontal: theme.spacing[16], paddingVertical: theme.spacing[8] },
  used: { opacity: 0.4 },
  text: { flex: 1 },
  input: { width: "100%" },
});
