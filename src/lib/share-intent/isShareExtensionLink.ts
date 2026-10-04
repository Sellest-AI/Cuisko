/**
 * The link iOS's share extension reopens the app on: `cuisko://dataUrl=cuiskoShareKey`, sometimes
 * with a fragment. Only at the root, so a page with a `dataUrl` of its own is not one.
 */
const _SHARE_EXTENSION = /^(?:[a-z][a-z0-9+.-]*:\/\/)?\/?dataUrl=/i;

/**
 * Whether a link opening the app is iOS's share extension handing over a share.
 *
 * It carries no route and none of what was shared (that is read from the native module by
 * `useOnSharedLink`): read as a route, `dataUrl=cuiskoShareKey` is a page that does not exist.
 */
export const isShareExtensionLink = (path: string): boolean => _SHARE_EXTENSION.test(path);
