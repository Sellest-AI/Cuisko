import { View, StyleSheet, ViewStyle, Platform } from "react-native";
import Animated from "react-native-reanimated";
import { Input, type TextInput } from "@ui/input";
import { Camera, LoaderCircle, Mic, MorphIcon } from "@ui/icons";
import { useSpin } from "@ui/hooks/useSpin";
import { theme } from "theme";
import { useTranslations } from "translations";
import { useEffect, useRef, useState } from "react";
import { NAVIGATION_BAR_HEIGHT } from "./constants";
import { AnimatePresence, m } from "@ui/motion";
import { BlurView } from "~/ui/components/blur-view";
import { Suggestions } from "./_components/suggestions";
import { pickQuantity, type Unit } from "@shared/ingredients";
import { useBarSuggestions } from "./_hooks/useBarSuggestions";
import { useNavigationBar } from "./_hooks/useNavigationBar";
import { useGrocerySort, useStockActions, usePendingIngredients } from "~/modules/groceries/hooks";
import { usePathname, router } from "expo-router";
import { type Intent } from "@shared/inputIntent";
import { useInputIntent } from "./_hooks/useInputIntent";
import type { AssistantMode } from "./_hooks/useNavigationBar";

const MIC_ICON_SIZE = 20;

/**
 * What a submission does to stock, decided by the mode the bar is in.
 *
 * "cellar" means the shopper is telling us what they own, so it goes in. Every other mode — the
 * list, a recipe, or no mode at all — means they are writing something down to buy.
 *
 * Named rather than inlined because two submissions now need it: an ingredient the catalog already
 * holds, and one the resolver had to go and find. They must agree, or the same word typed twice
 * lands in two different places depending on whether we happened to know it.
 *
 * The return type is inferred rather than imported: `Intent` lives in the groceries module's
 * `_model/`, which is its interior (lint R8), and the literal union is what `apply` accepts.
 */
const _stockIntent = (mode: AssistantMode) => (mode === "cellar" ? ("buy" as const) : ("relist" as const));

type Props = {
  style?: ViewStyle,
  /** Controlled by the parent: it stays true while a suggestion is being tapped, and only goes
   * false when the parent detects a tap outside the whole navigation bar. */
  focused: boolean,
  onFocus: () => void,
  onBlur?: () => void,
}

