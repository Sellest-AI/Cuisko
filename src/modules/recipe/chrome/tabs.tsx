import { useCallback, useEffect, useRef } from "react";
import { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, View } from "react-native";

import { Button } from "@ui/button";
import { Icon } from "@ui/icons";
import { theme } from "theme";

import { SCREEN_PADDING } from "../constants";

export type RecipeTab = {
  key: string;
  label: string;
  icon: Icon;
  onPress: () => void;
};

type Props = {
  tabs: RecipeTab[];
  activeKey: string;
};

/**
 * The row that switches recipe tabs, which scrolls itself to whichever tab is selected.
 *
 * The row is wider than the screen, so a tab reached any other way — a deep link, a swipe back —
 * could be selected while sitting off the edge, leaving the row looking like nothing is active.
 * Every geometry it needs is kept in a ref: measuring into state would re-render the row on each
 * scroll frame for a number nothing draws.
 */
export const RecipeTabs = ({ tabs, activeKey }: Props) => {
  const scrollRef = useRef<ScrollView>(null);
  const positions = useRef<Record<string, { x: number; width: number }>>({});
  const offset = useRef(0);
  const viewport = useRef(0);
  const content = useRef(0);

  const reveal = useCallback((key: string) => {
    const tab = positions.current[key];
    if (!tab || viewport.current === 0) return;

    /** The tab plus a gutter on either side, so a revealed tab never lands flush against the edge. */
    const start = tab.x - SCREEN_PADDING;
    const end = tab.x + tab.width + SCREEN_PADDING;

    let target = offset.current;
    if (start < target) target = start;
    else if (end > target + viewport.current) target = end - viewport.current;

    target = Math.min(Math.max(target, 0), Math.max(0, content.current - viewport.current));
    if (Math.abs(target - offset.current) < 1) return;

    scrollRef.current?.scrollTo({ x: target, animated: true });
  }, []);

  useEffect(() => reveal(activeKey), [activeKey, reveal]);

  /**
   * A tab measured after the selection moved to it — the deep-link case, where the effect above
   * ran before this row had any geometry to scroll by. `onLayout` fires after commit, so the
   * `activeKey` closed over here is the one currently drawn.
   */
  const measure = (key: string) => (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    positions.current[key] = { x, width };
    if (key === activeKey) reveal(key);
  };

  const trackScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.x;
  };

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      onLayout={(event) => { viewport.current = event.nativeEvent.layout.width; }}
      onContentSizeChange={(width) => { content.current = width; }}
      onScroll={trackScroll}
      scrollEventThrottle={16}
    >
      {tabs.map((tab) => (
        <View key={tab.key} onLayout={measure(tab.key)}>
          <Button
            leftIcon={tab.icon}
            onPress={tab.onPress}
            variant="neutral"
            style={[
              tab.key === activeKey ? styles.tabActive : undefined,
            ]}
          >
            {tab.label}
          </Button>
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: theme.spacing[8],
    gap: theme.spacing[8],
  },
  tabActive: {
    backgroundColor: theme.colors.neutral.elevated,
    color: theme.colors.neutral.base
  },
});
