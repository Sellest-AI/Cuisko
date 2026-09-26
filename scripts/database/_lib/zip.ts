/**
 * The zip read and written by the export and restore scripts: JSON documents and image files, each
 * at a path inside it.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

/**
 * The zip bytes: every document in `json` as indented JSON, every file in `images` as it is.
 *
 * Images are stored, not deflated (`level: 0`): they are already compressed, and deflating them
 * again costs time for nothing. The JSON is text, and is.
 */
export const zipOf = (json: Record<string, unknown>, images: Record<string, Uint8Array>): Uint8Array => {
  const entries: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  for (const [file, value] of Object.entries(json)) {
    entries[file] = [strToU8(`${JSON.stringify(value, null, 2)}\n`), { level: 6 }];
  }
  for (const [file, bytes] of Object.entries(images)) entries[file] = [bytes, { level: 0 }];

  return zipSync(entries);
};

export type OpenedZip = {
  /** The document at `file`, parsed, unchecked: the caller knows what it should be. */
  json: (file: string) => unknown;
  bytes: (file: string) => Uint8Array;
};

/**
 * A zip `zipOf` wrote, read back. A file that is not in it throws, naming the path: the zip was
 * edited by hand, and a restore should stop rather than restore part of what was asked.
 */
export const openZip = (zip: Uint8Array): OpenedZip => {
  const entries = unzipSync(zip);
  const bytes = (file: string) => {
    const entry = entries[file];
    if (!entry) throw new Error(`${file} is not in the zip`);

    return entry;
  };

  return { bytes, json: (file) => JSON.parse(strFromU8(bytes(file))) };
};

/**
 * An export's file name: `<kind>-dev-happy-otter-123-2026-09-21.zip`.
 *
 * The deployment's colon becomes a dash, because a colon is not allowed in a Windows file name.
 */
export const zipNameOf = (kind: string, deployment: string, exportedAt: string): string =>
  `${kind}-${deployment.replace(":", "-")}-${exportedAt.slice(0, 10)}.zip`;
