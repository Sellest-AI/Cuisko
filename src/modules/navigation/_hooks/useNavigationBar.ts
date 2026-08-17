import { atom, useAtom } from "jotai";
import type { TextInput } from "react-native";

export type AssistantMode = "default" | "cellar" | "shopping-list" | "recipe";

const modeAtom = atom<AssistantMode>("default");
const refAtom = atom<React.RefObject<TextInput | null>>({ current: null });

export const useNavigationBar = () => {
  const [mode, setMode] = useAtom(modeAtom);
  const [inputRef, setInputRef] = useAtom(refAtom);

  const reset = ({ delayed }: { delayed: boolean }) => {
    const timer = setTimeout(() => {
      setMode("default");
      clearTimeout(timer);
    }, delayed ? 3000 : 0);

    return () => clearTimeout(timer);
  }

  const focus = (mode?: AssistantMode) => {
    if (mode) { setMode(mode); }
    inputRef?.current?.focus();
  }

  return {
    mode,
    setMode,
    reset,
    setInputRef,
    focus,
  }
}
