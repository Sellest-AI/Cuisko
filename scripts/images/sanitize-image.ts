import runpodSdk from "runpod-sdk";
import * as z from "zod/v4";
import fs from "node:fs";
import path from "node:path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config({ path: ".env.local" });

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;

if (!RUNPOD_API_KEY) {
  throw new Error("RUNPOD_API_KEY environment variable is not set");
}

const runpod = runpodSdk(RUNPOD_API_KEY);
const endpoint = runpod.endpoint("e53gyrt44m46b6");

const outputSchema = z.object({
  url: z.string(),
  position: z.object({
    left: z.number(),
    top: z.number(),
    width: z.number(),
    height: z.number(),
  }),
});

type Output = z.infer<typeof outputSchema>;

async function removeBackground(base64: string): Promise<Output> {
  if (!endpoint) throw new Error("RunPod endpoint is not initialized");

  const result = await endpoint.runSync({
    input: {
      image_data_url: base64,
    },
  });

  const parsed = outputSchema.safeParse(result?.output);

  if (!parsed.success) {
    throw new Error(
      `RunPod removeBackground returned no usable output ` +
      `(status: ${result?.status ?? "unknown"}): ${parsed.error.message}`
    );
  }

  return parsed.data;
}

const loadImage = async (dirName = __dirname) => {
  const files = fs.readdirSync(dirName);

  const imageFile = files.find((file) => {
    const ext = path.extname(file).toLowerCase();

    return (
      [".png", ".jpg", ".jpeg", ".webp"].includes(ext) &&
      file !== "output.png"
    );
  });

  if (!imageFile) {
    throw new Error("No image found in the folder");
  }

  const imagePath = path.join(dirName, imageFile);
  const imageData = fs.readFileSync(imagePath);
  return imageData;
}

async function main() {
  const imageData = await loadImage(__dirname);

  const base64 = `data:image/png;base64,${imageData.toString("base64")}`;

  console.log("Sending image to RunPod...");

  const result = await removeBackground(base64);

  console.log("Received result:", result.position);

  console.log("Cropping image...");

  const { cropImageFromBuffer } = await import("../../convex/lib/media/image.crop");

  const buffer = Buffer.from(result.url, "base64");

  const croppedImage = await cropImageFromBuffer(buffer);

  console.log("Compressing image...");

  const { compressImage } = await import("../../convex/lib/media/image.compress");
  const compressedImage = await compressImage(croppedImage.buffer, {
    mimeType: "image/webp",
  })

  const outputPath = path.join(__dirname, "output.webp");
  fs.writeFileSync(outputPath, compressedImage.buffer);

  console.log(`Saved output to ${outputPath}`);
}

main().catch(console.error);
