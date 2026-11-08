/**
 * Personal data: found and masked (spec §11.1). The memory never holds any, the owner's included.
 * One implementation for every layer: condense masks a transcript before a model reads it, and
 * C20 scans the memory files before a diff is shown and on every commit.
 *
 * Two kinds of rule:
 *
 *   - shapes any regex knows: emails, phone numbers, API keys and tokens
 *   - the owner's identity, which no regex knows: it is passed in, read at run time by
 *     `ownerIdentity()` and never written anywhere. The git name and email match as free text.
 *     The OS user name matches only inside a path (after `Users` or `home`), so an account named
 *     `dev` never masks "commit on dev". The home folder becomes `~`.
 *
 * `mask` and `scan` apply the same rules in the same order, so a masked text always scans clean,
 * and a value that slips past the mask is still found by the scan.
 */
import os from "node:os";

import { gitInOrNull } from "./git.mjs";

/** An identity value shorter than this would match everywhere: it is dropped. */
const MIN_IDENTITY_LENGTH = 3;

/** A letter, a digit or `_`, in any script: what may not touch a name on either side. */
const WORD = String.raw`[\p{L}\p{N}_]`;

/** A path separator in every spelling a transcript holds: `\`, an escaped `\\`, or `/`. */
const SEP = String.raw`(?:\\\\|\\|/)`;

const _escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const _clean = (value) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().normalize("NFC");
  return trimmed.length >= MIN_IDENTITY_LENGTH ? trimmed : undefined;
};

/** Runs `read`, and turns a throw into undefined: a missing value is dropped, never fatal. */
const _attempt = (read) => {
  try {
    return read();
  } catch {
    return undefined; // os.userInfo() throws for a user with no passwd entry (some containers).
  }
};

/**
 * Who runs this machine, as the masks need it. Never throws: an unset git key, an empty value or
 * one under 3 characters is left out. With every field missing, only the shapes are masked.
 */
export const ownerIdentity = (cwd = process.cwd()) => {
  const identity = {
    userName: _clean(_attempt(() => os.userInfo().username)),
    home: _clean(_attempt(() => os.homedir())),
    gitName: _clean(gitInOrNull(cwd, "config", "user.name") ?? undefined),
    gitEmail: _clean(gitInOrNull(cwd, "config", "user.email") ?? undefined),
  };
  return Object.fromEntries(Object.entries(identity).filter(([, value]) => value !== undefined));
};

/**
 * A folder in every spelling: `C:\Users\x`, `C:\\Users\\x`, `c:/users/x`, `/c/Users/x`, and
 * `/home/x` on Linux. A separator after it is eaten, so `…\x\Documents` reads `<name>/Documents`.
 * The home must not be followed by a name character. A project root must not be followed by one
 * either, nor by `-`, so a sibling repo (`cuisko-web`) is left alone: `sibling` selects that end.
 */
const _folderPattern = (folder, { sibling }) => {
  const parts = folder.split(/[\\/]+/).filter(Boolean);
  const drive = /^[A-Za-z]:$/.test(parts[0] ?? "") ? parts.shift()[0] : null;
  const start = drive === null ? "" : `(?:${drive}:|/${drive})`;
  const body = parts.map(_escape).join(SEP);
  const end = sibling ? String.raw`(?![\p{L}\p{N}_-]|\.[\p{L}\p{N}])` : `(?!${WORD})`;
  return new RegExp(`${start}${SEP}${body}(?:(${SEP})|${end})`, "giu");
};

const _homeRule = (home) => ({
  kind: "owner",
  pattern: _folderPattern(home, { sibling: false }),
  replace: (_match, separator) => (separator === undefined ? "~" : "~/"),
});

/**
 * `text` with the project root written `<repo>`, in every spelling. Run it before `mask`: the root
 * sits under the home folder, which `mask` would turn into `~/Documents\…\cuisko`, unrecognisable
 * as the root. The root is not personal; a path is shorter and the same on every machine.
 */
export const shortenRoot = (text, root) =>
  text
    .normalize("NFC")
    .replace(_folderPattern(root.normalize("NFC"), { sibling: true }), (_match, separator) =>
      separator === undefined ? "<repo>" : "<repo>/",
    );

/** The OS user name, only right after `Users` or `home` and a separator, or in a project folder name (`C--Users-x-`). */
const _userNameRule = (userName) => ({
  kind: "owner",
  pattern: new RegExp(`(?<=(?:^|[^\\p{L}\\p{N}])(?:users|home)(?:${SEP}|-))${_escape(userName)}(?!${WORD})`, "giu"),
  replace: () => "[owner]",
});

