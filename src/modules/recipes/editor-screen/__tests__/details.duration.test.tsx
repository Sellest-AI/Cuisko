import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { DurationField } from "../details.duration";

/** A plain `<input>`: what is under test is the row's parsing, not the design system's field. */
vi.mock("@ui/input", () => ({
  Input: ({ value, onChangeText, onBlur, placeholder }: {
    value: string;
    onChangeText: (text: string) => void;
    onBlur: () => void;
    placeholder: string;
  }) => (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChangeText(event.target.value)}
      onBlur={onBlur}
    />
  ),
}));

vi.mock("@ui/text", () => ({
  Text: { Base: ({ children }: { children: React.ReactNode }) => <span>{children}</span> },
}));

vi.mock("translations", () => ({
  useTranslations: () => (key: string) => (key === "Editor.minute_unit" ? "min" : key),
}));

/** The row as the editor mounts it: `minutes` follows whatever the row reported, like `setDetails`. */
const Harness = ({ initial, onChange }: { initial?: number; onChange: (minutes?: number) => void }) => {
  const [minutes, setMinutes] = useState(initial);

  return (
    <DurationField
      label="Cooking"
      emoji="🔥"
      minutes={minutes}
      onChange={(next) => {
        setMinutes(next);
        onChange(next);
      }}
    />
  );
};

const field = () => screen.getByPlaceholderText<HTMLInputElement>("Editor.duration_placeholder");

describe("DurationField", () => {
  /**
   * On a phone, tapping Save outside the scroll view does not blur the field first — a timing that
   * only reached the form on blur was silently dropped from the save.
   */
  it("reports a parseable duration before the field is ever left", () => {
    const onChange = vi.fn();
    render(<Harness initial={20} onChange={onChange} />);

    fireEvent.change(field(), { target: { value: "1h30" } });

    expect(onChange).toHaveBeenLastCalledWith(90);
  });

  /** Reporting per keystroke must not rewrite the text under the cook's thumb: `1h` is half of `1h30`. */
  it("leaves the typed text alone until blur, then writes the canonical form", () => {
    render(<Harness initial={20} onChange={vi.fn()} />);

    fireEvent.change(field(), { target: { value: "1 h" } });
    expect(field().value).toBe("1 h");

    fireEvent.blur(field());
    expect(field().value).toBe("1h");
  });

  it("reports nothing for a typo, and puts the last stated value back on blur", () => {
    const onChange = vi.fn();
    render(<Harness initial={45} onChange={onChange} />);

    fireEvent.change(field(), { target: { value: "abd" } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.blur(field());
    expect(field().value).toBe("45 min");
  });

  it("reports an emptied field as a timing no longer stated", () => {
    const onChange = vi.fn();
    render(<Harness initial={45} onChange={onChange} />);

    fireEvent.change(field(), { target: { value: "" } });

    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});
