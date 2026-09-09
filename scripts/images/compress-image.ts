import fs from "node:fs";
import path from "node:path";

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

  console.log("Cropping image...");

  const { cropImageFromBuffer } = await import("../../convex/lib/media/image.crop");

  const croppedImage = await cropImageFromBuffer(imageData);

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
