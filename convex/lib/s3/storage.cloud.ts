import { CopyObjectCommand, DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl as getS3SignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "../nanoid";
import { S3 } from "./storage.helpers";
import { getFileExtensionFromMime, normalizeSlash } from "../path";
import { env } from "../../env";

// Create an S3 client
const S3_REGION = env.S3_ENDPOINT.split(".")[1];
const S3_URL = env.S3_ENDPOINT.startsWith("https://") ? env.S3_ENDPOINT : `https://${env.S3_ENDPOINT}`;
const s3Client = new S3Client({
  endpoint: S3_URL, // Replace with your Backblaze endpoint
  region: S3_REGION, // Specify your region if required
  credentials: {
    accessKeyId: env.S3_APP_KEY_ID,
    secretAccessKey: env.S3_APP_KEY,
  },
});

const sanitizeS3Path = <T extends string | undefined>(directory: T): T =>
  (directory?.replaceAll("\\", "/").startsWith("/") ? normalizeSlash(directory.slice(1)).trim() :
    directory ? normalizeSlash(directory).trim() :
      undefined) as T;

/**
 * Generate a signed URL for uploading a file to S3.
 * @param folder - Folder path where the file will be uploaded.
 * @param mimeType - MIME type of the file. If not provided, the file extension will be empty.
 * Example: `image/png` or `image/jpeg`.
 * @returns Signed URL.
 */
async function getSignedUrl(folder: string, mimeType?: string) {
  const extension = mimeType ? getFileExtensionFromMime(mimeType) : "";
  const key = sanitizeS3Path(`${folder}/${nanoid()}${extension ? `.${extension}` : ""}`);

  const command = new PutObjectCommand({
    Bucket: env.S3_DEFAULT_BUCKET, // Your bucket name
    Key: key,
    ContentType: mimeType, // Allowed content type
  });

  // Generate a signed URL
  const signedUrl = await getS3SignedUrl(s3Client, command, { expiresIn: 60 * 5 });
  return { url: signedUrl, key };
}

async function updateCacheControl(key: string) {
  try {
    // Replace the object's metadata to set Cache-Control
    const command = new CopyObjectCommand({
      Bucket: env.S3_DEFAULT_BUCKET,
      Key: key,
      CopySource: `${env.S3_DEFAULT_BUCKET}/${key}`,
      CacheControl: "public, max-age=31536000, immutable", // Set Cache-Control
      MetadataDirective: "REPLACE", // Required to overwrite metadata
    });

    await s3Client.send(command);
    return true;
  } catch {
    return false;
  }
}

type File = {
  buffer: Buffer<ArrayBufferLike>;
  /** example: image/webp */
  mimeType: string;
}

/**
 * Upload a file directly to S3.
 * @param file - File to upload.
 * @param directory - Directory to upload the file to.
 * @returns Upload result.
 */
async function uploadFile(file: File, directory?: string) {
  const extension = file.mimeType ? getFileExtensionFromMime(file.mimeType) : "";
  const key = sanitizeS3Path(`${directory}/${nanoid()}.${extension}`);

  const command = new PutObjectCommand({
    Bucket: env.S3_DEFAULT_BUCKET,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimeType,
    CacheControl: "public, max-age=31536000, immutable",
  });

  try {
    const response = await s3Client.send(command);
    return { key, location: `${S3_URL}/${env.S3_DEFAULT_BUCKET}/${key}`, ...response };
  } catch (error: unknown) {
    throw new Error(`Failed to upload file: ${error as string}`);
  }
}

/**
 * Delete a file from S3.
 * @param key - Key of the file to delete.
 */
const deleteFile = async (key: string) => {
  // Delete the file from the bucket
  const command = new DeleteObjectCommand({
    Bucket: env.S3_DEFAULT_BUCKET,
    Key: key,
  });
  await s3Client.send(command);
}

// StorageCloud class
export class StorageCloud {
  static FOLDERS = S3.FOLDERS;
  static updateCacheControl = updateCacheControl;
  static getSignedUrl = getSignedUrl;
  static deleteFile = deleteFile;
  static uploadFile = uploadFile;
}
