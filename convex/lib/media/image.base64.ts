export const bufferToBase64 = (buffer: Buffer) => buffer.toString("base64");
export const removeBase64Header = (base64: string) => base64.replace(/^data:image\/\w+;base64,/, "").trim()
export const addBase64Header = (base64: string, type: "webp" | "png") => {
  if (!base64.startsWith("data:")) return `data:image/${type};base64,${base64}`;
  return base64;
}
