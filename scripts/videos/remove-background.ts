import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";

/**
 * Sends extracted frames, one by one, to the local background remover and saves them as RGBA PNG.
 *
 *     npx tsx scripts/videos/remove-background.ts cuisko-cooking
 *     npx tsx scripts/videos/remove-background.ts cuisko-cooking --limit 3
 *     npx tsx scripts/videos/remove-background.ts cuisko-cooking --fresh
 *     npx tsx scripts/videos/remove-background.ts cuisko-cooking --frames 22-30,268-285
 *
 * Reads assets/videos/frames/<name>/*.png, writes assets/videos/frames/<name>-transparent/.
 * Frames already written are skipped, so an interrupted run resumes; --fresh redoes them all, and
 * --frames redoes only those (numbers as in the file names, ranges inclusive).
 * Needs the sellest background-remover container running (`docker compose up -d` in that repo),
 * which listens on http://localhost:4001.
 *
 * Edge strips: the model keeps the most salient object, so while Cuisko is half out of frame the
 * whole cauldron wins and he is dropped. For every frame where something has entered a strip along
 * the left or right edge, that strip is also cut out on its own, where he is the subject, and its
 * mask is merged into the frame's. "Something has entered" means the strip differs from the first
 * frame, which is the empty scene; a strip still empty is never sent, since a model shown a blank
 * crop tends to invent a shape in it.
 */

const FRAMES_DIR = path.join(__dirname, "..", "..", "assets", "videos", "frames");
const BASE_URL = "http://localhost:4001";
const CONTAINER = "background-remover-birefnet-api-1";
const MAX_ATTEMPTS = 3;

/**
 * A pixel has changed when a channel moved more than this from the empty scene; a strip has
 * something in it when more than STRIP_CHANGED_SHARE of its pixels have. Above the video's
 * compression noise, which leaves well under 1% of a still frame past this delta.
 */
const CHANGED_CHANNEL_DELTA = 40;
const STRIP_CHANGED_SHARE = 0.01;

type Strip = { side: "left" | "right"; left: number; width: number };
type Rgb = { data: Buffer; width: number; height: number };

const _parseFrames = (spec: string) => {
  const numbers = new Set<number>();
  for (const part of spec.split(",")) {
    const [first, last = first] = part.split("-").map(Number);
    for (let n = first!; n <= last!; n++) numbers.add(n);
  }
  return numbers;
};

const _sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The remover's fp16 inference intermittently hits "CUDA error: an illegal memory access", after
 * which every request fails until the process restarts.
 */
const _restartContainer = async () => {
  console.log("CUDA crashed, restarting the container...");
  execFileSync("docker", ["restart", CONTAINER], { stdio: "pipe" });
  for (;;) {
    try {
      if ((await fetch(`${BASE_URL}/models`)).ok) return;
    } catch (error) {
      // Refused while the server boots: the loop exists to wait that out.
      if (!(error instanceof TypeError)) throw error;
    }
    await _sleep(3000);
  }
};

/** The model's alpha for one PNG, one byte per pixel. */
const _alpha = async (png: Buffer, label: string, params: URLSearchParams): Promise<Buffer> => {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const body = new FormData();
    body.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), `${label}.png`);
    const response = await fetch(`${BASE_URL}/remove-background?${params}`, { method: "POST", body });
    const text = await response.text();
    if (response.ok) {
      const encoded = text.split(",", 2)[1]!;
      return sharp(Buffer.from(encoded, "base64")).ensureAlpha().extractChannel(3).raw().toBuffer();
    }
    if (!text.includes("CUDA error") || attempt === MAX_ATTEMPTS) {
      throw new Error(`${label}: ${response.status} ${text.slice(0, 500)}`);
    }
    await _restartContainer();
  }
  throw new Error("unreachable");
};

const _rgb = async (file: string): Promise<Rgb> => {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
};

