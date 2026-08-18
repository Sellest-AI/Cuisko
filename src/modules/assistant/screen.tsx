import { View, StyleSheet, ViewStyle, ScrollView } from "react-native";
import { theme } from "theme";
import { Text } from "@ui/text";
import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";
import { ForkKnife, SparklesIcon } from "@ui/icons";
import { Message } from "@ui/message";
import { ButtonPill } from "@ui/button-pill";
import { Image } from "@ui/image";
import { CardRecipe } from "@ui/cards/recipe";

const FOOD_EXAMPLES = [
  { name: "tomato", emoji: "🍅" },
  { name: "chicken", emoji: "🍗" },
  { name: "broccoli", emoji: "🥦" },
  { name: "rice", emoji: "🍚" },
  { name: "pasta", emoji: "🍝" },
  { name: "cheese", emoji: "🧀" },
  { name: "beef", emoji: "🥩" },
  { name: "fish", emoji: "🐟" },
  { name: "potato", emoji: "🥔" },
  { name: "carrot", emoji: "🥕" },
];

const RECIPES = [
  { title: "Pizza Atomica", subtitle: "Italian" },
  { title: "Asparagus Salad", subtitle: "Italian" },
  { title: "Pasta Carbonara", subtitle: "Italian" },
];

const foodParser = {
  // Regex to match any of the food examples, case insensitive, and plural forms (e.g., "tomatoes" for "tomatoe")
  condition: `\\b((?:${FOOD_EXAMPLES.map((f) => f.name).join("|")})s?)\\b`,
  parse: (text: string) => {
    const regex = new RegExp(`\\b((?:${FOOD_EXAMPLES.map((f) => f.name).join("|")})s?)\\b`, "gi");
    const parts = text.split(regex);

    return parts.map((part, index) => {
      if (regex.test(part)) {
        const food = FOOD_EXAMPLES.find((f) => f.name.toLowerCase() === part.toLowerCase().replace(/s$/, ""));

        return (
          <Text.Base key={index} style={{ color: theme.colors.primary.base, fontWeight: "bold" }}>
            <View style={{
              width: 20, height: 20, backgroundColor: theme.colors.neutral.subtle,
              borderRadius: theme.radius.full, alignItems: "center", justifyContent: "center",
              marginRight: 4
            }}>
              <Text.Sm style={{ lineHeight: 10, fontSize: 10 }}>
                {food?.emoji}
              </Text.Sm>
            </View>
            {part}
          </Text.Base>
        );
      }
      return part;
    });
  },
}

type Props = {
  style?: ViewStyle,
}

export const AssistantScreen = ({ style }: Props) => {
  return (
    <ScrollView
      style={[{ marginTop: 4 }, style]}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.title}>
          <SparklesIcon size={20} />
          <Text.H4 color="currentColor">Cuisko</Text.H4>
        </View>
      </View>
      <View style={{
        gap: theme.spacing[28],
      }}>
        <Message
          from="user"
          content="Hello Cuisko, can you help me find a recipe for dinner tonight?"
          parsers={[foodParser]}
          style={{ paddingRight: theme.spacing[16] }}
        />
        <Message
          from="assistant"
          content="Of course! What ingredients do you have on hand, or do you have a specific type of cuisine in mind?"
          parsers={[foodParser]}
          style={{ paddingLeft: theme.spacing[12] }}
        >
          <ButtonPill
            onPress={() => console.log("Open Grocery List pressed")}
            variant="secondary"
            leftIcon={ForkKnife}
            size="md"
          >
            Open Recipes
          </ButtonPill>
        </Message>
        <Message
          from="user"
          content="I have chicken, 3 broccolis, and rice. I was thinking of something Asian-inspired."
          parsers={[foodParser]}
          style={{ paddingRight: theme.spacing[16] }}
        />
        <Message
          from="assistant"
          content="Great! How about a Chicken and Broccoli Stir-Fry with Rice? It's quick, easy, and delicious. Here are simple recipes:"
          parsers={[foodParser]}
          style={{ paddingLeft: theme.spacing[12] }}
        >
          <View style={{ flexDirection: "row", justifyContent: "flex-start", alignItems: "center", gap: theme.spacing[8] }}>
            <Text.Lg color={theme.colors.foreground}>Recipes Found</Text.Lg>
            <Text.Lg color={theme.colors.neutral.muted}>3</Text.Lg>
          </View>
        </Message>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{
            marginTop: -24,
          }}
          contentContainerStyle={{
            gap: theme.spacing[12],
            paddingVertical: theme.spacing[12],
            paddingHorizontal: theme.spacing[28],
          }}
        >
          {RECIPES.map((recipe) => (
            <CardRecipe
              key={recipe.title}
              title={recipe.title}
              subtitle={recipe.subtitle}
              imageSrc={require("assets/placeholders/pizza-recipe.jpg")}
              style={{ width: 220 }}
            />
          ))}
        </ScrollView>
        <Message
          from="user"
          content="That sounds perfect! Do you know how to make a pizza with tomato, cheese, and chicken?"
          parsers={[foodParser]}
          style={{
            paddingRight: theme.spacing[16],
            marginTop: -12
          }}
        >
          <View style={{
            alignSelf: "flex-end",
            borderRadius: theme.radius.lg,
            borderTopRightRadius: theme.radius.xs,
            overflow: "hidden",
            width: 200,
            height: 200,
            boxShadow: [
              {
                offsetX: 2,
                offsetY: 6,
                blurRadius: 10,
                spreadDistance: 4,
                color: "rgba(0, 0, 0, 0.05)",
              },
            ],
          }}>
            <Image
              style={{
                width: 200,
                height: 200,

              }}
              source={require("assets/placeholders/pizza-recipe.jpg")}
            />
          </View>
        </Message>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: {
    paddingBottom: NAVIGATION_BAR_OFFSET,
  },
  header: {
    padding: theme.spacing[24],
    paddingTop: theme.spacing[20],
    marginBottom: theme.spacing[8],
    gap: theme.spacing[12],
    alignItems: "center",
  },
  title: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
    color: theme.colors.primary.base,
  },
})