export const NavigationBarInput = ({ style, focused, onFocus, onBlur }: Props) => {
  const t = useTranslations("Navigation");
  const pathname = usePathname();

  // The suggestions panel is laid out above the input and then pulled back down over it, so it
  // needs the input's height. Measured rather than assumed: the row grows with the font scale.
  const [inputHeight, setInputHeight] = useState(0);
  const [value, setValue] = useState("");

  /**
   * Called once, here, and handed down to the panel. Calling it there as well would give the two
   * their own debounce timers and their own held answers — and the panel mounts later than the
   * row, so they would not even start together. Enter would then be able to disagree with the
   * list the cook is looking at, which is the one thing this pairing must never do.
   */
  const bar = useBarSuggestions(value);
  const { kind, ingredient, hasSuggestions } = bar;
  const { matchingSuggestion, rest, unit, amount } = ingredient;
  const showSuggestions = focused && hasSuggestions;

  const { apply } = useStockActions();
  const { add: addUnknown } = usePendingIngredients();
  const { setSort } = useGrocerySort();

  const { resolve, isChecking } = useInputIntent();
  // Parked at 0 when it stops, and the morph below cross-fades at that same moment, so the jump
  // back to a still microphone is invisible.
  const spin = useSpin(isChecking);

  const { mode, setInputRef } = useNavigationBar();
  const ref = useRef<TextInput>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setInputRef(ref); }, []);

  /**
   * Lands the shopper on the page their submission went to: an ingredient aimed at the cellar
   * shows it with the cellar on top, everything else keeps the list first. The intent travels
   * rather than the mode, so the page and the write can never disagree about where stock went.
   *
   * Already on the page, only the param moves — a push would stack a second groceries screen
   * under the back gesture.
   *
   * The list goes back to its plain reading first. A shopper who just typed "yuzu" is looking for
   * the yuzu card, and under a per-meal or per-aisle heading it could be anywhere down the page;
   * on the plain list it is on top. Only an add does this — a tap on a card in the grid is the
   * shopper walking the store in the order they chose, and must not lose it.
   */
  const showGroceries = (intent: "buy" | "relist") => {
    const section = intent === "buy" ? "cellar" : "to-buy";

    setSort("standard");
    if (pathname.startsWith("/groceries")) router.setParams({ section });
    else router.push({ pathname: "/groceries", params: { section } });
  }

  const submitSuggestion = (suggestionId: string, unit: Unit, amount: number) => {
    const stockIntent = _stockIntent(mode);

    // Deliberately not awaited: `apply` handles its own failure, and the bar closes on the
    // gesture rather than on the write landing — Convex reflects the row when it does.
    void apply(stockIntent, { ingredientId: suggestionId, unit: unit }, Number(amount));
    showGroceries(stockIntent);
  }

  /**
   * A word the catalog does not hold, handed to the resolver with a placeholder standing in for it.
   *
   * Also not awaited, and for a stronger reason than above: the resolve can take seconds, and the
   * bar has to close on the gesture. The ghost is what carries the wait — `usePendingIngredients`
   * puts it up before the request goes out and owns everything that happens to it after.
   *
   * `rest` and not `value`: the resolver is asked about the food, with the quantity taken out, so
   * "500g yuzu" does not go to a dictionary as "500g yuzu".
   */
  const submitUnknown = (text: string, unit: Unit | null, amount: number | null) => {
    const stockIntent = _stockIntent(mode);
    void addUnknown(text, stockIntent, unit, amount);
    showGroceries(stockIntent);
  }

  /**
   * Where a settled intent goes. Three destinations, and they have not changed.
   *
   * Its own function because the decision is no longer in the same breath as the routing: an
   * intent arrives from `useInputIntent` settled, whether it was settled by a rule or by the model,
   * and this is the one place that knows what each kind opens.
   *
   * **`ingredient` with nothing to add is the resolver's job**, which is why it shares its branch
   * with `unknown`. Enter only ever produces `ingredient` when the catalog matched, so that pairing
   * never used to be reachable; the model produces it for a food the catalog has never held, which
   * is precisely the case the resolver exists for.
   */
  const route = (intent: Intent) => {
    // The row answers when the shopper did not, both halves together — an amount without its unit
    // is not half a quantity.
    if (intent.kind === "ingredient" && matchingSuggestion) {
      const quantity = pickQuantity({ amount, unit }, matchingSuggestion);
      submitSuggestion(matchingSuggestion.id, quantity.unit, quantity.amount);
    }
    else if (intent.kind === "recipe")
      // The whole input, not `rest`: the recipes page searches names, and a quantity the cook never
      // typed is not in one. `value` is also what the box showed, so the term the page opens on is
      // the term they submitted.
      router.push({ pathname: "/recipes", params: { q: value.trim() } });
    // No row yet on this branch, so the blank travels and `usePendingIngredients` fills it from
    // whatever the resolver comes back with.
    else if ((intent.kind === "unknown" || intent.kind === "ingredient") && rest)
      submitUnknown(rest, unit, amount);
    else if (intent.kind === "chat")
      router.push("/assistant");
  }

  /**
   * Clears the box and gives up the bar, the way selecting a suggestion already does.
   *
   * The Input's own `onBlur` is web-only, so without this the bar keeps its mode for the next
   * submission and the dismiss overlay stays mounted over the screen just pushed.
   */
  const release = () => {
    setValue("");
    onBlur?.();
  }

  return (
    <View style={[
      focused && { maxWidth: "100%", width: "100%", paddingHorizontal: theme.spacing[16] },
      style]}>
      <AnimatePresence>
        {showSuggestions && <m.View
          from={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          exitTransition={{ duration: 100 }}
          transition={{ duration: 0.2 }}
          style={[
            styles.suggestionsContainer,
            styles.suggestionsContainerRadius,
            styles.elevated,
            { transformOrigin: "bottom" },
            // Tucks the panel back over the input it grew above, landing its bottom edge the same
            // 6px below the bar the absolute version used to sit at.
            { marginBottom: -(inputHeight + theme.spacing[6]) },
          ]}>
          <BlurView
            tint="light"
            style={[
              StyleSheet.absoluteFill,
              styles.suggestionsContainerRadius,
              {
                borderWidth: 3,
                borderColor: theme.colors.border.default,
                backgroundColor: theme.colors.surface.elevated,
              }
            ]}
          />
          <Suggestions
            bar={bar}
            style={{
              paddingTop: theme.spacing[16],
              paddingBottom: NAVIGATION_BAR_HEIGHT,
            }}
            onSelect={(suggestion) => {
              setValue("");
              onBlur?.();
              ref.current?.blur();

              // Delay the submission to allow the blur animation to complete before navigating away.
              setTimeout(() => {
                submitSuggestion(suggestion.id, suggestion.unit, suggestion.amount);
              }, 200);
            }}
            onSelectRecipe={(recipeId) => {
              setValue("");
              onBlur?.();
              ref.current?.blur();

              // Same delay, and for the same reason the ingredient branch has one: the panel is
              // mid-exit, and pushing a screen under it drops the animation.
              setTimeout(() => router.push(`/recipe/${recipeId}`), 200);
            }}
          />
        </m.View>}
      </AnimatePresence>
      <m.View
        onLayout={(e) => setInputHeight(e.nativeEvent.layout.height)}
        style={[
          styles.container,
          focused ? { maxWidth: "100%", width: "100%" } : { maxWidth: 242, width: "100%" },
        ]}>
        <Input
          ref={ref}
          elevated
          placeholder={t("ask_anything").slice(0, 15).trim().concat("…")}
          leftIcon={Camera}
          onLeftPress={() => console.log("camera pressed")}
          /**
           * The microphone, which becomes the wait while the bar is confirming what was typed.
           *
           * `MorphIcon` rather than a swap: the mic's own strokes travel into the ring and back, so
           * a check that resolves quickly reads as the icon flexing rather than as a spinner
           * appearing and vanishing. Same pairing `ButtonIcon` uses for its loading state — the mic
           * cannot use `Input`'s `isLoading`, which drives `rightIcon`'s button and not this.
           */
          rightContent={
            <Animated.View style={spin}>
              <MorphIcon
                icon={isChecking ? LoaderCircle : Mic}
                size={MIC_ICON_SIZE}
                color={theme.colors.foreground}
              />
            </Animated.View>
          }
          style={{ width: "100%" }}
          onSubmit={() => {
            // A second Enter while the first is still being confirmed would route twice — once on
            // each answer — and put the same word on the list twice.
            if (isChecking) return;

            /**
             * What Enter means is `useInputIntent`'s to work out, from the rules and, for the two
             * it can only guess at, from the model. All this has to do is hand over what the panel
             * is showing, and route the answer.
             *
             * **`value` and not `rest`.** The resolver is asked about the food with the quantity
             * taken out, but a quantity is the strongest evidence there is that a phrase names one
             * — strip it and "500g yuzu" would be judged as bare "yuzu".
             *
             * Nothing is cleared until the answer lands. Most submissions settle locally and land
             * in the same breath; the ones that ask keep their words on screen with the microphone
             * spinning, because a bar that emptied itself first would look like it had swallowed
             * the input for as long as the request took.
             */
            void resolve(value, {
              hasCatalogHit: matchingSuggestion !== null,
              hasRecipeHit: kind === "recipe",
            }).then((intent) => {
              route(intent);
              release();
            });
          }}
          value={value}
          onChangeText={(text) => setValue(text)}
          onFocus={onFocus}
          onBlur={() => Platform.OS === "web" && onBlur?.()}
        />
      </m.View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
  },
  /**
   * In the layout flow, not absolutely positioned over it — the panel used to hang above the bar,
   * outside the bounds of every ancestor up to the sticky view. Android does not dispatch a native
   * touch to a view drawn outside its parent, so the horizontal ScrollView inside never saw a drag
   * and the suggestions would not scroll; iOS hit-tests overflowing subviews and worked.
   *
   * Laid out above the input instead, the panel gives the whole chain the height it occupies, and a
   * negative `marginBottom` at the call site puts it back where it was on screen. Geometry is
   * unchanged on both platforms; only the bounds it lives in are.
   */
  suggestionsContainer: {
    marginHorizontal: -theme.spacing[6],
    overflow: "hidden",
  },
  suggestionsContainerRadius: {
    borderRadius: theme.radius.lg,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  elevated: {
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 6,
        blurRadius: 32,
        spreadDistance: 0,
        color: "rgba(0, 0, 0, 0.07)",
      },
    ],
  }
})
