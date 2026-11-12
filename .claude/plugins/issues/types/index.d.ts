/** One draft in `.tmp/issues/`, as its card shows it: the labels from its header, the summary from its body. */
export type Draft = { file: string; title: string; labels: string[]; summary: string };

/** What the last click on a draft gave: running, the issue's URL, or the CLI's error. */
export type Outcome = { kind: 'running' } | { kind: 'created'; url: string } | { kind: 'error'; text: string };

/** An issue a click created, kept in the band with its link until the owner dismisses it. */
export type Created = { url: string; number: string; title: string };

declare module 'claude-code' {
  interface PluginState {
    issues: { drafts: Draft[]; outcomes: Record<string, Outcome>; created: Created[] };
  }
}
