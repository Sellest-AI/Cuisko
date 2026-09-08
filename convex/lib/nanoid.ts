type Options = {
  alphabet?: string;
}

export const nanoid = (length: number = 21, options?: Options): string => {
  const alphabet = options?.alphabet || "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let id = "";

  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);

  for (let i = 0; i < length; i++) {
    id += alphabet[(randomValues[i] ?? 0) % alphabet.length];
  }

  return id;
}
