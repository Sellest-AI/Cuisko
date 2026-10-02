import type { ReactNode } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";

import { ANONYMOUS_AVATAR_SEED } from "@shared/avatars";
import { Avatar } from "@ui/avatar";
import { theme } from "theme";
import { router } from "expo-router";
import { SafeAreaView } from "@ui/safe-area-view";
import { useAuth } from "~/modules/auth/hooks";
import { HouseholdSelect } from "~/modules/households/household-select";

/** Who you are, whose kitchen you are in, and the action the page puts on the right. */
export const HomeHeader = ({ action, style }: { action?: ReactNode; style?: ViewStyle }) => {
  const { user, isAuthenticated } = useAuth();

  return (
    <SafeAreaView
      style={[styles.container, style]}
      edges={{ top: "additive", bottom: "off" }}
    >
      <View style={styles.identity}>
        {/*
          * The anonymous face while the row is still arriving, and for a cook who is not signed in
          * at all. Rendering nothing until the seed lands would move everything beside it once the
          * query resolves, and this header is the first thing drawn on the first screen.
          */}
        <Avatar
          seed={user?.avatarSeed ?? ANONYMOUS_AVATAR_SEED}
          onPress={() => isAuthenticated ? router.push("/account") : router.dismissTo("/auth")}
          animated
          elevated
        />
        <HouseholdSelect />
      </View>
      {action}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingLeft: theme.spacing[16],
    paddingTop: theme.spacing[8],
    paddingRight: theme.spacing[16],
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  identity: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    gap: theme.spacing[8],
  },
});
