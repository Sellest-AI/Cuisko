import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { ArrowRight } from "@ui/icons";
import { Button } from "@ui/button";
import { ButtonPill } from "@ui/button-pill";
import { TextField } from "@ui/text-field";
import { theme } from "theme";

import type { Credentials } from "../_hooks/useAuth";

type Props = {
  isSubmitting: boolean;
  onSubmit: (credentials: Credentials) => void;
};

/**
 * Email and password, for development only — the screen renders this under `__DEV__`, so it never
 * appears in a shipped build. It is a permanent harness, not a stopgap: test accounts and
 * simulators sign in without the OAuth browser round-trip.
 *
 * Collapsed by default, so the screen in development looks like the screen people will see.
 * The copy is English and untranslated on purpose: no one outside the team ever reads it.
 */
export const DevSignIn = ({ isSubmitting, onSubmit }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (!isOpen) {
    return (
      <Button variant="neutral" onPress={() => setIsOpen(true)}>
        Email sign-in (dev)
      </Button>
    );
  }

  return (
    <View style={styles.form}>
      <TextField
        editable={!isSubmitting}
        kind="email"
        onChangeText={setEmail}
        placeholder="you@example.com"
        value={email}
      />
      <TextField
        editable={!isSubmitting}
        isSecure
        onChangeText={setPassword}
        placeholder="At least 8 characters"
        value={password}
      />
      <ButtonPill
        disabled={!email || !password}
        isLoading={isSubmitting}
        onPress={() => onSubmit({ email: email.trim(), password })}
        leftIcon={ArrowRight}
      >
        Connect
      </ButtonPill>
    </View>
  );
};

const styles = StyleSheet.create({
  form: { alignSelf: "stretch", gap: theme.spacing[12] },
});
