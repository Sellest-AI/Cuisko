import { StyleSheet, View } from "react-native";

import { Avatar } from "@ui/avatar";
import { ButtonIcon } from "@ui/button-icon";
import { Bell } from "@ui/icons";
import { Select } from "@ui/select";
import { theme } from "theme";
import { router } from "expo-router";
import { SafeAreaView } from "@ui/safe-area-view";

/** Placeholder until households arrive from Convex. */
const HOUSEHOLDS = [{ label: "House", value: "house" }];

const AVATAR_PLACEHOLDER = require("assets/placeholders/empty-placeholder.jpg");

/** Who you are, whose kitchen you are in, and what is waiting for you. */
export const HomeHeader = () => (
  <SafeAreaView
    style={styles.container}
    edges={{ top: "additive", bottom: "off" }}
  >
    <View style={styles.identity}>
      <Avatar
        source={AVATAR_PLACEHOLDER}
        onPress={() => router.dismissTo("/auth")}
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
