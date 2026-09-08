export const parseReplicateRunOutput = async (output: object) => {
  // Output is an array of FileOutput objects
  const outputs = Array.isArray(output) ? output : [output];

  return await Promise.all(outputs.map(async (fileOutput: {
    url: () => Promise<{ href: string }>,
    blob: () => Promise<Blob>
  }) => {
    return {
      toBuffer: async () => {
        const blob = await fileOutput.blob();
        return Buffer.from(await blob.arrayBuffer());
      },
      toUrl: async () => {
        const url = await fileOutput.url();
        return (url.href ?? url) as string;
      }
    }
  }));
}
