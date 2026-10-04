import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";

import { rejectionCodeOf } from "../../__tests__/convexError.fixtures";
import { httpsDownloadVideo } from "../httpsGet";

/**
 * `node:https` replaced by a server that streams a video with no declared size, and that, once the
 * request is destroyed, reports the response's abort BEFORE the request's own error: the order in
 * which Node may deliver them, and the one that used to turn our refusal into a network failure.
 */
const MAX_BYTES = 1_000;

vi.mock("node:https", () => ({
  request: (_options: unknown, onResponse: (response: PassThrough) => void) => {
    const req = new EventEmitter() as EventEmitter & { destroy: (error: Error) => void; end: () => void };
    const response = Object.assign(new PassThrough(), {
      statusCode: 200,
      headers: { "content-type": "video/mp4" } as Record<string, string>,
    });

    req.destroy = (error) => {
      response.destroy(new Error("aborted"));
      setTimeout(() => req.emit("error", error), 5);
    };
    req.end = () => {
      onResponse(response);
      response.write(Buffer.alloc(MAX_BYTES / 2));
      response.write(Buffer.alloc(MAX_BYTES));
    };
    return req;
  },
}));

describe("httpsDownloadVideo", () => {
  it("is VIDEO_TOO_LARGE past the cap, even when the aborted response reports first", async () => {
    const download = httpsDownloadVideo("https://cdn.example.test/v.mp4", {}, { maxBytes: MAX_BYTES });

    expect(await rejectionCodeOf(download)).toBe("VIDEO_TOO_LARGE");
  });
});
