import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import ffmpeg from "ffmpeg-static";
import sharp from "sharp";

/**
 * Splits a video from assets/videos/ into numbered PNG frames, ready for background removal.
 *
 *     npx tsx scripts/videos/extract-frames.ts cuisko-cooking.mp4
 *     npx tsx scripts/videos/extract-frames.ts cuisko-cooking.mp4 --whiten
 *
 * Writes assets/videos/frames/<video name>/0001.png ... (gitignored), and beside that folder
 * <video name>.json with the video's frame rate and size, which bundle-frames.ts reads as the
 * rate the frames were extracted at.
 *
 * --whiten maps the background grey the generator adds (~#DFDFDF) to pure #FFFFFF. It measures the
 * background from the four corners of the first frame and multiplies every frame by the gain that
 * makes it white, which also brightens the subject by the same ratio.
 */

const VIDEOS_DIR = path.join(__dirname, "..", "..", "assets", "videos");
const CORNER_SIZE = 16;

export type SourceInfo = { fps: number; width: number; height: number };

/** ffmpeg prints the stream line to stderr and exits 1 when given no output, so both are expected. */
const _probe = (video: string): SourceInfo => {
  let output = "";
  try {
    execFileSync(ffmpeg!, ["-hide_banner", "-i", video], { stdio: "pipe" });
  } catch (error) {
    output = String((error as { stderr?: Buffer }).stderr ?? "");
  }
  // e.g. "Stream #0:0: Video: h264 (High), yuv420p, 960x960, 2817 kb/s, 30 fps, 30 tbr"
  const size = /Video:.*?\b(\d{2,5})x(\d{2,5})\b/.exec(output);
  const fps = /, ([\d.]+) fps/.exec(output);
  if (!size || !fps) throw new Error(`Could not read the video stream from ffmpeg:\n${output}`);
  return { fps: Number(fps[1]), width: Number(size[1]), height: Number(size[2]) };
};

const _backgroundLevel = async (frame: string) => {
  const { data, info } = await sharp(frame).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const values: number[] = [];
  const corners = [
    [0, 0],
    [info.width - CORNER_SIZE, 0],
    [0, info.height - CORNER_SIZE],
    [info.width - CORNER_SIZE, info.height - CORNER_SIZE],
  ] as const;
  for (const [left, top] of corners) {
    for (let y = top; y < top + CORNER_SIZE; y++) {
      for (let x = left; x < left + CORNER_SIZE; x++) {
        const offset = (y * info.width + x) * 3;
        values.push(data[offset]!, data[offset + 1]!, data[offset + 2]!);
      }
    }
  }
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)]!;
};

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { whiten: { type: "boolean", default: false } },
  });
  const file = positionals[0];
  if (!file) throw new Error("Usage: npx tsx scripts/videos/extract-frames.ts <video in assets/videos/> [--whiten]");
  if (!ffmpeg) throw new Error("ffmpeg-static has no binary for this platform");

  const video = path.join(VIDEOS_DIR, file);
  if (!fs.existsSync(video)) throw new Error(`No video at ${video}`);

  const name = path.parse(file).name;
  const outputDir = path.join(VIDEOS_DIR, "frames", name);
  // Emptied first, so a shorter re-export leaves no frame of the previous one behind.
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const info = _probe(video);
  execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", video, path.join(outputDir, "%04d.png")]);
  fs.writeFileSync(path.join(VIDEOS_DIR, "frames", `${name}.json`), `${JSON.stringify(info, null, 2)}\n`);

  const frames = fs.readdirSync(outputDir).filter((frame) => frame.endsWith(".png")).sort();

  if (values.whiten) {
    const level = await _backgroundLevel(path.join(outputDir, frames[0]!));
    const gain = 255 / level;
    console.log(`Background level ${level}, gain ${gain.toFixed(3)}`);
    for (const frame of frames) {
      const framePath = path.join(outputDir, frame);
      const whitened = await sharp(framePath).linear(gain, 0).png().toBuffer();
      fs.writeFileSync(framePath, whitened);
    }
  }

  console.log(`${frames.length} frames at ${info.fps} fps (${info.width}x${info.height}) -> ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