/** A git name or email, as free text, without case. */
const _freeTextRule = (value) => ({
  kind: "owner",
  pattern: new RegExp(`(?<!${WORD})${_escape(value)}(?!${WORD})`, "giu"),
  replace: () => "[owner]",
});

const _secret = (pattern) => ({ kind: "secret", pattern, replace: () => "[secret masked]" });

/**
 * Key and token formats, by prefix, so a Convex id or a commit hash never matches. The last one
 * is an env-style assignment (`MEMORY_KEY=…`): its name stays, its value goes.
 */
const SECRET_RULES = [
  _secret(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g),
  _secret(/(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/g), // Anthropic, OpenAI
  _secret(/(?<![A-Za-z0-9])(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/g), // Stripe
  _secret(/(?<![A-Za-z0-9])gh[pousr]_[A-Za-z0-9]{36,}/g), // GitHub
  _secret(/(?<![A-Za-z0-9])github_pat_[A-Za-z0-9_]{22,}/g),
  _secret(/(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/g), // AWS
  _secret(/(?<![A-Za-z0-9])AIza[0-9A-Za-z_-]{35}/g), // Google
  _secret(/(?<![A-Za-z0-9])xox[abprs]-[A-Za-z0-9-]{10,}/g), // Slack
  _secret(/(?<![A-Za-z0-9])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g), // JWT
  _secret(/(?<![A-Za-z0-9])(?:prod|dev|preview|project):[a-z0-9-]+\|[A-Za-z0-9+/=_-]{20,}/g), // Convex deploy key
  {
    kind: "secret",
    pattern: /(?<![A-Za-z0-9_])([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|_KEY)\s*[=:]\s*["']?)[A-Za-z0-9+/=_-]{16,}/g,
    replace: (_match, name) => `${name}[secret masked]`,
  },
];

const EMAIL_RULE = {
  kind: "email",
  pattern: /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?![A-Za-z0-9-])/g,
  replace: () => "[email masked]",
};

/**
 * A French number (`06 12 34 56 78`, `06.12.34.56.78`, `0612345678`) or an international one
 * (`+33 6 12 34 56 78`, `+1 415 555 2671`). A date, a version string or a timestamp never starts
 * with `0[1-9]` and holds ten digits in pairs, nor with `+`.
 */
const PHONE_RULE = {
  kind: "phone",
  pattern: /(?<![\w+.-])(?:\+\d{1,3}[ .-]?(?:\(0\)[ .-]?)?\d(?:[ .-]?\d){6,13}|0[1-9](?:[ .-]?\d{2}){4})(?![\w.-]*\d)/g,
  replace: () => "[phone masked]",
};

/**
 * Every rule, in the order both functions apply them: the owner first (an owner email is
 * `[owner]`, not `[email masked]`), the home before the user name inside it, the secrets before
 * the phone (a key holds digit runs).
 */
const _rules = (identity) => [
  ...(identity.home ? [_homeRule(identity.home.normalize("NFC"))] : []),
  ...(identity.userName ? [_userNameRule(identity.userName.normalize("NFC"))] : []),
  ...(identity.gitEmail ? [_freeTextRule(identity.gitEmail.normalize("NFC"))] : []),
  ...(identity.gitName ? [_freeTextRule(identity.gitName.normalize("NFC"))] : []),
  ...SECRET_RULES,
  EMAIL_RULE,
  PHONE_RULE,
];

/** `text` with every hit replaced: `[email masked]`, `[phone masked]`, `[secret masked]`, `[owner]`, the home as `~`. */
export const mask = (text, identity) =>
  _rules(identity).reduce((current, rule) => current.replace(rule.pattern, rule.replace), text.normalize("NFC"));

/**
 * Every hit, with its kind, the matched text and its 1-based line. A line is masked rule by rule
 * as it is scanned, so one value is reported once.
 */
export const scan = (text, identity) => {
  const rules = _rules(identity);
  return text
    .normalize("NFC")
    .split("\n")
    .flatMap((raw, index) => {
      const hits = [];
      let current = raw;
      for (const rule of rules) {
        for (const found of current.matchAll(rule.pattern)) hits.push({ kind: rule.kind, match: found[0], line: index + 1 });
        current = current.replace(rule.pattern, rule.replace);
      }
      return hits;
    });
};
