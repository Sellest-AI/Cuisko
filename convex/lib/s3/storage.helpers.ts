const FOLDERS = {
  getFromKey: (key: string) => key.split("/").slice(0, -1).join("/"),
  USER: (id: string) => `users/${id}`,
  PUBLIC: `public`,
};

export const S3 = {
  FOLDERS: FOLDERS,
}
