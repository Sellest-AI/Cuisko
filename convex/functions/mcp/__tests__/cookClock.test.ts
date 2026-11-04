import { describe, expect, test } from "vitest";

import { startOfDay } from "@shared/clock";

import { cookClockOf } from "../cookClock";

const at = (iso: string) => Date.parse(iso);

describe("cookClockOf", () => {
  test("Paris in winter: today is the number the phone stores", () => {
    const clock = cookClockOf("2026-11-05T19:30:00+01:00", at("2026-11-04T17:30:00Z"));

    expect(clock).toEqual({
      date: "2026-11-05",
      midnight: at("2026-11-04T23:00:00Z"),
      today: at("2026-11-03T23:00:00Z"),
      now: "2026-11-04T18:30",
    });
  });

  test("Paris in summer", () => {
    expect(cookClockOf("2026-07-02T12:00:00+02:00", at("2026-07-01T10:00:00Z")).today).toBe(at("2026-06-30T22:00:00Z"));
  });

  test("a day boundary: just past the cook's midnight is the next day, while UTC is still on the last", () => {
    const clock = cookClockOf("2026-11-05T19:30:00+01:00", at("2026-11-04T23:30:00Z"));

    expect(clock.now).toBe("2026-11-05T00:30");
    expect(clock.today).toBe(at("2026-11-04T23:00:00Z"));
  });

  test("Auckland, ahead of UTC by more than half a day", () => {
    expect(cookClockOf("2026-11-05T19:30:00+13:00", at("2026-11-04T17:30:00Z")).now).toBe("2026-11-05T06:30");
  });

  test("a half-hour offset, and a negative one", () => {
    expect(cookClockOf("2026-11-05T19:30:00+05:30", at("2026-11-04T12:00:00Z")).today).toBe(at("2026-11-03T18:30:00Z"));
    expect(cookClockOf("2026-11-05T19:30:00-05:00", at("2026-11-04T12:00:00Z")).today).toBe(at("2026-11-04T05:00:00Z"));
  });

  test("seconds are optional", () => {
    expect(cookClockOf("2026-11-05T19:30+01:00", at("2026-11-04T17:30:00Z")).date).toBe("2026-11-05");
  });

  /** The `@limitation`: pinned so the hour is a known one, not a surprise. */
  test("on a clock-change day itself, today is an hour off the phone's midnight", () => {
    const clock = cookClockOf("2026-10-25T19:30:00+01:00", at("2026-10-25T17:00:00Z"));

    expect(clock.today - at("2026-10-24T22:00:00Z")).toBe(60 * 60 * 1000);
  });

  test("matches the phone's own midnight on an ordinary day in this machine's zone", () => {
    const now = new Date(2026, 10, 4, 18, 30);
    const minutes = -now.getTimezoneOffset();
    const sign = minutes < 0 ? "-" : "+";
    const pad = (part: number) => `${Math.floor(Math.abs(part))}`.padStart(2, "0");
    const offset = `${sign}${pad(minutes / 60)}:${pad(minutes % 60)}`;

    expect(cookClockOf(`2026-11-05T19:30:00${offset}`, now.getTime()).today).toBe(startOfDay(now).getTime());
  });

  test.each([
    ["a day in the past", "2026-11-03T19:30:00+01:00"],
    ["a day past what the app can plan", "2026-11-13T19:30:00+01:00"],
    ["a date years ahead", "2099-01-01T19:30:00+01:00"],
  ])("refuses %s, naming what can be planned", (_case, dateTime) => {
    expect(() => cookClockOf(dateTime, at("2026-11-04T17:30:00Z"))).toThrow(/from today to 8 days after it/);
  });

  test("accepts both ends of the offsets in use on Earth", () => {
    expect(cookClockOf("2026-11-05T19:30:00+14:00", at("2026-11-04T17:30:00Z")).date).toBe("2026-11-05");
    expect(cookClockOf("2026-11-05T19:30:00-12:00", at("2026-11-04T17:30:00Z")).date).toBe("2026-11-05");
  });

  test("accepts the last day the app can plan", () => {
    expect(cookClockOf("2026-11-12T19:30:00+01:00", at("2026-11-04T17:30:00Z")).date).toBe("2026-11-12");
  });

  test.each([
    ["no offset", "2026-11-05T19:30:00"],
    ["Z", "2026-11-05T19:30:00Z"],
    ["a date alone", "2026-11-05"],
    ["garbage", "tomorrow evening"],
    ["an offset past +14 hours", "2026-11-05T19:30:00+15:00"],
    ["an offset past -12 hours", "2026-11-05T19:30:00-13:00"],
    ["an impossible day", "2026-02-30T19:30:00+01:00"],
    ["an impossible hour", "2026-11-05T24:30:00+01:00"],
    ["impossible minutes", "2026-11-05T19:60:00+01:00"],
    ["impossible seconds", "2026-11-05T19:30:60+01:00"],
    ["impossible offset minutes", "2026-11-05T19:30:00+01:60"],
  ])("refuses %s", (_case, dateTime) => {
    expect(() => cookClockOf(dateTime, at("2026-11-04T17:30:00Z"))).toThrow(/UTC offset/);
  });
});
