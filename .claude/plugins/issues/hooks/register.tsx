/**
 * issues@sellest — a band above the prompt for each issue draft an agent wrote to `.tmp/issues/`.
 * Create issue runs `node scripts/github/create-issue.mjs <draft>`, which checks the draft, creates
 * the issue with the owner's own `gh` login and deletes the draft; Discard runs it with
 * `--discard`. The mod registers no tool and no command, so only the owner's click creates an
 * issue. Every rule lives in the CLI: the band only lists the drafts and shows what the CLI said.
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Created, Draft, Outcome } from '../types'

const DRAFTS = '.tmp/issues'
const CLI = 'scripts/github/create-issue.mjs'

const drafts = atom({ plugin: 'issues', key: 'drafts' } as const, [] as Draft[])
const outcomes = atom({ plugin: 'issues', key: 'outcomes' } as const, {} as Record<string, Outcome>)
const created = atom({ plugin: 'issues', key: 'created' } as const, [] as Created[])

// A copy of `HEADER` in scripts/github/_lib/issueDraft.mjs, which owns the draft format: the
// engine runs this module with no Node and no import outside the mod, so it cannot load that file.
const HEADER = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/
const SUMMARY_CHARS = 240

/** One header field, unquoted and unbracketed; empty when absent. */
const _field = (header: string, key: string) =>
  (new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(header)?.[1] ?? '').trim().replace(/^\[(.*)\]$/, '$1').replace(/^(["'])(.*)\1$/, '$2')

/**
 * What the card shows of a draft: its title (the file name when it has none), its labels, and the
 * text of its body's first section. Only a preview: the CLI checks the
 * draft and says what is wrong with it.
 */
const _preview = (text: string, file: string): Draft => {
  const match = HEADER.exec(text)
  const header = match?.[1] ?? ''
  const labels = [_field(header, 'type'), ..._field(header, 'areas').split(',')].map(label => label.trim()).filter(label => label !== '')
  // The first section of the form the draft follows: what happened, the problem, what needs doing.
  const body = (match === null ? text : text.slice(match[0].length)).replace(/^\s*#{1,6} [^\n]*\n/, '')
  const firstSection = body.split(/^#{1,6} /m)[0] ?? ''
  const prose = firstSection
    .split(/\r?\n/)
    .filter(line => line.trim() !== '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  const summary = prose.length > SUMMARY_CHARS ? `${prose.slice(0, SUMMARY_CHARS).trimEnd()}…` : prose
  return { file, title: _field(header, 'title') || file.slice(file.lastIndexOf('/') + 1), labels, summary }
}

/** Rereads `.tmp/issues/` under the project root; nothing when the folder is absent. */
const _scan = async ($: EngineInterface) => {
  const root = await $.session.root()
  const folder = `${root}/${DRAFTS}`
  const entries = (await $.fs.exists(folder)) ? await $.fs.list(folder) : []
  const found: Draft[] = []
  for (const entry of entries) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.md')) continue
    const file = `${DRAFTS}/${entry.name}`
    const text = await $.fs.read(`${folder}/${entry.name}`).catch((error: Error) => error)
    found.push(typeof text === 'string' ? _preview(text, file) : { file, title: entry.name, labels: [], summary: `The draft cannot be read: ${text.message}` })
  }
  await update($, drafts, () => found)
  // An error belongs to a draft: once the draft is gone, so is its error.
  await update($, outcomes, all => Object.fromEntries(Object.entries(all ?? {}).filter(([file]) => found.some(draft => draft.file === file))))
}

/** The drafts a CLI run is working on: a second press before the band redraws starts nothing. */
const inFlight = new Set<string>()

/** Runs the CLI on a draft and records what it said; the scan then drops a created draft. */
const _run = async ($: EngineInterface, file: string, { discard }: { discard: boolean }) => {
  if (inFlight.has(file)) return
  inFlight.add(file)
  try {
    await _runOnce($, file, { discard })
  } finally {
    inFlight.delete(file)
  }
}

const _runOnce = async ($: EngineInterface, file: string, { discard }: { discard: boolean }) => {
  const running: Outcome = { kind: 'running' }
  await update($, outcomes, all => ({ ...all, [file]: running }))
  const root = await $.session.root()
  const argv = ['node', CLI, ...(discard ? ['--discard'] : []), file]
  const result = await $.process.run(argv, { cwd: root, timeoutMs: 60_000 }).catch((error: Error) => ({ exitCode: 1, stdout: '', stderr: error.message }))
  const outcome: Outcome =
    result.exitCode !== 0
      ? { kind: 'error', text: result.stderr.trim() || `exit ${result.exitCode}` }
      : { kind: 'created', url: result.stdout.trim() }
  if (outcome.kind === 'created' && !discard) {
    // Kept in the band with its link: a notice in the chat is stored but not drawn on desktop.
    const title = (await read($, drafts)).find(draft => draft.file === file)?.title ?? 'Issue'
    const issue: Created = { url: outcome.url, number: /\/issues\/(\d+)$/.exec(outcome.url)?.[1] ?? '', title }
    await update($, created, all => [...(all ?? []), issue])
  }
  await update($, outcomes, all => {
    const next = { ...all }
    if (outcome.kind === 'error') next[file] = outcome
    else delete next[file]
    return next
  })
  await _scan($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await _scan($)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await _scan($)
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, drafts)
    const issues = (await read($, created)) ?? []
    if (e.props.hasSurvey || (list.length === 0 && issues.length === 0)) return next(e)

    const done = await read($, outcomes)
    const { Box, Button, Link, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column" gap="lg">
        {issues.map(issue => (
          <Box key={issue.url} paddingX="md" gap="sm" alignItems="center">
            <Text dimColor>Issue created</Text>
            <Link href={issue.url} label={`${issue.number === '' ? '' : `#${issue.number} `}${issue.title}`} />
            <Button
              key={`dismiss:${issue.url}`}
              variant="secondary"
              label="Dismiss"
              onPress={() => update($, created, all => (all ?? []).filter(other => other.url !== issue.url))}
            />
          </Box>
        ))}
        {list.map(draft => {
          // A draft stored by an older version of the mod has no labels or summary.
          const labels = draft.labels ?? []
          const outcome = done[draft.file]
          const isRunning = outcome?.kind === 'running'
          const press = (discard: boolean) => () => (isRunning ? undefined : _run($, draft.file, { discard }))
          return (
            <Box key={draft.file} flexDirection="column" padding="md" gap="lg">
              <Box flexDirection="column" gap="xs">
                <Text dimColor>Issue draft{labels.length > 0 ? ` · ${labels.join(' · ')}` : ''}</Text>
                <Text bold>{draft.title}</Text>
                {draft.summary ? <Text>{draft.summary}</Text> : null}
                {outcome?.kind === 'error' ? <Text color="red">{outcome.text}</Text> : null}
              </Box>
              <Box gap="sm">
                <Button key={`create:${draft.file}`} variant="primary" label={isRunning ? 'Creating…' : 'Create issue'} onPress={press(false)} />
                <Button key={`discard:${draft.file}`} variant="secondary" label="Discard" onPress={press(true)} />
              </Box>
            </Box>
          )
        })}
      </Box>
    )
  })
}
