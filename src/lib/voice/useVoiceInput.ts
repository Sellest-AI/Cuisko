import { useEffect, useRef } from "react";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { useSharedValue, withTiming } from "react-native-reanimated";

import type { Locale } from "@shared/translations";

import {
  EMPTY_ENTRY,
  type Entry,
  hearWords,
  isSilenceOver,
  joinTranscript,
  OPEN_RANGE,
  readEvent,
  type RecognizerEvent,
  speechLanguage,
  toLevel,
  type VolumeRange,
  widen,
} from "./voice";

/** How often the recognizer reports volume. Fast enough for the wave to breathe with the voice. */
const VOLUME_INTERVAL_MS = 50;

/** One mount of the voice bar: the entry it is listening for, and what only the hook tracks. */
type Session = {
  entry: Entry;
  /** When the recognizer last returned a new word — what the silence window counts from. */
  lastWordAt: number | null;
  /** The quietest and loudest heard in this entry — the wave is drawn against it. */
  range: VolumeRange;
  /** Thrown away — by a discard, or by the caller unmounting. Nothing is delivered after this. */
  isCancelled: boolean;
};

const _freshSession = (): Session => ({
  entry: EMPTY_ENTRY,
  lastWordAt: null,
  range: OPEN_RANGE,
  isCancelled: false,
});

/**
 * A microphone: speech in, one line of text out, for any screen that listens.
 *
 * **Mounted means listening.** The session starts with the component that calls this and is thrown
 * away with it, so a caller opens a spoken entry by swapping its listening view in and ends one by
 * swapping it out — there is no `isListening` to keep in step with what is on screen.
 *
 * **One mounted at a time.** The recognizer is the platform's, not this hook's: a second mount's
 * `start` takes it over, and the first one's cleanup `abort` stops it for both.
 *
 * **On the device, not on our server.** The platform's own recognizer does the listening, so an
 * entry costs nothing and never leaves the phone. The seam is `onDone`: it receives a string, and
 * nothing past it knows how the string was made — moving to a hosted model changes this file and no
 * other.
 *
 * **It ends itself.** After the speaker's first word, `SILENCE_MS` without a new word stops the
 * entry, the same as pressing send; `onDone` says either with `isSent`. Before the first word it
 * listens for as long as it takes. What each recognizer event does to the entry —
 * including ignoring the previous entry's late `end` — is `readEvent`'s, in `./voice.ts`;
 * this only feeds it.
 *
 * `onDone` is called exactly once per session that is not cancelled — with an empty string when
 * nothing was heard, the permission was refused or could not be asked, or the recognizer failed —
 * so the caller always learns the entry is over and can put its screen back the way it was.
 *
 * `level` is a shared value rather than state: it changes twenty times a second, and the wave reads
 * it on the UI thread. Holding it in state would re-render the caller on every sample.
 *
 * `locale` is the caller's (`useLocale`): `src/lib/` wraps the recognizer and takes nothing from the
 * app's own hooks, so the language it listens in is handed in like everything else it does not own.
 */
export const useVoiceInput = (onDone: (text: string, isSent: boolean) => void, locale: Locale) => {
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
    const before = joinTranscript(current.entry.settled, current.entry.pending);
    const { entry, done, stop } = readEvent(current.entry, event);
    current.entry = entry;
    const after = joinTranscript(entry.settled, entry.pending);
    current.lastWordAt = hearWords(current.lastWordAt, before, after, Date.now());

    if (stop) ExpoSpeechRecognitionModule.stop();

    if (done !== null && !current.isCancelled) deliver.current(done, entry.isStopAsked);
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
          console.warn("Voice input cannot listen: microphone or speech permission was refused");
          deliver.current("", false);
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
      // come, so the entry ends here with nothing and the caller learns it.
      .catch((error: unknown) => {
        console.warn("Voice input could not ask to listen", error);
        if (!own.isCancelled) deliver.current("", false);
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

    // Checked here because this is the event that keeps coming while nothing is said.
    if (isSilenceOver(session.current.lastWordAt, Date.now())) finish();
  });

  useSpeechRecognitionEvent("end", () => apply({ type: "end" }));

  useSpeechRecognitionEvent("error", (event) => {
    // A cancel reports itself as an error; it is the speaker's choice, not a failure.
    if (event.error !== "aborted") console.warn("Voice input stopped listening", event.error, event.message);

    apply({ type: "error", error: event.error });
  });

  return { level, finish };
};
