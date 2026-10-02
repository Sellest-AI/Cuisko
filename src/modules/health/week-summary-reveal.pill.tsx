import { Text } from "@ui/text";
import { HeartIcon } from "@ui/icons";
import { ScoreRing } from "@ui/score-ring";
import { theme } from "theme";

const PILL_RING_SIZE = 22;
const PILL_RING_WIDTH = 2;

/** The pill's face: the Health score, and the ring it fills. Drawn on the pill and on the box it becomes. */
export const PillFace = ({ health }: { health?: number }) => (
  <>
    <Text.Base color={theme.colors.primary.foreground}>
      {health === undefined ? "–" : `${Math.round(health)}`}
    </Text.Base>
    {/* Filled to the Health score, the same figure as the label: the ring is the score drawn. */}
    <ScoreRing
      score={health ?? 0}
      size={PILL_RING_SIZE}
      strokeWidth={PILL_RING_WIDTH}
      trackColor={health ? "transparent" : theme.colors.primary.subtle}
      fillColor={theme.colors.primary.subtle}
    >
      <HeartIcon size={10} color={theme.colors.primary.foreground} fill={theme.colors.primary.foreground} />
    </ScoreRing>
  </>
);
