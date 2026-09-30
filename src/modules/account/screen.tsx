import { useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { type Href, router } from "expo-router";

import { ButtonIcon } from "@ui/button-icon";
import { ButtonPill } from "@ui/button-pill";
import { LogOut, X } from "@ui/icons";
import { AnimatePresence, m } from "@ui/motion";
import { useSafeAreaInsets } from "@ui/safe-area-view";
import { theme } from "theme";
import { useTranslations } from "translations";
import { useAuth } from "~/modules/auth/hooks";
import { HouseholdList } from "~/modules/households/household-list";

import { AccountIdentity } from "./screen.identity";
import { AccountQuickAccess } from "./screen.quick-access";
import { LinearGradient } from "expo-linear-gradient";

/** Room left on the right, so the page behind stays visible and there is somewhere to tap out. */
const PAGE_PEEK = 24;
const MAX_WIDTH = 400;
const SLIDE = { type: "timing", duration: 250 } as const;

/**
 * The account drawer: who you are, where you cook, and the way out.
 *
 * It slides in from the left over the page it was opened from, and a tap on what is still visible
 * of that page closes it. The route is presented transparent, so the slide is drawn here: the panel
 * leaves first, and the route is popped once it is gone, not before.
 */
export const AccountScreen = () => {
  const t = useTranslations("Account");
  const { signOut } = useAuth();
  const { width } = useWindowDimensions();
  const [isOpen, setIsOpen] = useState(true);

  const panelWidth = Math.min(width - PAGE_PEEK, MAX_WIDTH);
  const close = () => setIsOpen(false);

  /**
   * Where the panel is headed once it has slid out: nowhere (back to the page) or a destination.
   * One navigation, fired by the exit animation. A timer racing the exit's own `router.back()`
   * either popped the destination or replaced the page underneath the drawer.
   */
  const destination = useRef<Href | null>(null);

  /** Replaces the drawer rather than stacking on it, so back from there returns to the page. */
  const go = (href: Href) => {
    destination.current = href;
    close();
  };

  const onClosed = () => {
    if (destination.current) router.replace(destination.current);
    else router.back();
  };

  /** No navigation here: once the session is gone, `AuthGate` sends the page to `/auth`. */
  const onSignOut = () => {
    signOut().catch((cause) => { if (__DEV__) console.warn("[AccountScreen] sign-out failed", cause); });
  };

  const { top, bottom } = useSafeAreaInsets();

  return (
    <View style={StyleSheet.absoluteFill}>
      <AnimatePresence onExitComplete={onClosed}>
        {isOpen && (
          <m.View
            key="backdrop"
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={SLIDE}
            style={[StyleSheet.absoluteFill, styles.backdrop]}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={close} />
          </m.View>
        )}
        {isOpen && (
          <m.View
            key="panel"
            from={{ translateX: -panelWidth }}
            animate={{ translateX: 0 }}
            exit={{ translateX: -panelWidth }}
            transition={SLIDE}
            style={[styles.panel, { width: panelWidth }]}
          >
            <View style={[styles.safeArea,]}>
              <LinearGradient
                colors={[theme.colors.neutral.subtle, theme.colors.background]}
                style={[StyleSheet.absoluteFill, { height: 500 }]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
              />
              <ScrollView
                contentContainerStyle={[styles.content,
                { paddingBottom: Math.max(styles.content.paddingBottom, bottom) },
                Platform.OS === "android" && { paddingTop: top + styles.content.paddingTop },
                Platform.OS === "ios" && { paddingTop: Math.max(styles.content.paddingTop, top * 1.2) }
                ]}
                showsVerticalScrollIndicator={false}
              >
                <AccountIdentity />
                <HouseholdList onSelect={() => { setTimeout(close, 300); }} />
                <AccountQuickAccess onGo={go} />
                <ButtonPill
                  variant="neutral"
                  size="lg"
                  leftIcon={LogOut}
                  onPress={onSignOut}
                  style={styles.logOut}
                >
                  {t("sign_out")}
                </ButtonPill>
              </ScrollView>
              <ButtonIcon
                elevated
                variant="neutral-inverted"
                onPress={close}
                style={{
                  position: "absolute",
                  top: theme.spacing[8] + top,
                  left: theme.spacing[16],
                }}
              >
                {X}
              </ButtonIcon>
            </View>
          </m.View>
        )}
      </AnimatePresence>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(0, 0, 0, 0.4)" },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: theme.colors.background,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    overflow: "hidden",
  },
  safeArea: { flex: 1 },
  content: {
    padding: theme.spacing[16],
    paddingBottom: theme.spacing[24],
    paddingTop: theme.spacing[20],
    gap: theme.spacing[32],
  },
  logOut: { marginTop: theme.spacing[12] }
});
