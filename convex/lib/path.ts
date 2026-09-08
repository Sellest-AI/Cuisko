"use node"
import { join } from "path";
export { normalize } from "path";

export const tmpPath = (fileName?: string) => join(process.cwd(), "/public/", "/.tmp/", fileName ?? "");

/** Retrieve the file path and remove the file name */
export const getFilePath = (filePath: string) => filePath.replaceAll("\\", "/").split("/").slice(0, -1).join("/");

/** Retrieve filename from path */
export const getFileName = (path: string) => path.replaceAll("\\", "/").split("/").pop() ?? "unknown";

/** Retrieve filename from path without extension */
export const getFileNameWithoutExtension = (path: string) => path.replaceAll("\\", "/").split("/").pop()?.split(".").slice(0, -1).join(".") ?? "unknown";

/** Retrieve extension from path or file name */
export const getFileExtension = (path: string) => path.split(".").pop() ?? "unknown";

export const normalizeSlash = (path: string) => path.normalize().replaceAll("\\", "/").replaceAll("//", "/").replaceAll("//", "/");

export const getFileExtensionFromMime = (mime: string) => mime.split("/").pop() ?? "unknown";
