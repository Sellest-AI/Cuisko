import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GroupSelect } from "../group-select";

/**
 * `Pressable` reaches `expo-haptics`, which jsdom cannot load. The stand-in forwards every tap and
 * ignores `disabled` on purpose: the guard under test is `GroupSelect`'s own, and a stub that
 * honoured `disabled` would pass even if that guard were deleted.
 */
vi.mock("../pressable", () => ({
  Pressable: ({ onPress, children }: { onPress: () => void; children: React.ReactNode }) => (
    <button onClick={onPress}>{children}</button>
  ),
}));

vi.mock("../icons", () => ({ Check: "check", Lock: "lock", MorphIcon: () => null }));

/**
 * A locked chip is shown so the cook can see a value is set and where it came from — and it must
 * never answer a tap, since the caller has nothing to do with one. Typecheck cannot see either half.
 */
describe("GroupSelect", () => {
  it("answers a tap on an ordinary chip with its value", () => {
    const onSelect = vi.fn();
    render(<GroupSelect items={[{ value: "main", label: "Main" }]} onSelect={onSelect} />);

    fireEvent.click(screen.getByText("Main"));

    expect(onSelect).toHaveBeenCalledWith("main");
  });

  it("never calls onSelect for a locked chip", () => {
    const onSelect = vi.fn();
    render(
      <GroupSelect items={[{ value: "vegan", label: "Vegan", locked: true }]} onSelect={onSelect} />,
    );

    fireEvent.click(screen.getByText("Vegan"));

    expect(onSelect).not.toHaveBeenCalled();
  });
});
