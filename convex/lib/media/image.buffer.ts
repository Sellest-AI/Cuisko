export const imageBufferFromUrl = async (base64orUrl: string) => {
  // Check if the string is a URL
  if (base64orUrl.startsWith("http://") || base64orUrl.startsWith("https://")) {
    // It's a URL, fetch the image and convert to buffer
    const response = await fetch(base64orUrl);
    if (!response.ok) {
      throw new Error("Failed to fetch the image");
    }
    return Buffer.from(await response.arrayBuffer());
  }

  // It’s a base64 string, convert it to buffer
  const base64Data = base64orUrl.replace(/^data:image\/\w+;base64,/, ""); // Remove base64 prefix
  return Buffer.from(base64Data, "base64");
}
