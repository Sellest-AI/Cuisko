import { callToolResult, type ContentBlock } from "@convex-dev/mcp";

/** A cover is about 20 KB from a CDN: a host this slow is down, and the cook is waiting on the recipe. */
const IMAGE_TIMEOUT_MS = 3000;

/** Fifty times a cover. Past it the file is not one, and a model would pay for it as input. */
const MAX_IMAGE_BYTES = 1024 * 1024;

/** `Buffer` is Node's, and a tool runs in an HTTP action. Byte by byte, so a long file cannot overflow a spread. */
const _base64Of = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary);
};

const _startsWith = (bytes: Uint8Array, text: string, at = 0) =>
  [...text].every((character, index) => bytes[at + index] === character.charCodeAt(0));

/** Read from the file, because the image host labels every file `binary/octet-stream`. */
const _mimeTypeOf = (bytes: Uint8Array) => {
  if (_startsWith(bytes, "RIFF") && _startsWith(bytes, "WEBP", 8)) return "image/webp";
  if (_startsWith(bytes, "\xFF\xD8\xFF")) return "image/jpeg";
  if (_startsWith(bytes, "\x89PNG")) return "image/png";
  return null;
};

const _download = async (url: string, signal: AbortSignal) => {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Answered ${response.status}`);

  return new Uint8Array(await response.arrayBuffer());
};

const _imageBlock = async (url: string): Promise<ContentBlock | null> => {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Timed out"));
    }, IMAGE_TIMEOUT_MS);
  });

  try {
    const bytes = await Promise.race([_download(url, controller.signal), timeout]);
    const mimeType = _mimeTypeOf(bytes);

    if (mimeType === null || bytes.length > MAX_IMAGE_BYTES) {
      console.error("MCP image not usable", { url, bytes: bytes.length });
      return null;
    }

    return { type: "image", data: _base64Of(bytes), mimeType };
  } catch (error) {
    console.error("MCP image download failed", { url, error });
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * A tool's answer with a picture attached, because agents' chats do not load pictures from a link.
 * The result itself still goes out as text and `structuredContent`, which `returns` checks. No
 * `imageUrl` means nothing is downloaded, and an image that cannot be read costs the picture and
 * never the result, which is what the cook asked for.
 */
export const withImage = async (result: Record<string, unknown>, imageUrl: string | undefined) => {
  const image = imageUrl ? await _imageBlock(imageUrl) : null;

  return callToolResult({
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }, ...(image ? [image] : [])],
    structuredContent: result,
  });
};
