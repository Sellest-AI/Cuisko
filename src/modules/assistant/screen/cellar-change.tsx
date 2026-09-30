import { ScrollView, StyleSheet, View } from "react-native";
import { useTranslations } from "translations";

import { Button } from "@ui/button";
import { GroceryItem } from "@ui/cards/grocery-item";
import { Undo2 } from "@ui/icons";
import { theme } from "theme";

import { useCellarChange } from "../_hooks/useCellarChange";
import type { DrawnCellarChange } from "../_model/chatMessage";

/** Narrow enough that a fourth card shows it is there to scroll to. */
const CARD_WIDTH = 104;

type Props = {
  change: DrawnCellarChange;
  /** Which change this is, across the conversation: what its undo is remembered under. */
  changeKey: string;
};

/**
 * What Cuisko put in or took out of the cellar: the lines as grocery cards on a shelf, and the pill
 * that takes all of them back.
 *
 * The cards do nothing when tapped. They are a record of what happened, and a tap that moved stock
 * from inside a chat bubble would be a second way to change the cellar with no undo of its own.
 * An add reads as `recent`, the way a fresh purchase does on the list; a removal as `memory`, stock
 * that is no longer there.
 *
 * Once there is nothing left to undo, the button goes and the cards settle: the change is now just
 * a record of what happened.
 */
export const CellarChange = ({ change, changeKey }: Props) => {
  const t = useTranslations("Assistant");
  const { cards, isLoading, canUndo, isUndoing, undo } = useCellarChange(change, changeKey);

  if (isLoading || cards.length === 0) return null;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.shelf}
        contentContainerStyle={[styles.shelfCards, !canUndo && { paddingBottom: theme.spacing[8] }]}
      >
        {cards.map((card) => (
          <GroceryItem
            key={card.key}
            name={card.name}
            quantity={card.quantity}
            emoji={card.emoji}
            imageUrl={card.imageUrl}
            variant={!canUndo ? "settled" :
              (change.action === "add" ? "recent" : "memory")}
            width={CARD_WIDTH}
          />
        ))}
      </ScrollView>
      {canUndo && <Button
        variant="neutral"
        onPress={() => void undo()}
        isLoading={isUndoing}
        style={styles.pill}
        leftIcon={Undo2}
      >
        {t("cellar.undo")}
      </Button>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "flex-start",
  },
  /** Pulls the shelf out of the message's own left inset so it runs edge to edge, as the recipe shelf does. */
  shelf: {
    alignSelf: "stretch",
    marginHorizontal: -theme.spacing[32],
  },
  shelfCards: {
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[8],
    paddingHorizontal: theme.spacing[28],
    paddingBottom: theme.spacing[16],
  },
  pill: {
    alignSelf: "flex-start",
    marginLeft: -theme.spacing[2],
  },
});
