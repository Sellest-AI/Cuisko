import { StyleSheet, View } from "react-native";

import { ANONYMOUS_AVATAR_SEED } from "@shared/avatars";
import { Avatar } from "@ui/avatar";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useAuth } from "~/modules/auth/hooks";

const AVATAR_SIZE = 140;

/** Who is signed in: their face, large, and the address they signed in with. */
export const AccountIdentity = () => {
  const { user } = useAuth();

  return (
    <View style={styles.container}>
      <Avatar seed={user?.avatarSeed ?? ANONYMOUS_AVATAR_SEED} size={AVATAR_SIZE} elevated animated />
      {user?.email && (
        <View style={styles.email}>
          <Text.Base color={theme.colors.neutral.foreground} numberOfLines={1}>
            {user.email}
          </Text.Base>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: theme.spacing[16],
  },
  email: {
    maxWidth: "100%",
    paddingHorizontal: theme.spacing[16],
    paddingVertical: theme.spacing[8],
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.neutral.base,
  },
});
