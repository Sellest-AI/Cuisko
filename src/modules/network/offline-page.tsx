import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { EmptyState } from "@ui/empty-state";
import { House, WifiOff } from "@ui/icons";
import { theme } from "theme";
import { useTranslations } from "translations";

import { useConnection } from "./_hooks/useConnection";
import { parseFromParam } from "./_model/blockedRoute";

/**
 * Where a route opened with no signal lands (`OfflineGate`). A route of its own so analytics counts
 * it like any screen.
 *
 * When the socket is back it replaces itself with the route the cook asked for, query included
 * (`from`), or with Home when there was none. On the socket itself, not on `isOffline`: that one
 * waits out a grace on the way down only, and the page has nothing to wait for on the way up.
 */
export const OfflinePage = () => {
  const t = useTranslations("Network");
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { isConnected } = useConnection();

  useEffect(() => {
    if (!isConnected) return;
    const blocked = parseFromParam(from);
    router.replace(blocked ?? "/");
  }, [isConnected, from]);

  return (
    <View style={styles.page}>
      <EmptyState
        icon={WifiOff}
        title={t("offline_title")}
        body={t("offline_body")}
        actions={[{
          label: t("offline_home"),
          icon: House, onPress: () => router.dismissTo("/"),
          variant: "primary"
        }]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    justifyContent: "center",
    padding: theme.spacing[24],
    backgroundColor: theme.colors.background,
  },
});
