import { Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";

/**
 * Opens a web page in the in-app browser, so closing it lands the cook back where they tapped.
 *
 * The same call opens a tab on web. When it cannot open (a sheet already presenting, a phone with
 * no browser able to host one), the system opens the page instead, so the tap is never lost.
 */
export const openInBrowser = (url: string) => {
  WebBrowser.openBrowserAsync(url)
    .catch(() => Linking.openURL(url))
    .catch((cause) => { if (__DEV__) console.warn("[openInBrowser] could not open", url, cause); });
};
