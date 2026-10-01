/**
 * Orders two `major.minor.patch` version strings: -1 when `a` is older, 1 when newer, 0 when equal.
 *
 * `null` means one of them is not a version at all, which is not the same answer as "equal": a
 * caller deciding whether to open something must be able to treat garbage as closed. A missing
 * trailing part counts as 0 (`1.2` is `1.2.0`); anything else that is not a whole number does not.
 */
export const compareVersions = (a: string, b: string): -1 | 0 | 1 | null => {
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return null;

  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i]! > right[i]! ? 1 : -1;
  }
  return 0;
};

const parse = (version: string): [number, number, number] | null => {
  const parts = version.split(".");
  if (parts.length < 1 || parts.length > 3) return null;
  if (!parts.every((part) => /^\d+$/.test(part))) return null;

  const [major = 0, minor = 0, patch = 0] = parts.map(Number);
  return [major, minor, patch];
};
