import { atom, useAtom } from "jotai";
import { useCallback } from "react";
import type { TextInput } from "react-native";

export type AssistantMode = "default" | "cellar" | "shopping-list" | "recipe";

type InputRef = React.RefObject<TextInput | null>;

const modeAtom = atom<AssistantMode>("default");

/**
 * Every navigation bar currently mounted, oldest first — not "the" bar, because there is regularly
 * more than one.
 *
 * The root layout renders a bar beside the navigator and never unmounts it, and a modal that wants
 * its own renders a second (`(modals)/assistant.tsx` on iOS). A single slot meant the newer one
 * overwrote the older on mount and then took it to the grave: React nulls a ref on unmount, so
 * dismissing that modal left the slot holding a dead ref, and `focus()` and `blur()` went quietly
 * no-op for the rest of the session — the Quick Access "+" buttons stopped raising the keyboard
 * once you had opened and closed the assistant.
 *
 * A stack instead, so the registration falls back rather than ending.
 */
const refsAtom = atom<InputRef[]>([]);

export const useNavigationBar = () => {
  const [mode, setMode] = useAtom(modeAtom);
  const [refs, setRefs] = useAtom(refsAtom);

  const reset = ({ delayed }: { delayed: boolean }) => {
    const timer = setTimeout(() => {
      setMode("default");
      clearTimeout(timer);
    }, delayed ? 3000 : 0);

    return () => clearTimeout(timer);
  }

  /**
   * A bar announcing itself, and taking itself back when it goes.
   *
   * Returns the deregistration, so the call site is one line in an effect and cannot forget the
   * other half. Stable across renders — `setRefs` is Jotai's and never changes — which is what
   * lets that effect depend on it honestly instead of silencing the lint rule.
   */
  const registerInputRef = useCallback((ref: InputRef) => {
    setRefs((current) => current.includes(ref) ? current : [...current, ref]);

    return () => setRefs((current) => current.filter((registered) => registered !== ref));
  }, [setRefs]);

  /**
   * The field a keystroke would actually land in: the most recently mounted bar still on screen.
   *
   * Searched from the top rather than simply taken from it, because a ref can be dead while it is
   * still listed — the cleanup above runs on unmount, but an effect's cleanup is not the only
   * moment `current` can be null, and a bar that is mid-transition should not swallow the call.
   */
  const _activeInput = () => {
    for (let index = refs.length - 1; index >= 0; index -= 1) {
      const input = refs[index]?.current;
      if (input) return input;
    }

    return undefined;
  }

  const focus = (mode?: AssistantMode) => {
    if (mode) { setMode(mode); }
    _activeInput()?.focus();
  }

  /**
   * Gives the keyboard back, and is not the same thing as the bar closing.
   *
   * The bar's focused state is React's — a tap outside flips it, and the field it is drawn around
   * never hears about that. Native focus only ends when something asks the field to give it up, so
   * without this the bar collapses with the keyboard still standing over it, and the next tap
   * outside is spent on a dismissal the first one looked like it had already done.
   */
  const blur = () => {
    _activeInput()?.blur();
  }

  return {
    mode,
    setMode,
    reset,
    registerInputRef,
    focus,
    blur,
  }
}
