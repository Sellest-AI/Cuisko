import { useEffect, useRef } from "react";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { useSharedValue, withTiming } from "react-native-reanimated";

import { useLocale } from "~/hooks/useLocale";

import {
  EMPTY_ENTRY,
  type Entry,
  hear,
  isSilenceOver,
  OPEN_RANGE,
  readEvent,
  type RecognizerEvent,
  speechLanguage,
  toLevel,
  type VolumeRange,
  widen,
} from "../_model/voice";

/** How often the recognizer reports volume. Fast enough for the wave to breathe with the voice. */
const VOLUME_INTERVAL_MS = 50;

/** One mount of the voice bar: the entry it is listening for, and what only the hook tracks. */
type Session = {
  entry: Entry;
  lastVoiceAt: number | null;
  /** The quietest and loudest heard in this entry — the wave is drawn against it. */
  range: VolumeRange;
  /** Thrown away — by the trash, or by the bar unmounting. Nothing is delivered after this. */
  isCancelled: boolean;
};

const _freshSession = (): Session => ({
  entry: EMPTY_ENTRY,
  lastVoiceAt: null,
  range: OPEN_RANGE,
  isCancelled: false,
});

/**
 * The navigation bar's microphone: speech in, one line of text out.
 *
 * **Mounted means listening.** The session starts with the component that calls this and is thrown
 * away with it, so the bar opens a spoken entry by swapping the voice bar in and ends one by
 * swapping it out — there is no `isListening` to keep in step with what is on screen.
 *
 * **On the device, not on our server.** The platform's own recognizer does the listening, so an
 * entry costs nothing and never leaves the phone. The seam is `onDone`: it receives a string, and
 * nothing past it knows how the string was made — moving to a hosted model changes this file and no
 * other.
 *
 * **It ends itself.** After the shopper has said something, `SILENCE_MS` of quiet stops the entry,
 * the same as pressing send. What each recognizer event does to the entry — including ignoring the
 * previous entry's late `end` — is `readEvent`'s, in `_model/voice.ts`; this only feeds it.
 *
 * `onDone` is called exactly once per session that is not cancelled — with an empty string when
 * nothing was heard, the permission was refused or could not be asked, or the recognizer failed —
 * so the caller always learns the entry is over and can put the text bar back.
 *
 * `level` is a shared value rather than state: it changes twenty times a second, and the wave reads
 * it on the UI thread. Holding it in state would re-render the bar on every sample.
 */
export const useVoiceInput = (onDone: (text: string) => void) => {
  const locale = useLocale();
  const level = useSharedValue(0);
  const session = useRef<Session>(_freshSession());

  // The caller hands a new closure every render; `end` must call the one current when it lands.
  const deliver = useRef(onDone);
  useEffect(() => {
    deliver.current = onDone;
  }, [onDone]);

  /** Applies one event to the current entry, and hands its words over if that ended it. */
  const apply = (event: RecognizerEvent) => {
    const current = session.current;
    const { entry, done, stop } = readEvent(current.entry, event);
    current.entry = entry;

    if (stop) ExpoSpeechRecognitionModule.stop();

    if (done !== null && !current.isCancelled) deliver.current(done);
  };

  useEffect(() => {
    // Held locally: in development React mounts twice, and the first mount's permission prompt
    // resolves after its cleanup has already replaced `session.current` with the second one.
    const own = _freshSession();
    session.current = own;

    ExpoSpeechRecognitionModule.requestPermissionsAsync()
      .then((permission) => {
        if (own.isCancelled) return;
        if (!permission.granted) {
          console.warn("The bar cannot listen: microphone or speech permission was refused");
          deliver.current("");
          return;
        }

        ExpoSpeechRecognitionModule.start({
          lang: speechLanguage(locale),
          interimResults: true,
          // Continuous, so the platform's own end-of-speech timer does not cut the entry short —
          // the silence window is ours to decide.
          continuous: true,
          volumeChangeEventOptions: { enabled: true, intervalMillis: VOLUME_INTERVAL_MS },
        });
      })
      // The request itself failed — a build without the native module, say. No `end` will ever
      // come, so the entry ends here with nothing and the text bar comes back.
      .catch((error: unknown) => {
        console.warn("The bar could not ask to listen", error);
        if (!own.isCancelled) deliver.current("");
      });

    return () => {
      own.isCancelled = true;
      ExpoSpeechRecognitionModule.abort();
    };
  }, [locale]);

  /** Ends the entry early and keeps what was said — the send button. */
  const finish = () => apply({ type: "stop" });

  useSpeechRecognitionEvent("start", () => apply({ type: "start" }));

  useSpeechRecognitionEvent("result", (event) => apply({
    type: "result",
    transcript: event.results[0]?.transcript ?? "",
    isFinal: event.isFinal,
  }));

  useSpeechRecognitionEvent("volumechange", ({ value }) => {
    // Eased over one interval, not more: a longer ease averaged each peak into its neighbours, and
    // the wave lost the rise and fall of the voice it was drawing.
    session.current.range = widen(session.current.range, value);
    level.set(withTiming(toLevel(session.current.range, value), { duration: VOLUME_INTERVAL_MS }));

    const now = Date.now();
    session.current.lastVoiceAt = hear(session.current.lastVoiceAt, value, now);
    if (isSilenceOver(session.current.lastVoiceAt, now)) finish();
  });

  useSpeechRecognitionEvent("end", () => apply({ type: "end" }));

  useSpeechRecognitionEvent("error", (event) => {
    // A cancel reports itself as an error; it is the shopper's choice, not a failure.
    if (event.error !== "aborted") console.warn("The bar stopped listening", event.error, event.message);

    apply({ type: "error", error: event.error });
  });

  return { level, finish };
};
