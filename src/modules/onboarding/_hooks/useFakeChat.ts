import { useCallback, useEffect, useRef, useState } from "react";

/** How long Cuisko thinks before it answers: long enough to read as a reply, short enough not to be a wait. */
const THINKING_MS = 1200;

/**
 * The turns of a pretend chat with Cuisko: which hints were sent, which answered, and which one
 * Cuisko is thinking about. Answered one at a time, in the order they were sent, as the real chat
 * answers them.
 *
 * `onAnswer` runs as an answer lands, for a step whose answer does something (planning a meal).
 * Read through a ref, so a caller passing a fresh function each render does not restart the wait.
 */
export const useFakeChat = (count: number, onAnswer?: (index: number) => void) => {
  const [sent, setSent] = useState<number[]>([]);
  const [answered, setAnswered] = useState<number[]>([]);
  const onAnswerRef = useRef(onAnswer);

  useEffect(() => {
    onAnswerRef.current = onAnswer;
  }, [onAnswer]);

  const pending = sent.find((index) => !answered.includes(index));

  useEffect(() => {
    if (pending === undefined) return;

    const timer = setTimeout(() => {
      onAnswerRef.current?.(pending);
      setAnswered((current) => [...current, pending]);
    }, THINKING_MS);

    return () => clearTimeout(timer);
  }, [pending]);

  const send = useCallback(
    (index: number) => setSent((current) => (current.includes(index) ? current : [...current, index])),
    [],
  );

  return { sent, answered, pending, send, isDone: answered.length === count };
};
