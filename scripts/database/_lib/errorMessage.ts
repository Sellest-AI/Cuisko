/** A thrown value as a line a script can log. */
export const errorMessageOf = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);

  // `ConvexHttpClient` throws the response body as the message, and a gateway timeout has none.
  return message.trim() || "the deployment answered with an error and no message (a timeout, usually)";
};
