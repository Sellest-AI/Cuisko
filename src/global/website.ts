/**
 * Where Cuisko lives outside the app: the pages the stores require us to link, and the address
 * that answers.
 *
 * Every page here is served by the marketing site, not by the app. The app links them; it never
 * restates what they say, so the policy has one text and the site owns it.
 */
export const WEBSITE = {
  URL: "https://cuisko.app",
  TERMS_OF_USE: "https://cuisko.app/policies/terms-of-use",
  PRIVACY_POLICY: "https://cuisko.app/policies/privacy-policy",
  /** The same address, for a phone with no mail app to hand a `mailto:` to. */
  CONTACT: "https://cuisko.app/contact",
  SUPPORT_EMAIL: "support@cuisko.app",
} as const;