const _hasEntered = (source: Rgb, empty: Rgb, strip: Strip) => {
  let changed = 0;
  for (let y = 0; y < source.height; y++) {
    for (let x = strip.left; x < strip.left + strip.width; x++) {
      const offset = (y * source.width + x) * 3;
      const delta = Math.max(
        Math.abs(source.data[offset]! - empty.data[offset]!),
        Math.abs(source.data[offset + 1]! - empty.data[offset + 1]!),
        Math.abs(source.data[offset + 2]! - empty.data[offset + 2]!),
      );
      if (delta > CHANGED_CHANNEL_DELTA) changed++;
    }
  }
  return changed / (strip.width * source.height) > STRIP_CHANGED_SHARE;
};

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      limit: { type: "string" },
      fresh: { type: "boolean", default: false },
      frames: { type: "string" },
      // lucida (the remover's default) drops Cuisko on most frames, matting on the frames where he enters.
      model: { type: "string", default: "general" },
      // sam and fill make everything inside the outline opaque, which closes the cauldron's handles.
      silhouette: { type: "string", default: "off" },
      // In source px. They stop short of the cauldron, so it never competes with Cuisko inside a strip.
      "left-strip": { type: "string", default: "320" },
      "right-strip": { type: "string", default: "320" },
    },
  });
  const name = positionals[0];
  if (!name) throw new Error("Usage: npx tsx scripts/videos/remove-background.ts <frames folder> [--frames 1-10,20] [--fresh] [--limit N]");

  const sourceDir = path.join(FRAMES_DIR, name);
  const outputDir = path.join(FRAMES_DIR, `${name}-transparent`);
  fs.mkdirSync(outputDir, { recursive: true });

  const allFrames = fs.readdirSync(sourceDir).filter((file) => file.endsWith(".png")).sort();
  if (allFrames.length === 0) throw new Error(`No frames in ${sourceDir}`);

  const empty = await _rgb(path.join(sourceDir, allFrames[0]!));
  const leftWidth = Number(values["left-strip"]);
  const rightWidth = Number(values["right-strip"]);
  const strips: Strip[] = [
    { side: "left" as const, left: 0, width: leftWidth },
    { side: "right" as const, left: empty.width - rightWidth, width: rightWidth },
  ].filter((strip) => strip.width > 0);

  let frames = values.limit ? allFrames.slice(0, Number(values.limit)) : allFrames;
  if (values.frames) {
    const wanted = _parseFrames(values.frames);
    frames = frames.filter((frame) => wanted.has(Number(path.parse(frame).name)));
  } else if (!values.fresh) {
    frames = frames.filter((frame) => !fs.existsSync(path.join(outputDir, frame)));
    if (frames.length === 0) {
      console.log(`Every frame is already in ${outputDir} (--fresh to redo them)`);
      return;
    }
  }

  const params = new URLSearchParams({ model: values.model, silhouette: values.silhouette });
  const started = performance.now();
  for (const frame of frames) {
    const frameStarted = performance.now();
    const label = path.parse(frame).name;
    const framePath = path.join(sourceDir, frame);
    const source = await _rgb(framePath);
    const alpha = await _alpha(fs.readFileSync(framePath), label, params);

    const merged: string[] = [];
    for (const strip of strips) {
      if (!_hasEntered(source, empty, strip)) continue;
      const crop = await sharp(framePath)
        .extract({ left: strip.left, top: 0, width: strip.width, height: source.height })
        .png()
        .toBuffer();
      const stripAlpha = await _alpha(crop, `${label}-strip`, params);
      for (let y = 0; y < source.height; y++) {
        for (let x = 0; x < strip.width; x++) {
          const target = y * source.width + strip.left + x;
          alpha[target] = Math.max(alpha[target]!, stripAlpha[y * strip.width + x]!);
        }
      }
      merged.push(strip.side);
    }

    await sharp(source.data, { raw: { width: source.width, height: source.height, channels: 3 } })
      .joinChannel(alpha, { raw: { width: source.width, height: source.height, channels: 1 } })
      .png()
      .toFile(path.join(outputDir, frame));
    const note = merged.length > 0 ? `  + ${merged.join(", ")} strip` : "";
    console.log(`${frame}  ${((performance.now() - frameStarted) / 1000).toFixed(2)}s${note}`);
  }

  const total = (performance.now() - started) / 1000;
  console.log(`${frames.length} frames in ${total.toFixed(1)}s (${(total / frames.length).toFixed(2)}s each) -> ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
