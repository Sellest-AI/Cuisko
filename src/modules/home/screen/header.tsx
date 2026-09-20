import { StyleSheet, View } from "react-native";

import { ANONYMOUS_AVATAR_SEED } from "@shared/avatars";
import { Avatar } from "@ui/avatar";
import { ButtonIcon } from "@ui/button-icon";
import { Bell } from "@ui/icons";
import { Select } from "@ui/select";
import { theme } from "theme";
import { router } from "expo-router";
import { SafeAreaView } from "@ui/safe-area-view";
import { useAuth } from "~/modules/auth/hooks";

/** Placeholder until households arrive from Convex. */
const HOUSEHOLDS = [{ label: "House", value: "house" }];

/** Who you are, whose kitchen you are in, and what is waiting for you. */
export const HomeHeader = () => {
  const { user } = useAuth();

  return (
    <SafeAreaView
      style={styles.container}
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
          onPress={() => router.dismissTo("/auth")}
          elevated
        />
        <Select
          onChange={(value) => console.log(value)}
          options={HOUSEHOLDS}
          value="house"
        />
      </View>
      <ButtonIcon
        onPress={() => console.log("bell pressed")}
        variant="neutral-subtle"
        size="md"
      >
        {Bell}
      </ButtonIcon>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingLeft: theme.spacing[24],
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
