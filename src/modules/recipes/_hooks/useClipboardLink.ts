import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";

import { clipboardLinkOf } from "../_model/clipboardLink";

/** What a check learned: whether to offer the paste, and the link if it had to read to know. */
type ClipboardCheck = { hasLink: boolean; link?: string };

/**
 * What the clipboard holds. Failing to read it reads as holding nothing: the offer is a shortcut,
 * and the field under it still takes a link typed or pasted by hand.
 */
const _readClipboard = (): Promise<string> =>
  (Platform.OS === "ios" ? _readPasteboard() : Clipboard.getStringAsync()).catch(() => "");

/**
 * The text, which is where a link inside a sentence lives, or the URL of a copy that has no text.
 * One read or the other, never both: the second would raise the alert again on a cook who just
 * refused it.
 *
 * @limitation A copy holding a URL and HTML but no plain text reads as empty, and the offer goes.
 * **Accepted because** `hasStringAsync` cannot tell it from text, and trying the URL as well would
 * raise a second alert on a cook who refused the first. **Until fixed**, the cook pastes by hand.
 */
const _readPasteboard = async (): Promise<string> =>
  (await Clipboard.hasStringAsync()) ? Clipboard.getStringAsync() : ((await Clipboard.getUrlAsync()) ?? "");

/**
 * Whether to offer the paste, asked differently per platform because reading is not free.
 *
 * - **iOS** must not read to answer: since iOS 16 a read raises the system's "Allow Paste" alert,
 *   and a sheet that opens on an alert is hostile. `hasWebLinkAsync`, which `patches/` adds to
 *   `expo-clipboard`, runs the pasteboard's detection, which finds a link alone or inside a sentence
 *   and reports only that, so the alert waits for the cook's tap.
 * - **Android** has no such question and has to read, as `clipboardLinkOf` needs the text.
 * - **Web** is left out: `readText` opens a permission prompt, and the shortcut is not worth one on
 *   a keyboard that has Ctrl+V.
 *
 * @limitation Android 12+ shows its "pasted from your clipboard" toast when the sheet opens, and on
 * each return to it, whenever text is copied. **Accepted because** it has no way to ask whether text
 * holds a link without reading it, and no offer at all costs more than a toast. **The fix** is a
 * check on the clip's metadata, if Android ever exposes one.
 *
 * @limitation A copied `mailto:` or `tel:` counts as a link on iOS: the cook gets the alert for
 * nothing before `readLink` withdraws the offer. **Accepted because** the check can only see that a
 * URL is there, and leaving URL copies out would risk missing real links. **The fix** is to look at
 * the URL's scheme natively, if a device shows this happens often.
 */
const _checkClipboard = async (): Promise<ClipboardCheck> => {
  if (Platform.OS === "ios") return { hasLink: await Clipboard.hasWebLinkAsync().catch(() => false) };
  if (Platform.OS !== "android") return { hasLink: false };

  const link = clipboardLinkOf(await _readClipboard());
  return { hasLink: link !== undefined, link };
};

/**
 * Whether the clipboard holds a link for the import screen, and the way to read it.
 *
 * Checked when the screen opens and each time the app comes back, because the sheet stays open
 * behind the app the cook left to copy the link. "Away" is any time the app lost the cook, the
 * background or just a pane beside it. iOS reports that as `inactive` or `background`; Android as
 * `blur`, and it checks on `focus`, which comes after `active`: until then the system hands the app
 * an empty clipboard. Those two events are Android's alone, and subscribing to them on the web
 * throws.
 *
 * iOS's paste alert also goes through `inactive`, so that one does not count as away: a check as it
 * closes would hand back the offer `readLink` just withdrew. For the same reason a read drops any
 * check still running.
 *
 * `hasLink` is only a promise on iOS, where the system's detector answered and not `clipboardLinkOf`.
 * `readLink` is what settles it, so a bare `marmiton.org` the detector took for a link withdraws the
 * offer. On Android the check already read the link, and it stays true until the cook leaves, the
 * only way the clipboard can change, so `readLink` hands that over: a second read would be a second
 * toast.
 */
export const useClipboardLink = () => {
  const [hasLink, setHasLink] = useState(false);
  const checkedLink = useRef<string | undefined>(undefined);
  const latestCheck = useRef(0);
  const isReading = useRef(false);

  useEffect(() => {
    const check = async () => {
      latestCheck.current += 1;
      const thisCheck = latestCheck.current;

      const { hasLink: found, link } = await _checkClipboard();
      if (thisCheck !== latestCheck.current) return;

      checkedLink.current = link;
      setHasLink(found);
    };

    let wasAway = false;
    const leave = () => {
      if (!isReading.current) wasAway = true;
    };
    const comeBack = () => {
      if (!wasAway) return;

      wasAway = false;
      void check();
    };

    void check();

    const subscriptions =
      Platform.OS === "android"
        ? [AppState.addEventListener("blur", leave), AppState.addEventListener("focus", comeBack)]
        : [AppState.addEventListener("change", (next) => (next === "active" ? comeBack() : leave()))];

    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);

  const readLink = useCallback(async () => {
    if (checkedLink.current) return checkedLink.current;

    latestCheck.current += 1;
    isReading.current = true;
    const link = clipboardLinkOf(await _readClipboard());
    isReading.current = false;

    if (!link) setHasLink(false);

    return link;
  }, []);

  return { hasLink, readLink };
};
