import { StyleSheet, View } from "react-native";

import { Avatar } from "@ui/avatar";
import { ButtonIcon } from "@ui/button-icon";
import { Bell } from "@ui/icons";
import { Select } from "@ui/select";
import { theme } from "theme";

/** Placeholder until households arrive from Convex. */
const HOUSEHOLDS = [{ label: "House", value: "house" }];

const AVATAR_PLACEHOLDER = require("assets/placeholders/pizza-recipe.jpg");

/** Who you are, whose kitchen you are in, and what is waiting for you. */
export const HomeHeader = () => (
  <View style={styles.container}>
    <View style={styles.identity}>
      <Avatar source={AVATAR_PLACEHOLDER} />
      <Select
        onChange={(value) => console.log(value)}
        options={HOUSEHOLDS}
        value="house"
      />
    </View>
    <ButtonIcon
      onPress={() => console.log("bell pressed")}
      variant="neutral-subtle"
      size="xs"
    >
      {Bell}
    </ButtonIcon>
  </View>
);

const styles = StyleSheet.create({
  container: {
    paddingLeft: theme.spacing[24],
    paddingTop: theme.spacing[16],
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
